import asyncio
from typing import Optional, Dict
import logging
import httpx
import ssl
import certifi

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Fix SSL certificate issues
ssl_context = ssl.create_default_context(cafile=certifi.where())


class DriftService:
    """Service for interacting with Drift Protocol on Solana.

    Currently uses public price feeds for testing.
    Enable full Drift SDK by installing: pip install driftpy solders anchorpy
    """

    def __init__(self):
        self.rpc_url = settings.solana_rpc_url
        self.drift_env = settings.drift_env
        self._initialized = False
        self._use_mock = True  # Use mock prices until full SDK is configured

    async def initialize(self):
        """Initialize connection to Solana and Drift."""
        if self._initialized:
            return

        try:
            # Check if wallet is configured
            if settings.wallet_private_key:
                try:
                    # Try to import full Drift SDK
                    from solders.keypair import Keypair
                    from solana.rpc.async_api import AsyncClient
                    from driftpy.drift_client import DriftClient
                    self._use_mock = False
                    logger.info("Drift SDK available - full trading enabled")
                except ImportError:
                    logger.warning("Drift SDK not installed - using price API only")
                    self._use_mock = True
            else:
                logger.warning("No wallet configured - running in read-only mode")
                self._use_mock = True

            self._initialized = True
            logger.info("Drift service initialized (mock mode: %s)", self._use_mock)

        except Exception as e:
            logger.error(f"Failed to initialize Drift service: {e}")
            self._initialized = True  # Continue in mock mode
            self._use_mock = True

    async def get_perp_market_price(self, market_symbol: str) -> Optional[float]:
        """Get current price for a perpetual market."""
        if not self._initialized:
            await self.initialize()

        try:
            # Use CoinGecko for prices (free, no API key)
            symbol_map = {
                "SOL-PERP": "solana",
                "BTC-PERP": "bitcoin",
                "ETH-PERP": "ethereum",
                "DOGE-PERP": "dogecoin",
                "XRP-PERP": "ripple",
                "ARB-PERP": "arbitrum",
                "SUI-PERP": "sui",
                "APT-PERP": "aptos",
                "JUP-PERP": "jupiter-exchange-solana",
                "WIF-PERP": "dogwifcoin",
            }

            coingecko_id = symbol_map.get(market_symbol)
            if not coingecko_id:
                logger.warning(f"Unknown market: {market_symbol}")
                return None

            async with httpx.AsyncClient(verify=certifi.where()) as client:
                response = await client.get(
                    f"https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": coingecko_id, "vs_currencies": "usd"},
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    price = data.get(coingecko_id, {}).get("usd")
                    if price:
                        return float(price)

            return None
        except Exception as e:
            logger.error(f"Error getting price for {market_symbol}: {e}")
            return None

    async def get_all_perp_prices(self) -> Dict[str, float]:
        """Get prices for all perpetual markets."""
        try:
            async with httpx.AsyncClient(verify=certifi.where()) as client:
                response = await client.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={
                        "ids": "solana,bitcoin,ethereum,dogecoin,ripple",
                        "vs_currencies": "usd"
                    },
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "SOL-PERP": data.get("solana", {}).get("usd", 0),
                        "BTC-PERP": data.get("bitcoin", {}).get("usd", 0),
                        "ETH-PERP": data.get("ethereum", {}).get("usd", 0),
                        "DOGE-PERP": data.get("dogecoin", {}).get("usd", 0),
                        "XRP-PERP": data.get("ripple", {}).get("usd", 0),
                    }
        except Exception as e:
            logger.error(f"Error getting prices: {e}")

        return {}

    async def get_user_position(self, market_symbol: str) -> Optional[Dict]:
        """Get user's current position in a market."""
        if self._use_mock:
            # Return mock data for testing
            return None

        # Full implementation requires Drift SDK
        return None

    async def place_market_order(
        self,
        market_symbol: str,
        side: str,
        size: float,
        reduce_only: bool = False
    ) -> Optional[str]:
        """Place a market order on Drift."""
        if self._use_mock:
            # Simulate order for testing
            import uuid
            fake_tx = f"MOCK_{uuid.uuid4().hex[:16]}"
            logger.info(f"[MOCK] Order: {side} {size} {market_symbol} -> {fake_tx}")
            return fake_tx

        raise NotImplementedError("Full trading requires Drift SDK. Install: pip install driftpy")

    async def close_position(self, market_symbol: str) -> Optional[str]:
        """Close entire position in a market."""
        if self._use_mock:
            import uuid
            fake_tx = f"MOCK_CLOSE_{uuid.uuid4().hex[:16]}"
            logger.info(f"[MOCK] Close position: {market_symbol} -> {fake_tx}")
            return fake_tx

        raise NotImplementedError("Full trading requires Drift SDK")

    async def close(self):
        """Close connections."""
        pass


# Singleton instance
drift_service = DriftService()
