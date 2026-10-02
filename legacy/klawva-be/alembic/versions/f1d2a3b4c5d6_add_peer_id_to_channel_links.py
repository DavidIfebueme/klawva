"""add_peer_id_to_channel_links

Revision ID: f1d2a3b4c5d6
Revises: e6a3d7f1d5b9
Create Date: 2026-07-01 01:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1d2a3b4c5d6"
down_revision: str | None = "e6a3d7f1d5b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("channel_links", sa.Column("peer_id", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("channel_links", "peer_id")
