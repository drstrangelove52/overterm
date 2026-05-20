from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=False,
    pool_recycle=1800,   # recycle connections after 30 min (MariaDB default wait_timeout is 8h, but idle connections break over time)
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
