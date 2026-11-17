"""Scoped account proposals. Passwords are hashed before a proposal is stored."""
import json
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, ConfigDict
from sqlalchemy import select
from app.db.session import get_db
from app.models import User, Mosque, Halaqa, HalaqaStudent, HalaqaTeacher, AuthSession
from app.models.accounts64 import AccountRequest32, GuardianStudent32
from app.api.halaqat import Input, _require, _actor, _ring_ids_for, _clean_username, _ensure_username, _unique_email, _user_pack, _temporary_password, SUPERVISOR_ROLE, TEACHER_ROLE, STUDENT_ROLE
from app.api.routes import audit
from app.services.auth import hash_password
from app.services.password_policy import validate_password

router = APIRouter(prefix='/api/v32')

class Proposal(Input):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    role: Literal['teacher', 'student', 'guardian', 'supervisor']
    full_name: str = Field(min_length=2, max_length=180)
    username: str = Field(min_length=3, max_length=30)
    temporary_password: str = Field(min_length=8, max_length=128, repr=False)
    ring_ids: list[int] = Field(default_factory=list, max_length=100)
    student_ids: list[int] = Field(default_factory=list, max_length=100)

class Review(Input):
    action: Literal['approve', 'reject', 'return']
    note: str = Field('', max_length=1000)

def validate_links(db, actor, mid, role, links):
    rings, students = links['ring_ids'], links['student_ids']
    allowed = set(_ring_ids_for(actor, mid, db))
    if len(set(rings)) != len(rings) or len(set(students)) != len(students):
        raise HTTPException(422, 'يوجد اختيار مكرر')
    if role == 'supervisor' and actor.role != 'owner':
        raise HTTPException(403, 'طلب المشرف متاح للمالك فقط')
    if role == 'teacher' and (not rings or students):
        raise HTTPException(422, 'اختر حلقة أو أكثر للمعلم')
    if role == 'student' and (len(students) != 1 or rings):
        raise HTTPException(422, 'اختر ملف طالب واحد؛ الحلقة من ملفه')
    if role == 'guardian' and (not students or rings):
        raise HTTPException(422, 'اختر أبناء ولي الأمر من ملفات الطلاب')
    if role == 'supervisor' and (rings or students):
        raise HTTPException(422, 'نطاق المشرف هو المجمع المحدد')
    for rid in rings:
        if rid not in allowed:
            raise HTTPException(403, 'الحلقة خارج نطاقك')
    for sid in students:
        student = db.get(HalaqaStudent, sid)
        if not student or not student.active or student.halaqa_id not in allowed:
            raise HTTPException(403, 'الطالب خارج نطاقك')
        if role == 'student' and student.user_id:
            old = db.get(User, student.user_id)
            if old and old.account_type != 'guardian':
                raise HTTPException(409, 'الطالب مرتبط بحساب طالب بالفعل')

def pack(row, db):
    links = json.loads(row.links_json)
    return {'id': row.id, 'role': row.role, 'full_name': row.full_name, 'username': row.username,
            'mosque_id': row.mosque_id, 'mosque': db.get(Mosque, row.mosque_id).name,
            'rings': [{'id': rid, 'name': r.name if (r := db.get(Halaqa, rid)) else 'حلقة محذوفة'} for rid in links['ring_ids']],
            'students': [{'id': sid, 'name': s.full_name if (s := db.get(HalaqaStudent, sid)) else 'ملف محذوف'} for sid in links['student_ids']],
            'requested_by': db.get(User, row.requested_by).full_name, 'requested_by_id': row.requested_by,
            'status': row.status, 'review_note': row.review_note,
            'reviewed_at': row.reviewed_at.isoformat()+'Z' if row.reviewed_at else None,
            'created_at': row.created_at.isoformat()+'Z'}

@router.get('/account-requests')
def requests(request: Request, role: str = '', status: str = '', db=Depends(get_db)):
    actor = _actor(request, db)
    if actor.role not in ('owner', SUPERVISOR_ROLE):
        raise HTTPException(403, 'للإدارة فقط')
    q = select(AccountRequest32)
    if actor.role != 'owner':
        q = q.where(AccountRequest32.mosque_id == actor.mosque_id, AccountRequest32.requested_by == actor.id)
    if role: q = q.where(AccountRequest32.role == role)
    if status: q = q.where(AccountRequest32.status == status)
    return {'requests': [pack(r, db) for r in db.scalars(q.order_by(AccountRequest32.id.desc()))]}

def save_proposal(mid, data, actor, db, row=None, commit=True):
    if not data.full_name.strip(): raise HTTPException(422, 'أدخل الاسم')
    if any(c.isspace() for c in data.username): raise HTTPException(422, 'اسم المستخدم لا يقبل المسافات؛ استخدم _')
    username = _clean_username(data.username, required=True)
    valid, error = validate_password(data.temporary_password)
    if not valid: raise HTTPException(422, error)
    if db.scalar(select(User.id).where(User.username == username)):
        raise HTTPException(409, 'اسم المستخدم مستخدم مسبقًا')
    pending = db.scalar(select(AccountRequest32).where(AccountRequest32.reservation == username))
    if pending and (not row or pending.id != row.id):
        raise HTTPException(409, 'اسم المستخدم محجوز لطلب قيد المراجعة')
    links = {'ring_ids': data.ring_ids, 'student_ids': data.student_ids}
    validate_links(db, actor, mid, data.role, links)
    if row is None:
        row = AccountRequest32(mosque_id=mid, requested_by=actor.id)
        db.add(row)
    row.role, row.full_name, row.username = data.role, data.full_name.strip(), username
    row.reservation, row.password_hash = username, hash_password(data.temporary_password)
    row.links_json, row.status = json.dumps(links), 'pending'
    row.reviewed_by, row.reviewed_at, row.review_note = None, None, ''
    db.flush()
    audit(db, actor.id, mid, 'account_request_submitted_v32', str(row.id))
    if commit: db.commit()
    return {'ok': True, 'request': pack(row, db)}

@router.post('/mosques/{mid}/account-requests')
def propose(mid: int, data: Proposal, request: Request, db=Depends(get_db)):
    actor = _require(request, db, mid, {SUPERVISOR_ROLE})
    return save_proposal(mid, data, actor, db)

@router.put('/mosques/{mid}/account-requests/{qid}')
def amend(mid: int, qid: int, data: Proposal, request: Request, db=Depends(get_db)):
    actor = _require(request, db, mid, {SUPERVISOR_ROLE})
    row = db.scalar(select(AccountRequest32).where(AccountRequest32.id == qid).with_for_update())
    if not row or row.mosque_id != mid or row.requested_by != actor.id:
        raise HTTPException(404, 'الطلب غير متاح')
    if row.status != 'returned': raise HTTPException(409, 'التعديل للطلبات المعادة فقط')
    return save_proposal(mid, data, actor, db, row)

@router.post('/mosques/{mid}/account-requests/{qid}/review')
def review(mid: int, qid: int, data: Review, request: Request, db=Depends(get_db)):
    return review_request(mid, qid, data, request, db)

def review_request(mid, qid, data, request, db, commit=True):
    owner = _require(request, db, mid, {'owner'})
    row = db.scalar(select(AccountRequest32).where(AccountRequest32.id == qid, AccountRequest32.mosque_id == mid).with_for_update())
    if not row: raise HTTPException(404, 'الطلب غير موجود')
    if row.status != 'pending': raise HTTPException(409, 'تمت معالجة الطلب سابقًا')
    if data.action == 'approve':
        actor = db.get(User, row.requested_by)
        if not actor or not actor.active or actor.role not in ('owner', SUPERVISOR_ROLE) or (actor.role != 'owner' and actor.mosque_id != mid):
            raise HTTPException(409, 'تغير نطاق مقدم الطلب؛ أعد تقديمه')
        links = json.loads(row.links_json)
        validate_links(db, actor, mid, row.role, links)
        if db.scalar(select(User.id).where(User.username == row.username)):
            raise HTTPException(409, 'اسم المستخدم مستخدم؛ أرجع الطلب للتعديل')
        u = User(full_name=row.full_name, username=row.username, email=_unique_email(db, '', row.role, row.id),
                 password_hash=row.password_hash, role={'teacher': TEACHER_ROLE, 'supervisor': SUPERVISOR_ROLE, 'student': STUDENT_ROLE, 'guardian': STUDENT_ROLE}[row.role],
                 account_type=row.role if row.role in ('student', 'guardian') else '', mosque_id=mid, active=True, force_password_change=True)
        db.add(u); db.flush()
        for rid in links['ring_ids']:
            db.add(HalaqaTeacher(halaqa_id=rid, user_id=u.id, assigned_by=owner.id, active=True))
        for sid in links['student_ids']:
            s = db.get(HalaqaStudent, sid)
            if row.role == 'guardian':
                db.add(GuardianStudent32(user_id=u.id, student_id=sid))
            else:
                if s.user_id and not db.get(GuardianStudent32, (s.user_id, sid)):
                    db.add(GuardianStudent32(user_id=s.user_id, student_id=sid))
                s.user_id, s.recipient_type = u.id, 'student'
        row.status = 'approved'
    else:
        row.status = 'rejected' if data.action == 'reject' else 'returned'
    row.reservation, row.password_hash = None, ''
    row.reviewed_by, row.reviewed_at, row.review_note = owner.id, datetime.utcnow(), data.note
    audit(db, owner.id, mid, 'account_request_'+row.status+'_v32', str(row.id))
    if commit: db.commit()
    return {'ok': True, 'request': pack(row, db)}

class OwnerInput(Input):
    username: str = Field(min_length=3, max_length=30)
    full_name: str = Field('', max_length=180)
    confirm: Literal['منح صلاحية مالك']
    existing: bool = False

@router.get('/owners')
def owners(request: Request, db=Depends(get_db)):
    actor = _actor(request, db)
    if actor.role != 'owner': raise HTTPException(403, 'للملّاك فقط')
    from app.models import OwnerRemoval50, PrimaryOwner50
    from app.services.owner_policy64 import can_manage_owners50
    primary = db.get(PrimaryOwner50, 1)
    return {'owners': [{**_user_pack(u), 'protected': bool(primary and u.id == primary.user_id)} for u in db.scalars(select(User).where(User.role == 'owner', ~User.id.in_(select(OwnerRemoval50.user_id))))], 'can_remove_owners': can_manage_owners50(request, db, actor)}

@router.post('/owners')
def add_owner(data: OwnerInput, request: Request, db=Depends(get_db)):
    actor = _actor(request, db)
    if actor.role != 'owner': raise HTTPException(403, 'للملّاك فقط')
    username = _clean_username(data.username, required=True)
    target = db.scalar(select(User).where(User.username == username).with_for_update())
    temp = None
    if data.existing:
        if not target or not target.active: raise HTTPException(404, 'الحساب غير موجود أو معطل')
        if target.role == 'owner': raise HTTPException(409, 'الحساب مالك بالفعل')
        target.role, target.account_type = 'owner', ''
        from sqlalchemy import delete
        db.execute(delete(AuthSession).where(AuthSession.user_id == target.id))
    else:
        _ensure_username(db, username)
        if len(data.full_name.strip()) < 2: raise HTTPException(422, 'أدخل اسم المالك')
        temp = _temporary_password()
        target = User(full_name=data.full_name.strip(), username=username, email=_unique_email(db, '', 'owner', 0),
                      password_hash=hash_password(temp), role='owner', mosque_id=actor.mosque_id, active=True, force_password_change=True)
        db.add(target)
    db.flush()
    audit(db, actor.id, actor.mosque_id, 'owner_granted_v32', str(target.id))
    db.commit()
    return {'ok': True, 'user': _user_pack(target), 'temporary_password': temp}

class RingDetails(Input):
    name: str = Field(min_length=2, max_length=180)
    schedule: str = Field('', max_length=500)

@router.put('/mosques/{mid}/rings/{rid}')
def edit_ring(mid: int, rid: int, data: RingDetails, request: Request, db=Depends(get_db)):
    actor = _require(request, db, mid, {SUPERVISOR_ROLE})
    if rid not in _ring_ids_for(actor, mid, db): raise HTTPException(404, 'الحلقة خارج نطاقك')
    r = db.get(Halaqa, rid)
    if db.scalar(select(Halaqa.id).where(Halaqa.mosque_id == mid, Halaqa.name == data.name, Halaqa.id != rid)):
        raise HTTPException(409, 'اسم الحلقة موجود')
    r.name, r.schedule = data.name, data.schedule
    audit(db, actor.id, mid, 'ring_edited_v32', str(rid)); db.commit()
    return {'ok': True}
