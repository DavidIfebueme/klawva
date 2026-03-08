from __future__ import annotations

from typing import Any

import httpx


class CallbackClient:
    def __init__(self, *, timeout_seconds: float = 15.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def _post(
        self,
        *,
        base_url: str,
        endpoint: str,
        internal_token: str,
        payload: dict[str, Any],
    ) -> None:
        url = f"{base_url.rstrip('/')}{endpoint}"
        headers = {
            "content-type": "application/json",
            "x-internal-token": internal_token,
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
        if response.status_code >= 400:
            text = response.text.strip()
            detail = text[:240] if text else "callback_failed"
            raise RuntimeError(f"callback_failed:{response.status_code}:{detail}")

    async def send_onboarding_event(
        self,
        *,
        session_config: dict[str, Any],
        channel: str,
        event_type: str,
        target: str | None,
        callback_event_id: str,
    ) -> None:
        callbacks = session_config.get("callbacks", {})
        endpoints = callbacks.get("endpoints", {})
        endpoint = endpoints.get("onboarding_event") or "/api/channels/onboarding/event"
        payload = {
            "sessionId": session_config["session_id"],
            "channel": channel,
            "eventType": event_type,
            "target": target,
            "callbackEventId": callback_event_id,
        }
        await self._post(
            base_url=str(callbacks.get("base_url", "")),
            endpoint=str(endpoint),
            internal_token=str(callbacks.get("internal_token", "")),
            payload=payload,
        )

    async def ingest_activity(
        self,
        *,
        session_config: dict[str, Any],
        event_type: str,
        text: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        callbacks = session_config.get("callbacks", {})
        endpoints = callbacks.get("endpoints", {})
        endpoint = endpoints.get("activity_ingest") or "/api/activity/ingest"
        request_payload = {
            "sessionId": session_config["session_id"],
            "eventType": event_type,
            "text": text,
            "payload": payload or {},
        }
        await self._post(
            base_url=str(callbacks.get("base_url", "")),
            endpoint=str(endpoint),
            internal_token=str(callbacks.get("internal_token", "")),
            payload=request_payload,
        )

    async def upsert_report(
        self,
        *,
        session_config: dict[str, Any],
        summary: str,
        report_data: dict[str, Any],
        report_card_url: str | None = None,
    ) -> None:
        callbacks = session_config.get("callbacks", {})
        endpoints = callbacks.get("endpoints", {})
        endpoint = endpoints.get("report_upsert") or "/api/reports/upsert"
        request_payload = {
            "sessionId": session_config["session_id"],
            "summary": summary,
            "reportData": report_data,
            "reportCardUrl": report_card_url,
        }
        await self._post(
            base_url=str(callbacks.get("base_url", "")),
            endpoint=str(endpoint),
            internal_token=str(callbacks.get("internal_token", "")),
            payload=request_payload,
        )
