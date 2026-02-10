from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models import TradingRule, JobLog, Trade, RuleStatus, ConditionType
from app.agents import llm_agent
from app.services import drift_service
from app.jobs import job_scheduler

router = APIRouter(prefix="/api/rules", tags=["rules"])


# Pydantic schemas
class RuleCreateRequest(BaseModel):
    input: str  # Natural language input
    conversation_id: Optional[int] = None  # Link to conversation
    wallet_address: Optional[str] = None  # Wallet address to bind rule to
    analysis_data: Optional[Dict[str, Any]] = None  # Analysis data from chat


class RuleResponse(BaseModel):
    id: int
    conversation_id: Optional[int] = None
    wallet_address: Optional[str] = None
    user_input: str
    parsed_summary: Optional[str] = None
    market: str
    condition_type: str
    condition_value: float
    reference_price: Optional[float] = None
    action_type: str
    action_amount_percent: Optional[float] = None
    action_amount_usd: Optional[float] = None
    status: str
    created_at: datetime
    triggered_at: Optional[datetime] = None
    analysis_data: Optional[Dict[str, Any]] = None  # Market analysis at rule creation

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_rule(cls, rule):
        """Convert SQLAlchemy model to Pydantic model with proper enum handling."""
        return cls(
            id=rule.id,
            conversation_id=rule.conversation_id,
            wallet_address=rule.wallet_address,
            user_input=rule.user_input,
            parsed_summary=rule.parsed_summary,
            market=rule.market,
            condition_type=rule.condition_type.value if hasattr(rule.condition_type, 'value') else str(rule.condition_type),
            condition_value=rule.condition_value,
            reference_price=rule.reference_price,
            action_type=rule.action_type.value if hasattr(rule.action_type, 'value') else str(rule.action_type),
            action_amount_percent=rule.action_amount_percent,
            action_amount_usd=rule.action_amount_usd,
            status=rule.status.value if hasattr(rule.status, 'value') else str(rule.status),
            created_at=rule.created_at,
            triggered_at=rule.triggered_at,
            analysis_data=rule.analysis_data,
        )


class JobLogResponse(BaseModel):
    id: int
    rule_id: int
    checked_at: datetime
    current_price: Optional[float]
    condition_met: bool
    message: Optional[str]
    error: Optional[str]

    class Config:
        from_attributes = True


class TradeResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    market: str
    side: str
    size: float
    price: float
    tx_signature: Optional[str]
    status: Optional[str]
    executed_at: datetime

    class Config:
        from_attributes = True


class RulePreviewRequest(BaseModel):
    """Request to preview/validate a rule before creating it."""
    input: str  # Natural language input


class RulePreviewResponse(BaseModel):
    """Response showing what the rule will look like before creation."""
    valid: bool
    market: str
    condition_type: str
    condition_value: float
    reference_price: Optional[float] = None
    target_price: Optional[float] = None  # Computed target price for display
    action_type: str
    action_amount_percent: Optional[float] = None
    action_amount_usd: Optional[float] = None
    summary: str
    explanation: str  # Human-readable explanation


def calculate_target_price(condition_type: ConditionType, condition_value: float, reference_price: Optional[float]) -> Optional[float]:
    """Calculate the actual target price based on condition type."""
    if condition_type == ConditionType.PRICE_ABOVE:
        return condition_value
    elif condition_type == ConditionType.PRICE_BELOW:
        return condition_value
    elif condition_type == ConditionType.PRICE_CHANGE_PERCENT and reference_price:
        return reference_price * (1 + condition_value / 100)
    elif condition_type == ConditionType.PRICE_CHANGE_ABSOLUTE and reference_price:
        return reference_price + condition_value
    return None


@router.post("/preview", response_model=RulePreviewResponse)
async def preview_rule(request: RulePreviewRequest):
    """Preview/validate a rule before creating it. Returns the parsed rule without saving."""
    try:
        # Get current price for context
        market = "SOL-PERP"  # Default
        for m in ["BTC-PERP", "ETH-PERP", "SOL-PERP", "BONK-PERP", "WIF-PERP", "DOGE-PERP"]:
            if m.split("-")[0].lower() in request.input.lower():
                market = m
                break

        current_price = await drift_service.get_perp_market_price(market)

        # Parse with LLM
        parsed = await llm_agent.parse_trading_rule(request.input, current_price)

        # Calculate target price for display
        target_price = calculate_target_price(
            parsed.condition.condition_type, 
            parsed.condition.condition_value, 
            current_price
        )

        # Build explanation
        condition_type = parsed.condition.condition_type
        if condition_type == ConditionType.PRICE_CHANGE_PERCENT:
            direction = "increases" if parsed.condition.condition_value > 0 else "decreases"
            explanation = f"Rule will trigger when {parsed.condition.market} price {direction} by {abs(parsed.condition.condition_value)}% from current price ${current_price:.2f} (target: ${target_price:.2f})"
        elif condition_type == ConditionType.PRICE_ABOVE:
            explanation = f"Rule will trigger when {parsed.condition.market} price goes above ${parsed.condition.condition_value:.2f}"
        elif condition_type == ConditionType.PRICE_BELOW:
            explanation = f"Rule will trigger when {parsed.condition.market} price drops below ${parsed.condition.condition_value:.2f}"
        else:
            explanation = parsed.summary

        return RulePreviewResponse(
            valid=True,
            market=parsed.condition.market,
            condition_type=condition_type.value if hasattr(condition_type, 'value') else str(condition_type),
            condition_value=parsed.condition.condition_value,
            reference_price=current_price,
            target_price=target_price,
            action_type=parsed.action.action_type.value if hasattr(parsed.action.action_type, 'value') else str(parsed.action.action_type),
            action_amount_percent=parsed.action.amount_percent,
            action_amount_usd=parsed.action.amount_usd,
            summary=parsed.summary,
            explanation=explanation
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse trading rule: {str(e)}"
        )


@router.post("/", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(request: RuleCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create a new trading rule from natural language input."""
    try:
        # Get current price for context
        # Try to detect market from input (simplified)
        market = "SOL-PERP"  # Default
        for m in ["BTC-PERP", "ETH-PERP", "SOL-PERP", "BONK-PERP", "WIF-PERP", "DOGE-PERP"]:
            if m.split("-")[0].lower() in request.input.lower():
                market = m
                break

        current_price = await drift_service.get_perp_market_price(market)

        # Parse with LLM
        parsed = await llm_agent.parse_trading_rule(request.input, current_price)

        # Validate condition_value based on condition_type
        condition_value = parsed.condition.condition_value
        condition_type = parsed.condition.condition_type
        
        if condition_type in [ConditionType.PRICE_ABOVE, ConditionType.PRICE_BELOW]:
            # For absolute price conditions, ensure value is positive
            if condition_value <= 0:
                condition_value = abs(condition_value) if condition_value != 0 else current_price
        elif condition_type == ConditionType.PRICE_CHANGE_PERCENT:
            # For percentage conditions, keep the value as-is (can be positive or negative)
            # Make sure it's a reasonable percentage
            if abs(condition_value) > 100:
                # User might have entered 0.01 meaning 1% - multiply by 100
                if abs(condition_value) < 1:
                    condition_value = condition_value * 100
        
        # Create database record
        rule = TradingRule(
            conversation_id=request.conversation_id,  # Link to conversation
            wallet_address=request.wallet_address,  # Link to wallet
            user_input=request.input,
            parsed_summary=parsed.summary,
            market=parsed.condition.market,
            condition_type=condition_type,
            condition_value=condition_value,
            reference_price=current_price,  # Always store current price as reference
            action_type=parsed.action.action_type,
            action_amount_percent=parsed.action.amount_percent,
            action_amount_usd=parsed.action.amount_usd,
            status=RuleStatus.ACTIVE,
            analysis_data=request.analysis_data  # Store analysis data from chat
        )

        db.add(rule)
        await db.commit()
        await db.refresh(rule)

        # Add monitoring job
        job_scheduler.add_rule_job(rule.id)

        return RuleResponse.from_orm_rule(rule)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse trading rule: {str(e)}"
        )


@router.get("/", response_model=List[RuleResponse])
async def list_rules(
    status_filter: Optional[str] = None,
    wallet_address: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List all trading rules, optionally filtered by wallet."""
    query = select(TradingRule).order_by(TradingRule.created_at.desc())

    if status_filter:
        query = query.where(TradingRule.status == status_filter)
    
    if wallet_address:
        query = query.where(TradingRule.wallet_address == wallet_address)

    result = await db.execute(query)
    rules = result.scalars().all()
    return [RuleResponse.from_orm_rule(r) for r in rules]


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific trading rule."""
    result = await db.execute(
        select(TradingRule).where(TradingRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    return RuleResponse.from_orm_rule(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a trading rule."""
    result = await db.execute(
        select(TradingRule).where(TradingRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Remove job from scheduler
    job_scheduler.remove_rule_job(rule_id)

    # Delete related records first (cascade delete)
    await db.execute(delete(JobLog).where(JobLog.rule_id == rule_id))
    await db.execute(delete(Trade).where(Trade.rule_id == rule_id))
    
    # Now delete the rule
    await db.delete(rule)
    await db.commit()


@router.post("/{rule_id}/toggle", response_model=RuleResponse)
async def toggle_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle a rule between active and paused."""
    result = await db.execute(
        select(TradingRule).where(TradingRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule.status == RuleStatus.ACTIVE:
        rule.status = RuleStatus.PAUSED
        job_scheduler.pause_rule_job(rule_id)
    elif rule.status == RuleStatus.PAUSED:
        rule.status = RuleStatus.ACTIVE
        job_scheduler.resume_rule_job(rule_id)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot toggle rule with status: {rule.status}"
        )

    await db.commit()
    await db.refresh(rule)
    return RuleResponse.from_orm_rule(rule)


@router.get("/{rule_id}/logs", response_model=List[JobLogResponse])
async def get_rule_logs(
    rule_id: int,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Get execution logs for a rule."""
    result = await db.execute(
        select(JobLog)
        .where(JobLog.rule_id == rule_id)
        .order_by(JobLog.checked_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{rule_id}/trades", response_model=List[TradeResponse])
async def get_rule_trades(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Get trades executed by a rule."""
    result = await db.execute(
        select(Trade)
        .where(Trade.rule_id == rule_id)
        .order_by(Trade.executed_at.desc())
    )
    return result.scalars().all()


# Rule Chat Request/Response
class RuleChatRequest(BaseModel):
    message: str


class RuleChatResponse(BaseModel):
    response: str
    action_taken: Optional[str] = None  # e.g., "updated_target", "paused", "deleted"
    rule: Optional[RuleResponse] = None  # Updated rule if modified


@router.post("/{rule_id}/chat", response_model=RuleChatResponse)
async def chat_with_rule(rule_id: int, request: RuleChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with a specific rule using natural language to query or modify it."""
    import re
    
    # Get the rule
    result = await db.execute(select(TradingRule).where(TradingRule.id == rule_id))
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    message = request.message.lower().strip()
    current_price = await drift_service.get_perp_market_price(rule.market)
    
    # Calculate current target price for context
    if rule.condition_type == ConditionType.PRICE_CHANGE_PERCENT and rule.reference_price:
        target_price = rule.reference_price * (1 + rule.condition_value / 100)
    elif rule.condition_type == ConditionType.PRICE_CHANGE_ABSOLUTE and rule.reference_price:
        target_price = rule.reference_price + rule.condition_value
    else:
        target_price = rule.condition_value
    
    # Parse intent from natural language
    action_taken = None
    
    # PAUSE/RESUME commands
    if any(word in message for word in ["pause", "stop", "disable", "turn off"]):
        if rule.status == RuleStatus.ACTIVE:
            rule.status = RuleStatus.PAUSED
            await db.commit()
            action_taken = "paused"
            return RuleChatResponse(
                response=f"✅ I've paused your rule. It won't trigger until you resume it.\n\nThe rule was: {rule.parsed_summary or rule.user_input}",
                action_taken="paused",
                rule=RuleResponse.from_orm_rule(rule)
            )
        else:
            return RuleChatResponse(
                response=f"This rule is already {rule.status.value}. No changes made.",
                rule=RuleResponse.from_orm_rule(rule)
            )
    
    if any(word in message for word in ["resume", "start", "enable", "turn on", "activate", "unpause"]):
        if rule.status == RuleStatus.PAUSED:
            rule.status = RuleStatus.ACTIVE
            await db.commit()
            action_taken = "resumed"
            return RuleChatResponse(
                response=f"✅ I've resumed your rule. It's now actively monitoring the market.\n\n**Target:** ${target_price:,.2f}\n**Current Price:** ${current_price:,.2f}",
                action_taken="resumed",
                rule=RuleResponse.from_orm_rule(rule)
            )
        else:
            return RuleChatResponse(
                response=f"This rule is already {rule.status.value}. No changes made.",
                rule=RuleResponse.from_orm_rule(rule)
            )
    
    # DELETE command
    if any(word in message for word in ["delete", "remove", "cancel"]):
        await db.execute(delete(JobLog).where(JobLog.rule_id == rule_id))
        await db.execute(delete(TradingRule).where(TradingRule.id == rule_id))
        await db.commit()
        job_scheduler.remove_rule_job(rule_id)
        return RuleChatResponse(
            response="🗑️ I've deleted this rule. It will no longer monitor the market.",
            action_taken="deleted",
            rule=None
        )
    
    # UPDATE TARGET PRICE commands
    price_match = re.search(r'(?:change|set|update|modify).*(?:target|price|trigger).*?\$?([\d,]+(?:\.\d+)?)', message)
    if not price_match:
        price_match = re.search(r'(?:target|price|trigger).*?(?:to|at|=)\s*\$?([\d,]+(?:\.\d+)?)', message)
    
    if price_match:
        new_target = float(price_match.group(1).replace(',', ''))
        
        # Update the rule based on condition type
        if rule.condition_type in [ConditionType.PRICE_ABOVE, ConditionType.PRICE_BELOW]:
            old_target = rule.condition_value
            rule.condition_value = new_target
        else:
            # For percentage-based rules, calculate new percentage
            if rule.reference_price:
                old_target = target_price
                new_percent = ((new_target / rule.reference_price) - 1) * 100
                rule.condition_value = new_percent
        
        await db.commit()
        await db.refresh(rule)
        
        return RuleChatResponse(
            response=f"✅ I've updated your target price from ${old_target:,.2f} to ${new_target:,.2f}.\n\n**Current Price:** ${current_price:,.2f}\n**Distance to Target:** {abs((new_target - current_price) / current_price * 100):.2f}%",
            action_taken="updated_target",
            rule=RuleResponse.from_orm_rule(rule)
        )
    
    # UPDATE PERCENTAGE commands
    percent_match = re.search(r'(?:change|set|update|modify).*?(?:to|by)\s*([\d.]+)\s*%', message)
    if percent_match:
        new_percent = float(percent_match.group(1))
        if "decrease" in message or "drop" in message or "down" in message or "fall" in message:
            new_percent = -new_percent
        
        rule.condition_type = ConditionType.PRICE_CHANGE_PERCENT
        rule.condition_value = new_percent
        rule.reference_price = current_price
        
        new_target = current_price * (1 + new_percent / 100)
        
        await db.commit()
        await db.refresh(rule)
        
        return RuleChatResponse(
            response=f"✅ I've updated the rule to trigger when price changes by {new_percent:+.1f}%.\n\n**Reference Price:** ${current_price:,.2f}\n**New Target:** ${new_target:,.2f}",
            action_taken="updated_percentage",
            rule=RuleResponse.from_orm_rule(rule)
        )
    
    # QUERY commands - tell user about the rule
    if any(word in message for word in ["what", "tell", "show", "explain", "describe", "status", "details", "info"]):
        status_emoji = {"active": "🟢 Active", "paused": "⏸️ Paused", "triggered": "✅ Triggered", "expired": "⏹️ Expired"}.get(rule.status.value, rule.status.value)
        
        condition_desc = ""
        if rule.condition_type == ConditionType.PRICE_ABOVE:
            condition_desc = f"when {rule.market.replace('-PERP', '')} price goes above ${rule.condition_value:,.2f}"
        elif rule.condition_type == ConditionType.PRICE_BELOW:
            condition_desc = f"when {rule.market.replace('-PERP', '')} price drops below ${rule.condition_value:,.2f}"
        elif rule.condition_type == ConditionType.PRICE_CHANGE_PERCENT:
            direction = "increases" if rule.condition_value > 0 else "decreases"
            condition_desc = f"when {rule.market.replace('-PERP', '')} price {direction} by {abs(rule.condition_value):.1f}%"
        
        action_desc = f"{rule.action_type.value}"
        if rule.action_amount_usd:
            action_desc += f" ${rule.action_amount_usd:,.2f}"
        elif rule.action_amount_percent:
            action_desc += f" {rule.action_amount_percent}%"
        
        price_diff = ((current_price - target_price) / target_price) * 100
        
        response = f"""📊 **Rule Summary**

**Status:** {status_emoji}
**Market:** {rule.market.replace('-PERP', '')}

**Condition:** Trigger {condition_desc}
**Action:** {action_desc}

**Current Price:** ${current_price:,.2f}
**Target Price:** ${target_price:,.2f}
**Distance:** {abs(price_diff):.2f}% {'above' if price_diff > 0 else 'below'} target

**Created:** {rule.created_at.strftime('%b %d, %Y at %H:%M')}

💡 You can say things like:
• "Change target to $180"
• "Pause this rule"
• "Update to 5% increase"
• "Delete this rule\""""
        
        return RuleChatResponse(
            response=response,
            rule=RuleResponse.from_orm_rule(rule)
        )
    
    # Default response - help
    return RuleChatResponse(
        response=f"""I can help you manage this rule. Here's what you can ask:

📝 **Query:**
• "What is this rule?" - Get details about the rule
• "Show status" - See current status and prices

⚙️ **Modify:**
• "Change target to $200" - Update the target price
• "Set to 3% increase" - Change to percentage-based trigger

⏯️ **Control:**
• "Pause this rule" - Stop monitoring temporarily
• "Resume" - Start monitoring again
• "Delete this rule" - Remove permanently

**Current Status:** {rule.status.value.capitalize()}
**Target:** ${target_price:,.2f}
**Current Price:** ${current_price:,.2f}""",
        rule=RuleResponse.from_orm_rule(rule)
    )


# Centralized trades endpoint
trades_router = APIRouter(prefix="/api/trades", tags=["trades"])


@trades_router.get("/", response_model=List[TradeResponse])
async def get_all_trades(
    limit: int = 100, 
    wallet_address: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all trades across all rules, optionally filtered by wallet."""
    query = select(Trade).order_by(Trade.executed_at.desc()).limit(limit)
    if wallet_address:
        query = query.where(Trade.wallet_address == wallet_address)
    result = await db.execute(query)
    return result.scalars().all()
