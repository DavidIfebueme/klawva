"""add_telegram_user_id_to_channel_links

Revision ID: 2c954ccd3ef3
Revises: f1d2a3b4c5d6
Create Date: 2026-07-03 01:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "2c954ccd3ef3"
down_revision: str | None = "f1d2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("channel_links", sa.Column("telegram_user_id", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("channel_links", "telegram_user_id")
