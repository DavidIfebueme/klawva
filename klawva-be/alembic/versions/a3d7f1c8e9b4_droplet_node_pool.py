"""droplet_node_pool

Revision ID: a3d7f1c8e9b4
Revises: 9b1f2ec4f7d2
Create Date: 2026-03-03 16:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3d7f1c8e9b4"
down_revision: str | None = "9b1f2ec4f7d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_constraint(
        "fk_provisioning_jobs_droplet_node_id",
        "provisioning_jobs",
        type_="foreignkey",
    )
    op.drop_index("ix_provisioning_jobs_droplet_node_id", table_name="provisioning_jobs")
    op.drop_column("provisioning_jobs", "droplet_node_id")
    op.drop_table("droplet_nodes")
