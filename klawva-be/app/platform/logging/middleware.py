import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from starlette.responses import Response

from app.platform.observability.metrics import metrics_registry

logger = logging.getLogger("klawva.request")


def register_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_logging_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        start = time.perf_counter()
        logger.debug("request incoming: %s %s", request.method, request.url.path)
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        metrics_registry.increment("requests_total")
        if response.status_code >= 500:
            metrics_registry.increment("requests_5xx")

        logger.info(
            "request path=%s method=%s status=%s duration_ms=%s",
            request.url.path,
            request.method,
            response.status_code,
            elapsed_ms,
        )
        return response
