from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models import TradingRule, JobLog, Trade, RuleStatus
from app.agents import llm_agent
from app.services import drift_service
from app.jobs import job_scheduler

router = APIRouter(prefix="/api/rules", tags=["rules"])


# Pydantic schemas
class RuleCreateRequest(BaseModel):
    input: str  # Natural language input


class RuleResponse(BaseModel):
    id: int
    user_input: str
    parsed_summary: Optional[str]
    market: str
    condition_type: str
    condition_value: float
    reference_price: Optional[float]
    action_type: str
    action_amount_percent: Optional[float]
    action_amount_usd: Optional[float]
    status: str
    created_at: datetime
    triggered_at: Optional[datetime]

    class Config:
        from_attributes = True


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


@router.post("/", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(request: RuleCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create a new trading rule from natural language input."""
    try:
        # Get current price for context
        # Try to detect market from input (simplified)
        market = "SOL-PERP"  # Default
        for m in ["BTC-PERP", "ETH-PERP", "SOL-PERP"]:
            if m.split("-")[0].lower() in request.input.lower():
                market = m
                break

        current_price = await drift_service.get_perp_market_price(market)

        # Parse with LLM
        parsed = await llm_agent.parse_trading_rule(request.input, current_price)

        # Create database record
        rule = TradingRule(
            user_input=request.input,
            parsed_summary=parsed.summary,
            market=parsed.condition.market,
            condition_type=parsed.condition.condition_type,
            condition_value=parsed.condition.condition_value,
            reference_price=current_price if parsed.condition.reference == "current_price" else None,
            action_type=parsed.action.action_type,
            action_amount_percent=parsed.action.amount_percent,
            action_amount_usd=parsed.action.amount_usd,
            status=RuleStatus.ACTIVE
        )

        db.add(rule)
        await db.commit()
        await db.refresh(rule)

        # Add monitoring job
        job_scheduler.add_rule_job(rule.id)

        return rule

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse trading rule: {str(e)}"
        )


@router.get("/", response_model=List[RuleResponse])
async def list_rules(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List all trading rules."""
    query = select(TradingRule).order_by(TradingRule.created_at.desc())

    if status_filter:
        query = query.where(TradingRule.status == status_filter)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific trading rule."""
    result = await db.execute(
        select(TradingRule).where(TradingRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a trading rule."""
    result = await db.execute(
        select(TradingRule).where(TradingRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Remove job
    job_scheduler.remove_rule_job(rule_id)

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
    return rule


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
