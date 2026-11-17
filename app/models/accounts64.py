"""Additive v32 tables; existing accounts and student records are preserved."""
from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base

class AccountRequest32(Base):
    __tablename__ = 'account_requests_v32'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mosque_id: Mapped[int] = mapped_column(ForeignKey('mosques.id'), index=True)
    requested_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    role: Mapped[str] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(180))
    username: Mapped[str] = mapped_column(String(80))
    reservation: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    links_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    review_note: Mapped[str] = mapped_column(Text, default='')
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class GuardianStudent32(Base):
    __tablename__ = 'guardian_students_v32'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('halaqa_students.id'), primary_key=True)
