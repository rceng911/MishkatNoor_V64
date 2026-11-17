from app.services.attendance64 import ATTENDED
"""Additive workflows; existing account approval and family scopes stay authoritative."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, model_validator
from sqlalchemy import select, Integer, String, Text, Date, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, get_db
from app.models import User, Halaqa, HalaqaStudent, HalaqaProgress, Assignment
from app.api.halaqat import Input, _actor, _require, _ring_ids_for, SUPERVISOR_ROLE, TEACHER_ROLE
from app.api.student_file import access_student, today
from app.api.accounts64 import Proposal, Review, save_proposal, review_request
from app.api.routes import audit

router=APIRouter(prefix='/api/v34')
MANAGERS={SUPERVISOR_ROLE}

class Capacity34(Base):
    __tablename__='ring_capacity_v34'
    ring_id: Mapped[int]=mapped_column(ForeignKey('halaqat.id'),primary_key=True)
    capacity: Mapped[int]=mapped_column(Integer,default=30)

class Admission34(Base):
    __tablename__='admissions_v34'
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    mosque_id: Mapped[int]=mapped_column(ForeignKey('mosques.id'),index=True)
    ring_id: Mapped[int]=mapped_column(ForeignKey('halaqat.id'),index=True)
    full_name: Mapped[str]=mapped_column(String(180))
    phone: Mapped[str]=mapped_column(String(40),default='')
    notes: Mapped[str]=mapped_column(Text,default='')
    status: Mapped[str]=mapped_column(String(20),default='waiting')
    student_id: Mapped[int | None]=mapped_column(ForeignKey('halaqa_students.id'),nullable=True)
    created_by: Mapped[int]=mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class FollowAction34(Base):
    __tablename__='follow_actions_v34'
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    student_id: Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    assigned_to: Mapped[int]=mapped_column(ForeignKey('users.id'))
    created_by: Mapped[int]=mapped_column(ForeignKey('users.id'))
    title: Mapped[str]=mapped_column(String(180))
    due: Mapped[date]=mapped_column(Date)
    status: Mapped[str]=mapped_column(String(20),default='open')
    outcome: Mapped[str]=mapped_column(Text,default='')

class Subscription34(Base):
    __tablename__='subscriptions_v34'
    mosque_id: Mapped[int]=mapped_column(ForeignKey('mosques.id'),primary_key=True)
    start: Mapped[date]=mapped_column(Date)
    end: Mapped[date]=mapped_column(Date)
    amount: Mapped[Decimal]=mapped_column(Numeric(12,2),default=0)
    paid: Mapped[Decimal]=mapped_column(Numeric(12,2),default=0)

class Renewal34(Base):
    __tablename__='renewals_v34'
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    mosque_id: Mapped[int]=mapped_column(ForeignKey('mosques.id'),index=True)
    created_by: Mapped[int]=mapped_column(ForeignKey('users.id'))
    end: Mapped[date]=mapped_column(Date)
    note: Mapped[str]=mapped_column(Text,default='')
    status: Mapped[str]=mapped_column(String(20),default='pending')

def ring_access(db,u,mid,rid):
    if rid not in _ring_ids_for(u,mid,db):raise HTTPException(404,'الحلقة خارج نطاقك')
    r=db.scalar(select(Halaqa).where(Halaqa.id==rid).with_for_update())
    if not r or not r.active:raise HTTPException(404,'الحلقة غير متاحة')
    return r

def spaces(db,rid):
    row=db.get(Capacity34,rid)
    cap=row.capacity if row else 30
    count=db.scalar(select(func.count(HalaqaStudent.id)).where(HalaqaStudent.halaqa_id==rid,HalaqaStudent.active.is_(True)))
    return {'capacity':cap,'students':count,'available':max(0,cap-count)}

class CapacityInput(Input):capacity:int=Field(ge=1,le=10000)
class AdmissionInput(Input):
    ring_id:int
    full_name:str=Field(min_length=2,max_length=180)
    phone:str=Field(min_length=8,max_length=40,pattern=r'^\+?[0-9٠-٩ ()-]+$')
    notes:str=Field('',max_length=1000)
class AdmissionReview(Input):action:Literal['admit','reject']

@router.get('/mosques/{mid}/admissions')
def admissions(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS);ids=_ring_ids_for(u,mid,db)
    rows=db.scalars(select(Admission34).where(Admission34.mosque_id==mid,Admission34.ring_id.in_(ids)).order_by(Admission34.id))
    return {'rings':[{'id':r.id,'name':r.name,**spaces(db,r.id)} for r in db.scalars(select(Halaqa).where(Halaqa.id.in_(ids),Halaqa.active.is_(True)))],
      'requests':[{'id':r.id,'ring_id':r.ring_id,'full_name':r.full_name,'phone':r.phone,'notes':r.notes,'status':r.status,'student_id':r.student_id} for r in rows]}

@router.put('/mosques/{mid}/rings/{rid}/capacity')
def capacity(mid:int,rid:int,p:CapacityInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS);ring_access(db,u,mid,rid)
    row=db.get(Capacity34,rid)
    if not row:row=Capacity34(ring_id=rid);db.add(row)
    row.capacity=p.capacity;audit(db,u.id,mid,'capacity_saved_v34',str(rid));db.commit();return {'ok':True}

@router.post('/mosques/{mid}/admissions')
def add_admission(mid:int,p:AdmissionInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS);ring_access(db,u,mid,p.ring_id)
    if db.scalar(select(Admission34.id).where(Admission34.mosque_id==mid,Admission34.full_name==p.full_name,Admission34.phone==p.phone,Admission34.status=='waiting')):raise HTTPException(409,'يوجد طلب انتظار لنفس الاسم والجوال')
    r=Admission34(mosque_id=mid,created_by=u.id,**p.model_dump());db.add(r);db.flush();audit(db,u.id,mid,'admission_requested_v34',str(r.id));db.commit();return {'ok':True,'id':r.id}

@router.post('/mosques/{mid}/admissions/{aid}/review')
def review_admission(mid:int,aid:int,p:AdmissionReview,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'})
    r=db.scalar(select(Admission34).where(Admission34.id==aid,Admission34.mosque_id==mid).with_for_update())
    if not r:raise HTTPException(404,'الطلب غير موجود')
    ring_access(db,u,mid,r.ring_id)
    if r.status!='waiting':raise HTTPException(409,'تمت معالجة الطلب')
    if p.action=='admit':
        if not spaces(db,r.ring_id)['available']:raise HTTPException(409,'الحلقة مكتملة؛ يبقى الطالب في الانتظار')
        s=HalaqaStudent(halaqa_id=r.ring_id,full_name=r.full_name,phone=r.phone,notes=r.notes,active=True)
        db.add(s);db.flush();r.student_id=s.id;r.status='admitted'
    else:r.status='rejected'
    audit(db,u.id,mid,'admission_'+r.status+'_v34',str(r.id));db.commit();return {'ok':True,'student_id':r.student_id}

class BatchProposals(Input):items:list[Proposal]=Field(min_length=1,max_length=50)
class BatchReview(Input):
    ids:list[int]=Field(min_length=1,max_length=50)
    action:Literal['approve','reject','return']
    note:str=Field('',max_length=1000)

@router.post('/mosques/{mid}/account-requests/batch')
def batch_proposals(mid:int,p:BatchProposals,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS)
    try:
        results=[save_proposal(mid,x,u,db,commit=False)['request'] for x in p.items];db.commit()
        return {'ok':True,'requests':results}
    except Exception:db.rollback();raise

@router.post('/mosques/{mid}/account-requests/batch-review')
def batch_review(mid:int,p:BatchReview,request:Request,db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    if len(set(p.ids))!=len(p.ids):raise HTTPException(422,'طلبات مكررة')
    try:
        results=[review_request(mid,qid,Review(action=p.action,note=p.note),request,db,commit=False)['request'] for qid in sorted(p.ids)];db.commit()
        return {'ok':True,'requests':results}
    except Exception:db.rollback();raise

def week_summary(rows,db=None):
    present=[r for r in rows if r.attendance in ATTENDED]
    legacy_scores=[r.memorization_score for r in present if r.memorization_score is not None]
    scores=[];daily=None;has_legacy=False
    if db is not None:
        from app.models.scoring64 import DailyScoringPolicy52
        from app.services.scoring64 import evaluation_pack52,evaluation_summary52
        daily=evaluation_summary52(db,rows)
        policy=None
        if rows:
            student=db.get(HalaqaStudent,rows[0].student_id)
            ring=db.get(Halaqa,student.halaqa_id)
            policy=db.get(DailyScoringPolicy52,ring.mosque_id)
        for row in present:
            evaluation=evaluation_pack52(db,row)
            if evaluation['state']=='complete':scores.append(evaluation['total'])
            elif (policy is None or row.day<policy.activated_on) and row.memorization_score is not None:
                scores.append(row.memorization_score);has_legacy=True
    else:scores=legacy_scores;has_legacy=bool(scores)
    return {'recorded_days':len(rows),'present':sum(r.attendance=='present' for r in rows),'absent':sum(r.attendance=='absent' for r in rows),
      'excused':sum(r.attendance=='excused' for r in rows),'permission':sum(r.attendance=='permission' for r in rows),
      'attendance_percent':round(100*len(present)/len([r for r in rows if r.attendance in ('present','permission','absent')]),1) if any(r.attendance in ('present','permission','absent') for r in rows) else None,
      'score':round(sum(scores)/len(scores),1) if scores else None,
      'legacy_score':round(sum(legacy_scores)/len(legacy_scores),1) if legacy_scores else None,
      'score_basis':'mixed' if daily and daily['evaluations_complete'] and has_legacy else 'daily10' if daily and daily['evaluations_complete'] else 'legacy' if has_legacy else None,
      'daily_evaluation52':daily,
      'memorized':{unit:sum(r.memorized_amount for r in present if r.memorized_unit==unit) for unit in ('page','ayah')},
      'revision':{unit:sum(r.revision_amount for r in present if r.revision_unit==unit) for unit in ('page','ayah')}}

@router.get('/mosques/{mid}/students/{sid}/weekly')
def weekly(mid:int,sid:int,request:Request,end:date | None=None,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    _,s=evaluation_access52(db,request,mid,sid)
    end=end or today()
    if end>today():raise HTTPException(422,'اختر تاريخًا حتى اليوم')
    start=end-timedelta(days=6)
    rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==sid,HalaqaProgress.day>=start-timedelta(days=7),HalaqaProgress.day<=end).order_by(HalaqaProgress.day)).all()
    current=week_summary([r for r in rows if r.day>=start],db);previous=week_summary([r for r in rows if r.day<start],db)
    next_task=db.scalar(select(Assignment).where(Assignment.student_id==sid,Assignment.status=='pending').order_by(Assignment.due,Assignment.id))
    return {'student':s.full_name,'from':str(start),'to':str(end),'current':current,'previous':previous,
      'score_change':round(current['score']-previous['score'],1) if current['score'] is not None and previous['score'] is not None else None,
      'next':{'due':str(next_task.due),'memorization':next_task.memorization,'revision':next_task.revision,'instructions':next_task.instructions} if next_task else None,
      'notes':[{'day':str(r.day),'note':r.notes} for r in rows if r.day>=start and r.notes]}

class ActionInput(Input):
    assigned_to:int
    title:str=Field(min_length=2,max_length=180)
    due:date
class ActionResult(Input):
    status:Literal['open','done']
    outcome:str=Field('',max_length=2000)

@router.get('/mosques/{mid}/students/{sid}/actions')
def actions(mid:int,sid:int,request:Request,db=Depends(get_db)):
    u,s=access_student(db,request,mid,sid,True)
    staff=[{'id':t.id,'name':t.full_name} for t in db.scalars(select(User).where(User.active.is_(True),User.role.in_(['owner',SUPERVISOR_ROLE,TEACHER_ROLE]))) if s.halaqa_id in _ring_ids_for(t,mid,db)]
    rows=db.scalars(select(FollowAction34).where(FollowAction34.student_id==sid).order_by(FollowAction34.id.desc()))
    return {'staff':staff,'actions':[{'id':r.id,'title':r.title,'assigned_to':r.assigned_to,'assignee':db.get(User,r.assigned_to).full_name,'due':str(r.due),'status':r.status,'outcome':r.outcome,'overdue':r.status=='open' and r.due<today()} for r in rows]}

@router.post('/mosques/{mid}/students/{sid}/actions')
def add_action(mid:int,sid:int,p:ActionInput,request:Request,db=Depends(get_db)):
    u,s=access_student(db,request,mid,sid,True);t=db.get(User,p.assigned_to)
    if p.due<today():raise HTTPException(422,'موعد المتابعة يبدأ من اليوم')
    if not t or not t.active or t.role not in ('owner',SUPERVISOR_ROLE,TEACHER_ROLE) or s.halaqa_id not in _ring_ids_for(t,mid,db):raise HTTPException(422,'المسؤول خارج نطاق الحلقة')
    r=FollowAction34(student_id=sid,created_by=u.id,**p.model_dump());db.add(r);db.flush();audit(db,u.id,mid,'follow_action_created_v34',str(r.id));db.commit();return {'ok':True}

@router.put('/mosques/{mid}/students/{sid}/actions/{aid}')
def result_action(mid:int,sid:int,aid:int,p:ActionResult,request:Request,db=Depends(get_db)):
    u,_=access_student(db,request,mid,sid,True)
    r=db.get(FollowAction34,aid)
    if not r or r.student_id!=sid:raise HTTPException(404,'الإجراء غير متاح')
    if u.role==TEACHER_ROLE and r.assigned_to!=u.id:raise HTTPException(403,'تسجيل النتيجة للمسؤول عن الإجراء')
    if p.status=='done' and not p.outcome.strip():raise HTTPException(422,'اكتب نتيجة المتابعة قبل إغلاقها')
    r.status=p.status;r.outcome=p.outcome;audit(db,u.id,mid,'follow_action_updated_v34',str(aid));db.commit();return {'ok':True}

class SubscriptionInput(Input):
    start:date
    end:date
    amount:Decimal=Field(ge=0,le=999999999,decimal_places=2,allow_inf_nan=False)
    paid:Decimal=Field(ge=0,le=999999999,decimal_places=2,allow_inf_nan=False)
    @model_validator(mode='after')
    def dates(self):
        if self.end<self.start or self.paid>self.amount:raise ValueError('تحقق من التواريخ والمبلغ المسدد')
        return self
class RenewalInput(Input):
    end:date
    note:str=Field('',max_length=1000)
class RenewalReview(Input):action:Literal['approve','reject']

@router.get('/mosques/{mid}/subscription')
def subscription(mid:int,request:Request,db=Depends(get_db)):
    _require(request,db,mid,MANAGERS);r=db.get(Subscription34,mid)
    from app.api.service64 import ComplexProfile32
    legacy=db.get(ComplexProfile32,mid)
    value={'start':str(r.start),'end':str(r.end),'amount':str(r.amount),'paid':str(r.paid),'remaining':str(r.amount-r.paid)} if r else None
    end=r.end if r else date.fromisoformat(legacy.renewal_date) if legacy and legacy.renewal_date else None
    state='unregistered' if not end else 'expired' if end<today() else 'expiring' if end<=today()+timedelta(days=30) else 'active'
    if r and r.start>today():state='upcoming'
    return {'subscription':value,'status':state,'end':str(end) if end else '', 'requests':[{'id':x.id,'end':str(x.end),'note':x.note,'status':x.status} for x in db.scalars(select(Renewal34).where(Renewal34.mosque_id==mid).order_by(Renewal34.id.desc()))]}

@router.put('/mosques/{mid}/subscription')
def save_subscription(mid:int,p:SubscriptionInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});r=db.get(Subscription34,mid)
    if not r:r=Subscription34(mosque_id=mid);db.add(r)
    for k,v in p.model_dump().items():setattr(r,k,v)
    from app.api.service64 import ComplexProfile32
    old=db.get(ComplexProfile32,mid)
    if not old:old=ComplexProfile32(mosque_id=mid);db.add(old)
    old.subscription_date=str(p.start);old.renewal_date=str(p.end)
    audit(db,u.id,mid,'subscription_saved_v34',str(mid));db.commit();return {'ok':True}

@router.post('/mosques/{mid}/renewals')
def renew(mid:int,p:RenewalInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS);sub=db.get(Subscription34,mid)
    if p.end<=today() or (sub and p.end<=sub.end):raise HTTPException(422,'اختر تاريخ تجديد لاحقًا')
    if db.scalar(select(Renewal34.id).where(Renewal34.mosque_id==mid,Renewal34.status=='pending')):raise HTTPException(409,'يوجد طلب تجديد بانتظار الموافقة')
    r=Renewal34(mosque_id=mid,created_by=u.id,**p.model_dump());db.add(r);db.flush();audit(db,u.id,mid,'renewal_requested_v34',str(r.id));db.commit();return {'ok':True}

@router.post('/mosques/{mid}/renewals/{rid}/review')
def review_renewal(mid:int,rid:int,p:RenewalReview,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});r=db.scalar(select(Renewal34).where(Renewal34.id==rid,Renewal34.mosque_id==mid).with_for_update())
    if not r:raise HTTPException(404,'الطلب غير موجود')
    if r.status!='pending':raise HTTPException(409,'تمت معالجة الطلب')
    if p.action=='approve':
        sub=db.get(Subscription34,mid)
        if not sub:raise HTTPException(422,'سجل الاشتراك ومبالغه قبل الموافقة')
        if r.end<=max(sub.end,today()):raise HTTPException(409,'تاريخ الطلب لم يعد لاحقًا')
        sub.end=r.end
        from app.api.service64 import ComplexProfile32
        old=db.get(ComplexProfile32,mid)
        if old:old.renewal_date=str(r.end)
    r.status='approved' if p.action=='approve' else 'rejected';audit(db,u.id,mid,'renewal_'+r.status+'_v34',str(rid));db.commit();return {'ok':True}

@router.get('/mosques/{mid}/ring-comparison')
def comparison(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,MANAGERS);ids=_ring_ids_for(u,mid,db);out=[]
    for ring in db.scalars(select(Halaqa).where(Halaqa.id.in_(ids),Halaqa.active.is_(True))):
        students=db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id==ring.id,HalaqaStudent.active.is_(True))).all()
        levels=[]
        for level in sorted({s.level for s in students}):
            cohort=[s for s in students if s.level==level];sids=[s.id for s in cohort]
            rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id.in_(sids),HalaqaProgress.day>=today()-timedelta(days=29),HalaqaProgress.day<=today())).all()
            summaries=[week_summary([r for r in rows if r.student_id==s.id],db) for s in cohort]
            attend=[x['attendance_percent'] for x in summaries if x['attendance_percent'] is not None];scores=[x['score'] for x in summaries if x['score'] is not None]
            levels.append({'level':level,'students':len(cohort),'assessed_students':len(scores),'attendance':round(sum(attend)/len(attend),1) if attend else None,'score':round(sum(scores)/len(scores),1) if scores else None})
        out.append({'id':ring.id,'name':ring.name,'students':len(students),'levels':levels})
    return {'rings':out,'method':'آخر 30 يومًا؛ المقارنة حسب المستوى، ومتوسط كل طالب بوزن متساوٍ. لا تدخل البيانات غير المسجلة في المتوسط.'}
