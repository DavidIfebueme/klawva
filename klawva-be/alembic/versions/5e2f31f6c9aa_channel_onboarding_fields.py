"""channel_onboarding_fields

Revision ID: 5e2f31f6c9aa
Revises: c1b4a9d9a3ef
Create Date: 2026-03-02 20:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "5e2f31f6c9aa"
down_revision: str | None = "c1b4a9d9a3ef"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("channel_links", sa.Column("link_target", sa.String(length=255), nullable=True))
    op.add_column("channel_links", sa.Column("intro_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("channel_links", sa.Column("report_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("channel_links", "report_sent_at")
    op.drop_column("channel_links", "intro_sent_at")
    op.drop_column("channel_links", "link_target")
