from app.services.attendance64 import ATTENDED
"""Record attendance corrections atomically, including batch attendance and excuses."""
import json,hashlib
from datetime import datetime,date
from sqlalchemy import Integer,String,Text,DateTime,Date,ForeignKey,event,inspect,select
from sqlalchemy.orm import Mapped,mapped_column,Session
from fastapi import HTTPException
from app.db.session import Base
from app.models import HalaqaProgress,Halaqa,HalaqaStudent,User

FIELDS=('attendance','memorized','revision','notes','memorized_amount','memorized_unit','revision_amount','revision_unit','memorization_score','tajweed_score','mistakes')
def encode(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def fingerprint(v):return hashlib.sha256(encode(v).encode()).hexdigest()
def snapshot(row):
    if row is None:return None
    values={k:getattr(row,k) for k in FIELDS}
    for k in ('memorized_amount','revision_amount'):
        if values[k] is not None:values[k]=float(values[k])
    from app.services.scoring64 import evaluation_snapshot52
    evaluation=evaluation_snapshot52(getattr(row,'daily_evaluation52',None))
    # Absence of this key keeps every pre-v52 fingerprint and undo usable.
    if evaluation is not None:values['daily_evaluation52']=evaluation
    return values

class ProgressRevision35(Base):
    __tablename__='progress_revisions_v35'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    student_id:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    day:Mapped[date]=mapped_column(Date,index=True)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id'))
    before_json:Mapped[str]=mapped_column(Text)
    after_json:Mapped[str]=mapped_column(Text)
    reason:Mapped[str]=mapped_column(String(500),default='حفظ الحضور والتسميع')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class TransferHistory35(Base):
    __tablename__='student_transfers_v35'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    student_id:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    source_id:Mapped[int]=mapped_column(Integer)
    target_id:Mapped[int]=mapped_column(Integer)
    source_name:Mapped[str]=mapped_column(String(180))
    target_name:Mapped[str]=mapped_column(String(180))
    requested_by:Mapped[int]=mapped_column(ForeignKey('users.id'))
    approved_by:Mapped[int]=mapped_column(ForeignKey('users.id'))
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

@event.listens_for(Session,'before_flush')
def collect_progress(db,ctx,instances):
    if not db.info.get('actor35'):return
    from app.models.scoring64 import DailyEvaluation52
    from app.services.scoring64 import evaluation_snapshot52
    candidates=[]
    for item in list(db.new)+list(db.dirty)+list(db.deleted):
        if isinstance(item,HalaqaProgress):candidates.append(item)
        elif isinstance(item,DailyEvaluation52):
            parent=item.progress
            if parent is None:
                previous=inspect(item).attrs.progress.history.deleted
                parent=previous[0] if previous else None
            if parent is not None:candidates.append(parent)
    candidates=list(dict.fromkeys(candidates))
    for row in candidates:
        ev=getattr(row,'daily_evaluation52',None)
        if ev is None or row in db.deleted:continue
        changed=any(inspect(row).attrs[key].history.has_changes() for key in FIELDS if key!='attendance')
        if row.attendance not in ATTENDED or (changed and row.id not in db.info.get('evaluation_write52',set())):
            # A legacy correction invalidates its score without erasing the old
            # evaluation from the revision that can restore it atomically.
            row.daily_evaluation52=None
    changes=[]
    for row in candidates:
        before=None if row in db.new else snapshot(row)
        if before is not None:
            state=inspect(row)
            for k in FIELDS:
                old=state.attrs[k].history.deleted
                if old:before[k]=old[0]
            previous=state.attrs.daily_evaluation52.history.deleted
            evaluation=previous[0] if previous else getattr(row,'daily_evaluation52',None)
            before.pop('daily_evaluation52',None)
            original=evaluation_snapshot52(evaluation,original=True)
            if original is not None:before['daily_evaluation52']=original
        if row not in db.new and row not in db.deleted and before==snapshot(row):continue
        changes.append((row,before,row in db.deleted,db.info['actor35'],db.info.get('progress_reason35','حفظ الحضور والتسميع')))
    db.info.setdefault('progress_changes35',[]).extend(changes)

@event.listens_for(Session,'after_flush_postexec')
def write_progress_history(db,ctx):
    for row,before,deleted,actor,reason in db.info.pop('progress_changes35',[]):
        after=None if deleted else snapshot(row)
        if before!=after:db.add(ProgressRevision35(student_id=row.student_id,day=row.day,actor_id=actor,before_json=encode(before),after_json=encode(after),reason=reason))

@event.listens_for(Session,'after_commit')
@event.listens_for(Session,'after_rollback')
def clear_scoring_context52(db):
    db.info.pop('evaluation_write52',None)
    db.info.pop('progress_changes35',None)
    db.info.pop('progress_reason35',None)

def apply_transfer(db,student,target_id,requester,approver,expected=None):
    from app.api.halaqat import _ring_ids_for
    from app.api.features64 import spaces
    target=db.scalar(select(Halaqa).where(Halaqa.id==target_id).with_for_update())
    source=db.get(Halaqa,student.halaqa_id) if student else None
    if not student or not student.active or not source or not target or not target.active or source.mosque_id!=target.mosque_id:
        raise HTTPException(409,'الحلقة أو ملف الطالب لم يعد متاحًا للنقل')
    if expected is not None and student.halaqa_id!=expected:raise HTTPException(409,'تغيرت حلقة الطالب بعد الطلب؛ أعد طلب النقل')
    if source.id==target.id:raise HTTPException(409,'الطالب موجود في الحلقة المطلوبة')
    actor=db.get(User,requester)
    if not actor or not actor.active or source.id not in _ring_ids_for(actor,source.mosque_id,db) or target.id not in _ring_ids_for(actor,source.mosque_id,db):raise HTTPException(409,'تغيرت صلاحيات مقدم طلب النقل')
    if not spaces(db,target.id)['available']:raise HTTPException(409,'الحلقة المطلوبة مكتملة؛ عدّل السعة أو اختر حلقة أخرى')
    db.add(TransferHistory35(student_id=student.id,source_id=source.id,target_id=target.id,source_name=source.name,target_name=target.name,requested_by=requester,approved_by=approver))
    student.halaqa_id=target.id
