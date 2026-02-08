import asyncio
from typing import Optional, Dict, List
from datetime import datetime, timedelta
import logging
import httpx
import certifi
import time

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PriceCache:
    """Simple in-memory price cache to reduce API calls."""
    
    def __init__(self, ttl_seconds: int = 5):
        self._cache: Dict[str, tuple[float, float]] = {}  # symbol -> (price, timestamp)
        self._ttl = ttl_seconds
    
    def get(self, symbol: str) -> Optional[float]:
        if symbol in self._cache:
            price, ts = self._cache[symbol]
            if time.time() - ts < self._ttl:
                return price
        return None
    
    def set(self, symbol: str, price: float):
        self._cache[symbol] = (price, time.time())
    
    def set_many(self, prices: Dict[str, float]):
        ts = time.time()
        for symbol, price in prices.items():
            self._cache[symbol] = (price, ts)
    
    def get_all(self) -> Dict[str, float]:
        """Get all cached prices that are still valid."""
        now = time.time()
        return {
            symbol: price 
            for symbol, (price, ts) in self._cache.items() 
            if now - ts < self._ttl
        }


class DriftService:
    """Service for interacting with Drift Protocol on Solana.
    
    Uses Jupiter API for prices (fast, reliable, no rate limits).
    Falls back to Pyth and CoinGecko if needed.
    """

    # Token mint addresses for Jupiter API
    TOKEN_MINTS = {
        "SOL-PERP": "So11111111111111111111111111111111111111112",
        "BTC-PERP": "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",  # wBTC
        "ETH-PERP": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",  # wETH
        "JUP-PERP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        "WIF-PERP": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
        "BONK-PERP": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "PYTH-PERP": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
        "RENDER-PERP": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    }
    
    # Pyth Network price feed IDs - PRIMARY SOURCE (Drift's actual oracle)
    PYTH_FEEDS = {
        "SOL-PERP": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        "BTC-PERP": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        "ETH-PERP": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        "DOGE-PERP": "0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
        "XRP-PERP": "0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
        "JUP-PERP": "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
        "WIF-PERP": "0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
        "BONK-PERP": "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    }

    def __init__(self):
        self.rpc_url = settings.solana_rpc_url
        self.drift_env = settings.drift_env
        self._initialized = False
        self._use_mock = True
        self._price_cache = PriceCache(ttl_seconds=5)
        self._drift_client = None
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                verify=certifi.where(),
                timeout=httpx.Timeout(10.0),
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
            )
        return self._http_client

    async def initialize(self):
        """Initialize connection to Solana and Drift."""
        if self._initialized:
            return

        try:
            if settings.wallet_private_key:
                try:
                    from solders.keypair import Keypair
                    from solana.rpc.async_api import AsyncClient
                    
                    # Decode wallet
                    import base58
                    private_key_bytes = base58.b58decode(settings.wallet_private_key)
                    self._keypair = Keypair.from_bytes(private_key_bytes)
                    logger.info(f"Wallet loaded: {self._keypair.pubkey()}")
                    
                    # Try to initialize Drift client
                    try:
                        from driftpy.drift_client import DriftClient
                        from driftpy.accounts import get_perp_market_account
                        from driftpy.constants.config import configs
                        
                        connection = AsyncClient(self.rpc_url)
                        config = configs[self.drift_env]
                        
                        self._drift_client = DriftClient(
                            connection,
                            self._keypair,
                            env=self.drift_env,
                        )
                        await self._drift_client.subscribe()
                        self._use_mock = False
                        logger.info("Drift client connected - REAL TRADING ENABLED")
                    except ImportError:
                        logger.warning("driftpy not installed - using price API only")
                        self._use_mock = True
                    except Exception as e:
                        logger.error(f"Drift client init failed: {e}")
                        self._use_mock = True
                        
                except ImportError:
                    logger.warning("solders/solana not installed - mock mode")
                    self._use_mock = True
                except Exception as e:
                    logger.error(f"Wallet init failed: {e}")
                    self._use_mock = True
            else:
                logger.warning("No wallet configured - running in read-only mode")
                self._use_mock = True

            self._initialized = True
            logger.info(f"Drift service initialized (mock mode: {self._use_mock})")

        except Exception as e:
            logger.error(f"Failed to initialize Drift service: {e}")
            self._initialized = True
            self._use_mock = True

    async def get_perp_market_price(self, market_symbol: str) -> Optional[float]:
        """Get current price for a perpetual market using Pyth Network (Solana's oracle)."""
        if not self._initialized:
            await self.initialize()

        # Check cache first
        cached = self._price_cache.get(market_symbol)
        if cached is not None:
            return cached

        # Try Pyth Network first (Drift's actual price oracle)
        price = await self._get_price_pyth(market_symbol)
        if price:
            self._price_cache.set(market_symbol, price)
            return price
        
        # Fallback to Jupiter
        price = await self._get_price_jupiter(market_symbol)
        if price:
            self._price_cache.set(market_symbol, price)
            return price
        
        # Last resort: CoinGecko
        price = await self._get_price_coingecko(market_symbol)
        if price:
            self._price_cache.set(market_symbol, price)
            return price
        
        logger.error(f"Failed to get price for {market_symbol} from all sources")
        return None

    async def _get_price_jupiter(self, market_symbol: str) -> Optional[float]:
        """Get price from Jupiter Price API v2."""
        try:
            mint = self.TOKEN_MINTS.get(market_symbol)
            if not mint:
                return None
            
            client = await self._get_http_client()
            response = await client.get(
                "https://api.jup.ag/price/v2",
                params={"ids": mint}
            )
            
            if response.status_code == 200:
                data = response.json()
                price_data = data.get("data", {}).get(mint)
                if price_data and price_data.get("price"):
                    return float(price_data["price"])
        except Exception as e:
            logger.debug(f"Jupiter price fetch failed for {market_symbol}: {e}")
        return None

    async def _get_price_pyth(self, market_symbol: str) -> Optional[float]:
        """Get price from Pyth Network."""
        try:
            feed_id = self.PYTH_FEEDS.get(market_symbol)
            if not feed_id:
                return None
            
            client = await self._get_http_client()
            response = await client.get(
                f"https://hermes.pyth.network/api/latest_price_feeds",
                params={"ids[]": feed_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    price_feed = data[0]
                    price = price_feed.get("price", {})
                    if price.get("price"):
                        # Pyth returns price with exponent
                        raw_price = int(price["price"])
                        expo = int(price.get("expo", 0))
                        return raw_price * (10 ** expo)
        except Exception as e:
            logger.debug(f"Pyth price fetch failed for {market_symbol}: {e}")
        return None

    async def _get_price_coingecko(self, market_symbol: str) -> Optional[float]:
        """Get price from CoinGecko (fallback, has rate limits)."""
        symbol_map = {
            "SOL-PERP": "solana",
            "BTC-PERP": "bitcoin",
            "ETH-PERP": "ethereum",
            "DOGE-PERP": "dogecoin",
            "XRP-PERP": "ripple",
            "JUP-PERP": "jupiter-exchange-solana",
            "WIF-PERP": "dogwifcoin",
        }
        
        try:
            coingecko_id = symbol_map.get(market_symbol)
            if not coingecko_id:
                return None
            
            client = await self._get_http_client()
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coingecko_id, "vs_currencies": "usd"}
            )
            
            if response.status_code == 200:
                data = response.json()
                price = data.get(coingecko_id, {}).get("usd")
                if price:
                    return float(price)
        except Exception as e:
            logger.debug(f"CoinGecko price fetch failed for {market_symbol}: {e}")
        return None

    async def get_all_perp_prices(self) -> Dict[str, float]:
        """Get prices for all perpetual markets using Pyth Network batch API."""
        # Return cached prices if all are fresh
        cached = self._price_cache.get_all()
        if len(cached) >= len(self.PYTH_FEEDS):
            return cached
        
        # Fetch all prices from Pyth Network (batch request)
        try:
            feed_ids = list(self.PYTH_FEEDS.values())
            feed_to_symbol = {v: k for k, v in self.PYTH_FEEDS.items()}
            
            client = await self._get_http_client()
            # Pyth supports multiple ids[] params for batch
            params = [("ids[]", feed_id) for feed_id in feed_ids]
            response = await client.get(
                "https://hermes.pyth.network/api/latest_price_feeds",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                prices = {}
                for price_feed in data:
                    feed_id = "0x" + price_feed.get("id", "")
                    symbol = feed_to_symbol.get(feed_id)
                    if symbol:
                        price_data = price_feed.get("price", {})
                        if price_data.get("price"):
                            raw_price = int(price_data["price"])
                            expo = int(price_data.get("expo", 0))
                            prices[symbol] = raw_price * (10 ** expo)
                
                if prices:
                    self._price_cache.set_many(prices)
                    return prices
        except Exception as e:
            logger.error(f"Pyth batch price fetch failed: {e}")
        
        # Fallback: fetch individually
        prices = {}
        for symbol in ["SOL-PERP", "BTC-PERP", "ETH-PERP"]:  # Core markets
            price = await self.get_perp_market_price(symbol)
            if price:
                prices[symbol] = price
        
        return prices

    async def get_price_history(
        self, 
        market_symbol: str, 
        days: int = 14
    ) -> List[Dict]:
        """Get price history for charting."""
        # Use CoinGecko for historical data (Jupiter doesn't have history)
        symbol_map = {
            "SOL-PERP": "solana",
            "BTC-PERP": "bitcoin",
            "ETH-PERP": "ethereum",
        }
        
        coingecko_id = symbol_map.get(market_symbol)
        if not coingecko_id:
            return []
        
        try:
            client = await self._get_http_client()
            response = await client.get(
                f"https://api.coingecko.com/api/v3/coins/{coingecko_id}/market_chart",
                params={"vs_currency": "usd", "days": days, "interval": "daily"}
            )
            
            if response.status_code == 200:
                data = response.json()
                prices = data.get("prices", [])
                return [
                    {"timestamp": ts, "price": price}
                    for ts, price in prices
                ]
        except Exception as e:
            logger.error(f"Price history fetch failed: {e}")
        
        return []

    async def get_user_position(self, market_symbol: str) -> Optional[Dict]:
        """Get user's current position in a market."""
        if self._use_mock or not self._drift_client:
            return None

        try:
            user = self._drift_client.get_user()
            # Find position for this market
            for position in user.perp_positions:
                if position.market_index == self._get_market_index(market_symbol):
                    if position.base_asset_amount != 0:
                        return {
                            "market": market_symbol,
                            "size": position.base_asset_amount / 1e9,
                            "entry_price": position.quote_entry_amount / position.base_asset_amount if position.base_asset_amount else 0,
                            "unrealized_pnl": position.unrealized_pnl / 1e6,
                        }
        except Exception as e:
            logger.error(f"Failed to get position: {e}")
        
        return None

    def _get_market_index(self, market_symbol: str) -> int:
        """Get Drift market index for symbol."""
        market_indices = {
            "SOL-PERP": 0,
            "BTC-PERP": 1,
            "ETH-PERP": 2,
            "APT-PERP": 3,
            "ARB-PERP": 4,
            "DOGE-PERP": 5,
            "MATIC-PERP": 6,
            "SUI-PERP": 7,
            "XRP-PERP": 8,
            "JUP-PERP": 24,
            "WIF-PERP": 25,
            "BONK-PERP": 19,
        }
        return market_indices.get(market_symbol, 0)

    async def place_market_order(
        self,
        market_symbol: str,
        side: str,
        size: float,
        reduce_only: bool = False
    ) -> Optional[str]:
        """Place a market order on Drift."""
        if self._use_mock:
            import uuid
            fake_tx = f"MOCK_{uuid.uuid4().hex[:16]}"
            logger.info(f"[MOCK] Order: {side} {size} {market_symbol} -> {fake_tx}")
            return fake_tx

        if not self._drift_client:
            raise RuntimeError("Drift client not initialized")

        try:
            from driftpy.types import PositionDirection, OrderParams, OrderType
            
            market_index = self._get_market_index(market_symbol)
            direction = PositionDirection.Long() if side.lower() == "buy" else PositionDirection.Short()
            
            # Convert size to base units (1e9)
            base_asset_amount = int(size * 1e9)
            
            order_params = OrderParams(
                order_type=OrderType.Market(),
                market_index=market_index,
                base_asset_amount=base_asset_amount,
                direction=direction,
                reduce_only=reduce_only,
            )
            
            tx_sig = await self._drift_client.place_perp_order(order_params)
            logger.info(f"Order placed: {side} {size} {market_symbol} -> {tx_sig}")
            return str(tx_sig)
            
        except Exception as e:
            logger.error(f"Failed to place order: {e}")
            raise

    async def close_position(self, market_symbol: str) -> Optional[str]:
        """Close entire position in a market."""
        if self._use_mock:
            import uuid
            fake_tx = f"MOCK_CLOSE_{uuid.uuid4().hex[:16]}"
            logger.info(f"[MOCK] Close position: {market_symbol} -> {fake_tx}")
            return fake_tx

        if not self._drift_client:
            raise RuntimeError("Drift client not initialized")

        try:
            position = await self.get_user_position(market_symbol)
            if not position:
                logger.info(f"No position to close for {market_symbol}")
                return None
            
            # Close by placing opposite order
            size = abs(position["size"])
            side = "sell" if position["size"] > 0 else "buy"
            
            return await self.place_market_order(
                market_symbol, side, size, reduce_only=True
            )
        except Exception as e:
            logger.error(f"Failed to close position: {e}")
            raise

    async def get_account_balance(self) -> Dict:
        """Get user's account balance."""
        if self._use_mock or not self._drift_client:
            return {
                "total_usd": 10000.0,
                "available_usd": 10000.0,
                "is_mock": True,
            }

        try:
            user = self._drift_client.get_user()
            total_collateral = user.get_total_collateral() / 1e6
            free_collateral = user.get_free_collateral() / 1e6
            
            return {
                "total_usd": total_collateral,
                "available_usd": free_collateral,
                "is_mock": False,
            }
        except Exception as e:
            logger.error(f"Failed to get balance: {e}")
            return {"total_usd": 0, "available_usd": 0, "is_mock": True}

    async def close(self):
        """Close connections."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
        
        if self._drift_client:
            try:
                await self._drift_client.unsubscribe()
            except:
                pass


# Singleton instance
drift_service = DriftService()
