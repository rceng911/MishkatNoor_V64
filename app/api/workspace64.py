from app.services.attendance64 import ATTENDED
from datetime import timedelta,date
import json,math
from fastapi import APIRouter,Depends,Request,HTTPException,Query
from pydantic import Field
from sqlalchemy import select,or_
from app.db.session import get_db
from app.models import User,Halaqa,HalaqaTeacher,HalaqaStudent,HalaqaProgress,StudentPlan,Assignment,HalaqaChangeRequest,HalaqaAccountRequest
from app.models.accounts64 import AccountRequest32
from app.api.halaqat import _require,_ring_ids_for,PORTAL_ROLES,STUDENT_ROLE,SUPERVISOR_ROLE,Input,ProgressInput
from app.api.student_file import access_student,today
from app.api.development import active_students
from app.api.routes import audit
from app.api.profile64 import child_pack,user_pack
from app.api.service64 import ServiceRequest32,can_review
from app.api.features64 import Admission34,Renewal34,FollowAction34
from app.services.history64 import ProgressRevision35,TransferHistory35,snapshot,fingerprint,FIELDS
from app.services.calendar import meeting_day

router=APIRouter(prefix='/api/v35/mosques/{mid}')

@router.get('/search')
def search(mid:int,request:Request,q:str=Query('',max_length=80),db=Depends(get_db)):
    u=_require(request,db,mid,PORTAL_ROLES);q=q.strip().casefold()
    if len(q)<2:return {'results':[]}
    students=active_students(db,u,mid);ids=_ring_ids_for(u,mid,db);out=[]
    for s in students:
        if q in s.full_name.casefold():out.append({'kind':'student','id':s.id,'name':s.full_name,'detail':db.get(Halaqa,s.halaqa_id).name,'route':'student/'+str(s.id)})
    for r in db.scalars(select(Halaqa).where(Halaqa.id.in_(ids),Halaqa.active.is_(True))):
        if q in r.name.casefold():out.append({'kind':'ring','id':r.id,'name':r.name,'detail':'حلقة ضمن نطاقك','route':'rings','ring_id':r.id})
    teachers=db.execute(select(User,Halaqa).join(HalaqaTeacher,HalaqaTeacher.user_id==User.id).join(Halaqa,Halaqa.id==HalaqaTeacher.halaqa_id).where(Halaqa.id.in_(ids),HalaqaTeacher.active.is_(True),User.active.is_(True),User.role=='halaqa_teacher')).all()
    for t,r in teachers:
        if q in t.full_name.casefold():out.append({'kind':'teacher','id':t.id,'name':t.full_name,'detail':r.name,'route':'rings','ring_id':r.id})
    return {'results':out[:40],'limited':len(out)>40}

def inbox_rows(db,u,mid):
    owner=u.role=='owner';manager=owner or u.role==SUPERVISOR_ROLE;ids=_ring_ids_for(u,mid,db);out=[]
    def add(kind,r,title,detail,actions,status=None):
        out.append({'key':kind+':'+str(r.id),'id':r.id,'kind':kind,'title':title,'detail':detail,'status':status or r.status,'actions':actions,'created_at':str(getattr(r,'created_at',''))})
    if manager:
        from app.api.workflow64 import rows
        for r in rows(db,u,mid):
            p=json.loads(r.payload);add('student_add',r,p['full_name'],db.get(Halaqa,r.ring_id).name+' · '+(p.get('username') or 'ملف دون حساب'),['approve','reject'] if owner and r.status=='pending' else [])
        for r in db.scalars(select(AccountRequest32).where(AccountRequest32.mosque_id==mid)):
            if owner or r.requested_by==u.id:add('account',r,r.full_name,r.username,['approve','return','reject'] if owner and r.status=='pending' else [])
        for r in db.scalars(select(Admission34).where(Admission34.mosque_id==mid,Admission34.ring_id.in_(ids))):add('admission',r,r.full_name,db.get(Halaqa,r.ring_id).name,['admit','reject'] if owner and r.status=='waiting' else [],'pending' if r.status=='waiting' else r.status)
        for r in db.scalars(select(Renewal34).where(Renewal34.mosque_id==mid)):add('renewal',r,'تجديد الاشتراك',str(r.end)+' · '+r.note,['approve','reject'] if owner and r.status=='pending' else [])
        from app.api.access import _request_item
        for r in db.scalars(select(HalaqaChangeRequest).where(HalaqaChangeRequest.mosque_id==mid)):
            if owner or r.requested_by==u.id:
                p=_request_item(r,db);add('change',r,p['action_label'],' · '.join(p['details']),['approve','reject'] if owner and r.status=='pending' else [])
        for r in db.scalars(select(HalaqaAccountRequest).where(HalaqaAccountRequest.mosque_id==mid)):
            if owner or r.requested_by==u.id:add('legacy',r,r.full_name,'طلب سابق · افتح تفاصيل الحساب لإتمامه',[])
    for r in db.scalars(select(ServiceRequest32).where(ServiceRequest32.mosque_id==mid)):
        review=can_review(r,u,db)
        if (r.author_id==u.id or review) and (r.kind!='enrollment' or manager):add(r.kind,r,r.title,r.description,['close','reject'] if review and r.status=='pending' and r.kind=='complaint' else ['approve','reject'] if review and r.status=='pending' else [])
    return sorted(out,key=lambda r:(r['status']!='pending',r['created_at']),reverse=False)

@router.get('/inbox')
def inbox(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,PORTAL_ROLES);rows=inbox_rows(db,u,mid)
    return {'requests':rows,'pending':sum(r['status']=='pending' for r in rows)}

@router.get('/today')
def daily(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,PORTAL_ROLES);students=active_students(db,u,mid);ids=[s.id for s in students];staff=u.role!=STUDENT_ROLE;tasks=[]
    def add(kind,title,route,detail='',student_id=None):tasks.append({'kind':kind,'title':title,'route':route,'detail':detail,'student_id':student_id})
    own=user_pack(db,u)
    if own['missing'] and u.role!='owner':add('profile','استكمل بياناتك الشخصية','personal-info','، '.join(own['missing']))
    rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id.in_(ids),HalaqaProgress.day==today())).all();by_sid={r.student_id:r for r in rows}
    for s in students:
        route='student/'+str(s.id);p=by_sid.get(s.id)
        if u.role=='halaqa_teacher' and meeting_day(db,s.halaqa_id,today()):
            if not p:add('attendance','تحضير '+s.full_name,route+'/evaluation','لم يسجل حضور اليوم',s.id)
            elif p.attendance in ATTENDED and getattr(p,'daily_evaluation52',None) is None:add('evaluation','تقييم '+s.full_name,route+'/evaluation','حاضر والتقييم اليومي والملاحظات بانتظار الاعتماد',s.id)
        missing=child_pack(db,s)['missing']
        if missing and not staff and u.account_type!='student':
            add('incomplete','الرجاء تعبئة بيانات '+s.full_name,'personal-info' if u.account_type=='student' else 'personal-child/'+str(s.id),'، '.join(missing),s.id)
    for a in db.scalars(select(FollowAction34).where(FollowAction34.student_id.in_(ids),FollowAction34.status=='open',FollowAction34.due<=today())):
        if staff and a.assigned_to==u.id:add('followup',a.title,'student/'+str(a.student_id)+'/learning','موعد المتابعة: '+str(a.due),a.student_id)
    if not staff:
        for a in db.scalars(select(Assignment).where(Assignment.student_id.in_(ids),Assignment.status=='pending',Assignment.due<=today())):add('assignment','ورد '+db.get(HalaqaStudent,a.student_id).full_name,'student/'+str(a.student_id)+'/learning',str(a.due)+' · '+a.memorization,a.student_id)
    if u.role in ('owner',SUPERVISOR_ROLE):
        for r in inbox_rows(db,u,mid):
            if r['status']=='pending' and r['actions']:add('approval',r['title'],'accounts',r['detail'])
    priority={'approval':0,'attendance':1,'evaluation':2,'followup':3,'assignment':4,'profile':5,'incomplete':6}
    tasks.sort(key=lambda t:priority[t['kind']])
    counts={k:sum(t['kind']==k for t in tasks) for k in priority}
    return {'day':str(today()),'counts':counts,'tasks':tasks,'total':len(tasks)}

@router.get('/students/{sid}/history')
def history(mid:int,sid:int,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    u,s=evaluation_access52(db,request,mid,sid,True)
    rows=db.scalars(select(ProgressRevision35).where(ProgressRevision35.student_id==sid).order_by(ProgressRevision35.id.desc()).limit(100)).all()
    latest={};current={r.day:r for r in db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==sid))}
    result=[]
    for r in rows:
        first=r.day not in latest;latest[r.day]=r.id
        result.append({'id':r.id,'day':str(r.day),'actor':db.get(User,r.actor_id).full_name,'at':r.created_at.isoformat()+'Z','reason':r.reason,'before':json.loads(r.before_json),'after':json.loads(r.after_json),'can_undo':first and fingerprint(snapshot(current.get(r.day)))==fingerprint(json.loads(r.after_json))})
    transfers=db.scalars(select(TransferHistory35).where(TransferHistory35.student_id==sid).order_by(TransferHistory35.id.desc())).all()
    return {'changes':result,'versions':{str(k):fingerprint(snapshot(v)) for k,v in current.items()},'transfers':[{'from':r.source_name,'to':r.target_name,'at':r.created_at.isoformat()+'Z','approved_by':db.get(User,r.approved_by).full_name} for r in transfers]}

class Correction(Input):
    expected:str=Field(min_length=64,max_length=64)
    reason:str=Field(min_length=3,max_length=500)
    progress:ProgressInput
class Undo(Input):reason:str=Field(min_length=3,max_length=500)

@router.put('/students/{sid}/progress/{pid}')
def correct(mid:int,sid:int,pid:int,p:Correction,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    u,_=evaluation_access52(db,request,mid,sid,True)
    r=db.scalar(select(HalaqaProgress).where(HalaqaProgress.id==pid,HalaqaProgress.student_id==sid).with_for_update())
    if not r:raise HTTPException(404,'السجل غير موجود')
    if p.progress.day!=r.day or fingerprint(snapshot(r))!=p.expected:raise HTTPException(409,'تغير السجل؛ حدّث الملف قبل التصحيح')
    from app.services.calendar import resolved_attendance
    db.info['progress_reason35']=p.reason
    for k in FIELDS:setattr(r,k,getattr(p.progress,k))
    r.attendance=resolved_attendance(db,sid,r.day,r.attendance)
    audit(db,u.id,mid,'progress_corrected_v35',str(pid));db.commit();return {'ok':True}

@router.post('/students/{sid}/history/{hid}/undo')
def undo(mid:int,sid:int,hid:int,p:Undo,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    u,_=evaluation_access52(db,request,mid,sid,True);h=db.get(ProgressRevision35,hid)
    if not h or h.student_id!=sid:raise HTTPException(404,'التعديل غير موجود')
    latest=db.scalar(select(ProgressRevision35.id).where(ProgressRevision35.student_id==sid,ProgressRevision35.day==h.day).order_by(ProgressRevision35.id.desc()))
    r=db.scalar(select(HalaqaProgress).where(HalaqaProgress.student_id==sid,HalaqaProgress.day==h.day).with_for_update())
    if latest!=hid or fingerprint(snapshot(r))!=fingerprint(json.loads(h.after_json)):raise HTTPException(409,'يوجد تعديل أحدث؛ حدّث السجل قبل التراجع')
    before=json.loads(h.before_json)
    if before:
        from app.services.calendar import resolved_attendance
        if resolved_attendance(db,sid,h.day,before['attendance'])!=before['attendance']:raise HTTPException(409,'يوجد عذر معتمد لهذا اليوم؛ صحح السجل بما يطابق العذر')
    db.info['progress_reason35']='تراجع: '+p.reason
    if before is None:
        if r:db.delete(r)
    else:
        if r is None:r=HalaqaProgress(student_id=sid,day=h.day,created_by=u.id);db.add(r)
        for k in FIELDS:setattr(r,k,before[k])
        from app.services.scoring64 import restore_evaluation52
        restore_evaluation52(db,r,before.get('daily_evaluation52'))
        db.info.setdefault('evaluation_write52',set()).add(r.id)
    audit(db,u.id,mid,'progress_undo_v35',str(hid));db.commit();return {'ok':True}

@router.get('/students/{sid}/plan-insight')
def insight(mid:int,sid:int,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    _,s=evaluation_access52(db,request,mid,sid);plan=db.get(StudentPlan,sid)
    if not plan:return {'weeks':[],'suggestion':None,'message':'حدد خطة الحفظ والمراجعة أولًا'}
    start=today()-timedelta(days=(today().weekday()+1)%7)
    rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==sid,HalaqaProgress.day>=start-timedelta(days=21),HalaqaProgress.day<=today())).all()
    weeks=[]
    for n in range(4):
        a=start-timedelta(days=7*n);b=a+timedelta(days=6);group=[r for r in rows if a<=r.day<=b];present=[r for r in group if r.attendance in ATTENDED]
        mem=sum(r.memorized_amount for r in present if r.memorized_unit==plan.memorization_unit);rev=sum(r.revision_amount for r in present if r.revision_unit==plan.revision_unit)
        target=plan.memorization_amount*plan.sessions_per_week;rt=plan.revision_amount*plan.sessions_per_week
        weeks.append({'from':str(a),'to':str(min(b,today())),'complete':b<today(),'recorded_days':len(group),'memorization':round(mem,2),'memorization_target':round(target,2),'memorization_percent':round(100*mem/target,1),'revision':round(rev,2),'revision_target':round(rt,2),'revision_percent':round(100*rev/rt,1)})
    evidence=[w for w in weeks if w['complete'] and w['recorded_days']>=plan.sessions_per_week]
    suggestion=None
    if len(evidence)>=2:
        rate=sum(w['memorization_percent'] for w in evidence)/len(evidence);factor=.8 if rate<65 else 1.1 if rate>=110 else None
        if factor:
            value=max(1,round(plan.memorization_amount*factor)) if plan.memorization_unit=='ayah' else max(.5,round(plan.memorization_amount*factor*2)/2)
            value=min(1000,value)
            if value!=plan.memorization_amount:suggestion={'memorization_amount':value,'reason':'اقتراح للمراجعة بناءً على '+str(len(evidence))+' أسابيع مكتملة التسجيل؛ متوسط تحقيق الحفظ '+str(round(rate,1))+'%. يعتمد التطبيق على مراجعة المعلم وحفظه.'}
    return {'weeks':weeks,'memorization_unit':plan.memorization_unit,'revision_unit':plan.revision_unit,'suggestion':suggestion,'message':'المقارنة حسب الخطة الحالية ووحدة القياس نفسها. الأسبوع الحالي لم يكتمل، والسجلات الناقصة لا تستخدم لاقتراح تغيير الخطة.'}
