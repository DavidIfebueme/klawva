from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.platform.db.base import Base
from app.platform.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class DropletNode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "droplet_nodes"

    droplet_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    ipv4_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    region: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="booting")
    session_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)


class ProvisioningJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "provisioning_jobs"

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    droplet_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    droplet_node_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("droplet_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    droplet_node: Mapped[DropletNode | None] = relationship(
        "DropletNode", lazy="selectin"
    )
