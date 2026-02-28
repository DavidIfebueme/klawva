"""session_identity_fields

Revision ID: c1b4a9d9a3ef
Revises: 06a82d92d34d
Create Date: 2026-02-28 09:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c1b4a9d9a3ef'
down_revision: str | None = '06a82d92d34d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('customer_email', sa.String(length=255), nullable=True))
    op.add_column('sessions', sa.Column('session_token_hash', sa.String(length=128), nullable=True))
    op.create_index(
        op.f('ix_sessions_customer_email'),
        'sessions',
        ['customer_email'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_sessions_customer_email'), table_name='sessions')
    op.drop_column('sessions', 'session_token_hash')
    op.drop_column('sessions', 'customer_email')
