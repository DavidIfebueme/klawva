from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.platform.db.base import Base
from app.platform.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class MissionReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "mission_reports"

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    report_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    report_card_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    share_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
