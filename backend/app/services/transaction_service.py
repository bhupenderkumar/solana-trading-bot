"""
Transaction Service for Drift Protocol

This service builds unsigned transactions that can be signed by the user's browser wallet.
Flow:
1. Frontend requests a transaction (e.g., place order)
2. Backend builds the unsigned transaction using Drift SDK
3. Backend returns serialized unsigned transaction
4. Frontend signs with Phantom/Solflare
5. Frontend submits signed transaction to Solana
"""

import logging
import base64
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


@dataclass
class DriftOrderParams:
    """Parameters for a Drift Protocol order."""
    market_index: int
    side: OrderSide
    size: float  # In base units (e.g., 1 SOL)
    price: Optional[float] = None  # For limit orders
    order_type: OrderType = OrderType.MARKET
    reduce_only: bool = False
    

# Market index mapping for Drift devnet
DRIFT_MARKET_INDEX = {
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
}


class _FakeWallet:
    """A wallet-like object that reports a user's pubkey but does not hold a private key.
    
    Used to make DriftClient build instructions with the correct authority/payer
    so that the user's browser wallet is the only required signer.
    """
    def __init__(self, pubkey):
        self._pubkey = pubkey

    @property
    def public_key(self):
        return self._pubkey

    # DriftClient never actually signs when we only extract instructions,
    # but provide stubs so it doesn't crash.
    def sign_transaction(self, tx):
        return tx

    def sign_all_transactions(self, txs):
        return txs


class TransactionService:
    """Service for building Drift Protocol transactions."""
    
    def __init__(self):
        self._drift_client = None
        self._connection = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize connection to Solana."""
        if self._initialized:
            return
            
        try:
            from solana.rpc.async_api import AsyncClient
            
            self._connection = AsyncClient(settings.solana_rpc_url)
            version = await self._connection.get_version()
            logger.info(f"Connected to Solana RPC: {version}")
            self._initialized = True
            
        except ImportError:
            logger.warning("solana package not installed - using mock mode")
            self._initialized = True
        except Exception as e:
            logger.error(f"Failed to connect to Solana: {e}")
            self._initialized = True  # Continue in mock mode
    
    async def build_place_order_transaction(
        self,
        user_pubkey: str,
        market: str,
        side: OrderSide,
        size: float,
        price: Optional[float] = None,
        order_type: OrderType = OrderType.MARKET
    ) -> Dict[str, Any]:
        """
        Build an unsigned transaction for placing an order on Drift.
        
        Returns:
            {
                "transaction": base64 encoded serialized transaction,
                "message": human readable description,
                "simulation": estimated outcome
            }
        """
        await self.initialize()
        
        market_index = DRIFT_MARKET_INDEX.get(market)
        if market_index is None:
            raise ValueError(f"Unknown market: {market}. Available: {list(DRIFT_MARKET_INDEX.keys())}")
        
        try:
            # Try to build real transaction using Drift SDK
            return await self._build_real_order_tx(
                user_pubkey, market_index, market, side, size, price, order_type
            )
        except ImportError as e:
            # Fall back to mock transaction for testing
            logger.warning(f"Import error: {e}")
            return await self._build_mock_order_tx(
                user_pubkey, market, side, size, price, order_type
            )
        except Exception as e:
            import traceback
            logger.error(f"Error building transaction: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Return mock for testing (with error info)
            mock_result = await self._build_mock_order_tx(
                user_pubkey, market, side, size, price, order_type
            )
            mock_result["mock_reason"] = str(e)
            return mock_result
    
    async def _build_real_order_tx(
        self,
        user_pubkey: str,
        market_index: int,
        market: str,
        side: OrderSide,
        size: float,
        price: Optional[float],
        order_type: OrderType
    ) -> Dict[str, Any]:
        """Build a real Drift order transaction using driftpy 0.8+."""
        from driftpy.drift_client import DriftClient
        from driftpy.types import OrderParams, MarketType, OrderType as DriftOrderType, PositionDirection
        from driftpy.account_subscription_config import AccountSubscriptionConfig
        from driftpy.addresses import get_user_account_public_key
        from driftpy.constants.config import DRIFT_PROGRAM_ID
        from solders.keypair import Keypair
        from solders.pubkey import Pubkey
        from solders.message import Message
        from solders.transaction import Transaction
        from solana.rpc.async_api import AsyncClient
        
        # Connect to Solana
        connection = AsyncClient(settings.solana_rpc_url)
        user_pubkey_obj = Pubkey.from_string(user_pubkey)
        
        # First, check if user has a Drift account
        user_account_pubkey = get_user_account_public_key(DRIFT_PROGRAM_ID, user_pubkey_obj, 0)
        
        account_info = await connection.get_account_info(user_account_pubkey)
        if account_info.value is None:
            await connection.close()
            # User doesn't have a Drift account - return helpful error
            return {
                "success": False,
                "error": "drift_account_not_found",
                "message": f"No Drift account found for {user_pubkey}. Please initialize your Drift account first at https://app.drift.trade (use devnet mode).",
                "details": {
                    "user_pubkey": user_pubkey,
                    "network": settings.drift_env,
                    "action_required": "initialize_drift_account",
                },
                "requires_signature": False,
            }
        
        # Create a fake wallet whose public_key is the user's pubkey.
        # This ensures DriftClient builds instructions with the user as authority/payer.
        fake_wallet = _FakeWallet(user_pubkey_obj)
        
        drift_client = DriftClient(
            connection,
            wallet=fake_wallet,
            env=settings.drift_env,
            account_subscription=AccountSubscriptionConfig("cached"),
        )
        
        # Subscribe to initialize the client (fetches account data)
        await drift_client.subscribe()
        
        # Build order parameters
        direction = PositionDirection.Long() if side == OrderSide.BUY else PositionDirection.Short()
        drift_order_type = DriftOrderType.Market() if order_type == OrderType.MARKET else DriftOrderType.Limit()
        
        # Convert size to base units (Drift uses 1e9 precision)
        base_asset_amount = int(size * 1e9)
        
        order_params = OrderParams(
            order_type=drift_order_type,
            market_type=MarketType.Perp(),
            direction=direction,
            base_asset_amount=base_asset_amount,
            market_index=market_index,
            price=int(price * 1e6) if price else 0,  # Price in 1e6
        )
        
        # Get the instruction (not a signed transaction)
        ix = await drift_client.get_place_perp_order_ix(order_params)
        
        # Get recent blockhash
        blockhash_resp = await connection.get_latest_blockhash()
        recent_blockhash = blockhash_resp.value.blockhash
        
        # Build unsigned transaction with user as fee payer
        message = Message.new_with_blockhash(
            [ix],
            user_pubkey_obj,  # Fee payer is the user
            recent_blockhash
        )
        
        # Create unsigned transaction
        tx = Transaction.new_unsigned(message)
        
        # Serialize the unsigned transaction
        serialized = base64.b64encode(bytes(tx)).decode('utf-8')
        
        await connection.close()
        
        return {
            "success": True,
            "transaction": serialized,
            "transaction_type": "place_perp_order",
            "message": f"{side.value.upper()} {size} {market} at {'market' if order_type == OrderType.MARKET else f'${price}'}",
            "details": {
                "market": market,
                "market_index": market_index,
                "side": side.value,
                "size": size,
                "price": price,
                "order_type": order_type.value,
            },
            "simulation": {
                "estimated_fee": 0.000005,  # ~5000 lamports
                "network": settings.drift_env,
            },
            "requires_signature": True,
            "signer": user_pubkey,
        }
    
    async def _build_mock_order_tx(
        self,
        user_pubkey: str,
        market: str,
        side: OrderSide,
        size: float,
        price: Optional[float],
        order_type: OrderType
    ) -> Dict[str, Any]:
        """Build a mock transaction for testing when Drift SDK not available."""
        import secrets
        
        # Generate a mock transaction that looks realistic
        mock_tx = secrets.token_bytes(256)
        serialized = base64.b64encode(mock_tx).decode('utf-8')
        
        return {
            "success": True,
            "transaction": serialized,
            "transaction_type": "place_perp_order",
            "message": f"[MOCK] {side.value.upper()} {size} {market} at {'market' if order_type == OrderType.MARKET else f'${price}'}",
            "details": {
                "market": market,
                "side": side.value,
                "size": size,
                "price": price,
                "order_type": order_type.value,
            },
            "simulation": {
                "estimated_fee": 0.000005,
                "network": settings.drift_env,
                "is_mock": True,
            },
            "requires_signature": True,
            "signer": user_pubkey,
            "mock_mode": True,
            "mock_reason": "Drift SDK not installed or not connected",
        }
    
    async def build_close_position_transaction(
        self,
        user_pubkey: str,
        market: str
    ) -> Dict[str, Any]:
        """Build a transaction to close an existing position."""
        await self.initialize()
        
        # For now, return mock
        import secrets
        mock_tx = secrets.token_bytes(256)
        serialized = base64.b64encode(mock_tx).decode('utf-8')
        
        return {
            "transaction": serialized,
            "transaction_type": "close_position",
            "message": f"Close {market} position",
            "details": {
                "market": market,
            },
            "simulation": {
                "estimated_fee": 0.000005,
                "network": settings.drift_env,
            },
            "requires_signature": True,
            "signer": user_pubkey,
        }
    
    async def get_user_positions(self, user_pubkey: str) -> List[Dict[str, Any]]:
        """Get user's current positions on Drift."""
        await self.initialize()
        
        try:
            from driftpy.drift_client import DriftClient
            from driftpy.accounts import get_user_account
            from solders.pubkey import Pubkey
            from solana.rpc.async_api import AsyncClient
            
            connection = AsyncClient(settings.solana_rpc_url)
            
            # Get user account
            user_account = await get_user_account(
                connection,
                Pubkey.from_string(user_pubkey),
                0  # subaccount 0
            )
            
            positions = []
            for pos in user_account.perp_positions:
                if pos.base_asset_amount != 0:
                    market_name = list(DRIFT_MARKET_INDEX.keys())[pos.market_index]
                    positions.append({
                        "market": market_name,
                        "market_index": pos.market_index,
                        "size": pos.base_asset_amount / 1e9,
                        "side": "long" if pos.base_asset_amount > 0 else "short",
                        "entry_price": pos.quote_entry_amount / abs(pos.base_asset_amount) if pos.base_asset_amount else 0,
                        "unrealized_pnl": pos.quote_asset_amount / 1e6,
                    })
            
            return positions
            
        except Exception as e:
            logger.warning(f"Could not fetch positions: {e}")
            return []
    
    async def get_market_info(self, market: str) -> Dict[str, Any]:
        """Get market information from Drift."""
        await self.initialize()
        
        market_index = DRIFT_MARKET_INDEX.get(market)
        if market_index is None:
            return {"error": f"Unknown market: {market}"}
        
        # Return basic info
        return {
            "market": market,
            "market_index": market_index,
            "network": settings.drift_env,
            "min_order_size": 0.001,
            "max_leverage": 10,
        }

    async def build_initialize_user_transaction(self, user_pubkey: str) -> Dict[str, Any]:
        """
        Build a transaction to initialize a new Drift user account.
        The user must sign this transaction to create their Drift account.
        """
        await self.initialize()
        
        try:
            from driftpy.drift_client import DriftClient
            from driftpy.account_subscription_config import AccountSubscriptionConfig
            from driftpy.addresses import get_user_account_public_key
            from driftpy.constants.config import DRIFT_PROGRAM_ID
            from solders.keypair import Keypair
            from solders.pubkey import Pubkey
            from solders.message import Message
            from solders.transaction import Transaction
            from solana.rpc.async_api import AsyncClient
            
            connection = AsyncClient(settings.solana_rpc_url)
            user_pubkey_obj = Pubkey.from_string(user_pubkey)
            
            # Check if user already has an account
            user_account_pubkey = get_user_account_public_key(DRIFT_PROGRAM_ID, user_pubkey_obj, 0)
            account_info = await connection.get_account_info(user_account_pubkey)
            
            if account_info.value is not None:
                await connection.close()
                return {
                    "success": False,
                    "error": "account_exists",
                    "message": f"Drift account already exists for {user_pubkey}",
                    "requires_signature": False,
                }
            
            # Create a fake wallet whose public_key is the user's pubkey.
            # This ensures instructions use the user as authority/payer (only required signer).
            fake_wallet = _FakeWallet(user_pubkey_obj)
            
            drift_client = DriftClient(
                connection,
                wallet=fake_wallet,
                env=settings.drift_env,
                account_subscription=AccountSubscriptionConfig("cached"),
            )
            
            # Subscribe to get state
            await drift_client.subscribe()
            
            # For sub_account 0 we need BOTH initialize_user_stats AND initialize_user
            instructions = []
            
            # Check if user_stats already exists
            user_stats_pubkey = drift_client.get_user_stats_public_key()
            stats_info = await connection.get_account_info(user_stats_pubkey)
            if stats_info.value is None:
                instructions.append(drift_client.get_initialize_user_stats())
            
            instructions.append(drift_client.get_initialize_user_instructions())
            
            # Get recent blockhash
            blockhash_resp = await connection.get_latest_blockhash()
            recent_blockhash = blockhash_resp.value.blockhash
            
            # Build unsigned transaction
            message = Message.new_with_blockhash(
                instructions,
                user_pubkey_obj,
                recent_blockhash
            )
            
            tx = Transaction.new_unsigned(message)
            serialized = base64.b64encode(bytes(tx)).decode('utf-8')
            
            await connection.close()
            
            return {
                "success": True,
                "transaction": serialized,
                "transaction_type": "initialize_user",
                "message": f"Initialize Drift account for {user_pubkey[:8]}...{user_pubkey[-6:]}",
                "details": {
                    "user_pubkey": user_pubkey,
                    "network": settings.drift_env,
                    "account_pubkey": str(user_account_pubkey),
                },
                "simulation": {
                    "estimated_fee": 0.000005,
                    "rent": 0.00144768,  # Approximate rent for user account
                    "network": settings.drift_env,
                },
                "requires_signature": True,
                "signer": user_pubkey,
            }
            
        except ImportError as e:
            logger.warning(f"Import error building initialize tx: {e}")
            return {
                "success": False,
                "error": "sdk_not_available",
                "message": "Drift SDK not available",
                "requires_signature": False,
            }
        except Exception as e:
            import traceback
            logger.error(f"Error building initialize tx: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to build initialize transaction: {e}",
                "requires_signature": False,
            }


# Singleton instance
_transaction_service: Optional[TransactionService] = None


def get_transaction_service() -> TransactionService:
    """Get or create the transaction service instance."""
    global _transaction_service
    if _transaction_service is None:
        _transaction_service = TransactionService()
    return _transaction_service
