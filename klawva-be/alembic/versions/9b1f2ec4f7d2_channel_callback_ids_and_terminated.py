"""channel_callback_ids_and_terminated

Revision ID: 9b1f2ec4f7d2
Revises: 5e2f31f6c9aa
Create Date: 2026-03-03 09:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9b1f2ec4f7d2"
down_revision: str | None = "5e2f31f6c9aa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("channel_links", sa.Column("terminated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("channel_links", sa.Column("worker_link_callback_id", sa.String(length=120), nullable=True))
    op.add_column("channel_links", sa.Column("worker_intro_callback_id", sa.String(length=120), nullable=True))
    op.add_column("channel_links", sa.Column("worker_report_callback_id", sa.String(length=120), nullable=True))
    op.add_column("channel_links", sa.Column("worker_terminated_callback_id", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("channel_links", "worker_terminated_callback_id")
    op.drop_column("channel_links", "worker_report_callback_id")
    op.drop_column("channel_links", "worker_intro_callback_id")
    op.drop_column("channel_links", "worker_link_callback_id")
    op.drop_column("channel_links", "terminated_at")
