"""Users complete their own data; families can update linked children's personal data only."""
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import Field, model_validator
from sqlalchemy import String, Date, ForeignKey, select
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy.exc import IntegrityError
from app.db.session import Base, get_db
from app.models import User, HalaqaStudent
from app.api.halaqat import Input, _actor
from app.services.family64 import family_filter, can_read_student
from app.api.routes import audit

router=APIRouter(prefix='/api/v33')

class UserPersonal33(Base):
    __tablename__='user_personal_v33'
    user_id: Mapped[int]=mapped_column(ForeignKey('users.id'),primary_key=True)
    national_id: Mapped[str]=mapped_column(String(30),default='')
    birth_date: Mapped[date | None]=mapped_column(Date,nullable=True)

class StudentPersonal33(Base):
    __tablename__='student_personal_v33'
    student_id: Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),primary_key=True)
    email: Mapped[str]=mapped_column(String(200),default='')

LABELS={'full_name':'الاسم الكامل','phone':'رقم الجوال','email':'البريد الإلكتروني','national_id':'رقم الهوية أو الإقامة','birth_date':'تاريخ الميلاد'}

class PersonalInput33(Input):
    full_name: str=Field(min_length=2,max_length=180)
    phone: str=Field(min_length=8,max_length=40)
    email: str=Field(min_length=5,max_length=200)
    national_id: str=Field(min_length=5,max_length=30)
    birth_date: date
    @model_validator(mode='after')
    def validate_personal(self):
        digits=str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')
        self.phone=self.phone.translate(digits).strip()
        self.national_id=self.national_id.translate(digits).strip()
        self.email=self.email.strip().lower()
        if not re.fullmatch(r'\+?[0-9 ()-]+',self.phone) or not 8<=len(re.sub(r'\D','',self.phone))<=15:raise ValueError('أدخل رقم جوال صحيحًا')
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',self.email) or self.email.endswith('.invalid'):raise ValueError('أدخل بريدًا إلكترونيًا صالحًا')
        if not re.fullmatch(r'[A-Za-z0-9-]+',self.national_id):raise ValueError('الهوية تقبل الأرقام أو حروف الوثيقة دون مسافات')
        if not date(1900,1,1)<=self.birth_date<=datetime.now(ZoneInfo('Asia/Riyadh')).date():raise ValueError('تاريخ الميلاد غير صحيح')
        return self

def missing(data):return [LABELS[k] for k in LABELS if not data.get(k)]

class ChildInput37(PersonalInput33):
    guardian_phone: str | None=Field(None,min_length=8,max_length=40)
    @model_validator(mode='after')
    def validate_guardian_phone(self):
        if self.guardian_phone is not None:
            self.guardian_phone=self.guardian_phone.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')).strip()
            if not re.fullmatch(r'\+?[0-9 ()-]+',self.guardian_phone) or not 8<=len(re.sub(r'\D','',self.guardian_phone))<=15:raise ValueError('أدخل رقم جوال ولي الأمر صحيحًا')
        return self

def guardian_phone37(db,u,phone):
    u.phone=phone
    for child in db.scalars(select(HalaqaStudent).where(HalaqaStudent.user_id==u.id,HalaqaStudent.recipient_type=='guardian',HalaqaStudent.active.is_(True))):
        child.guardian_phone=phone

def family_child37(db,u,s):
    data=child_pack(db,s)
    if u.account_type=='guardian':
        data['guardian_phone']=u.phone or (s.guardian_phone if s.user_id==u.id else '')
    return data
def child_pack(db,s):
    p=db.get(StudentPersonal33,s.id)
    data={'id':s.id,'full_name':s.full_name,'phone':s.phone,'email':p.email if p else '',
          'national_id':s.national_id,'birth_date':s.birth_date.isoformat() if s.birth_date else ''}
    data['missing']=missing(data);return data

def user_pack(db,u):
    p=db.get(UserPersonal33,u.id)
    linked=db.scalars(select(HalaqaStudent).where(HalaqaStudent.active.is_(True),family_filter(u.id))).all() if u.role=='halaqa_student' else []
    student=linked[0] if u.account_type=='student' and len(linked)==1 else None
    dob=p.birth_date if p else student.birth_date if student else None
    data={'full_name':u.full_name,'phone':u.phone or (student.phone if student else ''),
          'email':u.email if not u.email.endswith('.invalid') else '',
          'national_id':p.national_id if p else student.national_id if student else '',
          'birth_date':dob.isoformat() if dob else ''}
    data['missing']=missing(data);data['children']=[family_child37(db,u,s) for s in linked];return data

@router.get('/my-profile')
def get_profile(request: Request,db=Depends(get_db)):return user_pack(db,_actor(request,db))

@router.put('/my-profile')
def save_profile(data:PersonalInput33,request:Request,db=Depends(get_db)):
    u=_actor(request,db)
    if db.scalar(select(User.id).where(User.email==data.email,User.id!=u.id)):raise HTTPException(409,'البريد مستخدم في حساب آخر')
    u.full_name,u.phone,u.email=data.full_name,data.phone,data.email
    if u.role=='halaqa_student' and u.account_type=='guardian':guardian_phone37(db,u,data.phone)
    p=db.get(UserPersonal33,u.id)
    if not p:p=UserPersonal33(user_id=u.id);db.add(p)
    p.national_id,p.birth_date=data.national_id,data.birth_date
    if u.role=='halaqa_student' and u.account_type=='student':
        for s in db.scalars(select(HalaqaStudent).where(HalaqaStudent.user_id==u.id,HalaqaStudent.active.is_(True))):
            s.full_name,s.phone,s.national_id,s.birth_date=data.full_name,data.phone,data.national_id,data.birth_date
            cp=db.get(StudentPersonal33,s.id)
            if not cp:cp=StudentPersonal33(student_id=s.id);db.add(cp)
            cp.email=data.email
    audit(db,u.id,u.mosque_id,'personal_data_completed_v33','self')
    try:db.commit()
    except IntegrityError:db.rollback();raise HTTPException(409,'البريد مستخدم في حساب آخر')
    return {'ok':True,'profile':user_pack(db,u)}

def child_access(db,request,sid):
    u=_actor(request,db);s=db.get(HalaqaStudent,sid)
    if u.role!='halaqa_student' or not s or not s.active or not can_read_student(db,u.id,s):raise HTTPException(404,'ملف الطالب غير متاح')
    return u,s

@router.get('/students/{sid}/personal-details')
def get_child(sid:int,request:Request,db=Depends(get_db)):
    u,s=child_access(db,request,sid);return family_child37(db,u,s)

@router.put('/students/{sid}/personal-details')
def save_child(sid:int,data:ChildInput37,request:Request,db=Depends(get_db)):
    u,s=child_access(db,request,sid)
    if data.guardian_phone is not None:
        if u.account_type!='guardian':raise HTTPException(403,'رقم ولي الأمر يحدّثه حساب ولي الأمر فقط')
        guardian_phone37(db,u,data.guardian_phone)
    s.full_name,s.phone,s.national_id,s.birth_date=data.full_name,data.phone,data.national_id,data.birth_date
    p=db.get(StudentPersonal33,sid)
    if not p:p=StudentPersonal33(student_id=sid);db.add(p)
    p.email=data.email
    audit(db,u.id,u.mosque_id,'child_personal_data_completed_v33',str(sid));db.commit()
    return {'ok':True,'profile':family_child37(db,u,s)}
