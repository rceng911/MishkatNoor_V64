from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from app.api.halaqat import _require, SUPERVISOR_ROLE
from app.api.student_file import today, access_student
from app.db.session import get_db
from app.models import Halaqa,HalaqaStudent,HalaqaProgress
from app.services.attendance64 import ATTENDED
from app.services.quran_catalog import SURAH_NAMES
from app.services.recitation64 import history64, milestone64, Passage
from app.services.scoring64 import student_month52

router=APIRouter(prefix='/api/v64/mosques/{mid}')

@router.get('/students/{sid}/journey')
def journey(mid:int,sid:int,request:Request,db=Depends(get_db)):
    access_student(db,request,mid,sid)
    history=history64(db,sid,today())
    payload=history[-1][1] if history else {}
    return {'milestones':milestone64(history),'next':{k:Passage(**v).label() for k,v in payload.items() if k in ('next_saved','next_review') and v}}

def blank():
    return dict(present=0,permission=0,absent=0,excused=0,unmarked=0,grades=0,points=0,graded_points=0,expected=0,fulfilled=0,saved_ayah=0,saved_page=0,review_ayah=0,review_page=0)

def rates(row):
    def ratio(a,b,scale):
        return round(a*scale/b,2) if b else None
    attended=row['present']+row['permission']
    return dict(attendance=ratio(attended,attended+row['absent'],100),
                progress=ratio(row['fulfilled'],row['expected'],100),
                grade=ratio(row['graded_points'],row['grades'],1))

@router.get('/period-report')
def period_report(mid:int,start:date,end:date,request:Request,ring_id:int|None=None,db=Depends(get_db)):
    _require(request,db,mid,{'owner',SUPERVISOR_ROLE})
    if start>end or end>today() or (end-start).days>366:
        raise HTTPException(422,'حدّد فترة من يوم إلى سنة تنتهي اليوم أو قبله')
    rings={r.id:dict(id=r.id,name=r.name,students=[],**blank()) for r in db.scalars(select(Halaqa).where(Halaqa.mosque_id==mid).order_by(Halaqa.name))}
    if ring_id is not None and ring_id not in rings:raise HTTPException(404,'الحلقة غير موجودة')
    students=db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id.in_(rings)).order_by(HalaqaStudent.full_name)).all()
    cache={}
    for student in students:
        ledger=student_month52(db,student,'',end,calendar_cache=cache,bounds=(start,end))
        logs={p.day:p for p in db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==student.id,HalaqaProgress.day.between(start,end)))}
        history=history64(db,student.id,end)
        records=dict(history)
        prior=None
        last=None
        for day,payload in history:
            if day>=start:break
            prior=payload.get('next_saved')
            if payload.get('saved'):last=payload['saved']
        members={}
        unique_verses={}
        for entry in ledger['rows']:
            rid=entry['ring_id']
            if rid not in rings:continue
            day=date.fromisoformat(entry['day'])
            row=members.setdefault(rid,blank())
            state=entry['attendance']
            row[state if state in ('present','absent','excused','permission') else 'unmarked']+=1
            row['points']+=entry['earned']
            grade=entry['evaluation']
            if grade['state']=='complete':
                row['graded_points']+=grade['total'];row['grades']+=1
            rec=records.get(day,{})
            if state in ATTENDED:
                log=logs[day]
                row['saved_'+log.memorized_unit]+=log.memorized_amount or 0
                row['review_'+log.revision_unit]+=log.revision_amount or 0
                saved=rec.get('saved')
                if saved:
                    last=saved
                    a,b=Passage(**saved).span()
                    unique_verses.setdefault(rid,set()).update(range(a,b+1))
                elif rec and not log.memorized_amount:
                    unique_verses.setdefault(rid,set())
                if prior:
                    lo,hi=Passage(**prior).span()
                    if saved or not log.memorized_amount:
                        row['expected']+=hi-lo+1
                        if saved:
                            a,b=Passage(**saved).span()
                            row['fulfilled']+=max(0,min(hi,b)-max(lo,a)+1)
                prior=rec.get('next_saved')
            if last:row['position']=f"{SURAH_NAMES[last['end_surah']-1]} · آية {last['end_ayah']}"
            elif state in ATTENDED and logs[day].memorized:row['position']=logs[day].memorized
        if student.active and student.created_at.date()<=end and not members:members[student.halaqa_id]=blank()
        milestones=milestone64(history)
        for rid,row in members.items():
            if ring_id and rid!=ring_id:continue
            ring=rings[rid]
            for k in blank():ring[k]+=row[k]
            row.update(rates(row),unique_verses=len(unique_verses[rid]) if rid in unique_verses else None,id=student.id,name=student.full_name,
                       milestones=[m for m in milestones if start<=date.fromisoformat(m['day'])<=end and any(e['day']==m['day'] and e['ring_id']==rid for e in ledger['rows'])])
            ring['students'].append(row)
    selected=[r for r in rings.values() if ring_id is None or r['id']==ring_id]
    total=blank()
    for r in selected:
        for k in total:total[k]+=r[k]
        r.update(rates(r))
        graded=[s for s in r['students'] if s['grades']]
        for key,fn in [('highest',max),('lowest',min)]:
            score=fn((s['points'] for s in graded),default=None)
            r[key]=[{'name':s['name'],'position':s.get('position')} for s in graded if s['points']==score]
        documented=[s for s in r['students'] if s['unique_verses'] is not None]
        for key,fn in [('most_saved',max),('least_saved',min)]:
            value=fn((s['unique_verses'] for s in documented),default=None)
            r[key]=[{'name':s['name'],'position':s.get('position')} for s in documented if s['unique_verses']==value]
    total.update(rates(total))
    return dict(start=start,end=end,total=total,rings=selected)
