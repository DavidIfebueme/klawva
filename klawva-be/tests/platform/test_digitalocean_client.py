import json

import httpx
import pytest

from app.platform.clients.digitalocean import DigitalOceanClient, DigitalOceanClientError


class FakeTransport(httpx.AsyncBaseTransport):
    def __init__(self, handler):
        self._handler = handler

    async def handle_async_request(self, request):
        return self._handler(request)


@pytest.fixture
def patched_settings(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "digitalocean_api_token", "test-token")
    monkeypatch.setattr(settings, "digitalocean_api_base_url", "https://api.digitalocean.com")
    monkeypatch.setattr(settings, "digitalocean_region", "nyc1")
    monkeypatch.setattr(settings, "digitalocean_droplet_size", "s-2vcpu-4gb")
    monkeypatch.setattr(settings, "digitalocean_openclaw_image", "openclaw")
    return settings


def test_extract_public_ipv4_found():
    data = {
        "networks": {
            "v4": [
                {"ip_address": "10.132.0.2", "type": "private"},
                {"ip_address": "203.0.113.1", "type": "public"},
            ],
            "v6": [],
        }
    }
    assert DigitalOceanClient.extract_public_ipv4(data) == "203.0.113.1"


def test_extract_public_ipv4_no_public():
    data = {
        "networks": {
            "v4": [
                {"ip_address": "10.132.0.2", "type": "private"},
            ],
        }
    }
    assert DigitalOceanClient.extract_public_ipv4(data) is None


def test_extract_public_ipv4_empty():
    assert DigitalOceanClient.extract_public_ipv4({}) is None
    assert DigitalOceanClient.extract_public_ipv4({"networks": {}}) is None
    assert DigitalOceanClient.extract_public_ipv4({"networks": {"v4": []}}) is None


def test_create_droplet_includes_user_data_and_ssh_keys(patched_settings):
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "droplet": {"id": 12345, "status": "new"},
            },
        )

    import asyncio

    async def run():
        client = DigitalOceanClient()
        client.base_url = "https://api.digitalocean.com"

        original_post = httpx.AsyncClient.post

        async def mock_post(self, url, **kwargs):
            captured["body"] = kwargs.get("json", {})
            return httpx.Response(
                200,
                json={"droplet": {"id": 12345, "status": "new"}},
            )

        import unittest.mock

        with unittest.mock.patch.object(httpx.AsyncClient, "post", mock_post):
            result = await client.create_openclaw_droplet(
                session_id="abcd1234-5678",
                user_data="#!/bin/bash\necho hello",
                ssh_keys=["aa:bb:cc:dd"],
            )

        assert result.droplet_id == "12345"
        assert result.status == "new"
        assert captured["body"]["user_data"] == "#!/bin/bash\necho hello"
        assert captured["body"]["ssh_keys"] == ["aa:bb:cc:dd"]
        assert captured["body"]["tags"] == ["klawva", "klawva-pool"]

    asyncio.run(run())


def test_create_droplet_omits_user_data_when_none(patched_settings):
    captured = {}

    import asyncio

    async def run():
        client = DigitalOceanClient()

        import unittest.mock

        async def mock_post(self, url, **kwargs):
            captured["body"] = kwargs.get("json", {})
            return httpx.Response(
                200,
                json={"droplet": {"id": 99999, "status": "new"}},
            )

        with unittest.mock.patch.object(httpx.AsyncClient, "post", mock_post):
            await client.create_openclaw_droplet(session_id="efgh5678-1234")

        assert "user_data" not in captured["body"]
        assert "ssh_keys" not in captured["body"]

    asyncio.run(run())


def test_get_droplet_success(patched_settings):
    import asyncio

    async def run():
        client = DigitalOceanClient()

        import unittest.mock

        droplet_data = {
            "id": 12345,
            "name": "klawva-abcd1234",
            "status": "active",
            "networks": {
                "v4": [
                    {"ip_address": "10.132.0.2", "type": "private"},
                    {"ip_address": "203.0.113.1", "type": "public"},
                ],
            },
        }

        async def mock_get(self, url, **kwargs):
            return httpx.Response(200, json={"droplet": droplet_data})

        with unittest.mock.patch.object(httpx.AsyncClient, "get", mock_get):
            result = await client.get_droplet(droplet_id="12345")

        assert result["id"] == 12345
        assert result["status"] == "active"
        ip = DigitalOceanClient.extract_public_ipv4(result)
        assert ip == "203.0.113.1"

    asyncio.run(run())


def test_get_droplet_failure(patched_settings):
    import asyncio

    async def run():
        client = DigitalOceanClient()

        import unittest.mock

        async def mock_get(self, url, **kwargs):
            return httpx.Response(404, json={"message": "not_found"})

        with unittest.mock.patch.object(httpx.AsyncClient, "get", mock_get):
            with pytest.raises(DigitalOceanClientError, match="do_get_droplet_failed:404"):
                await client.get_droplet(droplet_id="99999")

    asyncio.run(run())
