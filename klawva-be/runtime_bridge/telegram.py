from __future__ import annotations

from typing import Any

import httpx


class TelegramClient:
    def __init__(self, *, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def get_updates(
        self,
        *,
        bot_token: str,
        offset: int | None,
        timeout_seconds: int,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"timeout": timeout_seconds, "allowed_updates": ["message"]}
        if offset is not None:
            params["offset"] = offset
        async with httpx.AsyncClient(timeout=self.timeout_seconds + timeout_seconds) as client:
            response = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getUpdates",
                params=params,
            )
        if response.status_code >= 400:
            return []
        payload = response.json()
        result = payload.get("result", [])
        if isinstance(result, list):
            return [item for item in result if isinstance(item, dict)]
        return []

    async def send_message(self, *, bot_token: str, chat_id: int, text: str) -> bool:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
        return response.status_code < 400
