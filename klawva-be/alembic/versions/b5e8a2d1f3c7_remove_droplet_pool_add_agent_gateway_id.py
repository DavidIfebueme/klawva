"""remove_droplet_pool_add_agent_gateway_id

Revision ID: b5e8a2d1f3c7
Revises: a3d7f1c8e9b4
Create Date: 2026-05-20 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b5e8a2d1f3c7"
down_revision: str | None = "a3d7f1c8e9b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_provisioning_jobs_droplet_node_id",
        "provisioning_jobs",
        type_="foreignkey",
    )
    op.drop_index("ix_provisioning_jobs_droplet_node_id", table_name="provisioning_jobs")
    op.drop_column("provisioning_jobs", "droplet_node_id")
    op.drop_column("provisioning_jobs", "droplet_id")
    op.drop_table("droplet_nodes")
    op.add_column(
        "provisioning_jobs",
        sa.Column("agent_id_in_gateway", sa.String(length=60), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("provisioning_jobs", "agent_id_in_gateway")
    op.create_table(
        "droplet_nodes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("droplet_id", sa.String(length=120), nullable=False),
        sa.Column("ipv4_address", sa.String(length=45), nullable=True),
        sa.Column("region", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("session_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_sessions", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("droplet_id"),
    )
    op.add_column(
        "provisioning_jobs",
        sa.Column("droplet_id", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "provisioning_jobs",
        sa.Column("droplet_node_id", sa.String(length=36), nullable=True),
    )
    op.create_index(
        "ix_provisioning_jobs_droplet_node_id",
        "provisioning_jobs",
        ["droplet_node_id"],
    )
    op.create_foreign_key(
        "fk_provisioning_jobs_droplet_node_id",
        "provisioning_jobs",
        "droplet_nodes",
        ["droplet_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
