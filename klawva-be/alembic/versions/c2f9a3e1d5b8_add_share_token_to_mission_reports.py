"""add_share_token_to_mission_reports

Revision ID: c2f9a3e1d5b8
Revises: b5e8a2d1f3c7
Create Date: 2026-05-25 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c2f9a3e1d5b8"
down_revision: str | None = "b5e8a2d1f3c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mission_reports", sa.Column("share_token", sa.String(64), nullable=True))
    op.create_index("ix_mission_reports_share_token", "mission_reports", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_mission_reports_share_token", table_name="mission_reports")
    op.drop_column("mission_reports", "share_token")
