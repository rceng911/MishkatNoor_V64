"""Stable primary-owner identity and retained account removal records."""
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class PrimaryOwner50(Base):
    __tablename__ = "primary_owner_v50"
    __table_args__ = (CheckConstraint("id = 1", name="primary_owner_singleton_v50"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)


class OwnerRemoval50(Base):
    __tablename__ = "owner_removals_v50"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    removed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    removed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    username: Mapped[str] = mapped_column(String(80))
