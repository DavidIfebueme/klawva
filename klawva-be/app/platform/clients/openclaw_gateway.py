import asyncio
import json
import subprocess
import uuid
from pathlib import Path
from typing import Any

import httpx
import websockets

from app.platform.config import settings


class OpenClawGatewayError(RuntimeError):
    pass


def _gateway_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.openclaw_gateway_token:
        headers["x-gateway-token"] = settings.openclaw_gateway_token
    return headers


async def health() -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{settings.openclaw_gateway_url}/health",
            headers=_gateway_headers(),
        )
    if response.status_code >= 400:
        raise OpenClawGatewayError(f"gateway_health_failed:{response.status_code}")
    return dict(response.json())


async def read_config() -> dict:
    config_path = Path(settings.openclaw_config_path)
    if config_path.exists():
        return dict(json.loads(config_path.read_text(encoding="utf-8")))
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{settings.openclaw_gateway_url}/rpc/config.get",
            headers=_gateway_headers(),
        )
    if response.status_code >= 400:
        raise OpenClawGatewayError(f"gateway_config_read_failed:{response.status_code}")
    return dict(response.json().get("result", response.json()))


def write_config(config: dict) -> None:
    config_path = Path(settings.openclaw_config_path)
    lock_path = config_path.with_suffix(".lock")
    lock_path.write_text(str(uuid.uuid4()), encoding="utf-8")
    try:
        tmp_path = config_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(config_path)
    finally:
        try:
            lock_path.unlink()
        except OSError:
            pass


def add_agent_to_config(
    config: dict,
    agent_fragment: dict,
    channel_type: str | None = None,
    account_id: str | None = None,
    account_config: dict | None = None,
) -> dict:
    agent_id = agent_fragment["id"]
    fragment = {
        "id": agent_fragment["id"],
        "name": agent_fragment.get("name", agent_id),
        "workspace": agent_fragment["workspace"],
        "agentDir": agent_fragment["agentDir"],
        "model": agent_fragment["model"],
    }
    if agent_fragment.get("tools"):
        fragment["tools"] = agent_fragment["tools"]

    agents_list = list(config.get("agents", {}).get("list", []))
    agents_list.append(fragment)
    config.setdefault("agents", {})["list"] = agents_list

    if channel_type and account_id:
        channel_section = config.setdefault("channels", {}).setdefault(channel_type, {})
        channel_section["enabled"] = True

        if account_config is not None:
            accounts = channel_section.setdefault("accounts", {})
            accounts[account_id] = account_config

        binding = {
            "type": "route",
            "agentId": agent_id,
            "match": {
                "channel": channel_type,
                "accountId": account_id,
            },
        }
        bindings = list(config.get("bindings", []))
        bindings.append(binding)
        config["bindings"] = bindings

    return config


def remove_agent_from_config(
    config: dict,
    agent_id: str,
    channel_type: str | None = None,
    account_id: str | None = None,
    remove_account: bool = False,
) -> dict:
    agents_list = config.get("agents", {}).get("list", [])
    config.setdefault("agents", {})["list"] = [a for a in agents_list if a.get("id") != agent_id]

    bindings = config.get("bindings", [])
    config["bindings"] = [b for b in bindings if b.get("agentId") != agent_id]

    if remove_account and channel_type and account_id:
        channel_section = config.get("channels", {}).get(channel_type, {})
        accounts = channel_section.get("accounts", {})
        accounts.pop(account_id, None)
        if not accounts:
            channel_section.pop("accounts", None)
        if not channel_section:
            config.get("channels", {}).pop(channel_type, None)

    return config


def restart_gateway() -> None:
    cmd = settings.openclaw_restart_command
    if not cmd:
        return
    subprocess.run(cmd, shell=True, check=True, timeout=30)


def read_telegram_peer_id(agent_id: str) -> str | None:
    sessions_path = Path(settings.openclaw_agents_dir) / agent_id / "sessions" / "sessions.json"
    if not sessions_path.exists():
        return None
    try:
        data = json.loads(sessions_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict):
        return None
    for _key, value in data.items():
        if not isinstance(value, dict):
            continue
        origin = value.get("origin", {})
        if origin.get("provider") == "telegram" and origin.get("chatType") == "direct":
            from_id = str(origin.get("from", ""))
            if from_id.startswith("telegram:"):
                return from_id.split(":", 1)[1]
    return None


def _read_first_user_message(session_file_path: Path) -> str | None:
    if not session_file_path.exists():
        return None
    try:
        with open(session_file_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except (json.JSONDecodeError, OSError):
                    continue
                if entry.get("type") != "prompt.submitted":
                    continue
                data = entry.get("data", {})
                messages = data.get("messages", [])
                for msg in messages:
                    if msg.get("role") != "user":
                        continue
                    content = msg.get("content", "")
                    if isinstance(content, str) and content.strip():
                        return content.strip()
                    if isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                text = str(part.get("text", "")).strip()
                                if text:
                                    return text
                return None
    except OSError:
        return None
    return None


def _validate_start_command(message: str, expected_session_id: str) -> bool:
    if not message.startswith("/start"):
        return False
    payload = message[len("/start"):].strip()
    return payload == expected_session_id


def check_agent_sessions(agent_id: str, expected_session_id: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "has_sessions": False,
        "channel_connected": False,
        "intro_sent": False,
        "peer_id": None,
        "provider": None,
    }
    sessions_path = Path(settings.openclaw_agents_dir) / agent_id / "sessions" / "sessions.json"
    if not sessions_path.exists():
        return result
    try:
        data = json.loads(sessions_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return result
    if not isinstance(data, dict) or not data:
        return result
    result["has_sessions"] = True
    for _key, value in data.items():
        if not isinstance(value, dict):
            continue
        origin = value.get("origin", {})
        provider = origin.get("provider", "")
        chat_type = origin.get("chatType", "")
        if chat_type == "direct":
            result["channel_connected"] = True
            result["provider"] = provider
            from_id = str(origin.get("from", ""))
            if provider == "telegram" and from_id.startswith("telegram:"):
                result["peer_id"] = from_id.split(":", 1)[1]
            elif provider == "whatsapp" and from_id.startswith("whatsapp:"):
                raw = from_id.split(":", 1)[1]
                phone = raw.split("@")[0]
                if phone and not phone.startswith("+"):
                    phone = "+" + phone
                result["peer_id"] = phone
            if value.get("systemSent"):
                result["intro_sent"] = True
            break
    return result


def read_whatsapp_peer_id(agent_id: str) -> str | None:
    sessions_path = Path(settings.openclaw_agents_dir) / agent_id / "sessions" / "sessions.json"
    if not sessions_path.exists():
        return None
    try:
        data = json.loads(sessions_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict):
        return None
    for _key, value in data.items():
        if not isinstance(value, dict):
            continue
        origin = value.get("origin", {})
        if origin.get("provider") == "whatsapp" and origin.get("chatType") == "direct":
            from_id = str(origin.get("from", ""))
            if from_id.startswith("whatsapp:"):
                raw = from_id.split(":", 1)[1]
                phone = raw.split("@")[0]
                if phone and not phone.startswith("+"):
                    phone = "+" + phone
                return phone
    return None


def lock_whatsapp_account(config: dict, account_id: str, phone_number: str) -> dict:
    wa = config.setdefault("channels", {}).setdefault("whatsapp", {})
    account = wa.get("accounts", {}).get(account_id, {})
    account["dmPolicy"] = "allowlist"
    account["allowFrom"] = [phone_number]
    account["groupPolicy"] = "disabled"
    account["sendReadReceipts"] = False
    wa.setdefault("accounts", {})[account_id] = account
    return config


def reset_whatsapp_account_access(config: dict, account_id: str) -> dict:
    wa = config.get("channels", {}).get("whatsapp", {})
    account = wa.get("accounts", {}).get(account_id, {})
    account["dmPolicy"] = "open"
    account["allowFrom"] = ["*"]
    wa.setdefault("accounts", {})[account_id] = account
    return config


def lock_telegram_account(config: dict, account_id: str, telegram_user_id: str) -> dict:
    tg = config.setdefault("channels", {}).setdefault("telegram", {})
    account = tg.get("accounts", {}).get(account_id, {})
    account["dmPolicy"] = "allowlist"
    account["allowFrom"] = [telegram_user_id]
    tg.setdefault("accounts", {})[account_id] = account
    return config


def reset_telegram_account_access(config: dict, account_id: str) -> dict:
    tg = config.get("channels", {}).get("telegram", {})
    account = tg.get("accounts", {}).get(account_id, {})
    account["enabled"] = False
    account["dmPolicy"] = "allowlist"
    account["allowFrom"] = []
    tg.setdefault("accounts", {})[account_id] = account
    return config


async def send_telegram_message(bot_token: str, chat_id: str, text: str) -> bool:
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
        return resp.status_code == 200
    except Exception:
        return False


async def _ws_connect_v3(ws: Any) -> None:
    raw = await asyncio.wait_for(ws.recv(), timeout=10)
    challenge = json.loads(raw)
    if challenge.get("event") != "connect.challenge":
        raise OpenClawGatewayError(f"unexpected_ws_event:{challenge.get('event')}")

    connect_id = str(uuid.uuid4())
    connect_payload = {
        "type": "req",
        "id": connect_id,
        "method": "connect",
        "params": {
            "minProtocol": 3,
            "maxProtocol": 3,
            "client": {
                "id": "gateway-client",
                "platform": "linux",
                "mode": "backend",
                "version": "2026.4.21",
            },
            "role": "operator",
            "scopes": [
                "operator.admin",
                "operator.read",
                "operator.write",
                "operator.approvals",
                "operator.pairing",
            ],
            "auth": {
                "token": settings.openclaw_gateway_token or "",
            },
        },
    }
    await ws.send(json.dumps(connect_payload))
    raw = await asyncio.wait_for(ws.recv(), timeout=10)
    connect_resp = json.loads(raw)
    if not connect_resp.get("ok"):
        err = connect_resp.get("error", {}).get("message", "unknown")
        raise OpenClawGatewayError(f"ws_connect_failed:{err}")


async def get_whatsapp_qr(account_id: str = "default") -> tuple[str, int]:
    request_id = str(uuid.uuid4())
    payload = {
        "type": "req",
        "id": request_id,
        "method": "web.login.start",
        "params": {
            "channel": "whatsapp",
            "account": account_id,
        },
    }

    try:
        async with websockets.connect(
            settings.openclaw_gateway_ws_url,
            additional_headers=_gateway_headers(),
            open_timeout=10,
        ) as ws:
            await _ws_connect_v3(ws)
            await ws.send(json.dumps(payload))
            raw = await asyncio.wait_for(ws.recv(), timeout=15)
    except OpenClawGatewayError:
        raise
    except Exception as exc:
        raise OpenClawGatewayError(f"gateway_ws_qr_failed:{exc}") from exc

    try:
        response = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OpenClawGatewayError("gateway_ws_qr_invalid_json") from exc

    if not response.get("ok"):
        error_msg = response.get("error", {}).get("message", "unknown")
        raise OpenClawGatewayError(f"gateway_ws_qr_error:{error_msg}")

    result = response.get("payload", response.get("result", {}))
    qr_data = result.get("qr", result.get("qrCode", ""))
    expires_ms = result.get("expiresMs", 60000)
    expires_s = max(expires_ms // 1000, 10)

    if not qr_data:
        raise OpenClawGatewayError("gateway_ws_qr_empty")

    return qr_data, expires_s


async def wait_for_whatsapp_link(account_id: str = "default", timeout: float = 120.0) -> bool:
    request_id = str(uuid.uuid4())
    payload = {
        "type": "req",
        "id": request_id,
        "method": "web.login.wait",
        "params": {
            "channel": "whatsapp",
            "account": account_id,
        },
    }

    try:
        async with websockets.connect(
            settings.openclaw_gateway_ws_url,
            additional_headers=_gateway_headers(),
            open_timeout=10,
        ) as ws:
            await _ws_connect_v3(ws)
            await ws.send(json.dumps(payload))
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    except OpenClawGatewayError:
        raise
    except Exception as exc:
        raise OpenClawGatewayError(f"gateway_ws_link_wait_failed:{exc}") from exc

    try:
        response = json.loads(raw)
    except json.JSONDecodeError:
        return False

    return bool(response.get("ok"))
