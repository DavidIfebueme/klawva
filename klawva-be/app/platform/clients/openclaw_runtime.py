import httpx

from app.platform.config import settings


class OpenClawRuntimeClientError(RuntimeError):
    pass


class OpenClawRuntimeClient:
    def __init__(self) -> None:
        self.dispatch_url = settings.openclaw_bootstrap_dispatch_url
        self.dispatch_timeout = settings.openclaw_bootstrap_dispatch_timeout_seconds
        self.dispatch_token = settings.openclaw_bootstrap_dispatch_token

    async def dispatch_bootstrap(self, payload: dict[str, object]) -> None:
        if not self.dispatch_url:
            raise OpenClawRuntimeClientError("openclaw_dispatch_url_not_configured")

        headers = {"Content-Type": "application/json"}
        if self.dispatch_token:
            headers["x-internal-token"] = self.dispatch_token

        async with httpx.AsyncClient(timeout=float(self.dispatch_timeout)) as client:
            response = await client.post(self.dispatch_url, json=payload, headers=headers)

        if response.status_code >= 400:
            text = response.text.strip()
            detail = text[:240] if text else "dispatch_failed"
            raise OpenClawRuntimeClientError(
                f"openclaw_dispatch_failed:{response.status_code}:{detail}"
            )