from dataclasses import dataclass

import httpx

from app.platform.config import settings


class DigitalOceanClientError(RuntimeError):
    pass


@dataclass
class DropletCreateResult:
    droplet_id: str
    status: str


class DigitalOceanClient:
    def __init__(self) -> None:
        self.base_url = settings.digitalocean_api_base_url.rstrip("/")
        self.api_token = settings.digitalocean_api_token

    def _headers(self) -> dict[str, str]:
        if not self.api_token:
            raise DigitalOceanClientError("DIGITALOCEAN_API_TOKEN is not configured")
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            message = payload.get("message")
            if message:
                return str(message)
        text = response.text.strip()
        return text[:240] if text else "unknown_error"

    async def create_openclaw_droplet(self, *, session_id: str) -> DropletCreateResult:
        payload = {
            "name": f"klawva-{session_id[:8]}",
            "region": settings.digitalocean_region,
            "size": settings.digitalocean_droplet_size,
            "image": settings.digitalocean_openclaw_image,
            "tags": ["klawva", f"session-{session_id}"],
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/droplets",
                headers=self._headers(),
                json=payload,
            )

        if response.status_code >= 400:
            detail = self._error_detail(response)
            raise DigitalOceanClientError(f"do_create_failed:{response.status_code}:{detail}")

        data = response.json().get("droplet", {})
        droplet_id = str(data.get("id"))
        status = str(data.get("status", "new"))
        if not droplet_id:
            raise DigitalOceanClientError("do_create_missing_id")
        return DropletCreateResult(droplet_id=droplet_id, status=status)

    async def destroy_droplet(self, *, droplet_id: str) -> None:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.delete(
                f"{self.base_url}/v2/droplets/{droplet_id}",
                headers=self._headers(),
            )

        if response.status_code >= 400:
            detail = self._error_detail(response)
            raise DigitalOceanClientError(f"do_destroy_failed:{response.status_code}:{detail}")

    async def add_droplet_tag(self, *, droplet_id: str, tag: str) -> None:
        payload = {"resources": [{"resource_id": droplet_id, "resource_type": "droplet"}]}
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/tags/{tag}/resources",
                headers=self._headers(),
                json=payload,
            )

        if response.status_code >= 400:
            detail = self._error_detail(response)
            raise DigitalOceanClientError(f"do_tag_failed:{response.status_code}:{detail}")
