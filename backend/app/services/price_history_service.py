"""
Service for fetching historical price data from CoinGecko API.
Provides historical price data for SOL, BTC, ETH and other cryptocurrencies.
"""

import httpx
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import asyncio
from functools import lru_cache
import time

# CoinGecko API base URL (free tier, no API key required)
COINGECKO_API_BASE = "https://api.coingecko.com/api/v3"

# Mapping from market symbols to CoinGecko IDs
MARKET_TO_COINGECKO_ID = {
    "SOL-PERP": "solana",
    "SOL": "solana",
    "BTC-PERP": "bitcoin",
    "BTC": "bitcoin",
    "ETH-PERP": "ethereum",
    "ETH": "ethereum",
    "BONK": "bonk",
    "JUP": "jupiter-exchange-solana",
    "WIF": "dogwifcoin",
    "RAY": "raydium",
    "ORCA": "orca",
    "PYTH": "pyth-network",
}

# Cache for price data (simple in-memory cache)
_price_cache: Dict[str, Dict[str, Any]] = {}
_cache_ttl = 300  # 5 minutes cache TTL


def _get_cache_key(coin_id: str, days: int, currency: str) -> str:
    """Generate cache key for price data."""
    return f"{coin_id}_{days}_{currency}"


def _is_cache_valid(cache_key: str) -> bool:
    """Check if cached data is still valid."""
    if cache_key not in _price_cache:
        return False
    cached_time = _price_cache[cache_key].get("cached_at", 0)
    return time.time() - cached_time < _cache_ttl


async def get_historical_prices(
    market: str,
    days: int = 20,
    currency: str = "usd"
) -> Dict[str, Any]:
    """
    Fetch historical price data for a market.
    
    Args:
        market: Market symbol (e.g., "SOL-PERP", "SOL", "BTC")
        days: Number of days of historical data (1-365)
        currency: Currency for price (default: "usd")
    
    Returns:
        Dictionary with historical price data including:
        - prices: List of [timestamp, price] pairs
        - market_caps: List of [timestamp, market_cap] pairs
        - total_volumes: List of [timestamp, volume] pairs
    """
    # Normalize market symbol
    coin_id = MARKET_TO_COINGECKO_ID.get(market.upper(), market.lower())
    
    cache_key = _get_cache_key(coin_id, days, currency)
    
    # Check cache first
    if _is_cache_valid(cache_key):
        return _price_cache[cache_key]["data"]
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{COINGECKO_API_BASE}/coins/{coin_id}/market_chart",
                params={
                    "vs_currency": currency,
                    "days": days,
                    "interval": "daily" if days > 1 else "hourly"
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # Process the data
            result = {
                "market": market,
                "coin_id": coin_id,
                "currency": currency,
                "days": days,
                "prices": data.get("prices", []),
                "market_caps": data.get("market_caps", []),
                "total_volumes": data.get("total_volumes", []),
                "fetched_at": datetime.utcnow().isoformat()
            }
            
            # Cache the result
            _price_cache[cache_key] = {
                "data": result,
                "cached_at": time.time()
            }
            
            return result
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise Exception("Rate limited by CoinGecko API. Please try again later.")
        raise Exception(f"Failed to fetch price data: {e.response.status_code}")
    except httpx.RequestError as e:
        raise Exception(f"Network error fetching price data: {str(e)}")


async def get_price_statistics(
    market: str,
    days: int = 20,
    currency: str = "usd"
) -> Dict[str, Any]:
    """
    Get price statistics for a market over a period.
    
    Args:
        market: Market symbol
        days: Number of days
        currency: Currency for price
    
    Returns:
        Dictionary with statistics including high, low, average, change percentage
    """
    data = await get_historical_prices(market, days, currency)
    prices = [p[1] for p in data.get("prices", [])]
    
    if not prices:
        return {"error": "No price data available"}
    
    current_price = prices[-1]
    start_price = prices[0]
    high_price = max(prices)
    low_price = min(prices)
    avg_price = sum(prices) / len(prices)
    price_change = current_price - start_price
    price_change_percent = (price_change / start_price) * 100 if start_price else 0
    
    # Calculate volatility (standard deviation)
    variance = sum((p - avg_price) ** 2 for p in prices) / len(prices)
    volatility = variance ** 0.5
    
    return {
        "market": market,
        "currency": currency,
        "days": days,
        "current_price": round(current_price, 4),
        "start_price": round(start_price, 4),
        "high_price": round(high_price, 4),
        "low_price": round(low_price, 4),
        "average_price": round(avg_price, 4),
        "price_change": round(price_change, 4),
        "price_change_percent": round(price_change_percent, 2),
        "volatility": round(volatility, 4),
        "data_points": len(prices)
    }


async def get_ohlc_data(
    market: str,
    days: int = 20,
    currency: str = "usd"
) -> Dict[str, Any]:
    """
    Get OHLC (Open, High, Low, Close) candlestick data.
    
    Args:
        market: Market symbol
        days: Number of days (1, 7, 14, 30, 90, 180, 365, max)
        currency: Currency for price
    
    Returns:
        Dictionary with OHLC data
    """
    coin_id = MARKET_TO_COINGECKO_ID.get(market.upper(), market.lower())
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{COINGECKO_API_BASE}/coins/{coin_id}/ohlc",
                params={
                    "vs_currency": currency,
                    "days": days
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # CoinGecko returns: [timestamp, open, high, low, close]
            ohlc_formatted = []
            for candle in data:
                if len(candle) >= 5:
                    ohlc_formatted.append({
                        "timestamp": candle[0],
                        "date": datetime.fromtimestamp(candle[0] / 1000).isoformat(),
                        "open": candle[1],
                        "high": candle[2],
                        "low": candle[3],
                        "close": candle[4]
                    })
            
            return {
                "market": market,
                "coin_id": coin_id,
                "currency": currency,
                "days": days,
                "ohlc": ohlc_formatted,
                "fetched_at": datetime.utcnow().isoformat()
            }
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise Exception("Rate limited by CoinGecko API. Please try again later.")
        raise Exception(f"Failed to fetch OHLC data: {e.response.status_code}")
    except httpx.RequestError as e:
        raise Exception(f"Network error fetching OHLC data: {str(e)}")


async def get_multiple_historical_prices(
    markets: List[str],
    days: int = 20,
    currency: str = "usd"
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch historical prices for multiple markets concurrently.
    
    Args:
        markets: List of market symbols
        days: Number of days
        currency: Currency for price
    
    Returns:
        Dictionary mapping market symbols to their historical data
    """
    # Limit concurrent requests to avoid rate limiting
    semaphore = asyncio.Semaphore(3)
    
    async def fetch_with_semaphore(market: str):
        async with semaphore:
            try:
                return market, await get_historical_prices(market, days, currency)
            except Exception as e:
                return market, {"error": str(e)}
    
    tasks = [fetch_with_semaphore(market) for market in markets]
    results = await asyncio.gather(*tasks)
    
    return dict(results)


async def get_current_price_with_history(
    market: str,
    currency: str = "usd"
) -> Dict[str, Any]:
    """
    Get current price along with 24h price change and sparkline data.
    
    Args:
        market: Market symbol
        currency: Currency for price
    
    Returns:
        Dictionary with current price and 24h data
    """
    coin_id = MARKET_TO_COINGECKO_ID.get(market.upper(), market.lower())
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{COINGECKO_API_BASE}/coins/{coin_id}",
                params={
                    "localization": "false",
                    "tickers": "false",
                    "market_data": "true",
                    "community_data": "false",
                    "developer_data": "false",
                    "sparkline": "true"
                }
            )
            response.raise_for_status()
            data = response.json()
            
            market_data = data.get("market_data", {})
            
            return {
                "market": market,
                "coin_id": coin_id,
                "name": data.get("name"),
                "symbol": data.get("symbol", "").upper(),
                "current_price": market_data.get("current_price", {}).get(currency),
                "price_change_24h": market_data.get("price_change_24h"),
                "price_change_percentage_24h": market_data.get("price_change_percentage_24h"),
                "price_change_percentage_7d": market_data.get("price_change_percentage_7d"),
                "price_change_percentage_30d": market_data.get("price_change_percentage_30d"),
                "market_cap": market_data.get("market_cap", {}).get(currency),
                "market_cap_rank": market_data.get("market_cap_rank"),
                "total_volume": market_data.get("total_volume", {}).get(currency),
                "high_24h": market_data.get("high_24h", {}).get(currency),
                "low_24h": market_data.get("low_24h", {}).get(currency),
                "ath": market_data.get("ath", {}).get(currency),
                "ath_date": market_data.get("ath_date", {}).get(currency),
                "atl": market_data.get("atl", {}).get(currency),
                "atl_date": market_data.get("atl_date", {}).get(currency),
                "sparkline_7d": data.get("market_data", {}).get("sparkline_7d", {}).get("price", []),
                "last_updated": market_data.get("last_updated"),
                "currency": currency
            }
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise Exception("Rate limited by CoinGecko API. Please try again later.")
        raise Exception(f"Failed to fetch price data: {e.response.status_code}")
    except httpx.RequestError as e:
        raise Exception(f"Network error fetching price data: {str(e)}")


def get_supported_markets() -> List[Dict[str, str]]:
    """
    Get list of supported markets with their CoinGecko IDs.
    
    Returns:
        List of dictionaries with market symbols and coin IDs
    """
    return [
        {"market": market, "coin_id": coin_id}
        for market, coin_id in MARKET_TO_COINGECKO_ID.items()
    ]


def clear_cache():
    """Clear the price data cache."""
    global _price_cache
    _price_cache = {}
