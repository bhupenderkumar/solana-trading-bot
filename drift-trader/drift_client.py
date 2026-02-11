"""
Drift Protocol Client Wrapper

Handles connection to Drift Protocol and trade execution on Solana devnet/mainnet.
"""
import asyncio
import logging
import base58
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from driftpy.drift_client import DriftClient
from driftpy.accounts import get_perp_market_account, get_user_account
from driftpy.constants.config import configs
from driftpy.types import (
    OrderParams,
    OrderType as DriftOrderType,
    MarketType,
    PositionDirection,
    OrderTriggerCondition,
)

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"
    LONG = "long"
    SHORT = "short"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


# Market index mapping for Drift Protocol
DRIFT_MARKET_INDEX = {
    # Devnet markets
    "SOL-PERP": 0,
    "BTC-PERP": 1,
    "ETH-PERP": 2,
    "APT-PERP": 3,
    "MATIC-PERP": 4,
    "ARB-PERP": 5,
    "DOGE-PERP": 6,
    "BNB-PERP": 7,
    "SUI-PERP": 8,
    "1MPEPE-PERP": 9,
    "OP-PERP": 10,
    "RENDER-PERP": 11,
    "XRP-PERP": 12,
    "HNT-PERP": 13,
    "INJ-PERP": 14,
    "LINK-PERP": 15,
    "RLB-PERP": 16,
    "PYTH-PERP": 17,
    "TIA-PERP": 18,
    "JTO-PERP": 19,
    "SEI-PERP": 20,
    "AVAX-PERP": 21,
    "WIF-PERP": 22,
    "JUP-PERP": 23,
    "DYM-PERP": 24,
    "BONK-PERP": 25,
}


@dataclass
class TradeResult:
    """Result of a trade execution."""
    success: bool
    signature: Optional[str] = None
    explorer_url: Optional[str] = None
    message: str = ""
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@dataclass
class Position:
    """User position on Drift."""
    market: str
    market_index: int
    size: float
    side: str  # "long" or "short"
    entry_price: float
    unrealized_pnl: float
    liquidation_price: Optional[float] = None


class DriftTraderClient:
    """
    Drift Protocol trading client.
    
    Manages connection to Solana and Drift, executes trades,
    and tracks positions.
    """
    
    def __init__(self):
        self._connection: Optional[AsyncClient] = None
        self._drift_client: Optional[DriftClient] = None
        self._keypair: Optional[Keypair] = None
        self._initialized = False
        self._subscribed = False
    
    @property
    def is_initialized(self) -> bool:
        return self._initialized
    
    @property
    def is_subscribed(self) -> bool:
        return self._subscribed
    
    @property
    def wallet_pubkey(self) -> Optional[str]:
        if self._keypair:
            return str(self._keypair.pubkey())
        return None
    
    async def initialize(self) -> bool:
        """
        Initialize connection to Solana and Drift Protocol.
        
        Returns:
            True if initialization successful, False otherwise.
        """
        if self._initialized:
            return True
        
        try:
            # Load wallet from private key
            if not settings.wallet_private_key:
                raise ValueError("WALLET_PRIVATE_KEY not configured")
            
            private_key_bytes = base58.b58decode(settings.wallet_private_key)
            self._keypair = Keypair.from_bytes(private_key_bytes)
            logger.info(f"Wallet loaded: {self._keypair.pubkey()}")
            
            # Connect to Solana RPC
            self._connection = AsyncClient(settings.solana_rpc_url)
            version = await self._connection.get_version()
            logger.info(f"Connected to Solana RPC: {version}")
            
            # Check wallet balance
            balance = await self._connection.get_balance(self._keypair.pubkey())
            sol_balance = balance.value / 1e9
            logger.info(f"Wallet balance: {sol_balance:.4f} SOL")
            
            if sol_balance < 0.01:
                logger.warning("Low wallet balance - may not have enough for transaction fees")
            
            # Initialize Drift client
            config = configs[settings.drift_env]
            self._drift_client = DriftClient(
                self._connection,
                self._keypair,
                env=settings.drift_env,
            )
            
            self._initialized = True
            logger.info(f"Drift client initialized on {settings.drift_env}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Drift client: {e}")
            self._initialized = False
            return False
    
    async def subscribe(self) -> bool:
        """
        Subscribe to Drift Protocol accounts for real-time updates.
        
        Returns:
            True if subscription successful.
        """
        if not self._initialized:
            await self.initialize()
        
        if self._subscribed:
            return True
        
        try:
            await self._drift_client.subscribe()
            self._subscribed = True
            logger.info("Subscribed to Drift Protocol")
            return True
        except Exception as e:
            logger.error(f"Failed to subscribe to Drift: {e}")
            return False
    
    async def place_perp_order(
        self,
        market: str,
        side: str,
        size: float,
        price: Optional[float] = None,
        order_type: str = "market",
        reduce_only: bool = False,
    ) -> TradeResult:
        """
        Place a perpetual futures order on Drift.
        
        Args:
            market: Market symbol (e.g., "SOL-PERP")
            side: "buy"/"long" or "sell"/"short"
            size: Order size in base units (e.g., 1.0 SOL)
            price: Limit price (required for limit orders)
            order_type: "market" or "limit"
            reduce_only: If True, only reduces existing position
        
        Returns:
            TradeResult with transaction signature and details.
        """
        if not self._initialized:
            success = await self.initialize()
            if not success:
                return TradeResult(
                    success=False,
                    error="Failed to initialize Drift client"
                )
        
        if not self._subscribed:
            await self.subscribe()
        
        market_index = DRIFT_MARKET_INDEX.get(market)
        if market_index is None:
            return TradeResult(
                success=False,
                error=f"Unknown market: {market}. Available: {list(DRIFT_MARKET_INDEX.keys())}"
            )
        
        try:
            # Determine direction
            side_lower = side.lower()
            if side_lower in ("buy", "long"):
                direction = PositionDirection.Long()
            elif side_lower in ("sell", "short"):
                direction = PositionDirection.Short()
            else:
                return TradeResult(
                    success=False,
                    error=f"Invalid side: {side}. Use 'buy'/'long' or 'sell'/'short'"
                )
            
            # Determine order type
            if order_type.lower() == "limit":
                if price is None:
                    return TradeResult(
                        success=False,
                        error="Limit orders require a price"
                    )
                drift_order_type = DriftOrderType.Limit()
                price_int = int(price * 1e6)  # Drift uses 6 decimal precision for price
            else:
                drift_order_type = DriftOrderType.Market()
                price_int = 0
            
            # Convert size to base asset amount (9 decimal precision)
            base_asset_amount = int(abs(size) * 1e9)
            
            # Build order params
            order_params = OrderParams(
                order_type=drift_order_type,
                market_type=MarketType.Perp(),
                direction=direction,
                base_asset_amount=base_asset_amount,
                market_index=market_index,
                price=price_int,
                reduce_only=reduce_only,
            )
            
            logger.info(f"Placing order: {side} {size} {market} @ {'market' if order_type == 'market' else f'${price}'}")
            
            # Execute the order
            tx_sig = await self._drift_client.place_perp_order(order_params)
            tx_sig_str = str(tx_sig)
            
            # Build explorer URL
            cluster = "devnet" if settings.drift_env == "devnet" else "mainnet-beta"
            explorer_url = f"https://explorer.solana.com/tx/{tx_sig_str}?cluster={cluster}"
            
            logger.info(f"Order placed successfully: {tx_sig_str}")
            
            return TradeResult(
                success=True,
                signature=tx_sig_str,
                explorer_url=explorer_url,
                message=f"Order placed: {side.upper()} {size} {market}",
                details={
                    "market": market,
                    "market_index": market_index,
                    "side": side,
                    "size": size,
                    "price": price,
                    "order_type": order_type,
                    "reduce_only": reduce_only,
                    "network": settings.drift_env,
                }
            )
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to place order: {error_msg}")
            return TradeResult(
                success=False,
                error=error_msg,
                message=f"Failed to place {side} order for {size} {market}"
            )
    
    async def close_position(self, market: str) -> TradeResult:
        """
        Close entire position in a market.
        
        Args:
            market: Market symbol (e.g., "SOL-PERP")
        
        Returns:
            TradeResult with transaction details.
        """
        if not self._initialized:
            await self.initialize()
        
        if not self._subscribed:
            await self.subscribe()
        
        try:
            # Get current position
            position = await self.get_position(market)
            if not position or position.size == 0:
                return TradeResult(
                    success=True,
                    message=f"No position to close for {market}"
                )
            
            # Close by taking opposite position
            close_side = "sell" if position.side == "long" else "buy"
            
            return await self.place_perp_order(
                market=market,
                side=close_side,
                size=abs(position.size),
                order_type="market",
                reduce_only=True,
            )
            
        except Exception as e:
            logger.error(f"Failed to close position: {e}")
            return TradeResult(
                success=False,
                error=str(e)
            )
    
    async def get_position(self, market: str) -> Optional[Position]:
        """
        Get user's position in a specific market.
        
        Args:
            market: Market symbol (e.g., "SOL-PERP")
        
        Returns:
            Position object or None if no position.
        """
        if not self._initialized:
            await self.initialize()
        
        market_index = DRIFT_MARKET_INDEX.get(market)
        if market_index is None:
            return None
        
        try:
            user = self._drift_client.get_user()
            perp_position = user.get_perp_position(market_index)
            
            if perp_position is None or perp_position.base_asset_amount == 0:
                return None
            
            # Convert from Drift's precision
            size = perp_position.base_asset_amount / 1e9
            side = "long" if size > 0 else "short"
            entry_price = perp_position.quote_entry_amount / abs(perp_position.base_asset_amount) if perp_position.base_asset_amount != 0 else 0
            
            # Calculate unrealized PnL
            oracle_price = await self._get_oracle_price(market_index)
            if oracle_price:
                unrealized_pnl = (oracle_price - entry_price) * abs(size) if side == "long" else (entry_price - oracle_price) * abs(size)
            else:
                unrealized_pnl = 0
            
            return Position(
                market=market,
                market_index=market_index,
                size=abs(size),
                side=side,
                entry_price=entry_price,
                unrealized_pnl=unrealized_pnl,
            )
            
        except Exception as e:
            logger.error(f"Failed to get position for {market}: {e}")
            return None
    
    async def get_all_positions(self) -> List[Position]:
        """
        Get all user positions.
        
        Returns:
            List of Position objects.
        """
        if not self._initialized:
            await self.initialize()
        
        positions = []
        
        try:
            user = self._drift_client.get_user()
            
            for market, market_index in DRIFT_MARKET_INDEX.items():
                try:
                    perp_position = user.get_perp_position(market_index)
                    
                    if perp_position and perp_position.base_asset_amount != 0:
                        size = perp_position.base_asset_amount / 1e9
                        side = "long" if size > 0 else "short"
                        entry_price = abs(perp_position.quote_entry_amount / perp_position.base_asset_amount) if perp_position.base_asset_amount != 0 else 0
                        
                        positions.append(Position(
                            market=market,
                            market_index=market_index,
                            size=abs(size),
                            side=side,
                            entry_price=entry_price,
                            unrealized_pnl=0,  # Would need oracle price
                        ))
                except Exception:
                    continue
            
            return positions
            
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")
            return []
    
    async def _get_oracle_price(self, market_index: int) -> Optional[float]:
        """Get oracle price for a market."""
        try:
            perp_market = await get_perp_market_account(
                self._drift_client.program,
                market_index,
            )
            # Oracle price is in 6 decimal precision
            return perp_market.amm.historical_oracle_data.last_oracle_price / 1e6
        except Exception:
            return None
    
    async def get_account_info(self) -> Dict[str, Any]:
        """
        Get user's Drift account information.
        
        Returns:
            Dict with account details.
        """
        if not self._initialized:
            await self.initialize()
        
        try:
            user = self._drift_client.get_user()
            
            # Get total collateral
            total_collateral = user.get_total_collateral() / 1e6
            free_collateral = user.get_free_collateral() / 1e6
            
            return {
                "wallet": str(self._keypair.pubkey()),
                "total_collateral_usdc": total_collateral,
                "free_collateral_usdc": free_collateral,
                "margin_ratio": user.get_margin_ratio() if hasattr(user, 'get_margin_ratio') else None,
                "network": settings.drift_env,
            }
        except Exception as e:
            logger.error(f"Failed to get account info: {e}")
            return {
                "wallet": str(self._keypair.pubkey()) if self._keypair else None,
                "error": str(e),
            }
    
    async def close(self):
        """Close connections."""
        if self._drift_client:
            try:
                await self._drift_client.unsubscribe()
            except Exception:
                pass
        
        if self._connection:
            try:
                await self._connection.close()
            except Exception:
                pass
        
        self._initialized = False
        self._subscribed = False


# Singleton instance
drift_client = DriftTraderClient()


async def get_drift_client() -> DriftTraderClient:
    """Get initialized Drift client."""
    if not drift_client.is_initialized:
        await drift_client.initialize()
    if not drift_client.is_subscribed:
        await drift_client.subscribe()
    return drift_client
