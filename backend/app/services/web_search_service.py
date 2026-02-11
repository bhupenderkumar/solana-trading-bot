"""
Web search service for real-time market news and analysis.
Uses DuckDuckGo search (no API key required).
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from functools import lru_cache
import time

logger = logging.getLogger(__name__)

# Cache for search results (simple in-memory cache)
_search_cache: Dict[str, Dict[str, Any]] = {}
_cache_ttl = 300  # 5 minutes cache TTL for news searches


def _get_cache_key(query: str) -> str:
    """Generate cache key for search."""
    return query.lower().strip()


async def search_crypto_news(
    coin: str,
    query_type: str = "price_analysis",
    max_results: int = 5
) -> Dict[str, Any]:
    """
    Search for crypto-related news and analysis.
    
    Args:
        coin: Cryptocurrency symbol (e.g., "BTC", "SOL", "BONK")
        query_type: Type of search - "price_analysis", "news", "sentiment"
        max_results: Maximum number of results to return
    
    Returns:
        Dictionary with search results and metadata
    """
    # Build search query based on type
    coin_names = {
        "BTC": "Bitcoin BTC",
        "ETH": "Ethereum ETH",
        "SOL": "Solana SOL",
        "XRP": "Ripple XRP",
        "DOGE": "Dogecoin DOGE",
        "BONK": "BONK memecoin Solana",
        "WIF": "dogwifhat WIF",
        "PEPE": "PEPE memecoin",
        "SHIB": "Shiba Inu SHIB",
    }
    
    coin_full = coin_names.get(coin.upper(), f"{coin} cryptocurrency")
    
    if query_type == "price_analysis":
        search_query = f"{coin_full} price analysis why {datetime.now().strftime('%B %Y')}"
    elif query_type == "news":
        search_query = f"{coin_full} news today {datetime.now().strftime('%B %Y')}"
    elif query_type == "sentiment":
        search_query = f"{coin_full} market sentiment prediction"
    elif query_type == "twitter":
        search_query = f"{coin_full} twitter crypto sentiment"
    elif query_type == "technical":
        search_query = f"{coin_full} technical analysis support resistance"
    else:
        search_query = f"{coin_full} crypto news"
    
    # Check cache
    cache_key = _get_cache_key(f"{coin}_{query_type}")
    if cache_key in _search_cache:
        cached = _search_cache[cache_key]
        if time.time() - cached.get("timestamp", 0) < _cache_ttl:
            logger.info(f"Cache hit for {cache_key}")
            return cached
    
    try:
        # Run the synchronous search in a thread pool
        results = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _do_search(search_query, max_results)
        )
        
        response = {
            "coin": coin.upper(),
            "query_type": query_type,
            "search_query": search_query,
            "results": results,
            "timestamp": time.time(),
            "fetched_at": datetime.utcnow().isoformat()
        }
        
        # Cache the results
        _search_cache[cache_key] = response
        
        return response
        
    except Exception as e:
        logger.error(f"Search failed for {coin}: {e}")
        return {
            "coin": coin.upper(),
            "query_type": query_type,
            "results": [],
            "error": str(e),
            "fetched_at": datetime.utcnow().isoformat()
        }


def _do_search(query: str, max_results: int) -> List[Dict[str, str]]:
    """Perform the actual DuckDuckGo search (synchronous)."""
    try:
        from duckduckgo_search import DDGS
        
        with DDGS() as ddgs:
            results = []
            for r in ddgs.text(query, max_results=max_results, timelimit="m"):  # last month
                results.append({
                    "title": r.get("title", ""),
                    "body": r.get("body", ""),
                    "href": r.get("href", ""),
                })
            return results
    except Exception as e:
        logger.error(f"DuckDuckGo search error: {e}")
        return []


async def gather_comprehensive_market_data(
    coin: str,
    current_price: Optional[float] = None,
    price_change_7d: Optional[float] = None,
    high_7d: Optional[float] = None,
    low_7d: Optional[float] = None
) -> Dict[str, Any]:
    """
    Gather comprehensive market data for a coin including news, sentiment, and analysis.
    This is used to provide insightful trade suggestions.
    
    Args:
        coin: Cryptocurrency symbol (e.g., "SOL", "BTC")
        current_price: Current price
        price_change_7d: 7-day price change percentage
        high_7d: 7-day high price
        low_7d: 7-day low price
    
    Returns:
        Comprehensive market data dictionary
    """
    logger.info(f"Gathering comprehensive market data for {coin}")
    
    # Gather multiple types of data concurrently
    news_task = search_crypto_news(coin, "news", max_results=3)
    sentiment_task = search_crypto_news(coin, "sentiment", max_results=2)
    analysis_task = search_crypto_news(coin, "price_analysis", max_results=2)
    
    # Wait for all searches
    news_results, sentiment_results, analysis_results = await asyncio.gather(
        news_task, sentiment_task, analysis_task,
        return_exceptions=True
    )
    
    # Process results
    all_news = []
    all_sentiment = []
    all_analysis = []
    
    if isinstance(news_results, dict):
        all_news = news_results.get("results", [])
    if isinstance(sentiment_results, dict):
        all_sentiment = sentiment_results.get("results", [])
    if isinstance(analysis_results, dict):
        all_analysis = analysis_results.get("results", [])
    
    # Calculate trend based on price data
    trend = "neutral"
    trend_strength = "weak"
    if price_change_7d is not None:
        if price_change_7d > 10:
            trend = "bullish"
            trend_strength = "strong"
        elif price_change_7d > 3:
            trend = "bullish"
            trend_strength = "moderate"
        elif price_change_7d > 0:
            trend = "bullish"
            trend_strength = "weak"
        elif price_change_7d < -10:
            trend = "bearish"
            trend_strength = "strong"
        elif price_change_7d < -3:
            trend = "bearish"
            trend_strength = "moderate"
        elif price_change_7d < 0:
            trend = "bearish"
            trend_strength = "weak"
    
    # Calculate support/resistance levels
    support_level = None
    resistance_level = None
    if low_7d and high_7d:
        range_size = high_7d - low_7d
        support_level = low_7d + (range_size * 0.1)  # 10% above the low
        resistance_level = high_7d - (range_size * 0.1)  # 10% below the high
    
    return {
        "coin": coin.upper(),
        "current_price": current_price,
        "price_change_7d": price_change_7d,
        "high_7d": high_7d,
        "low_7d": low_7d,
        "trend": trend,
        "trend_strength": trend_strength,
        "support_level": support_level,
        "resistance_level": resistance_level,
        "news": all_news,
        "sentiment": all_sentiment,
        "analysis": all_analysis,
        "fetched_at": datetime.utcnow().isoformat()
    }


async def search_and_summarize(
    coin: str,
    question: str,
    current_price: Optional[float] = None,
    price_change: Optional[float] = None
) -> Dict[str, Any]:
    """
    Search for information about a coin and prepare data for LLM summarization.
    
    Args:
        coin: Cryptocurrency symbol
        question: User's question (e.g., "why is SOL going down")
        current_price: Current price of the coin
        price_change: Recent price change percentage
    
    Returns:
        Dictionary with search context for LLM
    """
    # Determine search type based on question
    question_lower = question.lower()
    
    if any(kw in question_lower for kw in ["why", "reason", "cause", "explain"]):
        query_type = "price_analysis"
    elif any(kw in question_lower for kw in ["news", "latest", "update", "happening"]):
        query_type = "news"
    elif any(kw in question_lower for kw in ["predict", "forecast", "future", "will"]):
        query_type = "sentiment"
    else:
        query_type = "news"
    
    # Perform search
    search_results = await search_crypto_news(coin, query_type)
    
    # Build context for LLM
    context = {
        "coin": coin.upper(),
        "question": question,
        "current_price": current_price,
        "price_change": price_change,
        "search_results": search_results.get("results", []),
        "search_query": search_results.get("search_query", ""),
        "has_results": len(search_results.get("results", [])) > 0,
        "query_type": query_type
    }
    
    return context


def clear_cache():
    """Clear the search cache."""
    global _search_cache
    _search_cache = {}


# Module-level instance for easy import
web_search_service = type('WebSearchService', (), {
    'search_crypto_news': staticmethod(search_crypto_news),
    'search_and_summarize': staticmethod(search_and_summarize),
    'gather_comprehensive_market_data': staticmethod(gather_comprehensive_market_data),
    'clear_cache': staticmethod(clear_cache)
})()
