from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").replace(
    "postgresql://", "postgresql+asyncpg://"
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        from database import models  # noqa
        await conn.execute(
            __import__("sqlalchemy").text(
                "DO $$ BEGIN "
                "CREATE TYPE suggestiontype AS ENUM ('flirty', 'upsell', 'reengage'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; "
                "END $$;"
            )
        )
        await conn.run_sync(Base.metadata.create_all)
