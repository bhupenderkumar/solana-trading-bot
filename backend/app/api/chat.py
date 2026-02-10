from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

from app.database import get_db
from app.models import Conversation, ChatMessage, TradingRule, RuleStatus
from app.agents.llm_agent import llm_agent, ChatResponse, SecondaryIntent
from app.services.drift_service import drift_service
from app.services import price_history_service
from app.services.web_search_service import web_search_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


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
        return "\n**Positions:** No open positions (Simulation Mode)"
    
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
    """Generate a short title from the first message."""
    # Simple truncation for now, could use LLM for smarter titles
    if len(message) <= 30:
        return message
    return message[:27] + "..."


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
        positions = []  # TODO: Get real positions when available

        context = {
            "prices": prices,
            "balance": balance,
            "positions": positions,
            "conversation_id": conversation.id,
            "last_context": last_context,  # Previous response data
            "chat_history": chat_history   # Full conversation history for LLM
        }

        # Process chat message (LLM will use chat_history for context-aware responses)
        chat_response = await llm_agent.chat(request.message, context)

        # Handle historical price queries
        if chat_response.intent == "historical_price_query" and chat_response.data:
            if chat_response.data.get("needs_fetch"):
                market = chat_response.data.get("market", "SOL-PERP")
                days = chat_response.data.get("days", 7)
                
                try:
                    statistics = await price_history_service.get_price_statistics(market, days)
                    context["historical_data"] = {"market": market, "days": days, "statistics": statistics}
                    chat_response = await llm_agent.chat(request.message, context)
                except Exception as e:
                    chat_response = ChatResponse(
                        intent="historical_price_query",
                        response=f"I couldn't fetch historical data for {market}: {str(e)}",
                        data=None
                    )

        # Handle profit calculation queries
        if chat_response.intent == "profit_calculation" and chat_response.data:
            if chat_response.data.get("needs_calculation"):
                market = chat_response.data.get("market", "SOL-PERP")
                days = chat_response.data.get("days", 7)
                amount = chat_response.data.get("amount", 100.0)
                currency = chat_response.data.get("currency", "USD")
                position_type = chat_response.data.get("position_type", "long")
                
                try:
                    statistics = await price_history_service.get_price_statistics(market, days)
                    context["profit_data"] = {
                        "market": market, 
                        "days": days, 
                        "investment_amount": amount, 
                        "statistics": statistics,
                        "currency": currency,
                        "position_type": position_type
                    }
                    chat_response = await llm_agent.chat(request.message, context)
                except Exception as e:
                    chat_response = ChatResponse(
                        intent="profit_calculation",
                        response=f"I couldn't calculate profit: {str(e)}",
                        data=None
                    )

        # Handle profit scan queries - scan all coins
        if chat_response.intent == "profit_scan" and chat_response.data:
            if chat_response.data.get("needs_scan"):
                days = chat_response.data.get("days", 7)
                amount = chat_response.data.get("amount", 100.0)
                currency = chat_response.data.get("currency", "USD")
                try:
                    scan_data = await price_history_service.scan_all_coins_profit(days)
                    scan_data["amount"] = amount
                    scan_data["currency"] = currency
                    context["profit_scan_data"] = scan_data
                    chat_response = await llm_agent.chat(request.message, context)
                except Exception as e:
                    chat_response = ChatResponse(
                        intent="profit_scan",
                        response=f"I couldn't scan markets: {str(e)}",
                        data=None
                    )

        # Handle comparison queries
        if chat_response.intent == "comparison_query" and chat_response.data:
            if chat_response.data.get("needs_comparison"):
                days = chat_response.data.get("days", 7)
                try:
                    comparison_data = await price_history_service.compare_all_currencies(days)
                    context["comparison_data"] = comparison_data
                    chat_response = await llm_agent.chat(request.message, context)
                except Exception as e:
                    chat_response = ChatResponse(
                        intent="comparison_query",
                        response=f"I couldn't compare currencies: {str(e)}",
                        data=None
                    )

        # Handle market analysis queries - web search for real-time news
        if chat_response.intent == "market_analysis" and chat_response.data:
            if chat_response.data.get("needs_search"):
                market = chat_response.data.get("market", "SOL-PERP")
                question = chat_response.data.get("question", request.message)
                symbol = market.replace("-PERP", "")
                
                # Get current price for context
                current_price = prices.get(market)
                
                # Get historical data for price change
                price_change = None
                try:
                    stats = await price_history_service.get_price_statistics(market, 7)
                    if stats and "price_change_percent" in stats:
                        price_change = stats.get("price_change_percent")
                except:
                    pass
                
                try:
                    # Perform web search
                    search_context = await web_search_service.search_and_summarize(
                        coin=symbol,
                        question=question,
                        current_price=current_price,
                        price_change=price_change
                    )
                    context["market_analysis_data"] = search_context
                    chat_response = await llm_agent.chat(request.message, context)
                except Exception as e:
                    chat_response = ChatResponse(
                        intent="market_analysis",
                        response=f"I couldn't search for market news: {str(e)}. Let me provide general information instead.",
                        data=None
                    )

        # Handle rules queries - fetch rules from database, filtered by wallet
        if chat_response.intent == "rules_query" and chat_response.data:
            if chat_response.data.get("needs_fetch"):
                # Filter by wallet if available
                rules_query = select(TradingRule).order_by(TradingRule.created_at.desc()).limit(10)
                if request.wallet_address:
                    rules_query = rules_query.where(TradingRule.wallet_address == request.wallet_address)
                rule_result = await db.execute(rules_query)
                rules = rule_result.scalars().all()
                
                if rules:
                    lines = ["📋 **Your Trading Rules:**\n"]
                    for r in rules:
                        status_emoji = {"active": "🟢", "paused": "⏸️", "triggered": "✅", "expired": "⏹️"}.get(r.status.value, "❓")
                        lines.append(f"{status_emoji} **{r.market}**: {r.parsed_summary or r.user_input}")
                    response_text = "\n".join(lines)
                else:
                    response_text = "You don't have any trading rules yet.\n\nCreate one by saying something like: \"Buy SOL when it drops below $80\""
                
                chat_response = ChatResponse(
                    intent="rules_query",
                    response=response_text,
                    data={"rules_count": len(rules)}
                )

        # Determine if it's a trading rule or trading action (both can create rules)
        should_create_rule = False
        original_input = None
        analysis_data = None
        
        if chat_response.intent in ("trading_rule", "trading_action"):
            # Check if data explicitly says to create a rule
            if chat_response.data and chat_response.data.get("should_create_rule"):
                should_create_rule = True
                original_input = chat_response.data.get("original_input", request.message)
            elif chat_response.intent == "trading_rule":
                # Default for trading_rule intent
                should_create_rule = True
                original_input = request.message
            
            # Build comprehensive analysis when creating a rule
            if should_create_rule:
                try:
                    # Detect market from user input
                    rule_market = "SOL-PERP"  # Default
                    lower_input = (original_input or request.message).lower()
                    for m in ["BTC-PERP", "ETH-PERP", "SOL-PERP", "BONK-PERP", "WIF-PERP", "DOGE-PERP", "APT-PERP", "ARB-PERP"]:
                        if m.split("-")[0].lower() in lower_input:
                            rule_market = m
                            break
                    
                    symbol = rule_market.replace("-PERP", "")
                    
                    # Get current price
                    current_price = prices.get(rule_market) or await drift_service.get_perp_market_price(rule_market)
                    
                    # Fetch historical data (7-day stats)
                    historical_stats = None
                    try:
                        historical_stats = await price_history_service.get_price_statistics(rule_market, 7)
                    except:
                        pass
                    
                    # Fetch market analysis from web search
                    market_search = None
                    try:
                        price_change = historical_stats.get("price_change_percent") if historical_stats else None
                        market_search = await web_search_service.search_and_summarize(
                            coin=symbol,
                            question=f"What is the current market outlook for {symbol}?",
                            current_price=current_price,
                            price_change=price_change
                        )
                    except:
                        pass
                    
                    # Build comprehensive response
                    response_parts = [f"📊 **Creating your trading rule for {symbol}**\n"]
                    
                    # Current price section
                    response_parts.append(f"**Current Price:** ${current_price:,.2f}" if current_price else "")
                    
                    # Historical data section
                    if historical_stats:
                        change_pct = historical_stats.get("price_change_percent", 0)
                        high_7d = historical_stats.get("high_price", 0)
                        low_7d = historical_stats.get("low_price", 0)
                        direction = "📈" if change_pct >= 0 else "📉"
                        response_parts.append(f"\n**7-Day Performance:** {direction} {'+' if change_pct >= 0 else ''}{change_pct:.2f}%")
                        response_parts.append(f"**7-Day Range:** ${low_7d:,.2f} - ${high_7d:,.2f}")
                    
                    # Market analysis section
                    if market_search and market_search.get("summary"):
                        response_parts.append(f"\n**Market Analysis:**\n{market_search.get('summary')}")
                    
                    # News section
                    if market_search and market_search.get("results"):
                        response_parts.append("\n**Recent News:**")
                        for r in market_search["results"][:3]:
                            title = r.get("title", "")
                            if title:
                                response_parts.append(f"• {title}")
                    
                    # Prediction/Judgment based on analysis
                    prediction = None
                    if historical_stats:
                        change_pct = historical_stats.get("price_change_percent", 0)
                        volatility = historical_stats.get("volatility", 0)
                        if change_pct > 5:
                            prediction = "🔮 **Outlook:** Strong bullish momentum. Price has been rising significantly."
                        elif change_pct > 2:
                            prediction = "🔮 **Outlook:** Moderate bullish trend. Watch for potential continuation."
                        elif change_pct < -5:
                            prediction = "🔮 **Outlook:** Strong bearish pressure. Consider risk management."
                        elif change_pct < -2:
                            prediction = "🔮 **Outlook:** Moderate downtrend. Market may be seeking support."
                        else:
                            prediction = "🔮 **Outlook:** Consolidating. Price is ranging with no clear direction."
                        if volatility and volatility > 5:
                            prediction += " ⚠️ High volatility detected."
                    
                    if prediction:
                        response_parts.append(f"\n{prediction}")
                    
                    response_parts.append("\n\n✅ *Confirm the rule details below to create it.*")
                    
                    # Build analysis_data for storage with rule
                    analysis_data = {
                        "current_price": current_price,
                        "historical_stats": historical_stats,
                        "market_search": {
                            "summary": market_search.get("summary") if market_search else None,
                            "results": market_search.get("results", [])[:3] if market_search else []
                        },
                        "prediction": prediction,
                        "analyzed_at": datetime.utcnow().isoformat()
                    }
                    
                    # Update the response
                    chat_response = ChatResponse(
                        intent="trading_rule",
                        response="\n".join(filter(None, response_parts)),
                        data={
                            "should_create_rule": True,
                            "original_input": original_input or request.message,
                            "market": rule_market,
                            "analysis_data": analysis_data
                        }
                    )
                    
                except Exception as e:
                    # Fallback to simple response on error
                    pass

        # Handle compound queries - process secondary intents and combine responses
        final_response = chat_response.response
        if chat_response.data and chat_response.data.get("secondary_intents"):
            secondary_responses = []
            for secondary in chat_response.data["secondary_intents"]:
                try:
                    secondary_text = await process_secondary_intent(secondary, context, prices, db)
                    if secondary_text:
                        secondary_responses.append(secondary_text)
                except Exception as e:
                    # Log but don't fail the whole response
                    pass
            
            if secondary_responses:
                final_response = chat_response.response + "\n\n---\n" + "\n".join(secondary_responses)
        
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
