import json
import os
import ssl
import certifi
import re
import logging
from typing import Optional, Dict, Any, Literal, List
from pydantic import BaseModel
from app.config import get_settings
from app.models import ConditionType, ActionType

logger = logging.getLogger(__name__)

# Fix SSL certificate issues
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

settings = get_settings()


async def get_openai_client():
    """Get OpenAI client based on settings - supports Groq, Azure OpenAI, and standard OpenAI.
    
    Priority order:
    1. Groq (if USE_GROQ=true and GROQ_API_KEY is set) - RECOMMENDED, fastest
    2. Azure OpenAI (if USE_AZURE_OPENAI=true and credentials set)
    3. Standard OpenAI (if OPENAI_API_KEY is set)
    4. GitHub Proxy (if USE_GITHUB_PROXY=true)
    """
    import httpx
    from openai import AsyncOpenAI, AsyncAzureOpenAI
    
    http_client = httpx.AsyncClient(verify=certifi.where())
    
    # Log current config for debugging
    logger.info(f"LLM Config: use_groq={settings.use_groq}, groq_key_set={bool(settings.groq_api_key)}")
    
    if settings.use_groq and settings.groq_api_key:
        # Use Groq (fast inference)
        logger.info(f"Using Groq with model {settings.groq_model}")
        client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
            http_client=http_client
        )
        model = settings.groq_model
    elif settings.use_azure_openai and settings.azure_openai_api_key and settings.azure_openai_endpoint:
        # Use Azure OpenAI (GitHub Enterprise)
        logger.info(f"Using Azure OpenAI at {settings.azure_openai_endpoint}")
        client = AsyncAzureOpenAI(
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
            azure_endpoint=settings.azure_openai_endpoint,
            http_client=http_client
        )
        model = settings.azure_openai_deployment
    elif settings.openai_api_key:
        # Use standard OpenAI
        logger.info("Using standard OpenAI API")
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            http_client=http_client
        )
        model = settings.llm_model
    elif settings.use_github_proxy:
        # Use GitHub Models proxy
        logger.info(f"Using GitHub Models proxy at {settings.github_proxy_url}")
        client = AsyncOpenAI(
            api_key="github-proxy",
            base_url=settings.github_proxy_url,
            http_client=http_client
        )
        model = settings.llm_model
    else:
        raise ValueError("No LLM configured. Set GROQ_API_KEY, AZURE_OPENAI_API_KEY, OPENAI_API_KEY, or enable USE_GITHUB_PROXY")
    
    return client, model, http_client


class ParsedCondition(BaseModel):
    market: str
    condition_type: ConditionType
    condition_value: float
    reference: str = "current_price"  # "current_price", "entry_price", "absolute"


class ParsedAction(BaseModel):
    action_type: ActionType
    amount_percent: Optional[float] = 100.0
    amount_usd: Optional[float] = None


class ParsedRule(BaseModel):
    condition: ParsedCondition
    action: ParsedAction
    summary: str


class SecondaryIntent(BaseModel):
    """A secondary intent for compound queries."""
    intent: str
    market: Optional[str] = None
    days: Optional[int] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    position_type: Optional[str] = None


class IntentClassification(BaseModel):
    intent: Literal["trading_rule", "trading_action", "balance_query", "price_query", "position_query", "historical_price_query", "profit_calculation", "profit_scan", "comparison_query", "market_analysis", "rules_query", "help", "general_chat"]
    market: Optional[str] = None  # For price/position queries
    days: Optional[int] = None  # For historical queries
    amount: Optional[float] = None  # For profit calculations
    currency: Optional[str] = None  # USD, INR, etc.
    position_type: Optional[str] = None  # "long" or "short"
    confidence: float = 1.0
    secondary_intents: Optional[List[SecondaryIntent]] = None  # For compound queries


class ChatResponse(BaseModel):
    intent: str
    response: str
    data: Optional[Dict[str, Any]] = None


SYSTEM_PROMPT = """You are a trading rule parser. Convert natural language trading instructions into structured JSON rules.

Available markets on Drift Protocol:
- SOL-PERP (Solana perpetual)
- BTC-PERP (Bitcoin perpetual)
- ETH-PERP (Ethereum perpetual)
- And other perpetuals like APT-PERP, ARB-PERP, DOGE-PERP, etc.

Condition types:
- price_above: Trigger when price goes above a value
- price_below: Trigger when price goes below a value
- price_change_percent: Trigger on percentage change (positive for up, negative for down)
- price_change_absolute: Trigger on absolute price change in USD

Action types:
- buy: Open/increase a long position
- sell: Close/reduce a position
- close_position: Close entire position

Always respond with valid JSON in this exact format:
{
    "condition": {
        "market": "SOL-PERP",
        "condition_type": "price_below",
        "condition_value": 100.0,
        "reference": "current_price"
    },
    "action": {
        "action_type": "sell",
        "amount_percent": 100.0,
        "amount_usd": null
    },
    "summary": "Sell entire SOL-PERP position when price drops below $100"
}

Parse the user's trading instruction and return ONLY the JSON, no other text."""


INTELLIGENT_ROUTER_PROMPT = """You are an intelligent router for a crypto trading bot. Your job is to understand the user's request and decide which function/capability to use.

## AVAILABLE FUNCTIONS:

1. **trading_rule** - Create automated trading rules
   - Use when: User wants to SET UP automatic trades based on conditions
   - Examples: "buy BTC when it drops to 60k", "sell my SOL if it goes above $150", "alert me when ETH hits 3000"
   - Params: market (required)

2. **trading_action** - Execute a trade NOW (not automated, immediate action)
   - Use when: User wants to EXECUTE a trade immediately
   - Examples: "open a short on SOL", "long BTC for $500", "place a buy order for ETH"
   - Params: market (required), amount, currency, position_type (long/short)

3. **balance_query** - Check wallet/account balance
   - Use when: User asks about their funds or balance
   - Examples: "what's my balance", "how much do I have", "show my funds"
   - Params: none

4. **price_query** - Get current price of a coin
   - Use when: User asks what a coin is worth RIGHT NOW
   - Examples: "what's the price of BTC", "how much is SOL", "ETH price?"
   - Params: market

5. **position_query** - Check open trading positions
   - Use when: User asks about their current trades/positions
   - Examples: "what are my positions", "show my open trades", "my portfolio"
   - Params: none

6. **historical_price_query** - Get past price data or performance
   - Use when: User asks how a coin performed over time (WITHOUT investment calculation)
   - Examples: "how did SOL perform last week", "BTC trend over 30 days", "ETH history"
   - Params: market, days (default 7)

7. **profit_calculation** - Calculate hypothetical investment returns for ONE coin
   - Use when: User wants to calculate "what if I invested X in Y"
   - Examples: "profit if I invested $100 in SOL", "if I shorted BTC with 1000 INR"
   - Params: market (required), amount (required), currency, position_type, days (default 7)

8. **profit_scan** - Scan ALL coins for profit opportunities
   - Use when: User asks about profitable coins in general (not specific coin)
   - Examples: "any coins profitable?", "what's been profitable", "scan all coins"
   - Params: days, amount, currency

9. **market_analysis** - Get news/analysis about WHY a coin's price is moving
   - Use when: User asks WHY or wants NEWS/ANALYSIS about price movement
   - Examples: "why is BONK price so low?", "what's happening with SOL", "news about ETH", "why is BTC crashing"
   - Params: market (required)

10. **comparison_query** - Compare multiple coins' performance
    - Use when: User wants to compare or rank coins
    - Examples: "which coin performed best", "compare BTC vs ETH", "top performers"
    - Params: days

11. **rules_query** - List existing trading rules
    - Use when: User asks about their existing rules
    - Examples: "show my rules", "what rules do I have"
    - Params: none

12. **help** - Show help/capabilities
    - Examples: "help", "what can you do"
    - Params: none

13. **general_chat** - General conversation (fallback)
    - Use when: None of the above match
    - Params: none

## MARKET EXTRACTION:
Extract the coin/market from the user's message. Common coins and their markets:
- Bitcoin/BTC → BTC-PERP
- Solana/SOL → SOL-PERP  
- Ethereum/ETH → ETH-PERP
- Dogecoin/DOGE → DOGE-PERP
- XRP/Ripple → XRP-PERP
- BONK → BONK-PERP
- WIF/Dogwifhat → WIF-PERP
- PEPE → PEPE-PERP
- Any other coin → <SYMBOL>-PERP

## FOLLOW-UP DETECTION:
If the user's message is short (like "what about XRP", "and BTC?", "XRP?"), look at PREVIOUS messages to understand context and apply the SAME operation to the new coin.

## COMPOUND QUERIES (IMPORTANT!):
Users often ask for MULTIPLE things in one message. Detect these and return secondary_intents.

Examples of compound queries:
- "what is BONK and its current price" → primary: market_analysis, secondary: price_query
- "show BTC price and my balance" → primary: price_query, secondary: balance_query  
- "what's happening with SOL and how did it perform this week" → primary: market_analysis, secondary: historical_price_query
- "ETH price and any news" → primary: price_query, secondary: market_analysis
- "my positions and current SOL price" → primary: position_query, secondary: price_query

Look for words like: "and", "also", "plus", "with", "along with", or comma-separated requests.

## RESPOND WITH JSON ONLY:
{
    "intent": "<primary function_name>",
    "market": "<SYMBOL-PERP or null>",
    "days": <number or null>,
    "amount": <number or null>,
    "currency": "<USD or INR or null>",
    "position_type": "<long or short or null>",
    "confidence": <0.0-1.0>,
    "secondary_intents": [
        {
            "intent": "<secondary function_name>",
            "market": "<SYMBOL-PERP or null if same as primary>",
            "days": <number or null>,
            "amount": <number or null>,
            "currency": "<currency or null>",
            "position_type": "<position or null>"
        }
    ]
}

Note: secondary_intents should be an empty array [] if there's only ONE intent, or omitted entirely."""


CHAT_SYSTEM_PROMPT = """You are a helpful trading assistant for a Solana-based perpetual futures trading bot using Drift Protocol.

You can help users with:
- Creating trading rules (conditions that trigger automatic trades)
- Checking account balances and positions
- Getting current and historical crypto prices
- Comparing crypto performance across multiple coins
- Calculating potential profits from investments
- Understanding how the trading bot works

Available markets: SOL-PERP, BTC-PERP, ETH-PERP, DOGE-PERP, XRP-PERP

Keep responses concise and helpful. For trading-related questions, provide clear explanations.
When presenting data, format it nicely for the user."""


class LLMAgent:
    def __init__(self):
        self.settings = get_settings()

    async def parse_trading_rule(self, user_input: str, current_price: Optional[float] = None) -> ParsedRule:
        """Parse natural language trading instruction into structured rule."""

        context = f"Current price context: ${current_price}" if current_price else ""
        user_message = f"{context}\n\nUser instruction: {user_input}"

        # Check Groq first (fast inference)
        if self.settings.use_groq and self.settings.groq_api_key:
            return await self._parse_with_openai(user_message)  # Uses get_openai_client which handles Groq
        # Check for Azure OpenAI (GitHub Enterprise)
        elif self.settings.use_azure_openai and self.settings.azure_openai_api_key:
            return await self._parse_with_openai(user_message)
        # Then GitHub proxy
        elif self.settings.use_github_proxy:
            return await self._parse_with_github_proxy(user_message)
        elif self.settings.openai_api_key:
            return await self._parse_with_openai(user_message)
        elif self.settings.anthropic_api_key:
            return await self._parse_with_anthropic(user_message)
        else:
            raise ValueError("No LLM configured. Set GROQ_API_KEY, AZURE_OPENAI_API_KEY, OPENAI_API_KEY, or enable USE_GITHUB_PROXY")

    async def _parse_with_github_proxy(self, user_message: str) -> ParsedRule:
        """Parse using GitHub Models proxy (Claude via GitHub)."""
        import httpx
        from openai import AsyncOpenAI

        # Create HTTP client with proper SSL
        http_client = httpx.AsyncClient(verify=certifi.where())

        # Connect to local GitHub proxy
        client = AsyncOpenAI(
            api_key="github-proxy",  # Proxy uses GITHUB_TOKEN from env
            base_url=self.settings.github_proxy_url,
            http_client=http_client
        )

        try:
            response = await client.chat.completions.create(
                model=self.settings.llm_model,  # claude-3.5-sonnet
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.1
            )

            content = response.choices[0].message.content
            # Try to parse JSON from the response
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown code block
                import re
                json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError(f"Could not parse JSON from response: {content}")

            return ParsedRule(**result)
        finally:
            await http_client.aclose()

    async def _parse_with_openai(self, user_message: str) -> ParsedRule:
        """Parse using OpenAI API or Azure OpenAI."""
        client, model, http_client = await get_openai_client()
        
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            return ParsedRule(**result)
        finally:
            await http_client.aclose()

    async def _parse_with_anthropic(self, user_message: str) -> ParsedRule:
        """Parse using Anthropic API."""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

        response = await client.messages.create(
            model="claude-3-opus-20240229",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )

        # Extract JSON from response
        content = response.content[0].text
        # Try to parse JSON from the response
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            import re
            json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(1))
            else:
                raise ValueError(f"Could not parse JSON from response: {content}")

        return ParsedRule(**result)

    async def classify_intent(self, user_input: str, last_context: Optional[Dict] = None, chat_history: Optional[List[Dict]] = None) -> IntentClassification:
        """
        Classify the intent of user's message using LLM as the intelligent router.
        The LLM understands context and decides which function to call.
        """
        lower_input = user_input.lower().strip()
        
        # Quick pattern matching ONLY for trivial queries (save LLM calls)
        if any(kw in lower_input for kw in ["help", "what can you do", "commands"]):
            return IntentClassification(intent="help", confidence=0.99)
        
        if any(kw in lower_input for kw in ["my rules", "show rules", "list rules"]):
            return IntentClassification(intent="rules_query", confidence=0.99)
        
        # Use LLM for ALL other classifications - it's smarter at understanding intent
        return await self._classify_with_llm_router(user_input, chat_history)

    async def _classify_with_llm_router(self, user_input: str, chat_history: Optional[List[Dict]] = None) -> IntentClassification:
        """Use LLM as intelligent router to classify intent and extract parameters."""
        client, model, http_client = await get_openai_client()

        # Build context from chat history if available
        context_text = ""
        if chat_history and len(chat_history) > 0:
            recent_history = chat_history[-4:] if len(chat_history) > 4 else chat_history
            context_text = "\n\nCONVERSATION HISTORY (for follow-up detection):\n" + "\n".join([
                f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content'][:300]}"
                for msg in recent_history
            ])
        
        user_message = f"USER MESSAGE: {user_input}{context_text}"

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": INTELLIGENT_ROUTER_PROMPT},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.1
            )

            content = response.choices[0].message.content
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    logger.warning(f"Could not parse LLM router response: {content}")
                    return IntentClassification(intent="general_chat", confidence=0.5)

            # Parse secondary_intents if present
            secondary_intents = None
            if "secondary_intents" in result and result["secondary_intents"]:
                secondary_intents = [
                    SecondaryIntent(**{k: v for k, v in si.items() if k in SecondaryIntent.__fields__ and v is not None})
                    for si in result["secondary_intents"]
                    if isinstance(si, dict) and si.get("intent")
                ]
                if not secondary_intents:
                    secondary_intents = None
            
            # Build IntentClassification from result
            valid_fields = {k: v for k, v in result.items() 
                          if k in IntentClassification.__fields__ and v is not None and k != "secondary_intents"}
            valid_fields["secondary_intents"] = secondary_intents
            return IntentClassification(**valid_fields)
            
        except Exception as e:
            logger.error(f"LLM router failed: {e}")
            # Fallback to general_chat on failure
            return IntentClassification(intent="general_chat", confidence=0.5)
        finally:
            await http_client.aclose()

    def _extract_market(self, text: str) -> Optional[str]:
        """Extract market symbol from text."""
        market_map = {
            "btc": "BTC-PERP", "bitcoin": "BTC-PERP",
            "sol": "SOL-PERP", "solana": "SOL-PERP",
            "eth": "ETH-PERP", "ethereum": "ETH-PERP",
            "doge": "DOGE-PERP", "dogecoin": "DOGE-PERP",
            "xrp": "XRP-PERP", "ripple": "XRP-PERP",
            "bonk": "BONK-PERP",
            "wif": "WIF-PERP", "dogwifhat": "WIF-PERP",
            "pepe": "PEPE-PERP",
            "shib": "SHIB-PERP", "shiba": "SHIB-PERP",
            "jup": "JUP-PERP", "jupiter": "JUP-PERP",
            "link": "LINK-PERP", "chainlink": "LINK-PERP",
            "avax": "AVAX-PERP", "avalanche": "AVAX-PERP",
            "ada": "ADA-PERP", "cardano": "ADA-PERP",
            "matic": "MATIC-PERP", "polygon": "MATIC-PERP",
            "dot": "DOT-PERP", "polkadot": "DOT-PERP",
        }
        text_lower = text.lower()
        for keyword, market in market_map.items():
            if keyword in text_lower:
                return market
        return None

    def _extract_days(self, text: str) -> Optional[int]:
        """Extract number of days from text."""
        text_lower = text.lower()
        
        # Check for specific time period keywords
        if "week" in text_lower:
            return 7
        if "month" in text_lower:
            return 30
        if "year" in text_lower:
            return 365
        if "24 hour" in text_lower or "24h" in text_lower:
            return 1
        
        # Try to extract number followed by "day"
        day_match = re.search(r'(\d+)\s*day', text_lower)
        if day_match:
            return int(day_match.group(1))
        
        # Try to extract "last N"
        last_match = re.search(r'last\s+(\d+)', text_lower)
        if last_match:
            return int(last_match.group(1))
        
        # Default to 7 days for historical queries
        return 7

    def _extract_amount(self, text: str) -> Optional[float]:
        """Extract investment amount from text."""
        amount, _ = self._extract_amount_with_currency(text)
        return amount

    def _extract_amount_with_currency(self, text: str) -> tuple[Optional[float], str]:
        """Extract investment amount and currency from text."""
        text_lower = text.lower()
        
        # INR patterns: 1000 inr, 1000 rupee, ₹1000, Rs. 1000, Rs 1000
        inr_match = re.search(r'(?:₹|rs\.?\s*|inr\s*)([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s*(?:inr|rupees?)', text_lower)
        if inr_match:
            amount_str = inr_match.group(1) or inr_match.group(2)
            return float(amount_str.replace(',', '')), "INR"
        
        # Dollar amounts: $100, $1,000, $1000, 100 dollars, etc.
        dollar_match = re.search(r'\$\s*([\d,]+(?:\.\d{2})?)', text)
        if dollar_match:
            return float(dollar_match.group(1).replace(',', '')), "USD"
        
        # Match "X dollars" or "X USD"
        amount_match = re.search(r'([\d,]+(?:\.\d{2})?)\s*(?:dollars?|usd)', text_lower)
        if amount_match:
            return float(amount_match.group(1).replace(',', '')), "USD"
        
        # Just a number with no currency - but NOT followed by time-related words
        # Exclude patterns like "7 days", "30 days", "1 week", etc.
        num_match = re.search(r'([\d,]+(?:\.\d{2})?)\s*(?!days?|weeks?|months?|years?|hours?|minutes?)', text)
        if num_match:
            num_val = float(num_match.group(1).replace(',', ''))
            # Sanity check - if it's a small number (< 10), it's probably not an amount
            if num_val >= 10:
                return num_val, "USD"
        
        # Default to $100 USD for profit calculations if no amount specified
        return 100.0, "USD"

    async def _classify_with_llm(self, user_input: str) -> IntentClassification:
        """Classify intent using LLM."""
        client, model, http_client = await get_openai_client()

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": INTENT_CLASSIFICATION_PROMPT},
                    {"role": "user", "content": user_input}
                ],
                temperature=0.1
            )

            content = response.choices[0].message.content
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    return IntentClassification(intent="general_chat", confidence=0.5)

            return IntentClassification(**result)
        except Exception as e:
            return IntentClassification(intent="general_chat", confidence=0.5)
        finally:
            await http_client.aclose()

    async def _process_single_intent(self, intent: Any, context: Dict[str, Any], user_input: str) -> ChatResponse:
        """Process a single intent and return a ChatResponse. Used for both primary and secondary intents."""
        
        if intent.intent == "balance_query":
            balance_data = context.get("balance", {})
            return ChatResponse(
                intent="balance_query",
                response=self._format_balance_response(balance_data),
                data=balance_data
            )

        elif intent.intent == "price_query":
            prices = context.get("prices", {})
            market = intent.market
            if market and market in prices:
                price = prices[market]
                return ChatResponse(
                    intent="price_query",
                    response=f"The current price of {market.replace('-PERP', '')} is **${price:,.2f}**",
                    data={"market": market, "price": price, "intent": "price_query"}
                )
            elif prices:
                return ChatResponse(
                    intent="price_query",
                    response=self._format_prices_response(prices),
                    data={"prices": prices, "intent": "price_query"}
                )
            return ChatResponse(
                intent="price_query",
                response="Unable to fetch prices at the moment. Please try again.",
                data=None
            )

        elif intent.intent == "position_query":
            positions = context.get("positions", [])
            return ChatResponse(
                intent="position_query",
                response=self._format_positions_response(positions),
                data={"positions": positions}
            )

        elif intent.intent == "rules_query":
            return ChatResponse(
                intent="rules_query",
                response="Fetching your rules...",
                data={"needs_fetch": True}
            )

        elif intent.intent == "trading_action":
            market = intent.market or "SOL-PERP"
            symbol = market.replace("-PERP", "")
            amount = intent.amount or 100.0
            currency = intent.currency or "USD"
            position_type = intent.position_type or "long"
            currency_symbol = "$" if currency == "USD" else "₹"
            
            position_emoji = "📉" if position_type == "short" else "📈"
            action_word = "SHORT (sell)" if position_type == "short" else "LONG (buy)"
            action_type = "sell" if position_type == "short" else "buy"
            
            prices = context.get("prices", {})
            current_price = prices.get(market, 0)
            price_str = f"${current_price:,.2f}" if current_price else "N/A"
            rule_summary = f"{action_word} {symbol} at current price (${current_price:,.2f}) with {currency_symbol}{amount:,.2f}"
            
            return ChatResponse(
                intent="trading_action",
                response=f"""{position_emoji} **{action_word} Order - {symbol}**

**Order Details:**
- Position: {action_word}
- Market: {market}
- Size: {currency_symbol}{amount:,.2f} {currency}
- Entry Price: {price_str}

✅ **Ready to create trading rule!**
Click **"Create Rule"** to confirm this order.""",
                data={
                    "should_create_rule": True,
                    "original_input": user_input,
                    "action": "trade_request",
                    "market": market,
                    "position_type": position_type,
                    "action_type": action_type,
                    "amount": amount,
                    "currency": currency,
                    "current_price": current_price,
                    "parsed_rule": {
                        "condition": {
                            "market": market,
                            "condition_type": "price_above" if position_type == "short" else "price_below",
                            "condition_value": current_price * 0.999 if position_type == "short" else current_price * 1.001,
                            "reference": "current_price"
                        },
                        "action": {
                            "action_type": action_type,
                            "amount_percent": None,
                            "amount_usd": amount
                        },
                        "summary": rule_summary
                    },
                    "simulation_mode": True
                }
            )

        elif intent.intent == "help":
            return ChatResponse(
                intent="help",
                response=self._get_help_response(),
                data=None
            )

        elif intent.intent == "trading_rule":
            return ChatResponse(
                intent="trading_rule",
                response="I detected a trading rule. Please use the 'Create Rule' feature to set up automated trading rules.",
                data={"should_create_rule": True, "original_input": user_input}
            )

        elif intent.intent == "historical_price_query":
            historical_data = context.get("historical_data")
            if historical_data:
                historical_data["intent"] = "historical_price_query"
                return ChatResponse(
                    intent="historical_price_query",
                    response=self._format_historical_response(historical_data),
                    data=historical_data
                )
            return ChatResponse(
                intent="historical_price_query",
                response="I'll fetch the historical data for you...",
                data={
                    "needs_fetch": True,
                    "market": intent.market or "SOL-PERP",
                    "days": intent.days or 7,
                    "intent": "historical_price_query"
                }
            )

        elif intent.intent == "profit_calculation":
            profit_data = context.get("profit_data")
            if profit_data:
                profit_data["intent"] = "profit_calculation"
                return ChatResponse(
                    intent="profit_calculation",
                    response=self._format_profit_response(profit_data),
                    data=profit_data
                )
            return ChatResponse(
                intent="profit_calculation",
                response="I'll calculate that for you...",
                data={
                    "needs_calculation": True,
                    "market": intent.market or "SOL-PERP",
                    "days": intent.days or 7,
                    "amount": intent.amount or 100.0,
                    "currency": intent.currency or "USD",
                    "position_type": intent.position_type or "long",
                    "intent": "profit_calculation"
                }
            )

        elif intent.intent == "profit_scan":
            profit_scan_data = context.get("profit_scan_data")
            if profit_scan_data:
                return ChatResponse(
                    intent="profit_scan",
                    response=self._format_profit_scan_response(profit_scan_data),
                    data=profit_scan_data
                )
            return ChatResponse(
                intent="profit_scan",
                response="I'll scan all coins for profit opportunities...",
                data={
                    "needs_scan": True,
                    "days": intent.days or 7,
                    "amount": intent.amount or 100.0,
                    "currency": intent.currency or "USD",
                    "intent": "profit_scan"
                }
            )

        elif intent.intent == "comparison_query":
            comparison_data = context.get("comparison_data")
            if comparison_data:
                return ChatResponse(
                    intent="comparison_query",
                    response=self._format_comparison_response(comparison_data),
                    data=comparison_data
                )
            return ChatResponse(
                intent="comparison_query",
                response="I'll compare all currencies for you...",
                data={
                    "needs_comparison": True,
                    "days": intent.days or 7
                }
            )

        elif intent.intent == "market_analysis":
            analysis_data = context.get("market_analysis_data")
            if analysis_data:
                return ChatResponse(
                    intent="market_analysis",
                    response=self._format_market_analysis_response(analysis_data, user_input),
                    data=analysis_data
                )
            return ChatResponse(
                intent="market_analysis",
                response="Let me search for the latest news and analysis...",
                data={
                    "needs_search": True,
                    "market": intent.market or "SOL-PERP",
                    "question": user_input,
                    "intent": "market_analysis"
                }
            )

        else:
            # General chat
            return await self._chat_with_llm(user_input, context)

    async def chat(self, user_input: str, context: Dict[str, Any] = None) -> ChatResponse:
        """Handle conversational chat with context. Supports compound queries with multiple intents."""
        context = context or {}
        
        # Get previous context and chat history for follow-up questions
        last_context = context.get("last_context")
        chat_history = context.get("chat_history", [])
        
        # Classify intent (LLM will detect compound queries and return secondary_intents)
        intent = await self.classify_intent(user_input, last_context, chat_history)

        # Process primary intent
        primary_response = await self._process_single_intent(intent, context, user_input)
        
        # Check for secondary intents (compound queries)
        if intent.secondary_intents:
            # Add secondary intents info to data for chat.py to process
            primary_response.data = primary_response.data or {}
            
            # Convert SecondaryIntent objects to serializable dicts
            secondary_list = []
            for si in intent.secondary_intents:
                si_dict = {
                    "intent": si.intent,
                    "market": si.market or intent.market,  # Inherit market if not specified
                    "days": si.days or intent.days,
                    "amount": si.amount or intent.amount,
                    "currency": si.currency or intent.currency,
                    "position_type": si.position_type or intent.position_type
                }
                secondary_list.append(si_dict)
            
            primary_response.data["secondary_intents"] = secondary_list
        
        return primary_response

    def _format_balance_response(self, balance: Dict) -> str:
        if not balance:
            return "Your account balance:\n- USDC: $10,000.00 (Simulation Mode)\n- Available Margin: $10,000.00\n\nNote: Running in simulation mode with virtual funds."

        total = balance.get("total_usd", 0)
        available = balance.get("available_usd", 0)
        return f"Your account balance:\n- Total Value: ${total:,.2f}\n- Available Margin: ${available:,.2f}"

    def _format_prices_response(self, prices: Dict) -> str:
        if not prices:
            return "Unable to fetch prices at the moment."

        lines = ["Current Market Prices:"]
        for market, price in prices.items():
            symbol = market.replace("-PERP", "")
            lines.append(f"- {symbol}: ${price:,.2f}")
        return "\n".join(lines)

    def _format_positions_response(self, positions: list) -> str:
        if not positions:
            return "You don't have any open positions.\n\nIn simulation mode, create a trading rule to start paper trading!"

        lines = ["Your Open Positions:"]
        for pos in positions:
            lines.append(f"- {pos['market']}: {pos['size']} @ ${pos['entry_price']:,.2f}")
        return "\n".join(lines)

    def _get_help_response(self) -> str:
        return """Welcome to the Solana Trading Bot!

I can help you with:
- **Check Balance**: Ask "What's my balance?" or "How much money do I have?"
- **Check Prices**: Ask "What's the price of BTC?" or "Show me crypto prices"
- **Historical Prices**: Ask "How did SOL perform last 7 days?" or "Show me BTC history"
- **Compare Currencies**: Ask "Which crypto performed best last 7 days?" or "Compare all currencies"
- **Profit Calculator**: Ask "How much profit if I invested $100 in SOL last week?"
- **View Positions**: Ask "What are my positions?" or "Show my portfolio"
- **Create Trading Rules**: Use natural language like "Buy BTC when it drops below $60,000"

**💡 Pro Tip - Profit in Down Markets:**
This bot uses Drift Protocol perpetual futures, so you can:
- **Short (Sell)** to profit when prices DROP: "Sell SOL if it goes above $150"
- **Long (Buy)** to profit when prices RISE: "Buy BTC when it drops below $60,000"

Available Markets: SOL, BTC, ETH, DOGE, XRP (perpetual futures)

The bot is currently running in simulation mode with $10,000 virtual funds."""

    def _format_historical_response(self, data: Dict) -> str:
        """Format historical price data response."""
        market = data.get("market", "").replace("-PERP", "")
        days = data.get("days", 7)
        
        stats = data.get("statistics", {})
        if not stats:
            return f"Historical data for {market} over {days} days is not available."
        
        current = stats.get("current_price", 0)
        start = stats.get("start_price", 0)
        high = stats.get("high_price", 0)
        low = stats.get("low_price", 0)
        change_pct = stats.get("price_change_percent", 0)
        change = stats.get("price_change", 0)
        
        direction = "📈 up" if change_pct >= 0 else "📉 down"
        sign = "+" if change >= 0 else ""
        
        return f"""📊 **{market} Performance - Last {days} Days**

**Current Price:** ${current:,.2f}
**{days}D Change:** {sign}${change:,.2f} ({sign}{change_pct:.2f}%) {direction}

**Period Statistics:**
- Starting Price: ${start:,.2f}
- Highest Price: ${high:,.2f}
- Lowest Price: ${low:,.2f}

The chart shows {market} has been {direction} over the past {days} days."""

    def _format_profit_response(self, data: Dict) -> str:
        """Format profit calculation response."""
        market = data.get("market", "").replace("-PERP", "")
        days = data.get("days", 7)
        amount = data.get("investment_amount", 100)
        currency = data.get("currency", "USD")
        position_type = data.get("position_type", "long")
        
        stats = data.get("statistics", {})
        if not stats:
            return f"Unable to calculate profit for {market}."
        
        start_price = stats.get("start_price", 0)
        current_price = stats.get("current_price", 0)
        
        if start_price <= 0:
            return f"Unable to calculate profit - invalid price data."
        
        # Currency conversion (approximate rates)
        currency_symbol = "$" if currency == "USD" else "₹"
        usd_to_inr = 83.0  # Approximate conversion rate
        
        # Convert investment to USD for calculation
        if currency == "INR":
            amount_usd = amount / usd_to_inr
        else:
            amount_usd = amount
        
        # Calculate profit based on position type
        price_change_pct = ((current_price - start_price) / start_price) * 100
        
        if position_type == "short":
            # Short position: profit when price goes DOWN
            profit_pct = -price_change_pct  # Invert because short profits when price drops
            profit = amount * (profit_pct / 100)
            final_value = amount + profit
            position_label = "SHORT (sell)"
            position_desc = "opened a short position (betting price would drop)"
        else:
            # Long position: profit when price goes UP
            tokens_bought = amount_usd / start_price
            current_value_usd = tokens_bought * current_price
            profit_usd = current_value_usd - amount_usd
            profit_pct = (profit_usd / amount_usd) * 100
            # Convert back to original currency
            profit = profit_usd * usd_to_inr if currency == "INR" else profit_usd
            final_value = amount + profit
            position_label = "LONG (buy)"
            position_desc = "bought and held"
        
        direction = "PROFIT" if profit >= 0 else "LOSS"
        emoji = "💰" if profit >= 0 else "📉"
        sign = "+" if profit >= 0 else ""
        
        # Price movement description
        price_dir = "dropped" if price_change_pct < 0 else "rose"
        
        return f"""{emoji} **{position_label} Profit Calculator - {market}**

**Investment:** {currency_symbol}{amount:,.2f} {currency} {days} days ago

**Market Movement:**
- Starting Price: ${start_price:,.2f}
- Current Price: ${current_price:,.2f}
- Price {price_dir}: {abs(price_change_pct):.2f}%

**If you had {position_desc}:**
- Final Value: {currency_symbol}{final_value:,.2f} {currency}
- **{direction}: {sign}{currency_symbol}{abs(profit):,.2f} ({sign}{profit_pct:.2f}%)**

{'✅ Good call! Shorting was profitable because price dropped.' if position_type == 'short' and profit > 0 else '❌ The short would have lost money because price rose.' if position_type == 'short' and profit <= 0 else '✅ Good timing! Buying was profitable.' if profit > 0 else '❌ Buying would have lost money due to price drop.'}

*Note: This is a simulation. Trading perpetual futures involves leverage and liquidation risks.*"""

    def _format_profit_scan_response(self, data: Dict) -> str:
        """Format profit scan response showing all coins' LONG and SHORT profitability."""
        days = data.get("days", 7)
        amount = data.get("amount", 100.0)
        currency = data.get("currency", "USD")
        results = data.get("results", [])
        
        if not results:
            return "Unable to scan markets. Please try again later."
        
        currency_symbol = "$" if currency == "USD" else "₹"
        usd_to_inr = 83.0
        
        # Calculate profit for each coin (both LONG and SHORT)
        coin_profits = []
        for result in results:
            market = result.get("market", "").replace("-PERP", "")
            start_price = result.get("start_price", 0)
            current_price = result.get("current_price", 0)
            change_pct = result.get("price_change_percent", 0)
            
            if start_price <= 0:
                continue
            
            # LONG profit
            long_profit_pct = change_pct
            long_profit = amount * (long_profit_pct / 100)
            
            # SHORT profit (inverse)
            short_profit_pct = -change_pct
            short_profit = amount * (short_profit_pct / 100)
            
            coin_profits.append({
                "market": market,
                "change_pct": change_pct,
                "long_profit": long_profit,
                "long_profit_pct": long_profit_pct,
                "short_profit": short_profit,
                "short_profit_pct": short_profit_pct,
                "current_price": current_price
            })
        
        # Sort by absolute change (most movement first)
        coin_profits.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
        
        # Find profitable opportunities
        long_profitable = [c for c in coin_profits if c["long_profit"] > 0]
        short_profitable = [c for c in coin_profits if c["short_profit"] > 0]
        
        lines = [f"🔍 **Market Profit Scan - Last {days} Days**"]
        lines.append(f"Investment: {currency_symbol}{amount:,.2f} {currency}\n")
        
        # Summary
        if long_profitable:
            lines.append(f"✅ **{len(long_profitable)} coin(s) would have profited from LONG (buying)**")
            for coin in sorted(long_profitable, key=lambda x: x["long_profit"], reverse=True):
                sign = "+"
                lines.append(f"   - {coin['market']}: {sign}{currency_symbol}{coin['long_profit']:,.2f} ({sign}{coin['long_profit_pct']:.2f}%)")
        else:
            lines.append("❌ **No coins profitable for LONG positions** (market was down)")
        
        lines.append("")
        
        if short_profitable:
            lines.append(f"✅ **{len(short_profitable)} coin(s) would have profited from SHORT (selling)**")
            for coin in sorted(short_profitable, key=lambda x: x["short_profit"], reverse=True):
                sign = "+"
                lines.append(f"   - {coin['market']}: {sign}{currency_symbol}{coin['short_profit']:,.2f} ({sign}{coin['short_profit_pct']:.2f}%)")
        else:
            lines.append("❌ **No coins profitable for SHORT positions** (market was up)")
        
        lines.append("\n📊 **Full Market Overview:**")
        lines.append("| Coin | Price | Change | LONG | SHORT |")
        lines.append("|------|-------|--------|------|-------|")
        
        for coin in coin_profits:
            change_emoji = "📈" if coin["change_pct"] >= 0 else "📉"
            long_emoji = "✅" if coin["long_profit"] > 0 else "❌"
            short_emoji = "✅" if coin["short_profit"] > 0 else "❌"
            sign = "+" if coin["change_pct"] >= 0 else ""
            lines.append(f"| {coin['market']} | ${coin['current_price']:,.2f} | {change_emoji} {sign}{coin['change_pct']:.1f}% | {long_emoji} {currency_symbol}{coin['long_profit']:+,.0f} | {short_emoji} {currency_symbol}{coin['short_profit']:+,.0f} |")
        
        lines.append("\n💡 **Tip:** In a down market, SHORT positions profit. Use perpetual futures to profit either direction!")
        
        return "\n".join(lines)

    def _format_comparison_response(self, data: Dict) -> str:
        """Format comparison data response showing best/worst performers."""
        days = data.get("days", 7)
        results = data.get("results", [])
        
        if not results:
            return "Unable to fetch comparison data. Please try again later."
        
        # Sort by performance (best to worst)
        sorted_results = sorted(results, key=lambda x: x.get("price_change_percent", 0), reverse=True)
        
        lines = [f"🏆 **Crypto Performance Comparison - Last {days} Days**\n"]
        
        # Best performer
        if sorted_results:
            best = sorted_results[0]
            symbol = best.get("market", "").replace("-PERP", "")
            change_pct = best.get("price_change_percent", 0)
            sign = "+" if change_pct >= 0 else ""
            lines.append(f"🥇 **Best Performer:** {symbol} ({sign}{change_pct:.2f}%)")
        
        # Worst performer
        if len(sorted_results) > 1:
            worst = sorted_results[-1]
            symbol = worst.get("market", "").replace("-PERP", "")
            change_pct = worst.get("price_change_percent", 0)
            sign = "+" if change_pct >= 0 else ""
            lines.append(f"🥉 **Worst Performer:** {symbol} ({sign}{change_pct:.2f}%)")
        
        lines.append("\n**All Rankings:**")
        
        for i, result in enumerate(sorted_results, 1):
            market = result.get("market", "").replace("-PERP", "")
            current = result.get("current_price", 0)
            change_pct = result.get("price_change_percent", 0)
            sign = "+" if change_pct >= 0 else ""
            emoji = "📈" if change_pct >= 0 else "📉"
            
            lines.append(f"{i}. {emoji} **{market}**: ${current:,.2f} ({sign}{change_pct:.2f}%)")
        
        return "\n".join(lines)

    def _format_market_analysis_response(self, data: Dict, user_question: str) -> str:
        """Format market analysis response with web search results."""
        coin = data.get("coin", "").upper()
        current_price = data.get("current_price")
        price_change = data.get("price_change")
        search_results = data.get("search_results", [])
        has_results = data.get("has_results", False)
        
        lines = [f"🔍 **{coin} Market Analysis**\n"]
        
        # Price context
        if current_price:
            price_emoji = "📈" if price_change and price_change >= 0 else "📉"
            change_str = f" ({price_change:+.2f}%)" if price_change else ""
            lines.append(f"**Current Price:** ${current_price:,.6f}{change_str} {price_emoji}\n")
        
        if has_results and search_results:
            lines.append("📰 **Latest News & Analysis:**\n")
            
            for i, result in enumerate(search_results[:4], 1):
                title = result.get("title", "")
                body = result.get("body", "")[:200]
                href = result.get("href", "")
                
                if title:
                    lines.append(f"**{i}. {title}**")
                    if body:
                        lines.append(f"   {body}...")
                    if href:
                        lines.append(f"   🔗 [Read more]({href})\n")
        else:
            lines.append("*No recent news found. Here's what we know:*\n")
            
            # Provide general analysis based on coin type
            meme_coins = ["BONK", "WIF", "PEPE", "SHIB", "DOGE"]
            if coin in meme_coins:
                lines.append(f"""**{coin} Analysis:**
- 🎭 **Meme Coin**: High volatility, sentiment-driven
- 📊 **Market Cap**: Typically lower than major cryptos
- 💡 **Price Drivers**: Social media trends, influencer mentions, community activity
- ⚠️ **Risk**: Very high - prices can swing 50%+ in a day

{coin} prices often move based on:
- Twitter/X trends and viral content
- Celebrity/influencer mentions
- Overall crypto market sentiment
- Speculative trading volume""")
            else:
                lines.append(f"""**{coin} Price Factors:**
- 📈 Overall crypto market sentiment
- 🏛️ Regulatory news
- 🔧 Project development updates
- 💰 Institutional investment flows""")
        
        lines.append("\n💡 **Tip:** Would you like to set up a price alert or trading rule for {coin}?".format(coin=coin))
        
        return "\n".join(lines)

    async def _chat_with_llm(self, user_input: str, context: Dict) -> ChatResponse:
        """Generate a chat response using LLM."""
        client, model, http_client = await get_openai_client()

        # Build context message
        context_info = ""
        if context.get("prices"):
            context_info += f"\nCurrent prices: {json.dumps(context['prices'])}"
        if context.get("balance"):
            context_info += f"\nUser balance: {json.dumps(context['balance'])}"

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": CHAT_SYSTEM_PROMPT + context_info},
                    {"role": "user", "content": user_input}
                ],
                temperature=0.7,
                max_tokens=500
            )

            return ChatResponse(
                intent="general_chat",
                response=response.choices[0].message.content,
                data=None
            )
        except Exception as e:
            return ChatResponse(
                intent="general_chat",
                response="I'm having trouble processing your request. Please try again or ask for help.",
                data=None
            )
        finally:
            await http_client.aclose()


# Singleton instance
llm_agent = LLMAgent()
