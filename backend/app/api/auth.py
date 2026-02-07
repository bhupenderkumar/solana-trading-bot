from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import secrets
import hashlib

router = APIRouter(prefix="/api/auth", tags=["auth"])


class WalletResponse(BaseModel):
    public_key: str
    private_key: str  # Only shown once at creation
    message: str


class TokenRequest(BaseModel):
    token: Optional[str] = None


class TokenResponse(BaseModel):
    token: str
    is_new: bool


# In-memory token store (in production, use Redis or database)
_tokens: dict = {}


def generate_mock_wallet():
    """Generate a mock Solana-like wallet for devnet testing."""
    # Generate 32 random bytes for private key
    private_bytes = secrets.token_bytes(32)

    # Create a mock public key (in real impl, this would be derived from private key)
    public_bytes = hashlib.sha256(private_bytes).digest()

    # Encode as base58-like string (simplified)
    import base64
    private_key = base64.b64encode(private_bytes).decode()
    public_key = base64.b64encode(public_bytes).decode()[:44]  # Truncate to look like Solana pubkey

    return public_key, private_key


@router.post("/wallet", response_model=WalletResponse)
async def create_wallet():
    """Create a new devnet wallet for testing."""
    public_key, private_key = generate_mock_wallet()

    return WalletResponse(
        public_key=public_key,
        private_key=private_key,
        message="Save your private key! It will only be shown once. This is a DEVNET wallet for testing only."
    )


@router.post("/token", response_model=TokenResponse)
async def get_or_create_token(request: TokenRequest):
    """Get existing token or create a new one."""
    if request.token and request.token in _tokens:
        # Token exists, return it
        return TokenResponse(token=request.token, is_new=False)

    # Create new token
    new_token = secrets.token_urlsafe(32)
    _tokens[new_token] = {
        "created_at": "now",
        "wallet": None
    }

    return TokenResponse(token=new_token, is_new=True)


@router.get("/validate/{token}")
async def validate_token(token: str):
    """Validate a token."""
    if token in _tokens:
        return {"valid": True, "data": _tokens[token]}
    return {"valid": False}


@router.post("/link-wallet")
async def link_wallet(token: str, wallet_public_key: str):
    """Link a wallet to a token."""
    if token not in _tokens:
        raise HTTPException(status_code=404, detail="Token not found")

    _tokens[token]["wallet"] = wallet_public_key
    return {"success": True, "wallet": wallet_public_key}
