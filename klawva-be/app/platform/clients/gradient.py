from dataclasses import dataclass

import httpx

from app.platform.config import settings


class GradientClientError(RuntimeError):
    pass


@dataclass
class GradientModel:
    id: str
    owner: str


class GradientClient:
    def __init__(self) -> None:
        self.base_url = settings.gradient_base_url.rstrip("/")
        self.api_key = settings.gradient_model_access_key

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise GradientClientError("GRADIENT_MODEL_ACCESS_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def list_models(self) -> list[GradientModel]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{self.base_url}/v1/models", headers=self._headers())

        if response.status_code >= 400:
            raise GradientClientError(f"gradient_models_failed:{response.status_code}")

        payload = response.json()
        rows = payload.get("data", []) if isinstance(payload, dict) else []
        models: list[GradientModel] = []
        for row in rows:
            if isinstance(row, dict):
                model_id = str(row.get("id", ""))
                if model_id:
                    models.append(GradientModel(id=model_id, owner=str(row.get("owned_by", ""))))
        return models
