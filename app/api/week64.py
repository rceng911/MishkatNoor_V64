from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import ForeignKey, select
from sqlalchemy.orm import Mapped, mapped_column
from app.api.halaqat import Input, _require, _ring_ids_for, SUPERVISOR_ROLE, TEACHER_ROLE
from app.api.student_file import access_student,today
from app.api.day64 import ClosedDay,summary
from app.db.session import Base,get_db,PrimarySession
from app.models import Halaqa,HalaqaStudent,HalaqaProgress,HalaqaTeacher,User
from app.services.attendance64 import ATTENDED
from app.services.calendar import meeting_day
from app.services.scoring64 import student_month52
from app.services.roster64 import arabic_order

router=APIRouter(prefix='/api/v56/mosques/{mid}')
def sunday(d):return d-timedelta(days=(d.weekday()+1)%7)

class Goal(Base):
    __tablename__='weekly_student_goals56'
    sid:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id',ondelete='CASCADE'),primary_key=True)
    week:Mapped[date]=mapped_column(primary_key=True)
    amount:Mapped[float]
    unit:Mapped[str]

class AlertTime(Base):
    __tablename__='circle_alert_time56'
    mid:Mapped[int]=mapped_column(ForeignKey('mosques.id',ondelete='CASCADE'),primary_key=True)
    clock:Mapped[str]

class Digest(Base):
    __tablename__='supervisor_digest56'
    uid:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    day:Mapped[date]=mapped_column(primary_key=True)
    body:Mapped[str]
    seen:Mapped[bool]=mapped_column(default=False)

class Target(Input):
    amount:float=Field(gt=0,le=10000,allow_inf_nan=False)
    unit:Literal['page','ayah']
class Clock(Input):
    clock:str=Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')

@router.put('/students/{sid}/goal')
def save_goal(mid:int,sid:int,week:date,data:Target,request:Request,db=Depends(get_db)):
    user,_=access_student(db,request,mid,sid,True)
    if user.role!=TEACHER_ROLE:raise HTTPException(403,'للمعلم المسند فقط')
    if sunday(week)<sunday(today()):raise HTTPException(409,'انتهى أسبوع الهدف')
    if data.unit=='ayah' and not data.amount.is_integer():raise HTTPException(422,'عدد الآيات يجب أن يكون صحيحًا')
    db.merge(Goal(sid=sid,week=sunday(week),amount=data.amount,unit=data.unit));db.commit()
    return {'ok':True}

def analyze(rows,week):
    weeks=[]
    for i in range(4,-1,-1):
        start=week-timedelta(weeks=i)
        attended=[r for r in rows if start<=r.day<start+timedelta(days=7) and r.attendance in ATTENDED]
        grades=[r.daily_evaluation52 for r in attended if r.daily_evaluation52]
        weeks.append(dict(week=start,visits=len(attended),graded=len(grades),
            scores={k:round(mean(getattr(g,k) for g in grades),2) if grades else None for k in ('memorization_score','tajweed_score','plan_commitment_score')},
            units={u:{'saved':sum(r.memorized_amount for r in attended if r.memorized_unit==u),'review':sum(r.revision_amount for r in attended if r.revision_unit==u),
                      'count':sum(r.memorized_unit==u and (r.memorized_amount>0 or r.daily_evaluation52 is not None) for r in attended)} for u in ('page','ayah')}))
    flags=[]
    for unit in ('page','ayah'):
        now=weeks[-1]['units'][unit]
        past=[w['units'][unit] for w in weeks[:-1] if w['units'][unit]['count']]
        count=sum(w['count'] for w in past)
        if len(past)<2 or count<4 or now['count']<2:continue
        baseline=sum(w['saved'] for w in past)/count
        if baseline and now['saved']/now['count']<=baseline*.75:
            flags.append(dict(unit=unit,baseline=round(baseline,2),current=round(now['saved']/now['count'],2),previous_count=count,current_count=now['count']))
    return weeks,flags

def history(db,sid,week):
    return db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==sid,HalaqaProgress.day.between(week-timedelta(weeks=4),min(today(),week+timedelta(days=6))))).all()

@router.get('/students/{sid}/insights')
def insights(mid:int,sid:int,request:Request,start:date,end:date,db=Depends(get_db)):
    user,student=access_student(db,request,mid,sid)
    if user.role=='owner' or getattr(user,'original_role','')=='owner':raise HTTPException(403)
    if not date(2020,1,1)<=start<=end or (end-start).days>366:raise HTTPException(422,'اختر فترة تصل إلى سنة كاملة')
    week=sunday(min(end,today()));g=db.get(Goal,(sid,week))
    weeks,flags=analyze(history(db,sid,week),week)
    pts=student_month52(db,student,'',today(),True,bounds=(start,end))
    entries=pts.pop('rows')
    pts['recorded_total']=round(sum(entry['earned'] for entry in entries if entry['progress_id'] and (entry['evaluation']['state']=='complete' or pts['activated_on'] and entry['day']>=pts['activated_on'])),2)
    return dict(points=pts,week=week,weeks=weeks,flags=flags,goal={'amount':g.amount,'unit':g.unit} if g else None)

def tonight_rows(db,mid,day):
    rings=db.scalars(select(Halaqa).where(Halaqa.mosque_id==mid,Halaqa.active.is_(True)).order_by(Halaqa.name)).all()
    result=[]
    for ring in rings:
        if not meeting_day(db,ring.id,day):continue
        state=summary(db,ring.id,day)
        students=sorted(db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id==ring.id,HalaqaStudent.active.is_(True))).all(),key=arabic_order)
        teachers=db.scalars(select(User.full_name).join(HalaqaTeacher,HalaqaTeacher.user_id==User.id).where(HalaqaTeacher.halaqa_id==ring.id,HalaqaTeacher.active.is_(True),User.active.is_(True))).all()
        result.append(dict(name=ring.name,teachers=teachers,closed=state['closed'],total=state['total'],
            unmarked=[s.full_name for s in students if s.id in state['unmarked']],pending=[s.full_name for s in students if s.id in state['pending']]))
    return result

@router.get('/tonight')
def tonight(mid:int,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE})
    if u.role!=SUPERVISOR_ROLE or getattr(u,'original_role','')=='owner':raise HTTPException(403)
    day=today()
    cfg=db.get(AlertTime,mid);digest=db.get(Digest,(u.id,day))
    warnings=[]
    for student in db.scalars(select(HalaqaStudent).join(Halaqa).where(Halaqa.mosque_id==mid,Halaqa.active.is_(True),HalaqaStudent.active.is_(True))):
        _,flags=analyze(history(db,student.id,sunday(day)),sunday(day))
        if flags:warnings.append({'id':student.id,'name':student.full_name})
    return dict(rings=tonight_rows(db,mid,day),clock=cfg.clock if cfg else '',digest=digest.body if digest else '',warnings=warnings)

@router.put('/alert-time')
def alert_time(mid:int,data:Clock,request:Request,db=Depends(get_db)):
    _require(request,db,mid,{SUPERVISOR_ROLE})
    db.merge(AlertTime(mid=mid,clock=data.clock));db.commit();return {'ok':True}

def queue_digests():
    now=datetime.now(ZoneInfo('Asia/Riyadh'))
    with PrimarySession() as db:
        for cfg in db.scalars(select(AlertTime).where(AlertTime.clock<=now.strftime('%H:%M'))):
            users=db.scalars(select(User).where(User.mosque_id==cfg.mid,User.role==SUPERVISOR_ROLE,User.active.is_(True))).all()
            users=[u for u in users if not db.get(Digest,(u.id,now.date()))]
            if not users:continue
            outstanding=[r for r in tonight_rows(db,cfg.mid,now.date()) if not r['closed']]
            if not outstanding:continue
            body='حلقات تحتاج متابعة: '+'، '.join(r['name']+' (بلا تحضير '+str(len(r['unmarked']))+'، بلا تقييم '+str(len(r['pending']))+')' for r in outstanding)
            from app.services.notifications import enqueue
            for u in users:
                db.add(Digest(uid=u.id,day=now.date(),body=body));db.flush()
                enqueue(db,u.id,None,'message',body)
            db.commit()

@router.get('/competition')
def competition(mid:int,request:Request,week:date,db=Depends(get_db)):
    _require(request,db,mid,{SUPERVISOR_ROLE})
    week=sunday(week);end=week+timedelta(days=6)
    if week>today():raise HTTPException(422,'اختر أسبوعًا بدأ بالفعل')
    rings=db.scalars(select(Halaqa).where(Halaqa.mosque_id==mid)).all()
    stats={r.id:dict(name=r.name,points=0,possible=0,due=0,present=0,graded=0,achievement=0,goals=[],participants=0) for r in rings}
    students=[];cache={}
    for s in db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id.in_(list(stats)))):
        ledger=student_month52(db,s,'',today(),True,calendar_cache=cache,bounds=(week,end))
        eligible=[r for r in ledger['rows'] if r['eligible'] and r['ring_id'] in stats]
        if not eligible:continue
        students.append(dict(name=s.full_name,id=s.id,points=round(sum(r['earned'] for r in eligible),2),maximum=10*len(eligible)))
        goal=db.get(Goal,(s.id,week))
        records={p.day.isoformat():p for p in db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==s.id,HalaqaProgress.day.between(week,end)))}
        for rid in {r['ring_id'] for r in eligible}:
            st=stats[rid];local=[r for r in eligible if r['ring_id']==rid];st['participants']+=1
            st['points']+=sum(r['earned'] for r in local);st['possible']+=10*len(local);st['due']+=len(local)
            attended=[r for r in local if r['attendance'] in ATTENDED];st['present']+=len(attended)
            for r in attended:
                if r['evaluation']['state']=='complete':
                    st['graded']+=1;st['achievement']+=r['evaluation']['plan_commitment_score']
            if goal:
                saved=sum(records[r['day']].memorized_amount for r in attended if records[r['day']].memorized_unit==goal.unit)
                st['goals'].append(min(1,saved/(goal.amount*len(local)/len(eligible))))
    final=True;out=[]
    for rid,st in stats.items():
        scheduled=[week+timedelta(days=i) for i in range(7) if meeting_day(db,rid,week+timedelta(days=i))]
        if not st['due'] and not (scheduled and db.get(Halaqa,rid).active):continue
        closed=all(d<=today() and db.get(ClosedDay,(rid,d)) for d in scheduled)
        complete=bool(st['due'] and st['graded']==st['present'] and len(st['goals'])==st['participants'] and closed)
        if not complete and (st['due'] or any(d>today() for d in scheduled) or not closed):final=False
        attendance=st['present']/st['due'] if st['due'] else 0
        memory=sum(st['goals'])/st['participants'] if st['participants'] else 0
        achievement=st['achievement']/(10*st['present']) if st['present'] else 0
        score=round(30*attendance+40*memory+30*achievement,2) if st['due'] and len(st['goals'])==st['participants'] else None
        out.append(dict(name=st['name'],points=round(st['points'],2),score=score,attendance=round(attendance*100,1),memory=round(memory*100,1),achievement=round(achievement*100,1),graded=st['graded'],present=st['present'],missing=st['participants']-len(st['goals'])))
    students.sort(key=lambda x:(-x['points'],x['name']))
    out.sort(key=lambda x:(x['score'] is None,-(x['score'] or 0),x['name']))
    return dict(week=week,end=end,final=bool(out and final),students=students,rings=out)

@router.post('/digest/{day}/seen')
def read_digest(mid:int,day:date,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{SUPERVISOR_ROLE})
    digest=db.get(Digest,(u.id,day))
    if digest:digest.seen=True;db.commit()
    return {'ok':True}
