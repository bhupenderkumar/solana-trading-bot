"""
Drift Trader Microservice

A standalone service for executing trades on Drift Protocol.
Isolated from main backend to avoid dependency conflicts with driftpy.

API Endpoints:
- POST /trade - Execute a trade
- POST /close - Close a position
- GET /positions - Get all positions
- GET /position/{market} - Get position for specific market
- GET /account - Get account info
- GET /health - Health check
"""
import asyncio
import logging
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import get_settings
from drift_client import (
    get_drift_client,
    drift_client,
    TradeResult,
    Position,
    OrderSide,
    OrderType,
    DRIFT_MARKET_INDEX,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
settings = get_settings()


# Pydantic models for API
class TradeRequest(BaseModel):
    """Request to place a trade."""
    market: str = Field(..., description="Market symbol (e.g., 'SOL-PERP')")
    side: str = Field(..., description="'buy'/'long' or 'sell'/'short'")
    size: float = Field(..., gt=0, description="Order size in base units")
    price: Optional[float] = Field(None, description="Limit price (required for limit orders)")
    order_type: str = Field("market", description="'market' or 'limit'")
    reduce_only: bool = Field(False, description="Only reduce existing position")
    
    # Optional metadata for tracking
    rule_id: Optional[int] = Field(None, description="ID of the trading rule that triggered this")
    callback_url: Optional[str] = Field(None, description="URL to POST results to")


class TradeResponse(BaseModel):
    """Response from trade execution."""
    success: bool
    signature: Optional[str] = None
    explorer_url: Optional[str] = None
    message: str = ""
    error: Optional[str] = None
    details: Optional[dict] = None


class ClosePositionRequest(BaseModel):
    """Request to close a position."""
    market: str = Field(..., description="Market symbol to close")
    rule_id: Optional[int] = None
    callback_url: Optional[str] = None


class PositionResponse(BaseModel):
    """Position information."""
    market: str
    market_index: int
    size: float
    side: str
    entry_price: float
    unrealized_pnl: float
    liquidation_price: Optional[float] = None


class AccountResponse(BaseModel):
    """Account information."""
    wallet: Optional[str]
    total_collateral_usdc: Optional[float]
    free_collateral_usdc: Optional[float]
    margin_ratio: Optional[float]
    network: str
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    network: str
    wallet: Optional[str]
    initialized: bool
    subscribed: bool
    available_markets: List[str]


# Startup/shutdown lifecycle
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    logger.info(f"Starting Drift Trader Microservice on {settings.drift_env}...")
    
    # Initialize Drift client at startup
    try:
        client = await get_drift_client()
        logger.info(f"Drift client ready. Wallet: {client.wallet_pubkey}")
    except Exception as e:
        logger.error(f"Failed to initialize at startup (will retry on first request): {e}")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down Drift Trader...")
    await drift_client.close()


# Create FastAPI app
app = FastAPI(
    title="Drift Trader Microservice",
    description="Executes trades on Drift Protocol (Solana)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Background task to send callback
async def send_callback(callback_url: str, result: dict):
    """Send trade result to callback URL."""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            await client.post(callback_url, json=result, timeout=10.0)
            logger.info(f"Callback sent to {callback_url}")
    except Exception as e:
        logger.error(f"Failed to send callback: {e}")


# API Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and Drift connection."""
    return HealthResponse(
        status="ok" if drift_client.is_initialized else "initializing",
        service=settings.service_name,
        network=settings.drift_env,
        wallet=drift_client.wallet_pubkey,
        initialized=drift_client.is_initialized,
        subscribed=drift_client.is_subscribed,
        available_markets=list(DRIFT_MARKET_INDEX.keys()),
    )


@app.get("/markets")
async def list_markets():
    """Get list of available markets."""
    return {
        "markets": list(DRIFT_MARKET_INDEX.keys()),
        "network": settings.drift_env,
    }


@app.post("/trade", response_model=TradeResponse)
async def execute_trade(request: TradeRequest, background_tasks: BackgroundTasks):
    """
    Execute a trade on Drift Protocol.
    
    This endpoint places an order and returns the transaction signature.
    The transaction is submitted to Solana and can be verified on explorer.
    """
    logger.info(f"Trade request: {request.side} {request.size} {request.market}")
    
    try:
        client = await get_drift_client()
        
        result = await client.place_perp_order(
            market=request.market,
            side=request.side,
            size=request.size,
            price=request.price,
            order_type=request.order_type,
            reduce_only=request.reduce_only,
        )
        
        response = TradeResponse(
            success=result.success,
            signature=result.signature,
            explorer_url=result.explorer_url,
            message=result.message,
            error=result.error,
            details=result.details,
        )
        
        # Send callback if provided
        if request.callback_url:
            callback_data = {
                "rule_id": request.rule_id,
                "trade_result": response.dict(),
            }
            background_tasks.add_task(send_callback, request.callback_url, callback_data)
        
        return response
        
    except Exception as e:
        logger.error(f"Trade execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/close", response_model=TradeResponse)
async def close_position(request: ClosePositionRequest, background_tasks: BackgroundTasks):
    """
    Close an entire position in a market.
    """
    logger.info(f"Close position request: {request.market}")
    
    try:
        client = await get_drift_client()
        result = await client.close_position(request.market)
        
        response = TradeResponse(
            success=result.success,
            signature=result.signature,
            explorer_url=result.explorer_url,
            message=result.message,
            error=result.error,
            details=result.details,
        )
        
        # Send callback if provided
        if request.callback_url:
            callback_data = {
                "rule_id": request.rule_id,
                "trade_result": response.dict(),
            }
            background_tasks.add_task(send_callback, request.callback_url, callback_data)
        
        return response
        
    except Exception as e:
        logger.error(f"Close position error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/positions", response_model=List[PositionResponse])
async def get_all_positions():
    """
    Get all open positions.
    """
    try:
        client = await get_drift_client()
        positions = await client.get_all_positions()
        
        return [
            PositionResponse(
                market=p.market,
                market_index=p.market_index,
                size=p.size,
                side=p.side,
                entry_price=p.entry_price,
                unrealized_pnl=p.unrealized_pnl,
                liquidation_price=p.liquidation_price,
            )
            for p in positions
        ]
        
    except Exception as e:
        logger.error(f"Get positions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/position/{market}", response_model=Optional[PositionResponse])
async def get_position(market: str):
    """
    Get position for a specific market.
    """
    if market not in DRIFT_MARKET_INDEX:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown market: {market}. Available: {list(DRIFT_MARKET_INDEX.keys())}"
        )
    
    try:
        client = await get_drift_client()
        position = await client.get_position(market)
        
        if position is None:
            return None
        
        return PositionResponse(
            market=position.market,
            market_index=position.market_index,
            size=position.size,
            side=position.side,
            entry_price=position.entry_price,
            unrealized_pnl=position.unrealized_pnl,
            liquidation_price=position.liquidation_price,
        )
        
    except Exception as e:
        logger.error(f"Get position error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/account", response_model=AccountResponse)
async def get_account_info():
    """
    Get Drift account information.
    """
    try:
        client = await get_drift_client()
        info = await client.get_account_info()
        
        return AccountResponse(
            wallet=info.get("wallet"),
            total_collateral_usdc=info.get("total_collateral_usdc"),
            free_collateral_usdc=info.get("free_collateral_usdc"),
            margin_ratio=info.get("margin_ratio"),
            network=info.get("network", settings.drift_env),
            error=info.get("error"),
        )
        
    except Exception as e:
        logger.error(f"Get account info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=settings.debug,
    )
