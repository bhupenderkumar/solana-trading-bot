"""
Configuration for Drift Trader Microservice
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Drift Trader settings from environment variables."""
    
    # Service settings
    service_name: str = "drift-trader"
    service_port: int = 8101
    debug: bool = False
    
    # Solana/Drift settings
    solana_rpc_url: str = "https://api.devnet.solana.com"
    drift_env: str = "devnet"  # "devnet" or "mainnet-beta"
    
    # Wallet - private key for signing transactions
    wallet_private_key: str = ""
    
    # Main backend URL for callbacks
    main_backend_url: str = "http://localhost:8100"
    
    # Rate limiting
    max_orders_per_minute: int = 10
    
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
