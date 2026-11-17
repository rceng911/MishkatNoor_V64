from app.services.attendance64 import ATTENDED
"""Scoped engagement summaries, monthly ring points and reviewed report snapshots."""
import calendar, hashlib, json, secrets
from typing import Literal
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import Field, field_validator
from sqlalchemy import select, func, ForeignKey, String, Text, DateTime, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.exc import IntegrityError
from app.db.session import Base, get_db
from app.models import (User, Mosque, Halaqa, HalaqaStudent, HalaqaProgress, Assignment,
    AbsenceExcuse, OrganizedExam, QuranRecord, CompletionGoal)
from app.api.halaqat import Input, _require, _actor, _ring_ids_for, PORTAL_ROLES, TEACHER_ROLE, SUPERVISOR_ROLE, STUDENT_ROLE
from app.api.student_file import access_student, today
from app.api.development import active_students
from app.api.routes import audit
from app.api.features64 import Subscription34, weekly
from app.services.calendar import resolved_attendance, meeting_day

router=APIRouter(prefix='/api/v38')

class PointPolicy38(Base):
    __tablename__='point_policies_v38'
    __table_args__=(UniqueConstraint('mosque_id','month'),)
    id:Mapped[int]=mapped_column(primary_key=True)
    mosque_id:Mapped[int]=mapped_column(ForeignKey('mosques.id'))
    month:Mapped[str]=mapped_column(String(7))
    attendance:Mapped[int]=mapped_column(default=2)
    completion:Mapped[int]=mapped_column(default=5)

class PointAdjustment38(Base):
    __tablename__='point_adjustments_v38'
    id:Mapped[int]=mapped_column(primary_key=True)
    ring_id:Mapped[int]=mapped_column(ForeignKey('halaqat.id'),index=True)
    month:Mapped[str]=mapped_column(String(7),index=True)
    delta:Mapped[int]=mapped_column(Integer)
    reason:Mapped[str]=mapped_column(String(500))
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id'))
    token:Mapped[str]=mapped_column(String(64),unique=True)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class ReportPreview38(Base):
    __tablename__='report_previews_v38'
    token:Mapped[str]=mapped_column(String(64),primary_key=True)
    student_id:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id'))
    phone:Mapped[str]=mapped_column(String(16))
    payload:Mapped[str]=mapped_column(Text)
    fingerprint:Mapped[str]=mapped_column(String(64))
    expires:Mapped[datetime]=mapped_column(DateTime)
    job_id:Mapped[int|None]=mapped_column(ForeignKey('whatsapp_jobs_v34.id'),nullable=True,unique=True)

def period(month):
    try:
        start=date.fromisoformat(month+'-01')
        if len(month)!=7 or not 2020<=start.year<=2100:raise ValueError()
    except ValueError:raise HTTPException(422,'اختر شهرًا صحيحًا')
    return start,start.replace(day=calendar.monthrange(start.year,start.month)[1])

def weights(db,mid,month):
    p=db.scalar(select(PointPolicy38).where(PointPolicy38.mosque_id==mid,PointPolicy38.month==month))
    return {'attendance':p.attendance if p else 2,'completion':p.completion if p else 5}

from app.services.scoring64 import rules60, MonthlyRules60, SOURCES60

def legacy_points38(mid:int,request:Request,month:str,db):
    u=_require(request,db,mid,PORTAL_ROLES);month=month or today().strftime('%Y-%m');start,end=period(month)
    ids=_ring_ids_for(u,mid,db);w=weights(db,mid,month);rows=[]
    # Counts use each circle's current membership, including archived files. Corrections
    # and transfers therefore recalculate rather than leave duplicated point awards.
    for ring in db.scalars(select(Halaqa).where(Halaqa.id.in_(ids),Halaqa.active.is_(True))):
        sids=list(db.scalars(select(HalaqaStudent.id).where(HalaqaStudent.halaqa_id==ring.id)))
        attendance=db.scalar(select(func.count(HalaqaProgress.id)).where(HalaqaProgress.student_id.in_(sids),HalaqaProgress.day>=start,HalaqaProgress.day<=min(end,today()),HalaqaProgress.attendance.in_(ATTENDED)))
        done=db.scalar(select(func.count(Assignment.id)).where(Assignment.student_id.in_(sids),Assignment.due>=start,Assignment.due<=min(end,today()),Assignment.status=='completed'))
        manual=db.scalar(select(func.coalesce(func.sum(PointAdjustment38.delta),0)).where(PointAdjustment38.ring_id==ring.id,PointAdjustment38.month==month))
        auto=attendance*w['attendance']+done*w['completion']
        rows.append({'id':ring.id,'name':ring.name,'attendance_count':attendance,'completion_count':done,'automatic':auto,'manual':manual,'total':auto+manual})
    rows.sort(key=lambda r:(-r['total'],r['name'],r['id']))
    for r in rows:r['rank']=1+sum(x['total']>r['total'] for x in rows)
    manager=u.role in ('owner',SUPERVISOR_ROLE)
    logs=[]
    if manager:
        for a in db.scalars(select(PointAdjustment38).where(PointAdjustment38.ring_id.in_(ids),PointAdjustment38.month==month).order_by(PointAdjustment38.id.desc()).limit(100)):
            logs.append({'id':a.id,'ring':db.get(Halaqa,a.ring_id).name,'delta':a.delta,'reason':a.reason,'actor':db.get(User,a.actor_id).full_name,'at':a.created_at.isoformat()+'Z'})
    return {'month':month,'criteria':rules60(db,mid,month),'policy':w,'rings':rows,'adjustments':logs,'can_adjust':u.role==SUPERVISOR_ROLE,'can_configure':u.role=='owner'}


@router.get('/mosques/{mid}/points')
def points(mid:int,request:Request,month:str=Query('',max_length=7),system:Literal['daily10','legacy']='daily10',db=Depends(get_db)):
    from app.models.scoring64 import DailyScoringPolicy52
    from app.services.scoring64 import RUBRIC52,ring_month52
    u=_require(request,db,mid,PORTAL_ROLES)
    month=month or today().strftime('%Y-%m');start,end=period(month)
    legacy=legacy_points38(mid,request,month,db)
    activation=db.get(DailyScoringPolicy52,mid)
    effective='legacy' if system=='legacy' or (activation and end<activation.activated_on) else 'daily10'
    if effective=='legacy':
        return legacy | {'system':'legacy','requested_system':system,'activated_on':str(activation.activated_on) if activation else None,'legacy':legacy}
    ids=_ring_ids_for(u,mid,db);cache={}
    rings=[ring_month52(db,ring,month,today(),cache) for ring in db.scalars(select(Halaqa).where(Halaqa.id.in_(ids),Halaqa.active.is_(True)))]
    old_by_id={row['id']:row for row in legacy['rings']}
    for row in rings:
        row['legacy']=old_by_id.get(row['id'])
        row['manual']=0
        # A manual v38 adjustment remains visible in legacy and never changes a
        # student's ten-point grade or the relative daily competition.
    from fractions import Fraction
    ratios={r['id']:Fraction(str(r['total']))/r['maximum'] for r in rings if r['maximum']}
    rings.sort(key=lambda r:(r['id'] not in ratios,-ratios.get(r['id'],0),r['name'],r['id']))
    for row in rings:
        ratio=ratios.get(row['id'])
        row['rank']=None if ratio is None else 1+sum(value>ratio for value in ratios.values())
    return {'month':month,'criteria':rules60(db,mid,month),'system':'daily10','requested_system':system,
            'activated_on':str(activation.activated_on) if activation else None,'policy':RUBRIC52['weights'],
            'rubric':RUBRIC52,'ranking_basis':'earned_over_maximum','rings':rings,'legacy':legacy,
            'adjustments':legacy['adjustments'],'can_adjust':legacy['can_adjust'],'can_configure':legacy['can_configure']}

class Criterion60(Input):
    label:str=Field(min_length=1,max_length=64)
    source:str
    weight:int=Field(ge=0,le=10,strict=True)

class RulesInput60(Input):
    month:str
    items:list[Criterion60]=Field(min_length=1,max_length=20)

@router.put('/mosques/{mid}/points/rules60')
def save_rules60(mid:int,p:RulesInput60,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'})
    period(p.month)
    if p.month<today().strftime('%Y-%m') or sum(x.weight for x in p.items)!=10:
        raise HTTPException(422,'اختر الشهر الحالي أو القادم واجعل مجموع النقاط ١٠')
    if any(x.source not in SOURCES60 or not x.label.strip() for x in p.items):
        raise HTTPException(422,'تحقق من اسم البند وأساس احتسابه')
    db.merge(MonthlyRules60(mosque_id=mid,month=p.month,items=[x.model_dump() for x in p.items]))
    audit(db,u.id,mid,'monthly_rules60',json.dumps(p.model_dump(),ensure_ascii=False))
    db.commit()
    db.info.pop(('rules60',mid,p.month),None)
    return {'ok':True}

class PolicyInput(Input):
    month:str=Field(pattern=r'^\d{4}-\d{2}$')
    attendance:int=Field(ge=0,le=100)
    completion:int=Field(ge=0,le=100)

@router.put('/mosques/{mid}/points/policy')
def policy(mid:int,p:PolicyInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});period(p.month)
    if p.month<today().strftime('%Y-%m'):raise HTTPException(422,'قواعد الأشهر الماضية للقراءة فقط')
    row=db.scalar(select(PointPolicy38).where(PointPolicy38.mosque_id==mid,PointPolicy38.month==p.month))
    if not row:row=PointPolicy38(mosque_id=mid,month=p.month);db.add(row)
    row.attendance=p.attendance;row.completion=p.completion
    audit(db,u.id,mid,'point_policy_v38',json.dumps(p.model_dump()));db.commit();return {'ok':True}

class AdjustmentInput(Input):
    month:str=Field(pattern=r'^\d{4}-\d{2}$')
    delta:int=Field(ge=-10000,le=10000)
    reason:str=Field(min_length=3,max_length=500)
    token:str=Field(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    @field_validator('reason')
    @classmethod
    def reason_required(cls,v):
        if len(v.strip())<3:raise ValueError('اكتب سبب التعديل')
        return v.strip()

@router.post('/mosques/{mid}/rings/{rid}/points')
def adjust(mid:int,rid:int,p:AdjustmentInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE})
    if u.role!=SUPERVISOR_ROLE:raise HTTPException(403,'تعديل النقاط لمشرف المجمع')
    if rid not in _ring_ids_for(u,mid,db):raise HTTPException(404,'الحلقة خارج نطاقك')
    period(p.month)
    if p.month!=today().strftime('%Y-%m') or p.delta==0:raise HTTPException(422,'التعديل غير الصفري للشهر الحالي فقط')
    def duplicate(row):
        if (row.actor_id,row.ring_id,row.month,row.delta,row.reason)!=(u.id,rid,p.month,p.delta,p.reason):raise HTTPException(409,'تعارض الطلب؛ حدّث الصفحة')
        return {'ok':True,'id':row.id}
    old=db.scalar(select(PointAdjustment38).where(PointAdjustment38.token==p.token))
    if old:return duplicate(old)
    row=PointAdjustment38(ring_id=rid,actor_id=u.id,**p.model_dump());db.add(row)
    audit(db,u.id,mid,'ring_points_adjusted_v38',json.dumps({'ring':rid,**p.model_dump()},ensure_ascii=False))
    try:db.commit()
    except IntegrityError:
        db.rollback();old=db.scalar(select(PointAdjustment38).where(PointAdjustment38.token==p.token))
        if old:return duplicate(old)
        raise
    return {'ok':True,'id':row.id}

def disengaged(db,s):
    rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==s.id,HalaqaProgress.day>=today()-timedelta(days=29),HalaqaProgress.day<=today()).order_by(HalaqaProgress.day.desc()).limit(3)).all()
    return len(rows)==3 and all(resolved_attendance(db,s.id,r.day,r.attendance)=='absent' for r in rows)

@router.get('/mosques/{mid}/engagement')
def engagement(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,PORTAL_ROLES)
    if u.role=='owner' or getattr(u,'original_role','')=='owner':return {'absences':[],'exams':[],'excuses':[]}
    students=active_students(db,u,mid);sids=[s.id for s in students];absences=[];exams=[];excuses=[]
    if u.role in (TEACHER_ROLE,SUPERVISOR_ROLE):
        for s in students:
            if disengaged(db,s):
                if u.role==SUPERVISOR_ROLE:
                    from app.api.workflow64 import supervisor_summary
                    absences.append(supervisor_summary(db,s))
                else:absences.append({'id':s.id,'name':s.full_name,'halaqa_id':s.halaqa_id})
    if u.role in (TEACHER_ROLE,STUDENT_ROLE):
        for e in db.scalars(select(OrganizedExam).where(OrganizedExam.student_id.in_(sids),OrganizedExam.status=='scheduled',OrganizedExam.due>=today()-timedelta(days=7),OrganizedExam.due<=today()+timedelta(days=7)).order_by(OrganizedExam.due)):
            exams.append({'id':e.id,'student_id':e.student_id,'name':db.get(HalaqaStudent,e.student_id).full_name,'title':e.title,'syllabus':e.syllabus,'due':str(e.due),'overdue':e.due<today()})
        for x in db.scalars(select(AbsenceExcuse).where(AbsenceExcuse.student_id.in_(sids),AbsenceExcuse.status=='pending')):
            excuses.append({'id':x.id,'student_id':x.student_id,'name':db.get(HalaqaStudent,x.student_id).full_name,'day':str(x.day),'reason':x.reason})
    return {'absences':absences,'exams':exams,'excuses':excuses}

@router.get('/mosques/{mid}/students/{sid}/badges')
def badges(mid:int,sid:int,request:Request,db=Depends(get_db)):
    u,s=access_student(db,request,mid,sid)
    if u.role not in (TEACHER_ROLE,STUDENT_ROLE):raise HTTPException(403,'إنجازات الطالب للمعلم والأسرة')
    from app.services.quran_catalog import SURAH_NAMES
    out=[];start=today()-timedelta(days=6)
    days=[start+timedelta(days=i) for i in range(7) if meeting_day(db,s.halaqa_id,start+timedelta(days=i))]
    recorded={r.day:r.attendance for r in db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==sid,HalaqaProgress.day>=start,HalaqaProgress.day<=today()))}
    if days and all(recorded.get(day) in ATTENDED for day in days):out.append('أسبوع حضور كامل')
    for q in db.scalars(select(QuranRecord).where(QuranRecord.student_id==sid,QuranRecord.status.in_(['memorized','consolidation','revision']))):out.append('أتم سورة '+SURAH_NAMES[q.surah-1])
    g=db.get(CompletionGoal,sid)
    if g and g.completed>=g.target:out.append('حقق هدفه: '+g.title)
    return {'badges':out,'goal':{'title':g.title,'percent':round(100*g.completed/g.target,1),'deadline':str(g.deadline)} if g else None}

@router.get('/owner-summary')
def owner_summary(request:Request,db=Depends(get_db)):
    u=_actor(request,db)
    if u.role!='owner':raise HTTPException(403,'ملخص الإدارة للمالك')
    from app.api.workspace64 import inbox_rows
    complexes=list(db.scalars(select(Mosque)))
    subscriptions=[]
    for x in db.scalars(select(Subscription34).where(Subscription34.end<=today()+timedelta(days=30))):
        subscriptions.append({'name':db.get(Mosque,x.mosque_id).name,'end':str(x.end),'expired':x.end<today()})
    return {'complexes':len(complexes),'rings':db.scalar(select(func.count(Halaqa.id)).where(Halaqa.active.is_(True))),
        'accounts':db.scalar(select(func.count(User.id)).where(User.active.is_(True))),
        'pending':sum(r['status']=='pending' for m in complexes for r in inbox_rows(db,u,m.id)), 'subscriptions':subscriptions}

def preview_access(db,request,mid,sid,send=False):
    u,s=access_student(db,request,mid,sid)
    if u.role not in ((TEACHER_ROLE,) if send else (TEACHER_ROLE,STUDENT_ROLE)):raise HTTPException(403,'معاينة التقرير للأسرة ومعلم الحلقة، والإرسال للمعلم')
    return u,s

def preview_content(db,request,mid,sid):
    from app.api.whatsapp64 import WhatsAppRecipient34,parameters
    r=db.get(WhatsAppRecipient34,sid)
    if not r or not r.opted_in or not r.phone:raise HTTPException(422,'احفظ رقم المستلم وموافقته أولًا')
    report=weekly(mid,sid,request,today(),db)
    # Use exactly the sanitized body parameters that are submitted to Meta.
    from app.api.whatsapp64 import body_parameters
    payload={'report':report,'parameters':body_parameters(report),'recipient':r.recipient,'phone':r.phone}
    encoded=json.dumps(payload,ensure_ascii=False,sort_keys=True)
    return payload,hashlib.sha256(encoded.encode()).hexdigest()

@router.post('/mosques/{mid}/students/{sid}/whatsapp-preview')
def preview(mid:int,sid:int,request:Request,db=Depends(get_db)):
    u,s=preview_access(db,request,mid,sid);p,stamp=preview_content(db,request,mid,sid)
    row=ReportPreview38(token=secrets.token_urlsafe(32),student_id=sid,actor_id=u.id,phone=p['phone'],payload=json.dumps(p,ensure_ascii=False),fingerprint=stamp,expires=datetime.utcnow()+timedelta(minutes=10));db.add(row);db.commit()
    from app.api.whatsapp64 import enabled
    return {'token':row.token,'student':s.full_name,'recipient':p['recipient'],'phone':p['phone'],'parameters':p['parameters'],'can_send':u.role==TEACHER_ROLE and enabled(db),'expires_minutes':10}

class ConfirmPreview(Input):token:str=Field(min_length=20,max_length=64)

@router.post('/mosques/{mid}/students/{sid}/whatsapp-confirm')
def confirm_preview(mid:int,sid:int,p:ConfirmPreview,request:Request,db=Depends(get_db)):
    u,_=preview_access(db,request,mid,sid,True)
    row=db.scalar(select(ReportPreview38).where(ReportPreview38.token==p.token).with_for_update())
    if not row or row.student_id!=sid or row.actor_id!=u.id:raise HTTPException(404,'المعاينة غير متاحة')
    from app.api.whatsapp64 import enabled,enqueue,WhatsAppJob34
    if row.job_id:
        j=db.get(WhatsAppJob34,row.job_id);return {'ok':True,'status':j.status}
    if row.expires<datetime.utcnow():raise HTTPException(409,'انتهت المعاينة؛ اعرض التقرير مجددًا')
    current,stamp=preview_content(db,request,mid,sid)
    if stamp!=row.fingerprint:raise HTTPException(409,'تغير التقرير أو المستلم؛ عاين النسخة الجديدة قبل الإرسال')
    if not enabled(db):raise HTTPException(422,'أكمل تفعيل واتساب أعمال أولًا')
    j=enqueue(db,sid,today())
    # Never replace a report already queued by a previous preview or the schedule.
    existing=db.scalar(select(ReportPreview38).where(ReportPreview38.job_id==j.id))
    if not existing and j.status=='pending':row.job_id=j.id
    audit(db,u.id,mid,'whatsapp_preview_confirmed_v38',str(j.id));db.commit()
    return {'ok':True,'status':j.status}
