import asyncio
import json
import subprocess
import uuid
from pathlib import Path

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

    agents_list = list(config.get("agents", {}).get("list", []))
    agents_list.append(fragment)
    config.setdefault("agents", {})["list"] = agents_list

    if channel_type and account_id:
        channel_section = config.setdefault("channels", {}).setdefault(channel_type, {})
        channel_section["enabled"] = True
        accounts = channel_section.setdefault("accounts", {})
        accounts[account_id] = account_config or {"enabled": True}

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
) -> dict:
    agents_list = config.get("agents", {}).get("list", [])
    config.setdefault("agents", {})["list"] = [a for a in agents_list if a.get("id") != agent_id]

    bindings = config.get("bindings", [])
    config["bindings"] = [b for b in bindings if b.get("agentId") != agent_id]

    if channel_type and account_id:
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
            await ws.send(json.dumps(payload))
            raw = await ws.recv()
    except Exception as exc:
        raise OpenClawGatewayError(f"gateway_ws_qr_failed:{exc}") from exc

    try:
        response = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OpenClawGatewayError("gateway_ws_qr_invalid_json") from exc

    if response.get("type") == "err":
        error_msg = response.get("payload", {}).get("message", "unknown")
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
            await ws.send(json.dumps(payload))
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    except Exception as exc:
        raise OpenClawGatewayError(f"gateway_ws_link_wait_failed:{exc}") from exc

    try:
        response = json.loads(raw)
    except json.JSONDecodeError:
        return False

    return bool(response.get("type") != "err")
