import asyncio
import unittest.mock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.provisioning.models import DropletNode, ProvisioningJob
from app.features.provisioning.pool import (
    assign_droplet_from_pool,
    release_session_from_pool,
)
from app.features.sessions.models import Session
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry


@pytest.fixture
def db_session():
    load_model_registry()
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def teardown():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    asyncio.run(init())
    yield factory
    asyncio.run(teardown())


@pytest.fixture
def patch_settings(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "droplet_max_sessions", 5)
    monkeypatch.setattr(settings, "digitalocean_region", "nyc1")
    monkeypatch.setattr(settings, "digitalocean_ssh_key_fingerprints", "")
    monkeypatch.setattr(settings, "internal_service_token", "test-token")


def _make_session(db, suffix="1"):
    s = Session(
        agent_id="scrapper",
        channel="whatsapp",
        brief={"task": "test"},
        payment_ref=f"ref_{suffix}",
        session_token_hash=f"hash_{suffix}",
        status="provisioning",
    )
    db.add(s)
    return s


def _sample_config(session_id="sid-1"):
    return {
        "session_id": session_id,
        "agent_id": "scrapper",
        "channel": {"type": "whatsapp"},
    }


class FakeDOClient:
    def __init__(self):
        self.created = []
        self.destroyed = []

    async def create_openclaw_droplet(self, *, session_id, user_data=None, ssh_keys=None):
        self.created.append(session_id)

        class Result:
            droplet_id = "drop-new-1"
            status = "new"

        return Result()

    async def get_droplet(self, *, droplet_id):
        return {
            "id": droplet_id,
            "networks": {
                "v4": [{"ip_address": "192.168.1.100", "type": "public"}]
            },
        }

    async def destroy_droplet(self, *, droplet_id):
        self.destroyed.append(droplet_id)

    @staticmethod
    def extract_public_ipv4(droplet_data):
        for net in droplet_data.get("networks", {}).get("v4", []):
            if net.get("type") == "public":
                return net["ip_address"]
        return None


class FakeAgentClient:
    def __init__(self):
        self.pushed = []
        self.removed = []

    async def push_session(self, *, droplet_ip, session_config):
        self.pushed.append((droplet_ip, session_config))

    async def remove_session(self, *, droplet_ip, session_id):
        self.removed.append((droplet_ip, session_id))


def test_assign_creates_new_node_when_pool_empty(db_session, patch_settings, monkeypatch):
    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            session = _make_session(db, "new1")
            await db.commit()
            await db.refresh(session)

            job = await assign_droplet_from_pool(
                db,
                session_config=_sample_config(session.id),
                session_id=session.id,
            )
            await db.commit()

            assert job.status == "active"
            assert job.droplet_id == "drop-new-1"
            assert job.droplet_node_id is not None

            node = await db.get(DropletNode, job.droplet_node_id)
            assert node.droplet_id == "drop-new-1"
            assert node.ipv4_address == "192.168.1.100"
            assert node.session_count == 1
            assert node.status == "ready"
            assert len(fake_do.created) == 1

    asyncio.run(run())


def test_assign_reuses_existing_node(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )

    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="existing-1",
                ipv4_address="10.0.0.50",
                region="nyc1",
                status="ready",
                session_count=2,
                max_sessions=5,
            )
            db.add(node)
            session = _make_session(db, "reuse1")
            await db.commit()
            await db.refresh(node)
            await db.refresh(session)

            config = _sample_config(session.id)
            job = await assign_droplet_from_pool(
                db,
                session_config=config,
                session_id=session.id,
            )
            await db.commit()
            await db.refresh(node)

            assert job.status == "active"
            assert job.droplet_id == "existing-1"
            assert job.droplet_node_id == node.id
            assert node.session_count == 3
            assert node.status == "ready"
            assert len(fake_agent.pushed) == 1
            assert fake_agent.pushed[0] == ("10.0.0.50", config)

    asyncio.run(run())


def test_assign_picks_densest_node(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )

    async def run():
        async with db_session() as db:
            light = DropletNode(
                droplet_id="light-1",
                ipv4_address="10.0.0.1",
                region="nyc1",
                status="ready",
                session_count=1,
                max_sessions=5,
            )
            heavy = DropletNode(
                droplet_id="heavy-1",
                ipv4_address="10.0.0.2",
                region="nyc1",
                status="ready",
                session_count=4,
                max_sessions=5,
            )
            db.add_all([light, heavy])
            session = _make_session(db, "dense1")
            await db.commit()
            await db.refresh(heavy)
            await db.refresh(session)

            job = await assign_droplet_from_pool(
                db,
                session_config=_sample_config(session.id),
                session_id=session.id,
            )
            await db.commit()

            assert job.droplet_id == "heavy-1"
            assert job.droplet_node_id == heavy.id

    asyncio.run(run())


def test_assign_marks_full_when_at_capacity(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )

    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="almost-full",
                ipv4_address="10.0.0.99",
                region="nyc1",
                status="ready",
                session_count=4,
                max_sessions=5,
            )
            db.add(node)
            session = _make_session(db, "full1")
            await db.commit()
            await db.refresh(node)
            await db.refresh(session)

            await assign_droplet_from_pool(
                db,
                session_config=_sample_config(session.id),
                session_id=session.id,
            )
            await db.commit()
            await db.refresh(node)

            assert node.session_count == 5
            assert node.status == "full"

    asyncio.run(run())


def test_assign_skips_full_and_destroyed_nodes(db_session, patch_settings, monkeypatch):
    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            full = DropletNode(
                droplet_id="full-1",
                ipv4_address="10.0.0.20",
                region="nyc1",
                status="full",
                session_count=5,
                max_sessions=5,
            )
            destroyed = DropletNode(
                droplet_id="dead-1",
                ipv4_address="10.0.0.21",
                region="nyc1",
                status="destroyed",
                session_count=0,
                max_sessions=5,
            )
            db.add_all([full, destroyed])
            session = _make_session(db, "skip1")
            await db.commit()
            await db.refresh(session)

            job = await assign_droplet_from_pool(
                db,
                session_config=_sample_config(session.id),
                session_id=session.id,
            )
            await db.commit()

            assert job.droplet_id == "drop-new-1"
            assert len(fake_do.created) == 1

    asyncio.run(run())


def test_release_decrements_count_and_keeps_node(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="release-1",
                ipv4_address="10.0.0.30",
                region="nyc1",
                status="ready",
                session_count=3,
                max_sessions=5,
            )
            db.add(node)
            session = _make_session(db, "rel1")
            await db.commit()
            await db.refresh(node)
            await db.refresh(session)

            job = ProvisioningJob(
                session_id=session.id,
                status="active",
                attempt_count=1,
                droplet_id="release-1",
                droplet_node_id=node.id,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)

            result = await release_session_from_pool(db, session_id=session.id)
            await db.commit()
            await db.refresh(node)
            await db.refresh(job)

            assert result is True
            assert node.session_count == 2
            assert node.status == "ready"
            assert job.status == "released"
            assert len(fake_do.destroyed) == 0

    asyncio.run(run())


def test_release_destroys_node_when_last_session(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="last-1",
                ipv4_address="10.0.0.40",
                region="nyc1",
                status="ready",
                session_count=1,
                max_sessions=5,
            )
            db.add(node)
            session = _make_session(db, "last1")
            await db.commit()
            await db.refresh(node)
            await db.refresh(session)

            job = ProvisioningJob(
                session_id=session.id,
                status="active",
                attempt_count=1,
                droplet_id="last-1",
                droplet_node_id=node.id,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)

            result = await release_session_from_pool(db, session_id=session.id)
            await db.commit()
            await db.refresh(node)
            await db.refresh(job)

            assert result is True
            assert node.session_count == 0
            assert node.status == "destroyed"
            assert job.status == "destroyed"
            assert fake_do.destroyed == ["last-1"]

    asyncio.run(run())


def test_release_reopens_full_node(db_session, patch_settings, monkeypatch):
    fake_agent = FakeAgentClient()
    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient", lambda: fake_agent
    )
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="full-reopen",
                ipv4_address="10.0.0.50",
                region="nyc1",
                status="full",
                session_count=5,
                max_sessions=5,
            )
            db.add(node)
            session = _make_session(db, "reopen1")
            await db.commit()
            await db.refresh(node)
            await db.refresh(session)

            job = ProvisioningJob(
                session_id=session.id,
                status="active",
                attempt_count=1,
                droplet_id="full-reopen",
                droplet_node_id=node.id,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)

            result = await release_session_from_pool(db, session_id=session.id)
            await db.commit()
            await db.refresh(node)

            assert result is True
            assert node.session_count == 4
            assert node.status == "ready"

    asyncio.run(run())


def test_release_returns_false_for_missing_job(db_session, patch_settings):
    async def run():
        async with db_session() as db:
            result = await release_session_from_pool(
                db, session_id="nonexistent-session"
            )
            assert result is False

    asyncio.run(run())


def test_new_node_marks_full_if_max_is_one(db_session, patch_settings, monkeypatch):
    monkeypatch.setattr(
        "app.platform.config.settings.droplet_max_sessions", 1
    )
    from app.platform.config import settings
    monkeypatch.setattr(settings, "droplet_max_sessions", 1)

    fake_do = FakeDOClient()
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient", lambda: fake_do
    )

    async def run():
        async with db_session() as db:
            session = _make_session(db, "one1")
            await db.commit()
            await db.refresh(session)

            job = await assign_droplet_from_pool(
                db,
                session_config=_sample_config(session.id),
                session_id=session.id,
            )
            await db.commit()

            node = await db.get(DropletNode, job.droplet_node_id)
            assert node.session_count == 1
            assert node.status == "full"

    asyncio.run(run())
