import asyncio
import json
import unittest.mock

import httpx
import pytest

from app.platform.clients.droplet_agent import DropletAgentClient, DropletAgentClientError


@pytest.fixture
def patched_settings(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "internal_service_token", "test-internal-token")
    return settings


def test_push_session_success(patched_settings):
    captured = {}

    async def run():
        async def mock_post(self, url, **kwargs):
            captured["url"] = url
            captured["json"] = kwargs.get("json")
            captured["headers"] = kwargs.get("headers")
            return httpx.Response(200, json={"ok": True})

        with unittest.mock.patch.object(httpx.AsyncClient, "post", mock_post):
            client = DropletAgentClient()
            await client.push_session(
                droplet_ip="10.0.0.1",
                session_config={"session_id": "abc", "agent_id": "scrapper"},
            )

        assert captured["url"] == "http://10.0.0.1:9090/sessions"
        assert captured["json"]["session_id"] == "abc"
        assert captured["headers"]["x-internal-token"] == "test-internal-token"
        assert captured["headers"]["Content-Type"] == "application/json"

    asyncio.run(run())


def test_push_session_failure(patched_settings):
    async def run():
        async def mock_post(self, url, **kwargs):
            return httpx.Response(500, text="internal error")

        with unittest.mock.patch.object(httpx.AsyncClient, "post", mock_post):
            client = DropletAgentClient()
            with pytest.raises(DropletAgentClientError, match="droplet_push_failed:500"):
                await client.push_session(
                    droplet_ip="10.0.0.1",
                    session_config={"session_id": "abc"},
                )

    asyncio.run(run())


def test_remove_session_success(patched_settings):
    captured = {}

    async def run():
        async def mock_delete(self, url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            return httpx.Response(200, json={"ok": True})

        with unittest.mock.patch.object(httpx.AsyncClient, "delete", mock_delete):
            client = DropletAgentClient()
            await client.remove_session(
                droplet_ip="10.0.0.2",
                session_id="sess-xyz",
            )

        assert captured["url"] == "http://10.0.0.2:9090/sessions/sess-xyz"
        assert captured["headers"]["x-internal-token"] == "test-internal-token"

    asyncio.run(run())


def test_remove_session_failure(patched_settings):
    async def run():
        async def mock_delete(self, url, **kwargs):
            return httpx.Response(404, text="not found")

        with unittest.mock.patch.object(httpx.AsyncClient, "delete", mock_delete):
            client = DropletAgentClient()
            with pytest.raises(DropletAgentClientError, match="droplet_remove_failed:404"):
                await client.remove_session(
                    droplet_ip="10.0.0.2",
                    session_id="sess-xyz",
                )

    asyncio.run(run())


def test_health_check_success(patched_settings):
    async def run():
        async def mock_get(self, url, **kwargs):
            return httpx.Response(200, json={"sessions": 3, "uptime": 3600})

        with unittest.mock.patch.object(httpx.AsyncClient, "get", mock_get):
            client = DropletAgentClient()
            result = await client.health_check(droplet_ip="10.0.0.3")

        assert result["sessions"] == 3
        assert result["uptime"] == 3600

    asyncio.run(run())


def test_health_check_failure(patched_settings):
    async def run():
        async def mock_get(self, url, **kwargs):
            return httpx.Response(503, text="unavailable")

        with unittest.mock.patch.object(httpx.AsyncClient, "get", mock_get):
            client = DropletAgentClient()
            with pytest.raises(DropletAgentClientError, match="droplet_health_failed:503"):
                await client.health_check(droplet_ip="10.0.0.3")

    asyncio.run(run())


def test_no_token_omits_header(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "internal_service_token", None)

    captured = {}

    async def run():
        async def mock_post(self, url, **kwargs):
            captured["headers"] = kwargs.get("headers")
            return httpx.Response(200, json={"ok": True})

        with unittest.mock.patch.object(httpx.AsyncClient, "post", mock_post):
            client = DropletAgentClient()
            await client.push_session(
                droplet_ip="10.0.0.1",
                session_config={"session_id": "abc"},
            )

        assert "x-internal-token" not in captured["headers"]

    asyncio.run(run())
