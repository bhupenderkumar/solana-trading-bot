from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

from app.database import get_db
from app.services import drift_service
from app.services import price_history_service

router = APIRouter(prefix="/api/prices", tags=["prices"])


class PriceResponse(BaseModel):
    market: str
    price: float


class PositionResponse(BaseModel):
    market: str
    size: float
    entry_price: float
    unrealized_pnl: float


class HistoricalPricePoint(BaseModel):
    timestamp: int
    price: float


class HistoricalPricesResponse(BaseModel):
    market: str
    coin_id: str
    currency: str
    days: int
    prices: List[List[float]]
    market_caps: List[List[float]]
    total_volumes: List[List[float]]
    fetched_at: str


class PriceStatisticsResponse(BaseModel):
    market: str
    currency: str
    days: int
    current_price: float
    start_price: float
    high_price: float
    low_price: float
    average_price: float
    price_change: float
    price_change_percent: float
    volatility: float
    data_points: int


class OHLCPoint(BaseModel):
    timestamp: int
    date: str
    open: float
    high: float
    low: float
    close: float


class OHLCResponse(BaseModel):
    market: str
    coin_id: str
    currency: str
    days: int
    ohlc: List[OHLCPoint]
    fetched_at: str


class CurrentPriceWithHistoryResponse(BaseModel):
    market: str
    coin_id: str
    name: Optional[str]
    symbol: str
    current_price: Optional[float]
    price_change_24h: Optional[float]
    price_change_percentage_24h: Optional[float]
    price_change_percentage_7d: Optional[float]
    price_change_percentage_30d: Optional[float]
    market_cap: Optional[float]
    market_cap_rank: Optional[int]
    total_volume: Optional[float]
    high_24h: Optional[float]
    low_24h: Optional[float]
    ath: Optional[float]
    ath_date: Optional[str]
    atl: Optional[float]
    atl_date: Optional[str]
    sparkline_7d: List[float]
    last_updated: Optional[str]
    currency: str


class SupportedMarket(BaseModel):
    market: str
    coin_id: str


@router.get("/", response_model=Dict[str, float])
async def get_all_prices():
    """Get current prices for all markets."""
    try:
        prices = await drift_service.get_all_perp_prices()
        return prices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/supported-markets", response_model=List[SupportedMarket])
async def get_supported_markets():
    """Get list of supported markets for historical price data."""
    return price_history_service.get_supported_markets()


@router.get("/history/{market}")
async def get_historical_prices(
    market: str,
    days: int = Query(default=20, ge=1, le=365, description="Number of days of historical data"),
    currency: str = Query(default="usd", description="Currency for price (e.g., usd, eur)")
):
    """
    Get historical price data for a market.
    
    - **market**: Market symbol (e.g., SOL-PERP, BTC-PERP, ETH)
    - **days**: Number of days of historical data (1-365)
    - **currency**: Currency for price (default: usd)
    
    Returns historical prices, market caps, and volumes.
    """
    try:
        data = await price_history_service.get_historical_prices(market, days, currency)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{market}/statistics", response_model=PriceStatisticsResponse)
async def get_price_statistics(
    market: str,
    days: int = Query(default=20, ge=1, le=365, description="Number of days"),
    currency: str = Query(default="usd", description="Currency for price")
):
    """
    Get price statistics for a market over a period.
    
    Returns high, low, average, change percentage, and volatility.
    """
    try:
        stats = await price_history_service.get_price_statistics(market, days, currency)
        if "error" in stats:
            raise HTTPException(status_code=404, detail=stats["error"])
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{market}/ohlc", response_model=OHLCResponse)
async def get_ohlc_data(
    market: str,
    days: int = Query(default=20, ge=1, le=365, description="Number of days"),
    currency: str = Query(default="usd", description="Currency for price")
):
    """
    Get OHLC (Open, High, Low, Close) candlestick data.
    
    Useful for charting and technical analysis.
    """
    try:
        data = await price_history_service.get_ohlc_data(market, days, currency)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{market}/detailed", response_model=CurrentPriceWithHistoryResponse)
async def get_current_price_with_history(
    market: str,
    currency: str = Query(default="usd", description="Currency for price")
):
    """
    Get current price along with 24h, 7d, and 30d price changes.
    
    Also includes sparkline data for 7-day chart.
    """
    try:
        data = await price_history_service.get_current_price_with_history(market, currency)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/multiple")
async def get_multiple_historical_prices(
    markets: str = Query(..., description="Comma-separated list of market symbols"),
    days: int = Query(default=20, ge=1, le=365, description="Number of days"),
    currency: str = Query(default="usd", description="Currency for price")
):
    """
    Get historical prices for multiple markets at once.
    
    - **markets**: Comma-separated list (e.g., "SOL-PERP,BTC-PERP,ETH")
    """
    try:
        market_list = [m.strip() for m in markets.split(",")]
        data = await price_history_service.get_multiple_historical_prices(market_list, days, currency)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history/clear-cache")
async def clear_price_cache():
    """Clear the price data cache."""
    price_history_service.clear_cache()
    return {"message": "Cache cleared successfully"}


@router.get("/{market}", response_model=PriceResponse)
async def get_market_price(market: str):
    """Get current price for a specific market."""
    price = await drift_service.get_perp_market_price(market)
    if price is None:
        raise HTTPException(status_code=404, detail=f"Market {market} not found")
    return {"market": market, "price": price}


@router.get("/positions/all", response_model=List[PositionResponse])
async def get_all_positions():
    """Get all current positions."""
    positions = []
    markets = ["SOL-PERP", "BTC-PERP", "ETH-PERP"]

    for market in markets:
        position = await drift_service.get_user_position(market)
        if position:
            positions.append(position)

    return positions


@router.get("/positions/{market}", response_model=Optional[PositionResponse])
async def get_market_position(market: str):
    """Get current position for a specific market."""
    position = await drift_service.get_user_position(market)
    return position
