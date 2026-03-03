import httpx

from app.platform.config import settings


class DropletAgentClientError(RuntimeError):
    pass


class DropletAgentClient:
    def __init__(self) -> None:
        self.port = settings.droplet_agent_gateway_port
        self.token = settings.internal_service_token

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["x-internal-token"] = self.token
        return headers

    async def push_session(
        self, *, droplet_ip: str, session_config: dict
    ) -> None:
        url = f"http://{droplet_ip}:{self.port}/sessions"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                url, json=session_config, headers=self._headers()
            )
        if response.status_code >= 400:
            text = response.text.strip()
            detail = text[:240] if text else "push_failed"
            raise DropletAgentClientError(
                f"droplet_push_failed:{response.status_code}:{detail}"
            )

    async def remove_session(
        self, *, droplet_ip: str, session_id: str
    ) -> None:
        url = f"http://{droplet_ip}:{self.port}/sessions/{session_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(url, headers=self._headers())
        if response.status_code >= 400:
            text = response.text.strip()
            detail = text[:240] if text else "remove_failed"
            raise DropletAgentClientError(
                f"droplet_remove_failed:{response.status_code}:{detail}"
            )

    async def health_check(self, *, droplet_ip: str) -> dict:
        url = f"http://{droplet_ip}:{self.port}/health"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=self._headers())
        if response.status_code >= 400:
            text = response.text.strip()
            detail = text[:240] if text else "health_failed"
            raise DropletAgentClientError(
                f"droplet_health_failed:{response.status_code}:{detail}"
            )
        return response.json()
