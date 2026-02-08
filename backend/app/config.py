from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "Solana Trading Bot"
    debug: bool = False
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite+aiosqlite:///./trading.db"

    # Solana
    solana_rpc_url: str = "https://api.mainnet-beta.solana.com"
    drift_env: str = "devnet"  # mainnet or devnet
    wallet_private_key: Optional[str] = None

    # LLM - Azure OpenAI via GitHub Enterprise
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    llm_model: str = "gpt-4o"
    
    # Azure OpenAI (GitHub Enterprise)
    azure_openai_api_key: Optional[str] = None
    azure_openai_endpoint: Optional[str] = None
    azure_openai_deployment: str = "gpt-4o"
    azure_openai_api_version: str = "2024-02-15-preview"
    use_azure_openai: bool = False
    
    # Legacy GitHub proxy settings
    github_proxy_url: str = "http://127.0.0.1:8080/v1"
    use_github_proxy: bool = False

    # Job Scheduler
    check_interval_seconds: int = 10
    max_retries: int = 3

    # Security
    secret_key: str = "change-this-in-production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
