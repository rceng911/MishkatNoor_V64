"""Daily ten-point evaluations. Existing progress rows are never backfilled."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.db.session import Base
from app.models.halaqat import HalaqaProgress

SCORE_FIELDS52 = ('behavior_score', 'memorization_score', 'tajweed_score',
                  'recitation_score', 'tarteel_score', 'plan_commitment_score')
POINT_FIELDS52 = ('attendance_points', 'behavior_points', 'quality_points', 'plan_points', 'total')


class DailyEvaluation52(Base):
    __tablename__ = 'daily_evaluations_v52'
    __table_args__ = tuple(CheckConstraint(f'{name} >= 0 AND {name} <= 10', name=f'ck_eval52_{name}')
                           for name in SCORE_FIELDS52) + (
        CheckConstraint('attendance_points = 2', name='ck_eval52_attendance'),
        CheckConstraint('behavior_points >= 0 AND behavior_points <= 3', name='ck_eval52_behavior'),
        CheckConstraint('quality_points >= 0 AND quality_points <= 4', name='ck_eval52_quality'),
        CheckConstraint('plan_points >= 0 AND plan_points <= 1', name='ck_eval52_plan'),
        CheckConstraint('total >= 2 AND total <= 10', name='ck_eval52_total'),
        CheckConstraint('total = attendance_points + behavior_points + quality_points + plan_points', name='ck_eval52_sum'),
    )
    progress_id: Mapped[int] = mapped_column(ForeignKey('halaqa_progress.id', ondelete='CASCADE'), primary_key=True)
    ring_id: Mapped[int] = mapped_column(ForeignKey('halaqat.id'), index=True)
    behavior_score: Mapped[int] = mapped_column(Integer)
    memorization_score: Mapped[int] = mapped_column(Integer)
    tajweed_score: Mapped[int] = mapped_column(Integer)
    recitation_score: Mapped[int] = mapped_column(Integer)
    tarteel_score: Mapped[int] = mapped_column(Integer)
    plan_commitment_score: Mapped[int] = mapped_column(Integer)
    attendance_points: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    behavior_points: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    quality_points: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    plan_points: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    formula_version: Mapped[str] = mapped_column(String(30), default='daily10-v52')
    notes: Mapped[str] = mapped_column(Text, default='')
    evaluated_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    progress: Mapped[HalaqaProgress] = relationship(HalaqaProgress, backref=backref(
        'daily_evaluation52', uselist=False, cascade='all, delete-orphan', single_parent=True))


class DailyScoringPolicy52(Base):
    __tablename__ = 'daily_scoring_policies_v52'
    mosque_id: Mapped[int] = mapped_column(ForeignKey('mosques.id'), primary_key=True)
    activated_on: Mapped[date] = mapped_column(Date)
    activated_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
