from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from runtime_bridge.callbacks import CallbackClient
from runtime_bridge.config import RuntimeBridgeSettings
from runtime_bridge.telegram import TelegramClient


class BridgeRuntime:
    def __init__(
        self,
        *,
        settings: RuntimeBridgeSettings,
        callback_client: CallbackClient | None = None,
        telegram_client: TelegramClient | None = None,
    ) -> None:
        self.settings = settings
        self.callback_client = callback_client or CallbackClient()
        self.telegram_client = telegram_client or TelegramClient()
        self.sessions: dict[str, dict[str, Any]] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.telegram_offsets: dict[str, int] = {}

    @property
    def sessions_dir(self) -> Path:
        return Path(self.settings.bridge_sessions_dir)

    async def startup(self) -> None:
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        for file_path in self.sessions_dir.glob("*.json"):
            data = json.loads(file_path.read_text())
            session_id = str(data.get("session_id", "")).strip()
            if not session_id:
                continue
            self.sessions[session_id] = data
            await self._ensure_worker(session_id=session_id)

    async def shutdown(self) -> None:
        for task in self.tasks.values():
            task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.tasks.clear()

    async def upsert_session(self, *, session_config: dict[str, Any]) -> tuple[str, str]:
        session_id = str(session_config.get("session_id", "")).strip()
        if not session_id:
            raise ValueError("session_id_missing")
        channel = str(session_config.get("channel", {}).get("type", ""))
        if not channel:
            raise ValueError("channel_missing")

        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        file_path = self.sessions_dir / f"{session_id}.json"
        file_path.write_text(json.dumps(session_config, indent=2, default=str))

        self.sessions[session_id] = session_config
        await self._ensure_worker(session_id=session_id)
        return session_id, channel

    async def remove_session(self, *, session_id: str) -> bool:
        existing = self.sessions.pop(session_id, None)
        task = self.tasks.pop(session_id, None)
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

        file_path = self.sessions_dir / f"{session_id}.json"
        file_exists = file_path.exists()
        if file_exists:
            file_path.unlink()

        return existing is not None or file_exists

    async def emit_whatsapp_event(
        self,
        *,
        session_id: str,
        event_type: str,
        target: str | None,
        callback_event_id: str | None,
    ) -> None:
        session_config = self.sessions.get(session_id)
        if session_config is None:
            raise ValueError("session_not_found")
        event_id = callback_event_id or f"wa-{event_type}-{session_id}"
        await self.callback_client.send_onboarding_event(
            session_config=session_config,
            channel="whatsapp",
            event_type=event_type,
            target=target,
            callback_event_id=event_id,
        )

    async def _ensure_worker(self, *, session_id: str) -> None:
        session_config = self.sessions.get(session_id)
        if session_config is None:
            return
        channel = str(session_config.get("channel", {}).get("type", ""))
        if channel != "telegram":
            return
        if session_id in self.tasks and not self.tasks[session_id].done():
            return
        self.tasks[session_id] = asyncio.create_task(self._run_telegram_worker(session_id=session_id))

    async def _run_telegram_worker(self, *, session_id: str) -> None:
        while True:
            session_config = self.sessions.get(session_id)
            if session_config is None:
                return

            bot_token = str(session_config.get("channel", {}).get("bot_token") or "").strip()
            if not bot_token:
                await asyncio.sleep(self.settings.bridge_telegram_poll_pause_seconds)
                continue

            offset = self.telegram_offsets.get(session_id)
            updates = await self.telegram_client.get_updates(
                bot_token=bot_token,
                offset=offset,
                timeout_seconds=self.settings.bridge_telegram_poll_timeout_seconds,
            )

            for update in updates:
                update_id = int(update.get("update_id", 0))
                self.telegram_offsets[session_id] = max(
                    self.telegram_offsets.get(session_id, 0), update_id + 1
                )
                await self._handle_telegram_update(session_id=session_id, update=update)

            await asyncio.sleep(self.settings.bridge_telegram_poll_pause_seconds)

    async def _handle_telegram_update(self, *, session_id: str, update: dict[str, Any]) -> None:
        session_config = self.sessions.get(session_id)
        if session_config is None:
            return

        channel_block = session_config.get("channel", {})
        bot_token = str(channel_block.get("bot_token") or "")
        if not bot_token:
            return

        message = update.get("message") if isinstance(update.get("message"), dict) else None
        if message is None:
            return

        text = str(message.get("text") or "").strip()
        if not text.startswith("/start"):
            return

        start_payload = ""
        pieces = text.split(maxsplit=1)
        if len(pieces) > 1:
            start_payload = pieces[1].strip()
        if start_payload != session_id:
            return

        chat_block = message.get("chat") if isinstance(message.get("chat"), dict) else {}
        from_block = message.get("from") if isinstance(message.get("from"), dict) else {}
        chat_id = chat_block.get("id")
        if not isinstance(chat_id, int):
            return

        username = from_block.get("username") if isinstance(from_block.get("username"), str) else None
        target = f"@{username}" if username else str(chat_id)

        link_event_id = f"tg-linked-{session_id}-{chat_id}"
        await self.callback_client.send_onboarding_event(
            session_config=session_config,
            channel="telegram",
            event_type="linked",
            target=target,
            callback_event_id=link_event_id,
        )

        intro_message = str(
            session_config.get("onboarding", {}).get("intro_message")
            or "Your Klawva session is live."
        )
        sent = await self.telegram_client.send_message(
            bot_token=bot_token,
            chat_id=chat_id,
            text=intro_message,
        )
        if not sent:
            return

        intro_event_id = f"tg-intro-{session_id}-{chat_id}"
        await self.callback_client.send_onboarding_event(
            session_config=session_config,
            channel="telegram",
            event_type="intro_sent",
            target=target,
            callback_event_id=intro_event_id,
        )
        await self.callback_client.ingest_activity(
            session_config=session_config,
            event_type="channel_intro_sent",
            text="Telegram intro delivered",
            payload={"channel": "telegram", "target": target},
        )
