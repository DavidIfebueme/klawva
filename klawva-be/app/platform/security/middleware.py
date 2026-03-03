from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app.platform.config import settings

_RATE_WINDOW = timedelta(minutes=1)
_rate_buckets: dict[str, deque[datetime]] = defaultdict(deque)

_INTERNAL_PREFIXES = (
    "/api/provisioning/start",
    "/api/provisioning/bootstrap",
    "/api/provisioning/destroy",
    "/api/channels/telegram/assign",
    "/api/channels/onboarding/event",
    "/api/activity/ingest",
    "/api/reports/upsert",
    "/api/termination/schedule",
    "/api/termination/execute-due",
    "/api/emails/dispatch-due",
)


def _is_internal_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _INTERNAL_PREFIXES)


def register_security_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def rate_limit_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(UTC)
        bucket = _rate_buckets[client_ip]

        while bucket and (now - bucket[0]) > _RATE_WINDOW:
            bucket.popleft()

        if len(bucket) >= settings.rate_limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited", "message": "rate_limit_exceeded"}},
            )

        bucket.append(now)
        return await call_next(request)

    @app.middleware("http")
    async def internal_auth_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        token = settings.internal_service_token
        if _is_internal_path(request.url.path):
            if not token:
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "misconfigured",
                            "message": "internal_service_token_not_configured",
                        }
                    },
                )
            provided = request.headers.get("x-internal-token")
            if provided != token:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": {
                            "code": "unauthorized",
                            "message": "invalid_internal_token",
                        }
                    },
                )

        return await call_next(request)
