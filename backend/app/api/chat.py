from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

from app.database import get_db
from app.models import Conversation, ChatMessage, TradingRule, RuleStatus, Trade
from app.agents.llm_agent import llm_agent, ChatResponse, SecondaryIntent
from app.agents.orchestrator import orchestrator_agent
from app.agents.base_agent import AgentContext
from app.services.drift_service import drift_service
from app.services import price_history_service
from app.services.web_search_service import web_search_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ============= Helper: Gather full context for smart LLM =============

async def gather_full_context(
    db: AsyncSession,
    wallet_address: Optional[str] = None
) -> Dict[str, Any]:
    """Gather all relevant context for the smart LLM: rules, trades, prices, balance."""
    
    # Fetch prices
    prices = await drift_service.get_all_perp_prices()
    
    # Fetch balance
    balance = await drift_service.get_account_balance()
    if not balance:
        balance = {"total_usd": 10000, "available_usd": 10000, "simulation_mode": True}
    else:
        balance["simulation_mode"] = True
    
    # Fetch trading rules
    rules_query = select(TradingRule).order_by(TradingRule.created_at.desc()).limit(20)
    if wallet_address:
        rules_query = rules_query.where(TradingRule.wallet_address == wallet_address)
    rules_result = await db.execute(rules_query)
    rules_data = []
    for rule in rules_result.scalars().all():
        rules_data.append({
            "id": rule.id,
            "market": rule.market,
            "condition_type": rule.condition_type.value if rule.condition_type else None,
            "condition_value": rule.condition_value,
            "action_type": rule.action_type.value if rule.action_type else None,
            "status": rule.status.value if rule.status else "unknown",
            "user_input": rule.user_input,
            "parsed_summary": rule.parsed_summary,
            "triggered_at": rule.triggered_at.isoformat() if rule.triggered_at else None,
            "created_at": rule.created_at.isoformat() if rule.created_at else None
        })
    
    # Fetch executed trades
    trades_query = select(Trade).order_by(Trade.executed_at.desc()).limit(20)
    if wallet_address:
        trades_query = trades_query.where(Trade.wallet_address == wallet_address)
    trades_result = await db.execute(trades_query)
    trades_data = []
    for trade in trades_result.scalars().all():
        trades_data.append({
            "id": trade.id,
            "rule_id": trade.rule_id,
            "market": trade.market,
            "side": trade.side,
            "size": trade.size,
            "price": trade.price,
            "status": trade.status,
            "tx_signature": trade.tx_signature,
            "executed_at": trade.executed_at.isoformat() if trade.executed_at else None
        })
    
    return {
        "prices": prices,
        "balance": balance,
        "rules": rules_data,
        "trades": trades_data
    }


# ============= Helper: Check if query needs smart LLM =============

def needs_smart_response(message: str) -> bool:
    """Check if a message would benefit from the smart LLM with full context."""
    smart_keywords = [
        "trade", "trades", "executed", "position", "positions",
        "my rule", "my rules", "my agent", "my agents", "show rule", "show rules",
        "what rule", "what rules", "previous", "history", "how many",
        "status", "triggered", "active rule", "active agent"
    ]
    message_lower = message.lower()
    return any(kw in message_lower for kw in smart_keywords)


# ============= Helper: Check if query needs insightful price response =============

def needs_insightful_price_response(message: str) -> Optional[str]:
    """
    Check if a message is asking about price/market and would benefit from insightful response.
    Returns the detected coin symbol or None.
    """
    message_lower = message.lower()
    
    # Keywords that trigger insightful response
    price_keywords = [
        "price", "worth", "cost", "value", "how much",
        "market", "analysis", "sentiment", "news", "update",
        "what is", "what's", "show me", "tell me about",
        "outlook", "prediction", "forecast", "should i buy", "should i sell",
        "situation", "happening"
    ]
    
    if not any(kw in message_lower for kw in price_keywords):
        return None
    
    # Detect coin from message
    coin_patterns = {
        "sol": "SOL",
        "solana": "SOL",
        "btc": "BTC",
        "bitcoin": "BTC",
        "eth": "ETH",
        "ethereum": "ETH",
        "xrp": "XRP",
        "ripple": "XRP",
        "doge": "DOGE",
        "dogecoin": "DOGE",
        "bonk": "BONK",
        "wif": "WIF",
        "dogwifhat": "WIF",
        "pepe": "PEPE",
    }
    
    for pattern, coin in coin_patterns.items():
        if pattern in message_lower:
            return coin
    
    return None


# ============= Helper: Gather comprehensive market data =============

async def gather_insightful_market_data(coin: str, prices: Dict[str, float]) -> Dict[str, Any]:
    """
    Gather comprehensive market data for insightful response.
    Includes price, stats, news, and sentiment.
    """
    market = f"{coin}-PERP"
    current_price = prices.get(market, 0)
    
    # Get historical stats
    stats = None
    try:
        stats = await price_history_service.get_price_statistics(market, 7)
    except Exception as e:
        pass
    
    price_change_7d = stats.get("price_change_percent") if stats else None
    high_7d = stats.get("high_price") if stats else None
    low_7d = stats.get("low_price") if stats else None
    
    # Gather comprehensive market data including news and sentiment
    try:
        market_data = await web_search_service.gather_comprehensive_market_data(
            coin=coin,
            current_price=current_price,
            price_change_7d=price_change_7d,
            high_7d=high_7d,
            low_7d=low_7d
        )
        return market_data
    except Exception as e:
        # Return basic data on error
        return {
            "coin": coin,
            "current_price": current_price,
            "price_change_7d": price_change_7d,
            "high_7d": high_7d,
            "low_7d": low_7d,
            "trend": "neutral",
            "trend_strength": "unknown",
            "news": [],
            "sentiment_data": [],
            "analysis_data": [],
            "has_data": False
        }


# ============= Helper: Process secondary intent =============

async def process_secondary_intent(
    secondary: Dict,
    context: Dict, 
    prices: Dict,
    db: AsyncSession
) -> Optional[str]:
    """Process a secondary intent and return its response text."""
    intent = secondary.get("intent")
    market = secondary.get("market")
    days = secondary.get("days", 7)
    
    if intent == "price_query":
        if market and market in prices:
            price = prices[market]
            return f"**{market.replace('-PERP', '')} Price:** ${price:,.2f}"
        elif prices:
            lines = ["**Current Prices:**"]
            for m, p in prices.items():
                lines.append(f"- {m.replace('-PERP', '')}: ${p:,.2f}")
            return "\n".join(lines)
    
    elif intent == "market_analysis":
        if market:
            symbol = market.replace("-PERP", "")
            current_price = prices.get(market)
            try:
                stats = await price_history_service.get_price_statistics(market, 7)
                price_change = stats.get("price_change_percent") if stats else None
                search_data = await web_search_service.search_and_summarize(
                    coin=symbol,
                    question=f"Why is {symbol} moving?",
                    current_price=current_price,
                    price_change=price_change
                )
                if search_data.get("results"):
                    news_lines = [f"\n**{symbol} News:**"]
                    for r in search_data["results"][:2]:
                        news_lines.append(f"- {r.get('title', 'News')}")
                    return "\n".join(news_lines)
                return f"\n**{symbol} Analysis:** No recent news found."
            except Exception as e:
                return f"\n**{symbol} Analysis:** Unable to fetch news."
    
    elif intent == "historical_price_query":
        if market:
            try:
                stats = await price_history_service.get_price_statistics(market, days)
                if stats:
                    change_pct = stats.get("price_change_percent", 0)
                    direction = "📈" if change_pct >= 0 else "📉"
                    return f"\n**{market.replace('-PERP', '')} {days}D Performance:** {direction} {'+' if change_pct >= 0 else ''}{change_pct:.2f}%"
            except:
                pass
    
    elif intent == "balance_query":
        balance = await drift_service.get_account_balance()
        if balance:
            total = balance.get("total_usd", 10000)
            return f"\n**Balance:** ${total:,.2f}"
    
    elif intent == "position_query":
        # This is now handled by smart_chat with full context
        # Return None to let the main handler deal with it
        return None
    
    return None


# ============= Pydantic Schemas =============

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[int] = None  # If None, creates new conversation
    wallet_address: Optional[str] = None  # Wallet address to bind conversation to


class ChatApiResponse(BaseModel):
    intent: str
    response: str
    data: Optional[Dict[str, Any]] = None
    should_create_rule: bool = False
    original_input: Optional[str] = None
    conversation_id: int
    message_id: int


class ConversationStats(BaseModel):
    total_rules: int
    active_rules: int
    triggered_rules: int
    paused_rules: int


class ConversationResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    stats: ConversationStats
    last_message: Optional[str] = None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    intent: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationDetailResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    stats: ConversationStats
    messages: List[MessageResponse]
    rules: List[Dict[str, Any]]


class UpdateConversationRequest(BaseModel):
    title: str


# ============= Helper Functions =============

async def get_conversation_stats(db: AsyncSession, conversation_id: int) -> ConversationStats:
    """Get rule statistics for a conversation."""
    result = await db.execute(
        select(
            sql_func.count(TradingRule.id).label("total"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.ACTIVE).label("active"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.TRIGGERED).label("triggered"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.PAUSED).label("paused"),
        ).where(TradingRule.conversation_id == conversation_id)
    )
    row = result.first()
    return ConversationStats(
        total_rules=row.total or 0,
        active_rules=row.active or 0,
        triggered_rules=row.triggered or 0,
        paused_rules=row.paused or 0
    )


async def generate_title_from_message(message: str) -> str:
    """Generate a short, descriptive title from the first message using AI."""
    try:
        from app.agents.llm_agent import get_openai_client
        
        client, model, http_client = await get_openai_client()
        
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Generate a very short title (3-5 words max) for this chat conversation. No quotes, no punctuation at the end. Just the title text. Examples: 'Buy SOL strategy', 'ETH price check', 'Portfolio balance query'"
                },
                {
                    "role": "user", 
                    "content": message
                }
            ],
            max_tokens=20,
            temperature=0.3
        )
        
        await http_client.aclose()
        
        title = response.choices[0].message.content.strip()
        # Remove quotes if AI added them
        title = title.strip('"\'\'\"')
        # Truncate if too long
        if len(title) > 40:
            title = title[:37] + "..."
        return title if title else "Chat"
        
    except Exception as e:
        # Fallback: simple truncation if AI fails
        title = message.strip()[:35]
        return title if title else "Chat"


# ============= Conversation Endpoints =============

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    wallet_address: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List all conversations with their stats, optionally filtered by wallet."""
    # Get conversations, optionally filtered by wallet
    query = select(Conversation).order_by(Conversation.updated_at.desc())
    if wallet_address:
        query = query.where(Conversation.wallet_address == wallet_address)
    result = await db.execute(query)
    conversations = result.scalars().all()
    
    if not conversations:
        return []
    
    conv_ids = [c.id for c in conversations]
    
    # Batch get stats for all conversations in one query
    stats_result = await db.execute(
        select(
            TradingRule.conversation_id,
            sql_func.count(TradingRule.id).label("total"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.ACTIVE).label("active"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.TRIGGERED).label("triggered"),
            sql_func.count(TradingRule.id).filter(TradingRule.status == RuleStatus.PAUSED).label("paused"),
        )
        .where(TradingRule.conversation_id.in_(conv_ids))
        .group_by(TradingRule.conversation_id)
    )
    stats_map = {row.conversation_id: row for row in stats_result.all()}
    
    # Batch get last messages using a subquery
    from sqlalchemy import desc
    subq = (
        select(
            ChatMessage.conversation_id,
            ChatMessage.content,
            sql_func.row_number().over(
                partition_by=ChatMessage.conversation_id,
                order_by=desc(ChatMessage.created_at)
            ).label("rn")
        )
        .where(ChatMessage.conversation_id.in_(conv_ids))
        .subquery()
    )
    msg_result = await db.execute(
        select(subq.c.conversation_id, subq.c.content).where(subq.c.rn == 1)
    )
    msg_map = {row.conversation_id: row.content for row in msg_result.all()}
    
    response = []
    for conv in conversations:
        stats_row = stats_map.get(conv.id)
        response.append(ConversationResponse(
            id=conv.id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            stats=ConversationStats(
                total_rules=stats_row.total if stats_row else 0,
                active_rules=stats_row.active if stats_row else 0,
                triggered_rules=stats_row.triggered if stats_row else 0,
                paused_rules=stats_row.paused if stats_row else 0
            ),
            last_message=msg_map.get(conv.id)
        ))
    
    return response


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Chat"
    wallet_address: Optional[str] = None


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    request: CreateConversationRequest = CreateConversationRequest(),
    db: AsyncSession = Depends(get_db)
):
    """Create a new conversation."""
    conv = Conversation(title=request.title or "New Chat", wallet_address=request.wallet_address)
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    
    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        stats=ConversationStats(total_rules=0, active_rules=0, triggered_rules=0, paused_rules=0),
        last_message=None
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(conversation_id: int, db: AsyncSession = Depends(get_db)):
    """Get a conversation with all messages and rules."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get messages
    msg_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = msg_result.scalars().all()
    
    # Get rules
    rule_result = await db.execute(
        select(TradingRule)
        .where(TradingRule.conversation_id == conversation_id)
        .order_by(TradingRule.created_at.desc())
    )
    rules = rule_result.scalars().all()
    
    stats = await get_conversation_stats(db, conversation_id)
    
    return ConversationDetailResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        stats=stats,
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                intent=m.intent,
                data=m.data,
                created_at=m.created_at
            ) for m in messages
        ],
        rules=[
            {
                "id": r.id,
                "user_input": r.user_input,
                "parsed_summary": r.parsed_summary,
                "market": r.market,
                "status": r.status.value,
                "created_at": r.created_at.isoformat(),
                "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None
            } for r in rules
        ]
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int, 
    request: UpdateConversationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update a conversation (e.g., rename)."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conv.title = request.title
    await db.flush()
    await db.refresh(conv)
    
    stats = await get_conversation_stats(db, conversation_id)
    
    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        stats=stats,
        last_message=None
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a conversation and its messages."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Delete messages first
    await db.execute(
        ChatMessage.__table__.delete().where(ChatMessage.conversation_id == conversation_id)
    )
    
    # Unlink rules (don't delete them)
    await db.execute(
        TradingRule.__table__.update()
        .where(TradingRule.conversation_id == conversation_id)
        .values(conversation_id=None)
    )
    
    await db.delete(conv)
    
    return {"status": "deleted"}


# ============= Chat Endpoint =============

@router.post("/", response_model=ChatApiResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Handle natural language chat messages within a conversation.
    Creates new conversation if conversation_id is None.
    """
    try:
        # Get or create conversation
        if request.conversation_id:
            result = await db.execute(
                select(Conversation).where(Conversation.id == request.conversation_id)
            )
            conversation = result.scalar_one_or_none()
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            # Update wallet if provided and not already set
            if request.wallet_address and not conversation.wallet_address:
                conversation.wallet_address = request.wallet_address
            # Update title if still "New Chat" (first real message)
            if conversation.title == "New Chat":
                conversation.title = await generate_title_from_message(request.message)
        else:
            # Create new conversation with wallet_address
            title = await generate_title_from_message(request.message)
            conversation = Conversation(title=title, wallet_address=request.wallet_address)
            db.add(conversation)
            await db.flush()
            await db.refresh(conversation)
        
        # Fetch recent conversation history for context-aware LLM
        chat_history = []
        last_context = None
        if request.conversation_id:
            # Get last 6 messages for context
            history_result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == conversation.id)
                .order_by(ChatMessage.created_at.desc())
                .limit(6)
            )
            recent_messages = list(reversed(history_result.scalars().all()))
            
            # Convert to chat_history format for LLM
            chat_history = [
                {"role": msg.role, "content": msg.content}
                for msg in recent_messages
            ]
            
            # Get last assistant message data for context continuity
            for msg in reversed(recent_messages):
                if msg.role == "assistant" and msg.data:
                    last_context = msg.data
                    break
        
        # Save user message
        user_message = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=request.message
        )
        db.add(user_message)
        await db.flush()
        
        # Get current context (prices, balance, positions)
        prices = await drift_service.get_all_perp_prices()
        balance = await drift_service.get_account_balance()

        # ============= MULTI-AGENT ORCHESTRATION =============
        # Use orchestrator to coordinate multiple agents
        # LLM decides which agents to invoke (no hardcoded if-else)
        
        agent_context = AgentContext(
            user_message=request.message,
            conversation_id=conversation.id,
            wallet_address=request.wallet_address,
            chat_history=chat_history,
            prices=prices
        )
        
        # Run orchestrator - it will:
        # 1. Use LLM to decide which agents to invoke
        # 2. Run agents in parallel
        # 3. Combine results using LLM
        orchestrator_result = await orchestrator_agent.execute(agent_context)
        
        if orchestrator_result.success:
            response_text = orchestrator_result.data.get("response", "I couldn't process your request.")
            agents_used = orchestrator_result.data.get("agents_used", [])
            routing_decision = orchestrator_result.data.get("routing_decision", {})
            
            # Get LLM's decision on intent and rule creation - NO HARDCODING
            intent = routing_decision.get("intent", "general_chat")
            should_create_rule = routing_decision.get("should_create_rule", False)
            original_input = routing_decision.get("original_input") if should_create_rule else None
            
            # If LLM decided to create rule but didn't set original_input, use the message
            if should_create_rule and not original_input:
                original_input = request.message
            
            chat_response = ChatResponse(
                intent=intent,
                response=response_text,
                data={
                    "should_create_rule": should_create_rule,
                    "original_input": original_input,
                    "orchestrator_mode": True,
                    "agents_used": agents_used,
                    "routing_decision": routing_decision,
                    "agent_results": orchestrator_result.data.get("agent_results", {})
                }
            )
        else:
            # Fallback to simple response on orchestrator failure
            chat_response = ChatResponse(
                intent="general_chat",
                response=f"I encountered an issue: {orchestrator_result.error}. Please try again.",
                data={"error": orchestrator_result.error}
            )

        # ============= RESPONSE PROCESSING =============
        # With orchestrator, the response is already complete
        # Just extract key fields for saving
        
        should_create_rule = chat_response.data.get("should_create_rule", False) if chat_response.data else False
        original_input = chat_response.data.get("original_input") if chat_response.data else None
        final_response = chat_response.response
        
        # Save assistant response
        assistant_message = ChatMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=final_response,
            intent=chat_response.intent,
            data={
                "should_create_rule": should_create_rule,
                "original_input": original_input,
                **(chat_response.data or {})
            }
        )
        db.add(assistant_message)
        await db.flush()
        await db.refresh(assistant_message)
        
        # Update conversation timestamp
        conversation.updated_at = datetime.utcnow()
        
        return ChatApiResponse(
            intent=chat_response.intent,
            response=final_response,
            data=chat_response.data,
            should_create_rule=should_create_rule,
            original_input=original_input,
            conversation_id=conversation.id,
            message_id=assistant_message.id
        )

    except HTTPException:
        raise
    except Exception as e:
        return ChatApiResponse(
            intent="error",
            response=f"Sorry, I encountered an error: {str(e)}. Please try again.",
            data=None,
            should_create_rule=False,
            conversation_id=request.conversation_id or 0,
            message_id=0
        )


# ============= Utility Endpoints =============

@router.get("/prices")
async def get_prices():
    """Get current market prices."""
    prices = await drift_service.get_all_perp_prices()
    return {"prices": prices}


@router.get("/balance")
async def get_balance():
    """Get account balance."""
    balance = await drift_service.get_account_balance()
    return {
        **balance,
        "currency": "USDC"
    }


@router.get("/positions")
async def get_positions():
    """Get open positions."""
    return {
        "positions": [],
        "simulation_mode": True
    }
