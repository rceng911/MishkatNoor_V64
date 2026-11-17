"""Direct enrollment with a server-side circle and account boundary."""
from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.api.halaqat import (Input, _require, _ring_ids_for, _clean_username,
    _ensure_username, _unique_email, _temporary_password, _user_pack,
    SUPERVISOR_ROLE, STUDENT_ROLE)
from app.api.routes import audit
from app.db.session import get_db
from app.models import HalaqaStudent, Halaqa, User
from app.services.auth import hash_password

router = APIRouter(prefix='/api/halaqat/mosques/{mid}/rings/{rid}')

def scope(db, request, mid, rid):
    actor = _require(request, db, mid, {'owner', SUPERVISOR_ROLE})
    ring = db.get(Halaqa, rid)
    if not ring or not ring.active or ring.mosque_id != mid or rid not in _ring_ids_for(actor, mid, db):
        raise HTTPException(404, 'الحلقة خارج نطاقك')
    return actor

def usable(db, actor, user, mid):
    if not user or not user.active or user.role != STUDENT_ROLE or user.mosque_id != mid:
        return False
    children = db.scalars(select(HalaqaStudent).where(HalaqaStudent.user_id == user.id)).all()
    if user.account_type != 'guardian' and children:
        return False
    if actor.role != 'owner':
        allowed = set(_ring_ids_for(actor, mid, db))
        if any(s.halaqa_id not in allowed for s in children):
            return False
    return True

@router.get('/enrollment-accounts')
def accounts(mid: int, rid: int, request: Request, db=Depends(get_db)):
    actor = scope(db, request, mid, rid)
    return {'accounts': [_user_pack(u) for u in db.scalars(select(User).where(
        User.mosque_id == mid, User.role == STUDENT_ROLE, User.active.is_(True))) if usable(db, actor, u, mid)]}

class Enrollment(Input):
    full_name: str = Field(min_length=2, max_length=180)
    phone: str = Field('', max_length=40)
    national_id: str = Field('', max_length=30, pattern=r'^[0-9٠-٩۰-۹]*$')
    birth_date: date | None = None
    school_grade: str = Field('', max_length=120)
    guardian_name: str = Field('', max_length=180)
    guardian_phone: str = Field('', max_length=40)
    guardian_relation: str = Field('', max_length=60)
    current_memorization: str = Field('', max_length=250)
    notes: str = Field('', max_length=1000)
    account_mode: Literal['none', 'create', 'existing'] = 'none'
    recipient_type: Literal['student', 'guardian'] = 'student'
    username: str = Field('', max_length=30)
    existing_user_id: int | None = Field(None, gt=0)

@router.post('/students')
def enroll(mid: int, rid: int, data: Enrollment, request: Request, db=Depends(get_db)):
    actor = scope(db, request, mid, rid)
    if data.birth_date and data.birth_date > date.today():
        raise HTTPException(422, 'تاريخ الميلاد لا يكون في المستقبل')
    if data.recipient_type == 'guardian' and not data.guardian_name:
        raise HTTPException(422, 'أدخل اسم ولي الأمر')
    if actor.role!='owner':
        from app.api.workflow64 import propose
        return propose(db,actor,mid,rid,data)
    user = None
    password = None
    if data.account_mode == 'existing':
        user = db.get(User, data.existing_user_id) if data.existing_user_id else None
        if not usable(db, actor, user, mid) or (user.account_type or 'student') != data.recipient_type:
            raise HTTPException(422, 'الحساب غير متاح للربط أو نوعه لا يطابق المستفيد')
    elif data.account_mode == 'create':
        username = _clean_username(data.username, required=True)
        _ensure_username(db, username)
        password = _temporary_password()
        user = User(username=username, full_name=data.guardian_name if data.recipient_type == 'guardian' else data.full_name,
            email=_unique_email(db, '', 'student', 0), password_hash=hash_password(password),
            role=STUDENT_ROLE, account_type=data.recipient_type, mosque_id=mid, active=True, force_password_change=True)
        db.add(user)
    elif data.existing_user_id or data.username:
        raise HTTPException(422, 'اختر طريقة الحساب قبل إدخال بياناته')
    try:
        db.flush()
        values = data.model_dump(exclude={'account_mode', 'username', 'existing_user_id'})
        student = HalaqaStudent(halaqa_id=rid, user_id=user.id if user else None, **values)
        db.add(student)
        db.flush()
        audit(db, actor.id, mid, 'student_enrolled_v31', str(student.id))
        if not db.info.get('enrollment_review37'):db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'تعارض في بيانات الحساب؛ حدّث الصفحة وحاول مجددًا')
    return {'ok': True, 'student_id': student.id, 'user': _user_pack(user),
            'temporary_password': password, 'linked_existing': data.account_mode == 'existing'}
