from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from app.config import get_settings

settings = get_settings()

# Build engine options based on database type
engine_options = {
    "echo": settings.debug,
    "future": True,
}

# SQLite doesn't support connection pooling options
if "sqlite" not in settings.database_url:
    engine_options.update({
        "pool_pre_ping": True,  # Check connection health before using
        "pool_recycle": 300,    # Recycle connections every 5 minutes
        "pool_size": 5,         # Number of connections to keep open
        "max_overflow": 10,     # Additional connections when pool is full
    })

engine = create_async_engine(
    settings.database_url,
    **engine_options
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()


async def get_db():
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
