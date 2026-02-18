"""
Transaction API endpoints for Drift Protocol trading.

These endpoints build unsigned transactions that are signed by the user's browser wallet.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

from app.services.transaction_service import (
    get_transaction_service,
    OrderSide,
    OrderType,
    DRIFT_MARKET_INDEX,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class BuildOrderRequest(BaseModel):
    """Request to build an order transaction."""
    user_pubkey: str
    market: str  # e.g., "SOL-PERP"
    side: str  # "buy" or "sell"
    size: float  # Amount in base units
    price: Optional[float] = None  # For limit orders
    order_type: str = "market"  # "market" or "limit"


class BuildOrderResponse(BaseModel):
    """Response containing the unsigned transaction."""
    success: bool
    transaction: Optional[str] = None  # Base64 encoded
    transaction_type: str
    message: str
    details: Dict[str, Any]
    simulation: Dict[str, Any]
    requires_signature: bool = True
    signer: str
    error: Optional[str] = None


class SubmitSignedTxRequest(BaseModel):
    """Request to submit a signed transaction."""
    signed_transaction: str  # Base64 encoded signed transaction
    user_pubkey: str


class SubmitSignedTxResponse(BaseModel):
    """Response from submitting a signed transaction."""
    success: bool
    signature: Optional[str] = None
    message: str
    explorer_url: Optional[str] = None
    error: Optional[str] = None


class PositionResponse(BaseModel):
    """User position information."""
    market: str
    market_index: int
    size: float
    side: str
    entry_price: float
    unrealized_pnl: float


@router.get("/check-account/{user_pubkey}")
async def check_drift_account(user_pubkey: str):
    """
    Check if a user has an initialized Drift account on devnet.
    Returns account status so the frontend can prompt initialization if needed.
    """
    try:
        from driftpy.addresses import get_user_account_public_key
        from driftpy.constants.config import DRIFT_PROGRAM_ID
        from solders.pubkey import Pubkey
        from solana.rpc.async_api import AsyncClient
        from app.config import get_settings

        settings = get_settings()
        connection = AsyncClient(settings.solana_rpc_url)
        user_pubkey_obj = Pubkey.from_string(user_pubkey)
        user_account_pubkey = get_user_account_public_key(DRIFT_PROGRAM_ID, user_pubkey_obj, 0)
        account_info = await connection.get_account_info(user_account_pubkey)
        await connection.close()

        has_account = account_info.value is not None
        return {
            "user_pubkey": user_pubkey,
            "has_drift_account": has_account,
            "drift_account_pubkey": str(user_account_pubkey),
            "network": settings.drift_env,
            "message": "Drift account found" if has_account else "No Drift account. Please initialize to trade.",
        }
    except ImportError:
        return {
            "user_pubkey": user_pubkey,
            "has_drift_account": False,
            "drift_account_pubkey": None,
            "network": "devnet",
            "message": "Drift SDK not available — cannot check account",
        }
    except Exception as e:
        logger.error(f"Error checking Drift account: {e}")
        return {
            "user_pubkey": user_pubkey,
            "has_drift_account": False,
            "drift_account_pubkey": None,
            "network": "devnet",
            "message": str(e),
        }


@router.get("/markets")
async def get_available_markets():
    """Get list of available markets on Drift."""
    return {
        "markets": list(DRIFT_MARKET_INDEX.keys()),
        "market_indices": DRIFT_MARKET_INDEX,
    }


@router.get("/market/{market}")
async def get_market_info(market: str):
    """Get information about a specific market."""
    service = get_transaction_service()
    return await service.get_market_info(market)


class InitializeUserRequest(BaseModel):
    """Request to initialize a Drift user account."""
    user_pubkey: str


class InitializeUserResponse(BaseModel):
    """Response containing the unsigned initialize transaction."""
    success: bool
    transaction: Optional[str] = None
    transaction_type: str = "initialize_user"
    message: str
    details: Dict[str, Any] = {}
    simulation: Dict[str, Any] = {}
    requires_signature: bool = True
    signer: Optional[str] = None
    error: Optional[str] = None


@router.post("/initialize-user", response_model=InitializeUserResponse)
async def build_initialize_user_transaction(request: InitializeUserRequest):
    """
    Build an unsigned transaction to initialize a new Drift user account.
    
    The user must sign this transaction to create their Drift account before
    they can place any orders.
    
    Example:
    ```
    POST /api/transactions/initialize-user
    {
        "user_pubkey": "7gDDrwC2hE3hkd97km362rP4wudFCE9f3MBfirTUyvZn"
    }
    ```
    """
    try:
        service = get_transaction_service()
        result = await service.build_initialize_user_transaction(request.user_pubkey)
        
        return InitializeUserResponse(
            success=result.get("success", False),
            transaction=result.get("transaction"),
            transaction_type=result.get("transaction_type", "initialize_user"),
            message=result.get("message", ""),
            details=result.get("details", {}),
            simulation=result.get("simulation", {}),
            requires_signature=result.get("requires_signature", True),
            signer=result.get("signer"),
            error=result.get("error"),
        )
    except Exception as e:
        logger.error(f"Error building initialize user transaction: {e}")
        return InitializeUserResponse(
            success=False,
            message=str(e),
            error=str(e),
            requires_signature=False,
        )


@router.post("/build-order", response_model=BuildOrderResponse)
async def build_order_transaction(request: BuildOrderRequest):
    """
    Build an unsigned order transaction for Drift Protocol.
    
    The returned transaction must be signed by the user's wallet and submitted.
    
    Example:
    ```
    POST /api/transactions/build-order
    {
        "user_pubkey": "7gDDrwC2hE3hkd97km362rP4wudFCE9f3MBfirTUyvZn",
        "market": "SOL-PERP",
        "side": "buy",
        "size": 1.0,
        "order_type": "market"
    }
    ```
    """
    try:
        service = get_transaction_service()
        
        # Validate side
        try:
            side = OrderSide(request.side.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid side: {request.side}. Use 'buy' or 'sell'")
        
        # Validate order type
        try:
            order_type = OrderType(request.order_type.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid order_type: {request.order_type}. Use 'market' or 'limit'")
        
        # Validate limit order has price
        if order_type == OrderType.LIMIT and request.price is None:
            raise HTTPException(status_code=400, detail="Limit orders require a price")
        
        # Build the transaction
        result = await service.build_place_order_transaction(
            user_pubkey=request.user_pubkey,
            market=request.market,
            side=side,
            size=request.size,
            price=request.price,
            order_type=order_type,
        )
        
        # Pass through the success status from the service
        return BuildOrderResponse(
            success=result.get("success", True),
            transaction=result.get("transaction"),
            transaction_type=result.get("transaction_type", "place_perp_order"),
            message=result.get("message", ""),
            details=result.get("details", {}),
            simulation=result.get("simulation", {}),
            requires_signature=result.get("requires_signature", True),
            signer=result.get("signer", request.user_pubkey),
            error=result.get("error"),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building order transaction: {e}")
        return BuildOrderResponse(
            success=False,
            transaction=None,
            transaction_type="error",
            message="Failed to build transaction",
            details={},
            simulation={},
            requires_signature=False,
            signer=request.user_pubkey,
            error=str(e),
        )


@router.post("/submit", response_model=SubmitSignedTxResponse)
async def submit_signed_transaction(request: SubmitSignedTxRequest):
    """
    Submit a signed transaction to Solana.
    
    The transaction should be signed by the user's wallet in the browser.
    
    Example:
    ```
    POST /api/transactions/submit
    {
        "signed_transaction": "base64_encoded_signed_tx...",
        "user_pubkey": "7gDDrwC2hE3hkd97km362rP4wudFCE9f3MBfirTUyvZn"
    }
    ```
    """
    try:
        from app.config import get_settings
        import base64
        
        settings = get_settings()
        
        # Decode the signed transaction
        try:
            tx_bytes = base64.b64decode(request.signed_transaction)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid transaction encoding")
        
        try:
            from solana.rpc.async_api import AsyncClient
            import base58
            
            # Connect to Solana
            connection = AsyncClient(settings.solana_rpc_url)
            
            # Submit the raw signed transaction bytes directly via RPC
            # This avoids deserialization issues between solders/solana-py
            result = await connection.send_raw_transaction(tx_bytes)
            
            signature = str(result.value)
            explorer_url = f"https://explorer.solana.com/tx/{signature}?cluster={settings.drift_env}"
            
            await connection.close()
            
            return SubmitSignedTxResponse(
                success=True,
                signature=signature,
                message="Transaction submitted successfully",
                explorer_url=explorer_url,
            )
            
        except ImportError:
            # Mock mode - just return success
            import secrets
            mock_sig = secrets.token_hex(64)
            
            return SubmitSignedTxResponse(
                success=True,
                signature=mock_sig,
                message="[MOCK] Transaction submitted (Solana SDK not installed)",
                explorer_url=f"https://explorer.solana.com/tx/{mock_sig}?cluster={settings.drift_env}",
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting transaction: {e}")
        return SubmitSignedTxResponse(
            success=False,
            message="Failed to submit transaction",
            error=str(e),
        )


@router.get("/positions/{user_pubkey}", response_model=List[PositionResponse])
async def get_user_positions(user_pubkey: str):
    """Get user's current positions on Drift."""
    service = get_transaction_service()
    positions = await service.get_user_positions(user_pubkey)
    return positions


@router.post("/close-position")
async def build_close_position_transaction(user_pubkey: str, market: str):
    """Build a transaction to close a position."""
    service = get_transaction_service()
    return await service.build_close_position_transaction(user_pubkey, market)


# Rule-based transaction execution
class ExecuteRuleRequest(BaseModel):
    """Request to execute a trading rule."""
    rule_id: int
    user_pubkey: str


@router.post("/execute-rule")
async def execute_trading_rule(request: ExecuteRuleRequest):
    """
    Build a transaction to execute a trading rule.
    
    This is called when a rule condition is met (e.g., price alert triggered).
    The transaction is returned unsigned for the user to sign.
    """
    from app.database import async_session_maker
    from app.models.trading import TradingRule, ActionType
    from sqlalchemy import select
    
    async with async_session_maker() as session:
        result = await session.execute(
            select(TradingRule).where(TradingRule.id == request.rule_id)
        )
        rule = result.scalar_one_or_none()
        
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        service = get_transaction_service()
        
        # Extract trade details from the rule model
        market = rule.market  # e.g., "SOL-PERP"
        side = OrderSide.BUY if rule.action_type == ActionType.BUY else OrderSide.SELL
        
        # Determine size from USD amount or default
        size = 1.0
        if rule.action_amount_usd:
            # Get current price to calculate size
            from app.services.drift_service import drift_service
            current_price = await drift_service.get_perp_market_price(market)
            if current_price and current_price > 0:
                size = rule.action_amount_usd / current_price
        
        # Build the transaction
        tx_result = await service.build_place_order_transaction(
            user_pubkey=request.user_pubkey,
            market=market,
            side=side,
            size=size,
            order_type=OrderType.MARKET,
        )
        
        return {
            "rule_id": rule.id,
            "rule_description": rule.user_input,
            "transaction": tx_result,
        }
