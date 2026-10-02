from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.platform.db.session import engine


async def database_ready() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False
