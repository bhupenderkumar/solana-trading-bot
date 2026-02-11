"""
Portfolio Agent - Queries database for user's trading rules, executed trades, and positions.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base_agent import BaseAgent, AgentContext, AgentResult, AgentCapability
from app.database import async_session_maker
from app.models import TradingRule, Trade, RuleStatus

logger = logging.getLogger(__name__)


class PortfolioAgent(BaseAgent):
    """
    Agent responsible for portfolio data:
    - Trading rules (active, paused, triggered)
    - Executed trades
    - Positions (from trades)
    - Performance statistics
    """
    
    CAPABILITY = AgentCapability(
        name="portfolio",
        description="Queries user's trading rules, executed trades, and portfolio positions",
        triggers=["rule", "rules", "agent", "agents", "trade", "trades", "position", "positions", 
                  "executed", "triggered", "active", "my", "portfolio", "history"],
        priority=8,
        can_run_parallel=True
    )
    
    def __init__(self):
        super().__init__("portfolio")
    
    def can_handle(self, context: AgentContext) -> float:
        """Check if this agent should handle the request."""
        message = context.user_message.lower()
        
        # High confidence triggers
        rule_keywords = ["rule", "rules", "agent", "agents"]
        trade_keywords = ["trade", "trades", "executed", "position", "positions"]
        portfolio_keywords = ["my", "portfolio", "history", "show me"]
        
        has_rule_kw = any(kw in message for kw in rule_keywords)
        has_trade_kw = any(kw in message for kw in trade_keywords)
        has_portfolio_kw = any(kw in message for kw in portfolio_keywords)
        
        if has_rule_kw or has_trade_kw:
            return 0.9
        elif has_portfolio_kw:
            return 0.7
        return 0.1
    
    async def execute(self, context: AgentContext) -> AgentResult:
        """Fetch portfolio data from database."""
        try:
            async with async_session_maker() as db:
                # Fetch trading rules
                rules_data = await self._fetch_rules(db, context.wallet_address)
                
                # Fetch executed trades
                trades_data = await self._fetch_trades(db, context.wallet_address)
                
                # Calculate statistics
                stats = self._calculate_stats(rules_data, trades_data)
                
                return AgentResult(
                    agent_name=self.name,
                    success=True,
                    data={
                        "rules": rules_data,
                        "trades": trades_data,
                        "statistics": stats,
                        "wallet_address": context.wallet_address,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
                
        except Exception as e:
            logger.error(f"PortfolioAgent error: {e}")
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e)
            )
    
    async def _fetch_rules(self, db: AsyncSession, wallet_address: Optional[str]) -> List[Dict]:
        """Fetch trading rules from database."""
        query = select(TradingRule).order_by(TradingRule.created_at.desc()).limit(20)
        if wallet_address:
            query = query.where(TradingRule.wallet_address == wallet_address)
        
        result = await db.execute(query)
        rules = []
        
        for rule in result.scalars().all():
            rules.append({
                "id": rule.id,
                "market": rule.market,
                "condition_type": rule.condition_type.value if rule.condition_type else None,
                "condition_value": rule.condition_value,
                "action_type": rule.action_type.value if rule.action_type else None,
                "status": rule.status.value if rule.status else "unknown",
                "user_input": rule.user_input,
                "parsed_summary": rule.parsed_summary,
                "triggered_at": rule.triggered_at.isoformat() if rule.triggered_at else None,
                "created_at": rule.created_at.isoformat() if rule.created_at else None
            })
        
        return rules
    
    async def _fetch_trades(self, db: AsyncSession, wallet_address: Optional[str]) -> List[Dict]:
        """Fetch executed trades from database."""
        query = select(Trade).order_by(Trade.executed_at.desc()).limit(20)
        if wallet_address:
            query = query.where(Trade.wallet_address == wallet_address)
        
        result = await db.execute(query)
        trades = []
        
        for trade in result.scalars().all():
            trades.append({
                "id": trade.id,
                "rule_id": trade.rule_id,
                "market": trade.market,
                "side": trade.side,
                "size": trade.size,
                "price": trade.price,
                "status": trade.status,
                "tx_signature": trade.tx_signature,
                "executed_at": trade.executed_at.isoformat() if trade.executed_at else None
            })
        
        return trades
    
    def _calculate_stats(self, rules: List[Dict], trades: List[Dict]) -> Dict[str, Any]:
        """Calculate portfolio statistics."""
        stats = {
            "total_rules": len(rules),
            "active_rules": 0,
            "paused_rules": 0,
            "triggered_rules": 0,
            "total_trades": len(trades),
            "successful_trades": 0,
            "failed_trades": 0,
            "markets_traded": set()
        }
        
        for rule in rules:
            status = rule.get("status", "")
            if status == "active":
                stats["active_rules"] += 1
            elif status == "paused":
                stats["paused_rules"] += 1
            elif status == "triggered":
                stats["triggered_rules"] += 1
        
        for trade in trades:
            status = trade.get("status", "")
            if status == "confirmed":
                stats["successful_trades"] += 1
            elif status == "failed":
                stats["failed_trades"] += 1
            
            market = trade.get("market", "")
            if market:
                stats["markets_traded"].add(market)
        
        stats["markets_traded"] = list(stats["markets_traded"])
        
        return stats


# Singleton instance
portfolio_agent = PortfolioAgent()
