from sqlalchemy import Boolean, Column, String
from sqlalchemy.orm import Mapped, relationship

from app.platform.db.base import Base
from app.platform.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)

    sessions = relationship("Session", back_populates="user")
    wallet = relationship("Wallet", back_populates="user", uselist=False)
    virtual_account = relationship("VirtualAccount", back_populates="user", uselist=False)
