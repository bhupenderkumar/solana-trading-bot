"""
Sentiment Agent - Searches news, social media, and analyzes market sentiment.
"""

import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.agents.base_agent import BaseAgent, AgentContext, AgentResult, AgentCapability
from app.services.web_search_service import web_search_service

logger = logging.getLogger(__name__)


class SentimentAgent(BaseAgent):
    """
    Agent responsible for gathering sentiment data:
    - News headlines and summaries
    - Social media sentiment
    - Market analysis from experts
    - Trend indicators from news
    """
    
    CAPABILITY = AgentCapability(
        name="sentiment",
        description="Searches for news, social sentiment, and market analysis",
        triggers=["news", "sentiment", "why", "happening", "analysis", "predict", "outlook", "market situation"],
        priority=7,
        can_run_parallel=True
    )
    
    def __init__(self):
        super().__init__("sentiment")
        self._cache: Dict[str, Dict] = {}
        self._cache_ttl = 300  # 5 minutes for news
    
    def can_handle(self, context: AgentContext) -> float:
        """Check if this agent should handle the request."""
        message = context.user_message.lower()
        
        # High confidence triggers
        sentiment_keywords = ["news", "sentiment", "why", "reason", "happening", "update", "latest"]
        analysis_keywords = ["analysis", "predict", "forecast", "outlook", "situation", "should i"]
        
        has_sentiment_kw = any(kw in message for kw in sentiment_keywords)
        has_analysis_kw = any(kw in message for kw in analysis_keywords)
        
        if has_sentiment_kw:
            return 0.85
        elif has_analysis_kw:
            return 0.7
        return 0.2
    
    async def execute(self, context: AgentContext) -> AgentResult:
        """Gather sentiment data for relevant coins."""
        try:
            # Detect coins
            coins = self._detect_coins(context.user_message)
            if not coins:
                coins = ["SOL"]  # Default
            
            results = {}
            for coin in coins:
                # Check cache
                cached = self._get_cached(coin)
                if cached:
                    results[coin] = cached
                    continue
                
                # Gather fresh sentiment data
                sentiment_data = await self._gather_sentiment(coin, context.user_message)
                results[coin] = sentiment_data
                
                # Cache it
                self._set_cache(coin, sentiment_data)
            
            # Aggregate overall sentiment
            overall_sentiment = self._calculate_overall_sentiment(results)
            
            return AgentResult(
                agent_name=self.name,
                success=True,
                data={
                    "coins": results,
                    "overall_sentiment": overall_sentiment,
                    "coins_analyzed": coins,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            
        except Exception as e:
            logger.error(f"SentimentAgent error: {e}")
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e)
            )
    
    async def _gather_sentiment(self, coin: str, question: str) -> Dict[str, Any]:
        """Gather comprehensive sentiment data for a coin."""
        data = {
            "coin": coin,
            "news": [],
            "sentiment_score": 0.5,  # 0=bearish, 0.5=neutral, 1=bullish
            "sentiment_label": "neutral",
            "key_topics": [],
            "news_count": 0
        }
        
        try:
            # Fetch news, sentiment, and analysis in parallel
            news_task = web_search_service.search_crypto_news(coin, "news", max_results=4)
            sentiment_task = web_search_service.search_crypto_news(coin, "sentiment", max_results=3)
            analysis_task = web_search_service.search_crypto_news(coin, "price_analysis", max_results=2)
            
            news_results, sentiment_results, analysis_results = await asyncio.gather(
                news_task, sentiment_task, analysis_task,
                return_exceptions=True
            )
            
            # Process news
            all_items = []
            if isinstance(news_results, dict):
                all_items.extend(news_results.get("results", []))
            if isinstance(sentiment_results, dict):
                all_items.extend(sentiment_results.get("results", []))
            if isinstance(analysis_results, dict):
                all_items.extend(analysis_results.get("results", []))
            
            # Deduplicate and limit
            seen_titles = set()
            unique_items = []
            for item in all_items:
                title = item.get("title", "")
                if title and title not in seen_titles:
                    seen_titles.add(title)
                    unique_items.append(item)
            
            data["news"] = unique_items[:6]
            data["news_count"] = len(unique_items)
            
            # Analyze sentiment from headlines
            sentiment_score = self._analyze_headlines_sentiment(unique_items, coin)
            data["sentiment_score"] = sentiment_score
            
            if sentiment_score >= 0.7:
                data["sentiment_label"] = "bullish"
            elif sentiment_score >= 0.55:
                data["sentiment_label"] = "slightly_bullish"
            elif sentiment_score <= 0.3:
                data["sentiment_label"] = "bearish"
            elif sentiment_score <= 0.45:
                data["sentiment_label"] = "slightly_bearish"
            else:
                data["sentiment_label"] = "neutral"
            
            # Extract key topics
            data["key_topics"] = self._extract_topics(unique_items)
            
        except Exception as e:
            logger.warning(f"Failed to gather sentiment for {coin}: {e}")
        
        return data
    
    def _analyze_headlines_sentiment(self, items: List[Dict], coin: str) -> float:
        """Analyze sentiment from news headlines using keyword matching."""
        if not items:
            return 0.5  # Neutral
        
        bullish_keywords = [
            "surge", "soar", "rally", "gain", "rise", "jump", "bull", "breakout",
            "high", "record", "growth", "adoption", "partnership", "launch",
            "upgrade", "positive", "success", "milestone", "boom", "moon"
        ]
        
        bearish_keywords = [
            "drop", "fall", "crash", "decline", "plunge", "bear", "low", "loss",
            "sell", "dump", "fear", "concern", "warning", "risk", "hack", "scam",
            "regulation", "ban", "lawsuit", "negative", "fail", "struggle"
        ]
        
        bullish_count = 0
        bearish_count = 0
        total_checked = 0
        
        for item in items:
            text = (item.get("title", "") + " " + item.get("body", "")).lower()
            
            for kw in bullish_keywords:
                if kw in text:
                    bullish_count += 1
            
            for kw in bearish_keywords:
                if kw in text:
                    bearish_count += 1
            
            total_checked += 1
        
        if bullish_count + bearish_count == 0:
            return 0.5
        
        # Calculate score (0-1, where 1 is very bullish)
        score = (bullish_count / (bullish_count + bearish_count + 0.1))
        
        # Normalize to 0.3-0.7 range to avoid extreme values without strong signals
        return 0.3 + (score * 0.4)
    
    def _extract_topics(self, items: List[Dict]) -> List[str]:
        """Extract key topics from news items."""
        topic_keywords = {
            "etf": "ETF",
            "regulation": "Regulation",
            "adoption": "Adoption",
            "partnership": "Partnership",
            "upgrade": "Network Upgrade",
            "defi": "DeFi",
            "nft": "NFT",
            "staking": "Staking",
            "hack": "Security",
            "whale": "Whale Activity"
        }
        
        found_topics = set()
        for item in items:
            text = (item.get("title", "") + " " + item.get("body", "")).lower()
            for keyword, topic in topic_keywords.items():
                if keyword in text:
                    found_topics.add(topic)
        
        return list(found_topics)[:5]
    
    def _calculate_overall_sentiment(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """Calculate overall market sentiment from all coins."""
        if not results:
            return {"score": 0.5, "label": "neutral"}
        
        total_score = sum(r.get("sentiment_score", 0.5) for r in results.values())
        avg_score = total_score / len(results)
        
        if avg_score >= 0.65:
            label = "bullish"
        elif avg_score >= 0.55:
            label = "slightly_bullish"
        elif avg_score <= 0.35:
            label = "bearish"
        elif avg_score <= 0.45:
            label = "slightly_bearish"
        else:
            label = "neutral"
        
        return {"score": avg_score, "label": label}
    
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
            "wif": "WIF",
            "pepe": "PEPE"
        }
        
        coins = []
        for pattern, coin in coin_map.items():
            if pattern in message_lower and coin not in coins:
                coins.append(coin)
        
        return coins
    
    def _get_cached(self, coin: str) -> Optional[Dict]:
        """Get cached data if still valid."""
        if coin in self._cache:
            cached = self._cache[coin]
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
    
    def _set_cache(self, coin: str, data: Dict):
        """Cache sentiment data."""
        data["_cached_at"] = datetime.utcnow().isoformat()
        self._cache[coin] = data


# Singleton instance
sentiment_agent = SentimentAgent()
