"""add_cron_job_id_to_provisioning_jobs

Revision ID: d4e5f6a7b8c9
Revises: cba62fd2f98b
Create Date: 2026-07-07 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "cba62fd2f98b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "provisioning_jobs",
        sa.Column("cron_job_id", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("provisioning_jobs", "cron_job_id")
