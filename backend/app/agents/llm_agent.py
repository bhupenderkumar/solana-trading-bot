import json
import os
import ssl
import certifi
import re
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel
from app.config import get_settings
from app.models import ConditionType, ActionType

# Fix SSL certificate issues
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

settings = get_settings()


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


class IntentClassification(BaseModel):
    intent: Literal["trading_rule", "balance_query", "price_query", "position_query", "help", "general_chat"]
    market: Optional[str] = None  # For price/position queries
    confidence: float = 1.0


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


INTENT_CLASSIFICATION_PROMPT = """You are an intent classifier for a crypto trading bot. Classify the user's message into one of these intents:

1. "trading_rule" - User wants to create a trading rule/condition (e.g., "buy BTC when price drops to 60k", "sell SOL if it goes above 100")
2. "balance_query" - User asks about their balance, funds, or account value (e.g., "what's my balance", "how much money do I have", "show my funds")
3. "price_query" - User asks about current prices (e.g., "what's the price of BTC", "how much is SOL worth", "ETH price")
4. "position_query" - User asks about their positions or holdings (e.g., "what are my positions", "show my portfolio", "do I have any open positions")
5. "help" - User needs help or guidance (e.g., "help", "what can you do", "how does this work")
6. "general_chat" - Other conversation that doesn't fit above (e.g., "hello", "thanks", general questions)

Respond with JSON:
{
    "intent": "<intent_type>",
    "market": "<market_symbol or null>",
    "confidence": <0.0-1.0>
}

If a specific market is mentioned (BTC, SOL, ETH, etc.), include it in "market" field as "BTC-PERP", "SOL-PERP", etc.
Return ONLY the JSON, no other text."""


CHAT_SYSTEM_PROMPT = """You are a helpful trading assistant for a Solana-based perpetual futures trading bot using Drift Protocol.

You can help users with:
- Creating trading rules (conditions that trigger automatic trades)
- Checking account balances and positions
- Getting current crypto prices
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

        # Prefer GitHub proxy for Claude (free via GitHub Models)
        if self.settings.use_github_proxy:
            return await self._parse_with_github_proxy(user_message)
        elif self.settings.openai_api_key:
            return await self._parse_with_openai(user_message)
        elif self.settings.anthropic_api_key:
            return await self._parse_with_anthropic(user_message)
        else:
            raise ValueError("No LLM configured. Enable USE_GITHUB_PROXY or set API keys")

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
        """Parse using OpenAI API."""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.settings.openai_api_key)

        response = await client.chat.completions.create(
            model=self.settings.llm_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return ParsedRule(**result)

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

    async def classify_intent(self, user_input: str) -> IntentClassification:
        """Classify the intent of user's message."""
        # First try quick pattern matching for common queries
        lower_input = user_input.lower().strip()

        # Balance queries
        if any(kw in lower_input for kw in ["balance", "funds", "money", "account", "how much do i have"]):
            return IntentClassification(intent="balance_query", confidence=0.95)

        # Price queries
        if any(kw in lower_input for kw in ["price of", "price for", "worth", "how much is", "current price"]):
            market = self._extract_market(lower_input)
            return IntentClassification(intent="price_query", market=market, confidence=0.95)

        # Position queries
        if any(kw in lower_input for kw in ["position", "portfolio", "holdings", "what do i own", "open trades"]):
            return IntentClassification(intent="position_query", confidence=0.95)

        # Help queries
        if any(kw in lower_input for kw in ["help", "what can you do", "how does this work", "commands"]):
            return IntentClassification(intent="help", confidence=0.95)

        # Trading rule patterns
        if any(kw in lower_input for kw in ["if ", "when ", "buy ", "sell ", "above", "below", "drops", "rises"]):
            return IntentClassification(intent="trading_rule", confidence=0.85)

        # Fall back to LLM for classification
        return await self._classify_with_llm(user_input)

    def _extract_market(self, text: str) -> Optional[str]:
        """Extract market symbol from text."""
        market_map = {
            "btc": "BTC-PERP", "bitcoin": "BTC-PERP",
            "sol": "SOL-PERP", "solana": "SOL-PERP",
            "eth": "ETH-PERP", "ethereum": "ETH-PERP",
            "doge": "DOGE-PERP", "dogecoin": "DOGE-PERP",
            "xrp": "XRP-PERP", "ripple": "XRP-PERP",
        }
        text_lower = text.lower()
        for keyword, market in market_map.items():
            if keyword in text_lower:
                return market
        return None

    async def _classify_with_llm(self, user_input: str) -> IntentClassification:
        """Classify intent using LLM."""
        import httpx
        from openai import AsyncOpenAI

        http_client = httpx.AsyncClient(verify=certifi.where())
        client = AsyncOpenAI(
            api_key="github-proxy",
            base_url=self.settings.github_proxy_url,
            http_client=http_client
        )

        try:
            response = await client.chat.completions.create(
                model=self.settings.llm_model,
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

    async def chat(self, user_input: str, context: Dict[str, Any] = None) -> ChatResponse:
        """Handle conversational chat with context."""
        # Classify intent first
        intent = await self.classify_intent(user_input)
        context = context or {}

        # Handle different intents
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
                    response=f"The current price of {market.replace('-PERP', '')} is ${price:,.2f}",
                    data={"market": market, "price": price}
                )
            elif prices:
                return ChatResponse(
                    intent="price_query",
                    response=self._format_prices_response(prices),
                    data=prices
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

        else:
            # General chat - use LLM
            return await self._chat_with_llm(user_input, context)

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
- **View Positions**: Ask "What are my positions?" or "Show my portfolio"
- **Create Trading Rules**: Use natural language like "Buy BTC when it drops below $60,000"

Available Markets: SOL, BTC, ETH, DOGE, XRP (perpetual futures)

The bot is currently running in simulation mode with $10,000 virtual funds."""

    async def _chat_with_llm(self, user_input: str, context: Dict) -> ChatResponse:
        """Generate a chat response using LLM."""
        import httpx
        from openai import AsyncOpenAI

        http_client = httpx.AsyncClient(verify=certifi.where())
        client = AsyncOpenAI(
            api_key="github-proxy",
            base_url=self.settings.github_proxy_url,
            http_client=http_client
        )

        # Build context message
        context_info = ""
        if context.get("prices"):
            context_info += f"\nCurrent prices: {json.dumps(context['prices'])}"
        if context.get("balance"):
            context_info += f"\nUser balance: {json.dumps(context['balance'])}"

        try:
            response = await client.chat.completions.create(
                model=self.settings.llm_model,
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
