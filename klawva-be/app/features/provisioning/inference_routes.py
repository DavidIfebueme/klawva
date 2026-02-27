from fastapi import APIRouter

from app.features.provisioning.inference import discover_models_and_select

router = APIRouter(prefix="/api/inference", tags=["inference"])


@router.get("/models")
async def list_models_and_selection() -> dict[str, object]:
    return await discover_models_and_select()
