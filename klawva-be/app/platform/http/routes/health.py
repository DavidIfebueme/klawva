from fastapi import APIRouter, HTTPException

from app.platform.db.health import database_ready

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


async def is_database_ready() -> bool:
    return await database_ready()


@router.get("/ready")
async def ready() -> dict[str, str]:
    if not await is_database_ready():
        raise HTTPException(status_code=503, detail="service_not_ready")
    return {"status": "ready"}
