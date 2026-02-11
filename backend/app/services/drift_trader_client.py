"""
Drift Trader Client

Client for communicating with the Drift Trader microservice.
This allows the main backend to execute trades via the isolated driftpy service.
"""
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class TradeResult:
    """Result from trade execution."""
    success: bool
    signature: Optional[str] = None
    explorer_url: Optional[str] = None
    message: str = ""
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@dataclass  
class Position:
    """Position from Drift."""
    market: str
    market_index: int
    size: float
    side: str
    entry_price: float
    unrealized_pnl: float
    liquidation_price: Optional[float] = None


class DriftTraderClient:
    """
    HTTP client for the Drift Trader microservice.
    
    The microservice handles all driftpy interactions in an isolated environment
    to avoid dependency conflicts with the main FastAPI backend.
    """
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or getattr(settings, 'drift_trader_url', 'http://localhost:8101')
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(30.0),  # Longer timeout for blockchain operations
            )
        return self._client
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if drift-trader service is healthy."""
        try:
            client = await self._get_client()
            response = await client.get("/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Drift trader health check failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def is_available(self) -> bool:
        """Check if drift-trader service is available and initialized."""
        try:
            health = await self.health_check()
            return health.get("status") == "ok" and health.get("initialized", False)
        except Exception:
            return False
    
    async def place_order(
        self,
        market: str,
        side: str,
        size: float,
        price: Optional[float] = None,
        order_type: str = "market",
        reduce_only: bool = False,
        rule_id: Optional[int] = None,
    ) -> TradeResult:
        """
        Place an order via the drift-trader microservice.
        
        Args:
            market: Market symbol (e.g., "SOL-PERP")
            side: "buy"/"long" or "sell"/"short"
            size: Order size in base units
            price: Limit price (required for limit orders)
            order_type: "market" or "limit"
            reduce_only: Only reduce existing position
            rule_id: Optional rule ID for tracking
        
        Returns:
            TradeResult with transaction details.
        """
        try:
            client = await self._get_client()
            
            payload = {
                "market": market,
                "side": side,
                "size": size,
                "order_type": order_type,
                "reduce_only": reduce_only,
            }
            
            if price is not None:
                payload["price"] = price
            
            if rule_id is not None:
                payload["rule_id"] = rule_id
            
            logger.info(f"Sending trade to drift-trader: {side} {size} {market}")
            
            response = await client.post("/trade", json=payload)
            response.raise_for_status()
            data = response.json()
            
            result = TradeResult(
                success=data.get("success", False),
                signature=data.get("signature"),
                explorer_url=data.get("explorer_url"),
                message=data.get("message", ""),
                error=data.get("error"),
                details=data.get("details"),
            )
            
            if result.success:
                logger.info(f"Trade executed: {result.signature}")
            else:
                logger.error(f"Trade failed: {result.error}")
            
            return result
            
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error from drift-trader: {e}")
            return TradeResult(
                success=False,
                error=f"HTTP {e.response.status_code}: {e.response.text}"
            )
        except httpx.ConnectError:
            logger.error("Cannot connect to drift-trader microservice")
            return TradeResult(
                success=False,
                error="Drift trader service unavailable - is it running on port 8101?"
            )
        except Exception as e:
            logger.error(f"Trade execution error: {e}")
            return TradeResult(
                success=False,
                error=str(e)
            )
    
    async def close_position(
        self,
        market: str,
        rule_id: Optional[int] = None,
    ) -> TradeResult:
        """
        Close a position via drift-trader microservice.
        """
        try:
            client = await self._get_client()
            
            payload = {
                "market": market,
            }
            
            if rule_id is not None:
                payload["rule_id"] = rule_id
            
            response = await client.post("/close", json=payload)
            response.raise_for_status()
            data = response.json()
            
            return TradeResult(
                success=data.get("success", False),
                signature=data.get("signature"),
                explorer_url=data.get("explorer_url"),
                message=data.get("message", ""),
                error=data.get("error"),
                details=data.get("details"),
            )
            
        except Exception as e:
            logger.error(f"Close position error: {e}")
            return TradeResult(success=False, error=str(e))
    
    async def get_positions(self) -> List[Position]:
        """Get all positions from drift-trader."""
        try:
            client = await self._get_client()
            response = await client.get("/positions")
            response.raise_for_status()
            data = response.json()
            
            return [
                Position(
                    market=p["market"],
                    market_index=p["market_index"],
                    size=p["size"],
                    side=p["side"],
                    entry_price=p["entry_price"],
                    unrealized_pnl=p["unrealized_pnl"],
                    liquidation_price=p.get("liquidation_price"),
                )
                for p in data
            ]
            
        except Exception as e:
            logger.error(f"Get positions error: {e}")
            return []
    
    async def get_position(self, market: str) -> Optional[Position]:
        """Get position for a specific market."""
        try:
            client = await self._get_client()
            response = await client.get(f"/position/{market}")
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    return Position(
                        market=data["market"],
                        market_index=data["market_index"],
                        size=data["size"],
                        side=data["side"],
                        entry_price=data["entry_price"],
                        unrealized_pnl=data["unrealized_pnl"],
                        liquidation_price=data.get("liquidation_price"),
                    )
            return None
            
        except Exception as e:
            logger.error(f"Get position error: {e}")
            return None
    
    async def get_account_info(self) -> Dict[str, Any]:
        """Get Drift account information."""
        try:
            client = await self._get_client()
            response = await client.get("/account")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Get account info error: {e}")
            return {"error": str(e)}
    
    async def get_markets(self) -> List[str]:
        """Get available markets."""
        try:
            client = await self._get_client()
            response = await client.get("/markets")
            response.raise_for_status()
            data = response.json()
            return data.get("markets", [])
        except Exception as e:
            logger.error(f"Get markets error: {e}")
            return []
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton instance
drift_trader_client = DriftTraderClient()


async def get_drift_trader() -> DriftTraderClient:
    """Get drift trader client instance."""
    return drift_trader_client
