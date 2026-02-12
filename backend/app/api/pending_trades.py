"""
Pending Trades API - Trades that need user approval before execution.
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PendingTrade, PendingTradeStatus, Trade

router = APIRouter(prefix="/api/pending-trades", tags=["pending-trades"])


class PendingTradeResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    wallet_address: str
    market: str
    side: str
    size: float
    price_at_trigger: float
    title: str
    message: str
    status: str
    created_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApproveTradeRequest(BaseModel):
    tx_signature: str
    executed_price: Optional[float] = None


class ApproveTradeResponse(BaseModel):
    success: bool
    message: str
    trade_id: Optional[int] = None


@router.get("", response_model=List[PendingTradeResponse])
async def get_pending_trades(
    wallet_address: Optional[str] = None,
    status: Optional[str] = "pending",
    db: AsyncSession = Depends(get_db)
):
    """Get pending trades for a wallet."""
    query = select(PendingTrade)
    
    filters = []
    if wallet_address:
        filters.append(PendingTrade.wallet_address == wallet_address)
    if status:
        filters.append(PendingTrade.status == status)
    
    if filters:
        query = query.where(and_(*filters))
    
    query = query.order_by(PendingTrade.created_at.desc())
    
    result = await db.execute(query)
    pending_trades = result.scalars().all()
    
    # Expire old pending trades
    now = datetime.utcnow()
    for pt in pending_trades:
        if pt.status == PendingTradeStatus.PENDING and pt.expires_at and pt.expires_at < now:
            pt.status = PendingTradeStatus.EXPIRED
    
    await db.commit()
    
    # Return only non-expired pending trades if status filter is "pending"
    if status == "pending":
        return [pt for pt in pending_trades if pt.status == PendingTradeStatus.PENDING]
    
    return pending_trades


@router.get("/count")
async def get_pending_trade_count(
    wallet_address: str,
    db: AsyncSession = Depends(get_db)
):
    """Get count of pending trades for a wallet (for badge/notification)."""
    query = select(PendingTrade).where(
        and_(
            PendingTrade.wallet_address == wallet_address,
            PendingTrade.status == PendingTradeStatus.PENDING
        )
    )
    result = await db.execute(query)
    count = len(result.scalars().all())
    
    return {"count": count}


@router.post("/{trade_id}/approve", response_model=ApproveTradeResponse)
async def approve_pending_trade(
    trade_id: int,
    request: ApproveTradeRequest,
    db: AsyncSession = Depends(get_db)
):
    """Approve a pending trade after user signs transaction."""
    result = await db.execute(
        select(PendingTrade).where(PendingTrade.id == trade_id)
    )
    pending_trade = result.scalar_one_or_none()
    
    if not pending_trade:
        raise HTTPException(status_code=404, detail="Pending trade not found")
    
    if pending_trade.status != PendingTradeStatus.PENDING:
        raise HTTPException(
            status_code=400, 
            detail=f"Trade is already {pending_trade.status.value}"
        )
    
    # Check if expired
    if pending_trade.expires_at and pending_trade.expires_at < datetime.utcnow():
        pending_trade.status = PendingTradeStatus.EXPIRED
        await db.commit()
        raise HTTPException(status_code=400, detail="Trade has expired")
    
    # Update pending trade
    pending_trade.status = PendingTradeStatus.EXECUTED
    pending_trade.tx_signature = request.tx_signature
    pending_trade.executed_price = request.executed_price
    pending_trade.acted_at = datetime.utcnow()
    
    # Create trade record
    trade = Trade(
        rule_id=pending_trade.rule_id,
        wallet_address=pending_trade.wallet_address,
        market=pending_trade.market,
        side="long" if pending_trade.side == "buy" else "short",
        size=pending_trade.size,
        price=request.executed_price or pending_trade.price_at_trigger,
        tx_signature=request.tx_signature,
        status="confirmed"
    )
    db.add(trade)
    
    await db.commit()
    
    return ApproveTradeResponse(
        success=True,
        message="Trade executed successfully",
        trade_id=trade.id
    )


@router.post("/{trade_id}/reject", response_model=ApproveTradeResponse)
async def reject_pending_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Reject a pending trade."""
    result = await db.execute(
        select(PendingTrade).where(PendingTrade.id == trade_id)
    )
    pending_trade = result.scalar_one_or_none()
    
    if not pending_trade:
        raise HTTPException(status_code=404, detail="Pending trade not found")
    
    if pending_trade.status != PendingTradeStatus.PENDING:
        raise HTTPException(
            status_code=400, 
            detail=f"Trade is already {pending_trade.status.value}"
        )
    
    pending_trade.status = PendingTradeStatus.REJECTED
    pending_trade.acted_at = datetime.utcnow()
    
    await db.commit()
    
    return ApproveTradeResponse(
        success=True,
        message="Trade rejected"
    )


@router.get("/{trade_id}", response_model=PendingTradeResponse)
async def get_pending_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific pending trade."""
    result = await db.execute(
        select(PendingTrade).where(PendingTrade.id == trade_id)
    )
    pending_trade = result.scalar_one_or_none()
    
    if not pending_trade:
        raise HTTPException(status_code=404, detail="Pending trade not found")
    
    return pending_trade
