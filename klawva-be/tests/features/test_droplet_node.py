import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.features.provisioning.models import DropletNode, ProvisioningJob


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


def test_create_droplet_node(db_session):
    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="99999",
                ipv4_address="10.0.0.1",
                region="nyc1",
                status="ready",
                session_count=0,
                max_sessions=5,
            )
            db.add(node)
            await db.commit()
            await db.refresh(node)

            assert node.id is not None
            assert node.droplet_id == "99999"
            assert node.ipv4_address == "10.0.0.1"
            assert node.region == "nyc1"
            assert node.status == "ready"
            assert node.session_count == 0
            assert node.max_sessions == 5
            assert node.error_message is None
            assert node.created_at is not None
            assert node.updated_at is not None

    asyncio.run(run())


def test_droplet_node_defaults(db_session):
    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="88888",
                region="sfo1",
            )
            db.add(node)
            await db.commit()
            await db.refresh(node)

            assert node.status == "booting"
            assert node.session_count == 0
            assert node.max_sessions == 5
            assert node.ipv4_address is None

    asyncio.run(run())


def test_droplet_node_unique_droplet_id(db_session):
    async def run():
        async with db_session() as db:
            db.add(DropletNode(droplet_id="77777", region="nyc1"))
            await db.commit()

        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            async with db_session() as db:
                db.add(DropletNode(droplet_id="77777", region="sfo1"))
                await db.commit()

    asyncio.run(run())


def test_provisioning_job_droplet_node_relationship(db_session):
    async def run():
        async with db_session() as db:
            from app.features.sessions.models import Session

            session = Session(
                agent_id="scrapper",
                channel="whatsapp",
                brief={"task": "test"},
                payment_ref="ref_1",
                session_token_hash="hash_1",
                status="provisioning",
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)

            node = DropletNode(
                droplet_id="66666",
                ipv4_address="10.0.0.2",
                region="nyc1",
                status="ready",
                session_count=1,
                max_sessions=5,
            )
            db.add(node)
            await db.commit()
            await db.refresh(node)

            job = ProvisioningJob(
                session_id=session.id,
                status="active",
                attempt_count=1,
                droplet_id="66666",
                droplet_node_id=node.id,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)

            assert job.droplet_node_id == node.id
            assert job.droplet_node is not None
            assert job.droplet_node.droplet_id == "66666"
            assert job.droplet_node.ipv4_address == "10.0.0.2"

    asyncio.run(run())


def test_provisioning_job_without_droplet_node(db_session):
    async def run():
        async with db_session() as db:
            from app.features.sessions.models import Session

            session = Session(
                agent_id="scrapper",
                channel="whatsapp",
                brief={"task": "test"},
                payment_ref="ref_2",
                session_token_hash="hash_2",
                status="provisioning",
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)

            job = ProvisioningJob(
                session_id=session.id,
                status="provisioning",
                attempt_count=0,
                droplet_id=None,
                droplet_node_id=None,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)

            assert job.droplet_node_id is None
            assert job.droplet_node is None

    asyncio.run(run())


def test_droplet_node_session_count_update(db_session):
    async def run():
        async with db_session() as db:
            node = DropletNode(
                droplet_id="55555",
                ipv4_address="10.0.0.3",
                region="nyc1",
                status="ready",
                session_count=0,
                max_sessions=5,
            )
            db.add(node)
            await db.commit()

            node.session_count = 3
            node.status = "ready"
            await db.commit()
            await db.refresh(node)
            assert node.session_count == 3

            node.session_count = 5
            node.status = "full"
            await db.commit()
            await db.refresh(node)
            assert node.session_count == 5
            assert node.status == "full"

    asyncio.run(run())


def test_query_droplet_nodes_with_capacity(db_session):
    async def run():
        async with db_session() as db:
            full_node = DropletNode(
                droplet_id="10001",
                ipv4_address="10.0.0.10",
                region="nyc1",
                status="full",
                session_count=5,
                max_sessions=5,
            )
            ready_node = DropletNode(
                droplet_id="10002",
                ipv4_address="10.0.0.11",
                region="nyc1",
                status="ready",
                session_count=3,
                max_sessions=5,
            )
            destroyed_node = DropletNode(
                droplet_id="10003",
                ipv4_address="10.0.0.12",
                region="nyc1",
                status="destroyed",
                session_count=0,
                max_sessions=5,
            )
            db.add_all([full_node, ready_node, destroyed_node])
            await db.commit()

            stmt = (
                select(DropletNode)
                .where(DropletNode.status == "ready")
                .where(DropletNode.session_count < DropletNode.max_sessions)
                .order_by(DropletNode.session_count.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            candidate = result.scalar_one_or_none()

            assert candidate is not None
            assert candidate.droplet_id == "10002"
            assert candidate.session_count == 3

    asyncio.run(run())
