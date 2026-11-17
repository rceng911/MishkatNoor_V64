"""Scoped complaints and teacher enrollment requests; never issue credentials."""
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import Field
from sqlalchemy import select, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, get_db
from app.models import User, Mosque, Halaqa, HalaqaStudent
from app.api.halaqat import Input, _actor, _ring_ids_for, SUPERVISOR_ROLE, TEACHER_ROLE
from app.api.routes import audit

router = APIRouter(prefix='/api/v32/service-requests')

class ServiceRequest32(Base):
    __tablename__ = 'service_requests_v32'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mosque_id: Mapped[int] = mapped_column(ForeignKey('mosques.id'), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    ring_id: Mapped[int | None] = mapped_column(ForeignKey('halaqat.id'), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default='')
    phone: Mapped[str] = mapped_column(String(40), default='')
    status: Mapped[str] = mapped_column(String(20), default='pending')
    reply: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Submission(Input):
    kind: Literal['complaint', 'enrollment']
    title: str = Field(min_length=2, max_length=180)
    description: str = Field('', max_length=3000)
    phone: str = Field('', max_length=40)
    ring_id: int | None = None

class Review(Input):
    action: Literal['approve', 'reject', 'close']
    reply: str = Field('', max_length=1000)

def can_review(row, actor, db):
    return actor.role == 'owner'

def pack(row, actor, db):
    return {'id': row.id, 'kind': row.kind, 'title': row.title,
            'description': row.description, 'phone': row.phone,
            'status': row.status, 'reply': row.reply,
            'mosque': db.get(Mosque, row.mosque_id).name,
            'ring': db.get(Halaqa, row.ring_id).name if row.ring_id and db.get(Halaqa, row.ring_id) else '',
            'author': db.get(User, row.author_id).full_name,
            'can_review': can_review(row, actor, db)}

@router.get('')
def requests(request: Request, db=Depends(get_db)):
    actor = _actor(request, db)
    rows = db.scalars(select(ServiceRequest32).order_by(ServiceRequest32.id.desc()))
    return {'requests': [pack(row, actor, db) for row in rows
                         if (row.author_id == actor.id or can_review(row, actor, db)) and (row.kind!='enrollment' or actor.role in ('owner',SUPERVISOR_ROLE))]}

@router.post('')
def submit(data: Submission, request: Request, db=Depends(get_db)):
    actor = _actor(request, db)
    if not data.title.strip(): raise HTTPException(422, 'أدخل العنوان')
    mid = actor.mosque_id
    if data.kind == 'enrollment':
        raise HTTPException(403, 'إضافة الطلاب مسؤولية مشرف المجمع والمالك؛ طلب الإضافة غير متاح للمعلم')
    elif data.ring_id is not None:
        raise HTTPException(422, 'الشكوى لا تحتاج تحديد حلقة')
    if not mid or not db.get(Mosque, mid): raise HTTPException(422, 'لا يوجد مجمع مرتبط بالحساب')
    row = ServiceRequest32(mosque_id=mid, author_id=actor.id, kind=data.kind,
                           ring_id=data.ring_id, title=data.title.strip(),
                           description=data.description, phone=data.phone)
    db.add(row); db.flush()
    audit(db, actor.id, mid, 'service_request_submitted_v32', str(row.id))
    db.commit()
    return {'ok': True, 'request': pack(row, actor, db)}

@router.post('/{qid}/review')
def review(qid: int, data: Review, request: Request, db=Depends(get_db)):
    actor = _actor(request, db)
    row = db.scalar(select(ServiceRequest32).where(ServiceRequest32.id == qid).with_for_update())
    if not row or not can_review(row, actor, db): raise HTTPException(404, 'الطلب غير متاح')
    if row.status != 'pending': raise HTTPException(409, 'تمت معالجة الطلب سابقًا')
    if data.action == 'approve':
        if row.kind != 'enrollment': raise HTTPException(422, 'الموافقة لطلب إضافة الطالب')
        ring = db.get(Halaqa, row.ring_id)
        teacher = db.get(User, row.author_id)
        if not ring or not ring.active or not teacher or not teacher.active or teacher.role != TEACHER_ROLE or row.ring_id not in _ring_ids_for(teacher, row.mosque_id, db):
            raise HTTPException(409, 'تغير نطاق المعلم؛ أعد تقديم الطلب')
        db.add(HalaqaStudent(halaqa_id=row.ring_id, full_name=row.title, phone=row.phone, notes=row.description, active=True))
        row.status = 'approved'
    elif data.action == 'close':
        if row.kind != 'complaint': raise HTTPException(422, 'المعالجة للشكاوى فقط')
        if not data.reply.strip(): raise HTTPException(422, 'أدخل ردًا على الشكوى')
        row.status = 'closed'
    else: row.status = 'rejected'
    row.reply = data.reply
    audit(db, actor.id, row.mosque_id, 'service_request_'+row.status+'_v32', str(row.id))
    db.commit()
    return {'ok': True, 'request': pack(row, actor, db)}

class ComplexProfile32(Base):
    __tablename__ = 'complex_profiles_v32'
    mosque_id: Mapped[int] = mapped_column(ForeignKey('mosques.id'), primary_key=True)
    location: Mapped[str] = mapped_column(String(500), default='')
    supervisor_name: Mapped[str] = mapped_column(String(180), default='')
    phone: Mapped[str] = mapped_column(String(40), default='')
    book_name: Mapped[str] = mapped_column(String(180), default='')
    book_count: Mapped[int] = mapped_column(Integer, default=0)
    ordered_count: Mapped[int] = mapped_column(Integer, default=0)
    subscription_date: Mapped[str] = mapped_column(String(10), default='')
    renewal_date: Mapped[str] = mapped_column(String(10), default='')

from datetime import date
from app.api.halaqat import _require

class ProfileInput32(Input):
    location: str = Field('', max_length=500)
    supervisor_name: str = Field('', max_length=180)
    phone: str = Field('', max_length=40)
    book_name: str = Field('', max_length=180)
    book_count: int = Field(0, ge=0, le=1000000)
    ordered_count: int = Field(0, ge=0, le=1000000)
    subscription_date: date | None = None
    renewal_date: date | None = None

def profile_pack32(row):
    keys=ProfileInput32.model_fields
    return {k:getattr(row,k) if row else (0 if k.endswith('_count') else '') for k in keys}

@router.get('/complex-profile/{mid}')
def profile_get32(mid: int, request: Request, db=Depends(get_db)):
    _require(request, db, mid, {SUPERVISOR_ROLE})
    return profile_pack32(db.get(ComplexProfile32, mid))

@router.put('/complex-profile/{mid}')
def profile_save32(mid: int, data: ProfileInput32, request: Request, db=Depends(get_db)):
    actor=_require(request, db, mid, {'owner'})
    if data.subscription_date and data.renewal_date and data.renewal_date < data.subscription_date:
        raise HTTPException(422, 'تاريخ التجديد يجب أن يكون بعد تاريخ الاشتراك')
    row=db.get(ComplexProfile32, mid)
    if not row: row=ComplexProfile32(mosque_id=mid);db.add(row)
    for k,v in data.model_dump().items():setattr(row,k,v.isoformat() if isinstance(v,date) else v if v is not None else '')
    audit(db, actor.id, mid, 'complex_profile_updated_v32', str(mid));db.commit()
    return {'ok':True, 'profile':profile_pack32(row)}
