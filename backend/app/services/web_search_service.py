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
    'clear_cache': staticmethod(clear_cache)
})()
