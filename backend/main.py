from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api import rules_router, prices_router, auth_router, trades_router
from app.api.chat import router as chat_router
from app.database import init_db
from app.jobs import job_scheduler
from app.services import drift_service
from app.config import get_settings

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    # Startup
    logger.info("Starting Solana Trading Bot...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Initialize Drift service
    try:
        await drift_service.initialize()
        logger.info("Drift service initialized")
    except Exception as e:
        logger.error(f"Failed to initialize Drift: {e}")

    # Start job scheduler and restore jobs
    job_scheduler.start()
    await job_scheduler.restore_jobs()
    logger.info("Job scheduler started")

    yield

    # Shutdown
    logger.info("Shutting down...")
    job_scheduler.stop()
    await drift_service.close()


# Create FastAPI app
app = FastAPI(
    title="Solana Trading Bot",
    description="Automated trading on Drift Protocol using natural language rules",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Must be False when allow_origins is "*"
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(rules_router)
app.include_router(prices_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(trades_router)


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "drift_connected": drift_service._initialized,
        "scheduler_running": job_scheduler._running
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Solana Trading Bot API",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower()
    )
