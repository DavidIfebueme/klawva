import asyncio

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.provisioning.models import DropletNode, ProvisioningJob
from app.features.provisioning.user_data import build_user_data_script
from app.platform.clients.digitalocean import DigitalOceanClient
from app.platform.clients.droplet_agent import DropletAgentClient
from app.platform.config import settings

_POLL_INTERVAL = 5
_POLL_MAX_ATTEMPTS = 12


async def _wait_for_ip(do_client: DigitalOceanClient, droplet_id: str) -> str:
    for _ in range(_POLL_MAX_ATTEMPTS):
        data = await do_client.get_droplet(droplet_id=droplet_id)
        ip = do_client.extract_public_ipv4(data)
        if ip:
            return ip
        await asyncio.sleep(_POLL_INTERVAL)
    raise HTTPException(status_code=504, detail="droplet_ip_timeout")


async def _create_new_node(
    db: AsyncSession,
    *,
    session_config: dict,
    session_id: str,
) -> tuple[DropletNode, ProvisioningJob]:
    user_data_script = build_user_data_script(
        session_config, gateway_port=settings.droplet_agent_gateway_port
    )

    fingerprints_raw = settings.digitalocean_ssh_key_fingerprints.strip()
    ssh_keys = [f.strip() for f in fingerprints_raw.split(",") if f.strip()] or None

    do_client = DigitalOceanClient()
    created = await do_client.create_openclaw_droplet(
        session_id=session_id,
        user_data=user_data_script,
        ssh_keys=ssh_keys,
    )

    node = DropletNode(
        droplet_id=created.droplet_id,
        region=settings.digitalocean_region,
        status="booting",
        session_count=0,
        max_sessions=settings.droplet_max_sessions,
    )
    db.add(node)
    await db.flush()

    ip = await _wait_for_ip(do_client, created.droplet_id)
    node.ipv4_address = ip
    node.status = "ready"
    node.session_count = 1

    job = ProvisioningJob(
        session_id=session_id,
        status="active",
        attempt_count=1,
        droplet_id=created.droplet_id,
        droplet_node_id=node.id,
    )
    db.add(job)

    if node.session_count >= node.max_sessions:
        node.status = "full"

    await db.flush()
    return node, job


async def _assign_to_existing_node(
    db: AsyncSession,
    *,
    node: DropletNode,
    session_config: dict,
    session_id: str,
) -> ProvisioningJob:
    agent_client = DropletAgentClient()
    await agent_client.push_session(
        droplet_ip=node.ipv4_address,
        session_config=session_config,
    )

    node.session_count += 1
    if node.session_count >= node.max_sessions:
        node.status = "full"

    job = ProvisioningJob(
        session_id=session_id,
        status="active",
        attempt_count=1,
        droplet_id=node.droplet_id,
        droplet_node_id=node.id,
    )
    db.add(job)
    await db.flush()
    return job


async def assign_droplet_from_pool(
    db: AsyncSession,
    *,
    session_config: dict,
    session_id: str,
) -> ProvisioningJob:
    stmt = (
        select(DropletNode)
        .where(DropletNode.status == "ready")
        .where(DropletNode.session_count < DropletNode.max_sessions)
        .order_by(DropletNode.session_count.desc())
        .limit(1)
        .with_for_update()
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()

    if node is not None:
        job = await _assign_to_existing_node(
            db,
            node=node,
            session_config=session_config,
            session_id=session_id,
        )
    else:
        node, job = await _create_new_node(
            db,
            session_config=session_config,
            session_id=session_id,
        )

    return job


async def release_session_from_pool(
    db: AsyncSession,
    *,
    session_id: str,
) -> bool:
    stmt = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if job is None or not job.droplet_node_id:
        return False

    node = await db.get(DropletNode, job.droplet_node_id)
    if node is None:
        return False

    agent_client = DropletAgentClient()
    try:
        await agent_client.remove_session(
            droplet_ip=node.ipv4_address,
            session_id=session_id,
        )
    except Exception:
        pass

    node.session_count = max(0, node.session_count - 1)

    if node.session_count == 0:
        do_client = DigitalOceanClient()
        try:
            await do_client.destroy_droplet(droplet_id=node.droplet_id)
        except Exception:
            node.status = "destroy_failed"
            job.status = "destroy_failed"
            await db.flush()
            return False
        node.status = "destroyed"
        job.status = "destroyed"
    else:
        if node.status == "full":
            node.status = "ready"
        job.status = "released"

    await db.flush()
    return True
