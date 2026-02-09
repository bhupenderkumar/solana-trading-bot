from app.api.rules import router as rules_router, trades_router
from app.api.prices import router as prices_router
from app.api.auth import router as auth_router

__all__ = ["rules_router", "prices_router", "auth_router", "trades_router"]
