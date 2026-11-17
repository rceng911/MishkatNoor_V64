from app.services.attendance64 import ATTENDED
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import ForeignKey, select, event
from sqlalchemy.orm import Mapped, mapped_column, Session
from app.db.session import Base,get_db
from app.api.halaqat import _require,_ring_ids_for,TEACHER_ROLE
from app.api.student_file import today
from app.api.routes import audit
from app.models import Halaqa,HalaqaStudent,HalaqaProgress,RingCalendar
from app.models.scoring64 import DailyEvaluation52

router=APIRouter(prefix='/api/v53/mosques/{mid}')
TIME_TEXT='من بعد صلاة المغرب إلى صلاة العشاء'

class ClosedDay(Base):
    __tablename__='closed_circle_days53'
    ring_id:Mapped[int]=mapped_column(ForeignKey('halaqat.id',ondelete='CASCADE'),primary_key=True)
    day:Mapped[date]=mapped_column(primary_key=True)
    closed_at:Mapped[datetime]=mapped_column(default=datetime.utcnow)
    closed_by:Mapped[int]

def assigned(db,request,mid,rid,day):
    actor=_require(request,db,mid,{TEACHER_ROLE})
    if actor.role!=TEACHER_ROLE or rid not in _ring_ids_for(actor,mid,db):
        raise HTTPException(403,'الإغلاق لمعلم الحلقة المسندة إليه')
    if day>today():raise HTTPException(422,'لا يمكن إغلاق يوم مستقبلي')
    return actor

def summary(db,rid,day):
    rows=db.execute(select(HalaqaStudent.id,HalaqaProgress.attendance,DailyEvaluation52.progress_id)
        .outerjoin(HalaqaProgress,(HalaqaProgress.student_id==HalaqaStudent.id)&(HalaqaProgress.day==day))
        .outerjoin(DailyEvaluation52,(DailyEvaluation52.progress_id==HalaqaProgress.id)&(DailyEvaluation52.ring_id==rid))
        .where(HalaqaStudent.halaqa_id==rid,HalaqaStudent.active.is_(True))).all()
    return {'total':len(rows),'unmarked':[sid for sid,att,_ in rows if att not in ('present','absent','permission','excused')],
            'pending':[sid for sid,att,ev in rows if att in ATTENDED and ev is None],
            'closed':db.get(ClosedDay,(rid,day)) is not None}

@router.get('/rings/{rid}/day/{day}')
def day_state(mid:int,rid:int,day:date,request:Request,db=Depends(get_db)):
    assigned(db,request,mid,rid,day)
    return summary(db,rid,day)

@router.post('/rings/{rid}/day/{day}/close')
def close(mid:int,rid:int,day:date,request:Request,db=Depends(get_db)):
    actor=assigned(db,request,mid,rid,day)
    state=summary(db,rid,day)
    if state['closed']:return state
    if not state['total'] or state['unmarked'] or state['pending']:
        raise HTTPException(409,'لا يمكن الإغلاق حتى يُحضر كل الطلاب ويُعتمد تقييم كل حاضر ومستأذن')
    db.add(ClosedDay(ring_id=rid,day=day,closed_by=actor.id))
    audit(db,actor.id,mid,'circle_day_closed',f'{rid}/{day}');db.commit()
    return dict(state,closed=True)

@router.post('/rings/{rid}/day/{day}/reopen')
def reopen(mid:int,rid:int,day:date,request:Request,db=Depends(get_db)):
    actor=assigned(db,request,mid,rid,day)
    row=db.get(ClosedDay,(rid,day))
    if row:
        db.delete(row);audit(db,actor.id,mid,'circle_day_reopened',f'{rid}/{day}');db.commit()
    return {'ok':True}

@event.listens_for(Session,'before_flush')
def guard_closed(db,context,instances):
    for obj in list(db.new)+list(db.dirty)+list(db.deleted):
        if isinstance(obj,DailyEvaluation52):
            progress=obj.progress or db.get(HalaqaProgress,obj.progress_id)
        elif isinstance(obj,HalaqaProgress):
            progress=obj
        else:continue
        if progress is None or not progress.student_id or not progress.day:continue
        student=db.get(HalaqaStudent,progress.student_id)
        if student and db.get(ClosedDay,(student.halaqa_id,progress.day)):
            raise HTTPException(409,'هذا اليوم مغلق. أعد فتحه من التحضير قبل تعديل السجل.')

@router.post('/evening-calendar')
def evening(mid:int,request:Request,db=Depends(get_db)):
    actor=_require(request,db,mid,{'owner'})
    if actor.role!='owner':raise HTTPException(403,'للمالك فقط')
    rings=db.scalars(select(Halaqa).where(Halaqa.mosque_id==mid,Halaqa.active.is_(True))).all()
    for ring in rings:
        row=db.get(RingCalendar,ring.id)
        if not row:row=RingCalendar(halaqa_id=ring.id);db.add(row)
        row.weekdays_json='[6,0,1,2]';row.time_text=TIME_TEXT
        ring.schedule='الأحد إلى الأربعاء · '+TIME_TEXT
    audit(db,actor.id,mid,'evening_calendar_applied',str(len(rings)));db.commit()
    return {'count':len(rings)}
