from app.services.attendance64 import ATTENDED
"""Attendance-first daily evaluation, restricted to the assigned teacher and family."""
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field, ValidationError
from sqlalchemy import select

from app.api.halaqat import Input, ProgressInput, TEACHER_ROLE, STUDENT_ROLE
from app.api.student_file import access_student, progress_pack, today
from app.api.routes import audit
from app.db.session import get_db
from app.models import HalaqaProgress
from app.models.scoring64 import DailyEvaluation52, DailyScoringPolicy52, SCORE_FIELDS52
from app.services.calendar import resolved_attendance
from app.services.scoring64 import rules60, RUBRIC52, evaluation_pack52, points52, student_month52

from app.services.recitation64 import Recitation, RecitationEntry, history64

router = APIRouter(prefix='/api/v52/mosques/{mid}', tags=['daily-evaluation'])
Score52 = Annotated[int, Field(ge=0, le=10, strict=True)]


class EvaluationInput52(Input):
    recitation64: Recitation | None = None
    behavior_score: Score52
    memorization_score: Score52
    tajweed_score: Score52
    recitation_score: Score52
    tarteel_score: Score52
    plan_commitment_score: Score52
    notes: str = Field(min_length=1, max_length=2000)
    memorized: str | None = Field(None, max_length=2000)
    revision: str | None = Field(None, max_length=2000)
    memorized_amount: float | None = Field(None, ge=0, le=1000, allow_inf_nan=False)
    revision_amount: float | None = Field(None, ge=0, le=1000, allow_inf_nan=False)
    memorized_unit: str | None = Field(None, pattern='^(page|ayah)$')
    revision_unit: str | None = Field(None, pattern='^(page|ayah)$')
    mistakes: int | None = Field(None, ge=0, le=1000)


def evaluation_access52(db, request, mid, sid, write=False):
    user, student = access_student(db, request, mid, sid, write)
    if user.role not in ((TEACHER_ROLE,) if write else (TEACHER_ROLE, STUDENT_ROLE)) or getattr(user, 'original_role', '') == 'owner':
        raise HTTPException(403, 'التقييم لمعلم الحلقة، والعرض للطالب وأسرته المرتبطة')
    return user, student


def progress_on52(db, sid, day, write=False):
    query = select(HalaqaProgress).where(HalaqaProgress.student_id == sid, HalaqaProgress.day == day)
    return db.scalar(query.with_for_update() if write else query)


@router.get('/students/{sid}/evaluation/{day}')
def get_evaluation52(mid: int, sid: int, day: date, request: Request, db=Depends(get_db)):
    user, student = evaluation_access52(db, request, mid, sid)
    row = progress_on52(db, sid, day)
    policy = db.get(DailyScoringPolicy52, mid)
    activated_on = policy.activated_on if policy else today()
    entry=db.get(RecitationEntry,row.id) if row else None
    previous=history64(db,sid,day)
    prior=next((payload for d,payload in reversed(previous) if d<day),{})
    return {'recitation64':entry.payload if entry else {},'previous_plan':{k:prior.get(k) for k in ('next_saved','next_review')},'student_id': sid, 'day': str(day), 'progress': progress_pack(row) if row else None,
            'evaluation': evaluation_pack52(db, row), 'rules60':rules60(db,mid,day.strftime('%Y-%m')) if day>=date(2026,11,1) else None,'rubric': RUBRIC52, 'activated_on': str(activated_on),
            'can_evaluate_day': user.role == TEACHER_ROLE and activated_on <= day <= today()}


@router.put('/students/{sid}/evaluation/{day}')
def save_evaluation52(mid: int, sid: int, day: date, data: EvaluationInput52, request: Request, db=Depends(get_db)):
    user, student = evaluation_access52(db, request, mid, sid, True)
    if day > today():
        raise HTTPException(422, 'لا يمكن تقييم يوم مستقبلي')
    progress = progress_on52(db, sid, day, True)
    if progress is None or resolved_attendance(db, sid, day, progress.attendance) not in ATTENDED:
        raise HTTPException(409, 'احفظ التحضير بحالة حاضر أو مستأذن قبل اعتماد التقييم')
    policy = db.get(DailyScoringPolicy52, mid)
    activated_on = policy.activated_on if policy else today()
    if day < activated_on:
        raise HTTPException(422, 'النظام اليومي يبدأ من ' + str(activated_on) + '؛ السجلات السابقة محفوظة بالنظام السابق')
    # Validate optional recitation details with the same unit rules as legacy records.
    fields = {key: getattr(progress, key) for key in ProgressInput.model_fields}
    fields.update({key: value for key, value in data.model_dump().items() if key in fields and value is not None})
    if data.recitation64 is not None:
        previous_entry=db.get(RecitationEntry,progress.id)
        for key,passage in [('memorized',data.recitation64.saved),('revision',data.recitation64.review)]:
            if passage:
                begin,end=passage.span()
                fields.update({key:passage.label(),key+'_amount':end-begin+1,key+'_unit':'ayah'})
            elif previous_entry and previous_entry.payload.get("saved" if key=="memorized" else "review"):
                fields.update({key:"",key+"_amount":0,key+"_unit":"ayah"})
        db.merge(RecitationEntry(progress_id=progress.id,payload=data.recitation64.model_dump()))
    try:
        validated = ProgressInput.model_validate(fields)
    except ValidationError:
        raise HTTPException(422, 'تحقق من وحدات التسميع؛ عدد الآيات يجب أن يكون عددًا صحيحًا')
    if policy is None:
        db.add(DailyScoringPolicy52(mosque_id=mid, activated_on=activated_on, activated_by=user.id))
    old = progress.daily_evaluation52
    evaluation = old or DailyEvaluation52(progress=progress, ring_id=student.halaqa_id)
    for key in SCORE_FIELDS52:
        setattr(evaluation, key, getattr(data, key))
    for key, value in points52(data.model_dump()).items():
        setattr(evaluation, key, value)
    evaluation.formula_version = RUBRIC52['formula_version']
    evaluation.notes, evaluation.evaluated_by, evaluation.updated_at = data.notes, user.id, datetime.utcnow()
    db.add(evaluation)
    for key in ('notes', 'memorization_score', 'tajweed_score', 'memorized', 'revision', 'memorized_amount',
                'revision_amount', 'memorized_unit', 'revision_unit', 'mistakes'):
        setattr(progress, key, getattr(validated, key))
    db.info['progress_reason35'] = 'اعتماد التقييم اليومي من ١٠ مع الملاحظات'
    db.info.setdefault('evaluation_write52', set()).add(progress.id)
    audit(db, user.id, mid, 'daily_evaluation_saved_v52', str(sid) + ':' + str(day))
    db.commit()
    return {'ok': True, 'activated_on': str(activated_on), 'progress': progress_pack(progress),
            'evaluation': evaluation_pack52(db, progress), 'rubric': RUBRIC52}


class EvaluationRemove52(Input):
    reason: str = Field(min_length=3, max_length=500)


@router.delete('/students/{sid}/evaluation/{day}')
def remove_evaluation52(mid: int, sid: int, day: date, data: EvaluationRemove52, request: Request, db=Depends(get_db)):
    user, _ = evaluation_access52(db, request, mid, sid, True)
    progress = progress_on52(db, sid, day, True)
    if progress is None or progress.daily_evaluation52 is None:
        raise HTTPException(404, 'لا يوجد تقييم معتمد لهذا اليوم')
    db.info['progress_reason35'] = 'إلغاء التقييم: ' + data.reason
    progress.daily_evaluation52 = None
    audit(db, user.id, mid, 'daily_evaluation_removed_v52', str(sid) + ':' + str(day))
    db.commit()
    return {'ok': True, 'evaluation': evaluation_pack52(db, progress)}


@router.get('/students/{sid}/monthly-points')
def monthly_points52(mid: int, sid: int, request: Request, month: str = Query('', max_length=7), db=Depends(get_db)):
    _, student = evaluation_access52(db, request, mid, sid)
    return student_month52(db, student, month or today().strftime('%Y-%m'), today()) | {'rubric': RUBRIC52}
