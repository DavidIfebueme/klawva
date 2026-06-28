"""add_users_and_wallets

Revision ID: e6a3d7f1d5b9
Revises: c2f9a3e1d5b8
Create Date: 2026-06-28 01:25:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6a3d7f1d5b9"
down_revision: str | None = "c2f9a3e1d5b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("sessions", sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("sessions", sa.Column("auto_renew", sa.Boolean(), server_default="false", nullable=False))
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "wallets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("balance_minor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(10), server_default="NGN", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"], unique=True)
    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wallet_id", sa.String(36), sa.ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("balance_after", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"])
    op.create_index("ix_wallet_transactions_reference", "wallet_transactions", ["reference"], unique=True)
    op.create_table(
        "virtual_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nomba_account_ref", sa.String(120), nullable=False),
        sa.Column("bank_account_number", sa.String(30), nullable=False),
        sa.Column("bank_name", sa.String(100), nullable=False),
        sa.Column("bank_account_name", sa.String(150), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_virtual_accounts_user_id", "virtual_accounts", ["user_id"], unique=True)
    op.create_index("ix_virtual_accounts_nomba_account_ref", "virtual_accounts", ["nomba_account_ref"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_virtual_accounts_nomba_account_ref", table_name="virtual_accounts")
    op.drop_index("ix_virtual_accounts_user_id", table_name="virtual_accounts")
    op.drop_table("virtual_accounts")

    op.drop_index("ix_wallet_transactions_reference", table_name="wallet_transactions")
    op.drop_index("ix_wallet_transactions_wallet_id", table_name="wallet_transactions")
    op.drop_table("wallet_transactions")

    op.drop_index("ix_wallets_user_id", table_name="wallets")
    op.drop_table("wallets")

    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_column("sessions", "auto_renew")
    op.drop_column("sessions", "user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")