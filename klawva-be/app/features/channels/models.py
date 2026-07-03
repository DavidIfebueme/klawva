from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.platform.db.base import Base
from app.platform.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChannelLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "channel_links"

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    link_target: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qr_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    intro_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    peer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    telegram_user_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    worker_link_callback_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    worker_intro_callback_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    worker_report_callback_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    worker_terminated_callback_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
