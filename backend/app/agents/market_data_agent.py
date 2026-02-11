"""
Market Data Agent - Fetches and caches price data, statistics, and indicators.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

from app.agents.base_agent import BaseAgent, AgentContext, AgentResult, AgentCapability
from app.services.drift_service import drift_service
from app.services import price_history_service

logger = logging.getLogger(__name__)


class MarketDataAgent(BaseAgent):
    """
    Agent responsible for fetching market data:
    - Current prices
    - Historical statistics
    - Technical indicators
    - Support/resistance levels
    """
    
    CAPABILITY = AgentCapability(
        name="market_data",
        description="Fetches real-time prices, historical stats, and technical indicators",
        triggers=["price", "cost", "worth", "value", "how much", "stats", "performance", "high", "low"],
        priority=8,
        can_run_parallel=True
    )
    
    def __init__(self):
        super().__init__("market_data")
        self._cache: Dict[str, Dict] = {}
        self._cache_ttl = 30  # seconds
    
    def can_handle(self, context: AgentContext) -> float:
        """Check if this agent should handle the request."""
        message = context.user_message.lower()
        
        # Check for price-related keywords
        price_keywords = ["price", "cost", "worth", "value", "how much", "$"]
        market_keywords = ["sol", "btc", "eth", "bitcoin", "solana", "ethereum", "doge", "xrp"]
        
        has_price_keyword = any(kw in message for kw in price_keywords)
        has_market_keyword = any(kw in message for kw in market_keywords)
        
        if has_price_keyword and has_market_keyword:
            return 0.9
        elif has_price_keyword or has_market_keyword:
            return 0.6
        return 0.1
    
    async def execute(self, context: AgentContext) -> AgentResult:
        """Fetch market data for relevant coins."""
        try:
            # Detect which coins are mentioned
            coins = self._detect_coins(context.user_message)
            if not coins:
                coins = ["SOL"]  # Default
            
            results = {}
            for coin in coins:
                market = f"{coin}-PERP"
                
                # Check cache first
                cached = self._get_cached(market)
                if cached:
                    results[market] = cached
                    continue
                
                # Fetch fresh data
                market_data = await self._fetch_market_data(market)
                results[market] = market_data
                
                # Cache it
                self._set_cache(market, market_data)
            
            return AgentResult(
                agent_name=self.name,
                success=True,
                data={
                    "markets": results,
                    "coins_analyzed": coins,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            
        except Exception as e:
            logger.error(f"MarketDataAgent error: {e}")
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e)
            )
    
    async def _fetch_market_data(self, market: str) -> Dict[str, Any]:
        """Fetch comprehensive market data."""
        data = {
            "market": market,
            "current_price": None,
            "price_change_24h": None,
            "price_change_7d": None,
            "high_24h": None,
            "low_24h": None,
            "high_7d": None,
            "low_7d": None,
            "support_level": None,
            "resistance_level": None,
            "trend": "neutral",
            "trend_strength": "unknown",
            "volatility": None
        }
        
        # Get current price
        try:
            price = await drift_service.get_perp_market_price(market)
            data["current_price"] = price
        except:
            pass
        
        # Get 7-day stats
        try:
            stats = await price_history_service.get_price_statistics(market, 7)
            if stats:
                data["price_change_7d"] = stats.get("price_change_percent")
                data["high_7d"] = stats.get("high_price")
                data["low_7d"] = stats.get("low_price")
                data["volatility"] = stats.get("volatility")
                
                # Calculate support/resistance
                if data["high_7d"] and data["low_7d"]:
                    range_size = data["high_7d"] - data["low_7d"]
                    data["support_level"] = data["low_7d"] + (range_size * 0.1)
                    data["resistance_level"] = data["high_7d"] - (range_size * 0.1)
                
                # Determine trend
                change = data["price_change_7d"] or 0
                if change > 10:
                    data["trend"] = "bullish"
                    data["trend_strength"] = "strong"
                elif change > 3:
                    data["trend"] = "bullish"
                    data["trend_strength"] = "moderate"
                elif change > 0:
                    data["trend"] = "bullish"
                    data["trend_strength"] = "weak"
                elif change < -10:
                    data["trend"] = "bearish"
                    data["trend_strength"] = "strong"
                elif change < -3:
                    data["trend"] = "bearish"
                    data["trend_strength"] = "moderate"
                elif change < 0:
                    data["trend"] = "bearish"
                    data["trend_strength"] = "weak"
        except Exception as e:
            logger.warning(f"Failed to get stats for {market}: {e}")
        
        return data
    
    def _detect_coins(self, message: str) -> list:
        """Detect coin symbols from message."""
        message_lower = message.lower()
        coin_map = {
            "sol": "SOL", "solana": "SOL",
            "btc": "BTC", "bitcoin": "BTC",
            "eth": "ETH", "ethereum": "ETH",
            "doge": "DOGE", "dogecoin": "DOGE",
            "xrp": "XRP", "ripple": "XRP",
            "bonk": "BONK",
            "wif": "WIF", "dogwifhat": "WIF",
            "pepe": "PEPE"
        }
        
        coins = []
        for pattern, coin in coin_map.items():
            if pattern in message_lower and coin not in coins:
                coins.append(coin)
        
        return coins
    
    def _get_cached(self, market: str) -> Optional[Dict]:
        """Get cached data if still valid."""
        if market in self._cache:
            cached = self._cache[market]
            cached_at_str = cached.get("_cached_at", "1970-01-01T00:00:00")
            try:
                cached_at = datetime.fromisoformat(cached_at_str)
                age = (datetime.utcnow() - cached_at).total_seconds()
                if age < self._cache_ttl:
                    # Return without the _cached_at field to avoid serialization issues
                    result = {k: v for k, v in cached.items() if not k.startswith("_")}
                    return result
            except:
                pass
        return None
    
    def _set_cache(self, market: str, data: Dict):
        """Cache market data."""
        data["_cached_at"] = datetime.utcnow().isoformat()
        self._cache[market] = data


# Singleton instance
market_data_agent = MarketDataAgent()
