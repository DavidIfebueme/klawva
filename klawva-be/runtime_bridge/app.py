from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from runtime_bridge.config import runtime_bridge_settings
from runtime_bridge.models import (
    BridgeHealthResponse,
    SessionDeleteResponse,
    SessionUpsertResponse,
    WhatsAppEventRequest,
    WhatsAppEventResponse,
)
from runtime_bridge.runtime import BridgeRuntime


@asynccontextmanager
async def _lifespan(app: FastAPI):
    runtime: BridgeRuntime = app.state.runtime
    await runtime.startup()
    try:
        yield
    finally:
        await runtime.shutdown()


def create_runtime_bridge_app(runtime: BridgeRuntime | None = None) -> FastAPI:
    app = FastAPI(title="Klawva Runtime Bridge")
    app.state.runtime = runtime or BridgeRuntime(settings=runtime_bridge_settings)
    app.router.lifespan_context = _lifespan

    def _expected_token() -> str:
        direct = runtime_bridge_settings.bridge_internal_token.strip()
        if direct:
            return direct
        token_file = Path(runtime_bridge_settings.bridge_internal_token_file)
        if token_file.exists():
            return token_file.read_text().strip()
        return ""

    async def require_internal_token(
        x_internal_token: str | None = Header(default=None),
    ) -> None:
        expected = _expected_token()
        if not expected or x_internal_token != expected:
            raise HTTPException(status_code=401, detail="invalid_internal_token")

    def get_runtime() -> BridgeRuntime:
        runtime_obj: Any = app.state.runtime
        return runtime_obj

    @app.get("/health", response_model=BridgeHealthResponse)
    async def health(runtime_obj: BridgeRuntime = Depends(get_runtime)) -> BridgeHealthResponse:
        return BridgeHealthResponse(ok=True, sessions=len(runtime_obj.sessions))

    @app.post("/sessions", response_model=SessionUpsertResponse)
    async def upsert_session(
        payload: dict,
        _: None = Depends(require_internal_token),
        runtime_obj: BridgeRuntime = Depends(get_runtime),
    ) -> SessionUpsertResponse:
        session_id, channel = await runtime_obj.upsert_session(session_config=payload)
        return SessionUpsertResponse(sessionId=session_id, accepted=True, channel=channel)

    @app.delete("/sessions/{session_id}", response_model=SessionDeleteResponse)
    async def delete_session(
        session_id: str,
        _: None = Depends(require_internal_token),
        runtime_obj: BridgeRuntime = Depends(get_runtime),
    ) -> SessionDeleteResponse:
        removed = await runtime_obj.remove_session(session_id=session_id)
        return SessionDeleteResponse(sessionId=session_id, removed=removed)

    @app.post("/channels/whatsapp/event", response_model=WhatsAppEventResponse)
    async def whatsapp_event(
        payload: WhatsAppEventRequest,
        _: None = Depends(require_internal_token),
        runtime_obj: BridgeRuntime = Depends(get_runtime),
    ) -> WhatsAppEventResponse:
        await runtime_obj.emit_whatsapp_event(
            session_id=payload.session_id,
            event_type=payload.event_type,
            target=payload.target,
            callback_event_id=payload.callback_event_id,
        )
        return WhatsAppEventResponse(accepted=True, sessionId=payload.session_id)

    return app
