from app.services.attendance64 import ATTENDED
"""Owner-reviewed enrollments and per-supervisor dismissal of data reminders."""
import hashlib,json
from datetime import datetime
from fastapi import APIRouter,Request,Depends,HTTPException
from sqlalchemy import select,String,Text,ForeignKey,DateTime,UniqueConstraint
from sqlalchemy.orm import Mapped,mapped_column
from app.db.session import Base,get_db
from app.models import User,Halaqa,HalaqaStudent,HalaqaProgress
from app.api.halaqat import Input,_require,_ring_ids_for,SUPERVISOR_ROLE,_clean_username,_ensure_username
from app.api.routes import audit
from app.api.profile64 import child_pack
from typing import Literal

router=APIRouter(prefix='/api/v37/mosques/{mid}')

def supervisor_summary(db,s):
    from app.api.student_file import today
    from datetime import timedelta
    from app.models.scoring64 import DailyScoringPolicy52
    from app.services.scoring64 import evaluation_pack52
    from app.services.calendar import resolved_attendance
    progress=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==s.id,HalaqaProgress.day>=today()-timedelta(days=29),HalaqaProgress.day<=today())).all()
    ring=db.get(Halaqa,s.halaqa_id);policy=db.get(DailyScoringPolicy52,ring.mosque_id)
    grades=[]
    for row in progress:
        if resolved_attendance(db,s.id,row.day,row.attendance) not in ATTENDED:continue
        evaluation=evaluation_pack52(db,row)
        if evaluation['state']=='complete':grades.append(evaluation['total'])
        elif policy is None or row.day<policy.activated_on:
            legacy=[score for score in (row.memorization_score,row.tajweed_score) if score is not None]
            if legacy:grades.append(sum(legacy)/len(legacy))
    return {'id':s.id,'name':s.full_name,'halaqa_id':s.halaqa_id,'ring':ring.name,'phone':s.phone,'guardian_phone':s.guardian_phone,'overall_rating':round(sum(grades)/len(grades),1) if grades else None}

@router.get('/reports.csv')
def summary_report(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE})
    import io,csv
    from fastapi.responses import Response
    from app.api.student_file import csv_safe
    out=io.StringIO();writer=csv.writer(out)
    owner=u.role=='owner' or getattr(u,'original_role','')=='owner'
    writer.writerow(['اسم الطالب','الحلقة'] if owner else ['اسم الطالب','الحلقة','التقييم العام من 10 (آخر 30 يومًا)','جوال الطالب','جوال ولي الأمر'])
    for s in db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id.in_(_ring_ids_for(u,mid,db)),HalaqaStudent.active.is_(True))):
        r=supervisor_summary(db,s);values=[r['name'],r['ring']]
        if not owner:values += [r['overall_rating'] if r['overall_rating'] is not None else 'لم يسجل',r['phone'],r['guardian_phone']]
        writer.writerow([csv_safe(x) for x in values])
    return Response('\ufeff'+out.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="students-summary.csv"'})

class EnrollmentRequest37(Base):
    __tablename__='enrollment_requests_v37'
    id:Mapped[int]=mapped_column(primary_key=True)
    mosque_id:Mapped[int]=mapped_column(ForeignKey('mosques.id'),index=True)
    ring_id:Mapped[int]=mapped_column(ForeignKey('halaqat.id'),index=True)
    requested_by:Mapped[int]=mapped_column(ForeignKey('users.id'))
    payload:Mapped[str]=mapped_column(Text)
    status:Mapped[str]=mapped_column(String(20),default='pending')
    student_id:Mapped[int|None]=mapped_column(ForeignKey('halaqa_students.id'),nullable=True)
    reviewed_by:Mapped[int|None]=mapped_column(ForeignKey('users.id'),nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class ReminderDismissal37(Base):
    __tablename__='reminder_dismissals_v37'
    __table_args__=(UniqueConstraint('user_id','student_id',name='uq_reminder_user_student37'),)
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)
    student_id:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    fingerprint:Mapped[str]=mapped_column(String(64))

def propose(db,actor,mid,rid,data):
    if data.account_mode=='create':
        _clean_username(data.username,required=True);_ensure_username(db,data.username)
    elif data.username:raise HTTPException(422,'اختر إصدار حساب لإدخال اسم المستخدم')
    payload=data.model_dump_json()
    if db.scalar(select(EnrollmentRequest37.id).where(EnrollmentRequest37.mosque_id==mid,EnrollmentRequest37.ring_id==rid,EnrollmentRequest37.payload==payload,EnrollmentRequest37.status=='pending')):
        raise HTTPException(409,'هذا الطلب مرفوع بالفعل وينتظر موافقة المالك')
    row=EnrollmentRequest37(mosque_id=mid,ring_id=rid,requested_by=actor.id,payload=payload)
    db.add(row);db.flush();audit(db,actor.id,mid,'enrollment_requested_v37',str(row.id));db.commit()
    return {'ok':True,'pending_approval':True,'request_id':row.id}

def rows(db,u,mid):
    ids=_ring_ids_for(u,mid,db)
    q=select(EnrollmentRequest37).where(EnrollmentRequest37.mosque_id==mid,EnrollmentRequest37.ring_id.in_(ids))
    if u.role!='owner':q=q.where(EnrollmentRequest37.requested_by==u.id)
    return db.scalars(q).all()

class Review37(Input):action:Literal['approve','reject']

@router.post('/enrollments/{qid}/review')
def review(mid:int,qid:int,p:Review37,request:Request,db=Depends(get_db)):
    owner=_require(request,db,mid,{'owner'})
    row=db.scalar(select(EnrollmentRequest37).where(EnrollmentRequest37.id==qid,EnrollmentRequest37.mosque_id==mid).with_for_update())
    if not row:raise HTTPException(404,'الطلب غير موجود')
    if row.status!='pending':raise HTTPException(409,'تمت معالجة الطلب سابقًا')
    result={'ok':True}
    if p.action=='approve':
        supervisor=db.get(User,row.requested_by);ring=db.get(Halaqa,row.ring_id)
        if not supervisor or not supervisor.active or supervisor.role!=SUPERVISOR_ROLE or supervisor.mosque_id!=mid or not ring or not ring.active or row.ring_id not in _ring_ids_for(supervisor,mid,db):
            raise HTTPException(409,'تغير نطاق المشرف أو الحلقة؛ لا يمكن اعتماد الطلب')
        from app.api.features64 import spaces
        if not spaces(db,row.ring_id)['available']:raise HTTPException(409,'الحلقة مكتملة؛ الطلب باقٍ بانتظار المعالجة')
        from app.api.release64 import Enrollment,enroll
        db.info['enrollment_review37']=True
        try:result=enroll(mid,row.ring_id,Enrollment.model_validate_json(row.payload),request,db)
        finally:db.info.pop('enrollment_review37',None)
        row.student_id=result['student_id']
    row.status='approved' if p.action=='approve' else 'rejected';row.reviewed_by=owner.id
    audit(db,owner.id,mid,'enrollment_'+row.status+'_v37',str(qid));db.commit();return result

def reminder(db,s):
    fields=child_pack(db,s)['missing']
    stamp=hashlib.sha256(json.dumps(fields,ensure_ascii=False).encode()).hexdigest()
    return fields,stamp

@router.get('/data-reminders')
def reminders(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE})
    if u.role!='halaqa_supervisor':return {'reminders':[]}
    ids=_ring_ids_for(u,mid,db);hidden={r.student_id:r.fingerprint for r in db.scalars(select(ReminderDismissal37).where(ReminderDismissal37.user_id==u.id))};out=[]
    for s in db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id.in_(ids),HalaqaStudent.active.is_(True))):
        fields,stamp=reminder(db,s)
        if fields and hidden.get(s.id)!=stamp:out.append({'student_id':s.id,'name':s.full_name,'missing':fields,'fingerprint':stamp})
    return {'reminders':out}

class Dismiss37(Input):fingerprint:str

@router.post('/data-reminders/{sid}/dismiss')
def dismiss(mid:int,sid:int,p:Dismiss37,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE});s=db.get(HalaqaStudent,sid)
    if u.role!=SUPERVISOR_ROLE or not s or not s.active or s.halaqa_id not in _ring_ids_for(u,mid,db):raise HTTPException(404,'التنبيه غير متاح')
    fields,stamp=reminder(db,s)
    if p.fingerprint!=stamp:raise HTTPException(409,'تغيرت البيانات؛ حدّث التنبيهات')
    row=db.scalar(select(ReminderDismissal37).where(ReminderDismissal37.user_id==u.id,ReminderDismissal37.student_id==sid))
    if not row:row=ReminderDismissal37(user_id=u.id,student_id=sid);db.add(row)
    row.fingerprint=stamp;db.commit();return {'ok':True}
