from fastapi import HTTPException

from app.platform.clients.gradient import GradientClient, GradientClientError
from app.platform.config import settings


def resolve_model_policy(available_model_ids: set[str]) -> tuple[str, str]:
    preferred = settings.gradient_preferred_model
    fallback = settings.gradient_fallback_model

    if preferred in available_model_ids:
        return preferred, "preferred"
    if fallback in available_model_ids:
        return fallback, "fallback"
    raise HTTPException(status_code=503, detail="no_supported_gradient_model")


async def discover_models_and_select() -> dict[str, object]:
    client = GradientClient()
    try:
        models = await client.list_models()
    except GradientClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    model_ids = {model.id for model in models}
    selected, policy = resolve_model_policy(model_ids)

    return {
        "selectedModel": selected,
        "policy": policy,
        "models": [{"id": m.id, "owner": m.owner} for m in models],
    }
