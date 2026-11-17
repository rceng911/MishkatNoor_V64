"""Daily recovery copies of teaching records, with previewed, non-deleting restore."""
import hashlib, json, secrets, threading
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, select
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, get_db, SessionLocal
from app.models import User, HalaqaProgress, StudentPlan, StudentExam, Assignment, HalaqaStudent
from app.api.halaqat import Input, _actor
from app.api.routes import audit

router=APIRouter(prefix='/api/v34/backups')
TABLES=[HalaqaProgress.__table__,StudentPlan.__table__,StudentExam.__table__,Assignment.__table__]
LABELS=['التسميع والحضور','خطط الحفظ','الاختبارات','الأوراد']

class Backup34(Base):
    __tablename__='teaching_backups_v34'
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    created_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
    kind: Mapped[str]=mapped_column(String(20))
    daily_key: Mapped[str | None]=mapped_column(String(10),unique=True,nullable=True)
    payload: Mapped[str]=mapped_column(Text)
    checksum: Mapped[str]=mapped_column(String(64))

class RestorePreview34(Base):
    __tablename__='restore_previews_v34'
    token: Mapped[str]=mapped_column(String(64),primary_key=True)
    backup_id: Mapped[int]=mapped_column(ForeignKey('teaching_backups_v34.id'))
    actor_id: Mapped[int]=mapped_column(ForeignKey('users.id'))
    fingerprint: Mapped[str]=mapped_column(String(64))
    expires: Mapped[datetime]=mapped_column(DateTime)

def owner(request,db):
    u=_actor(request,db)
    if u.role!='owner':raise HTTPException(403,'النسخ والاستعادة للمالك فقط')
    return u

def encode(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,default=str,separators=(',',':'))
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def current(db):
    return {t.name:[dict(r) for r in db.execute(select(t).order_by(*t.primary_key.columns)).mappings()] for t in TABLES}

def make_backup(db,kind):
    payload=encode(current(db));r=Backup34(kind=kind,payload=payload,checksum=digest(payload),daily_key=str(datetime.now(ZoneInfo('Asia/Riyadh')).date()) if kind=='daily' else None);db.add(r);db.flush();return r

@router.get('')
def listing(request:Request,db=Depends(get_db)):
    owner(request,db)
    return {'scope':'الحضور والتسميع وخطط الحفظ والاختبارات والأوراد. الاستعادة تعيد سجلات النسخة وتحتفظ بالسجلات الجديدة والحسابات والصلاحيات.',
      'backups':[{'id':r.id,'created_at':r.created_at.isoformat()+'Z','kind':r.kind,'records':sum(len(v) for v in json.loads(r.payload).values())} for r in db.scalars(select(Backup34).order_by(Backup34.id.desc()).limit(30))]}

@router.post('')
def create(request:Request,db=Depends(get_db)):
    u=owner(request,db);r=make_backup(db,'manual');audit(db,u.id,u.mosque_id,'teaching_backup_created_v34',str(r.id));db.commit();return {'ok':True,'id':r.id}

@router.get('/{bid}/download')
def download(bid:int,request:Request,db=Depends(get_db)):
    owner(request,db);r=db.get(Backup34,bid)
    if not r:raise HTTPException(404,'النسخة غير موجودة')
    return Response(encode({'version':34,'created_at':r.created_at,'checksum':r.checksum,'records':json.loads(r.payload)}),media_type='application/json',headers={'Content-Disposition':f'attachment; filename="teaching-backup-{bid}.json"','Cache-Control':'no-store'})

def restored_rows(db,r):
    if digest(r.payload)!=r.checksum:raise HTTPException(409,'فشل التحقق من سلامة النسخة')
    data=json.loads(r.payload);out={}
    for table in TABLES:
        values=[]
        for row in data[table.name]:
            v=dict(row)
            if not db.get(HalaqaStudent,v['student_id']):raise HTTPException(409,'تحتوي النسخة على طالب محذوف؛ لا يمكن استعادتها تلقائيًا')
            for col in table.columns:
                if v[col.name] is None:continue
                if isinstance(col.type,DateTime):v[col.name]=datetime.fromisoformat(v[col.name])
                elif isinstance(col.type,__import__('sqlalchemy').Date):v[col.name]=date.fromisoformat(v[col.name])
                if col.name=='created_by' and not db.get(User,v[col.name]):raise HTTPException(409,'حساب المعلم في النسخة غير موجود')
            values.append(v)
        out[table.name]=values
    return out

@router.post('/{bid}/preview')
def preview(bid:int,request:Request,db=Depends(get_db)):
    u=owner(request,db);r=db.get(Backup34,bid)
    if not r:raise HTTPException(404,'النسخة غير موجودة')
    restored_rows(db,r);now=current(db);counts=[]
    for table,label in zip(TABLES,LABELS):
        keys=[c.name for c in table.primary_key];existing={tuple(x[k] for k in keys) for x in now[table.name]};saved=json.loads(r.payload)[table.name]
        old=sum(tuple(x[k] for k in keys) in existing for x in saved)
        counts.append({'label':label,'restore':old,'insert':len(saved)-old,'keep_new':len(existing)-old})
    p=RestorePreview34(token=secrets.token_hex(24),backup_id=bid,actor_id=u.id,fingerprint=digest(encode(now)),expires=datetime.utcnow()+timedelta(minutes=5))
    db.add(p);db.commit();return {'token':p.token,'counts':counts,'message':'ستعاد قيم السجلات الموجودة في النسخة. السجلات الأحدث والحسابات والصلاحيات تبقى محفوظة. تؤخذ نسخة قبل الاستعادة.'}

class RestoreInput(Input):
    token:str=Field(min_length=48,max_length=48)
    confirm:str

@router.post('/{bid}/restore')
def restore(bid:int,p:RestoreInput,request:Request,db=Depends(get_db)):
    # Serialize teaching writes during fingerprint check and restore, on either database backend.
    conn=db.connection()
    if conn.dialect.name=='sqlite':conn.exec_driver_sql('BEGIN IMMEDIATE')
    else:
        for table in sorted(TABLES,key=lambda t:t.name):conn.exec_driver_sql('LOCK TABLE '+table.name+' IN SHARE ROW EXCLUSIVE MODE')
    u=owner(request,db);token=db.get(RestorePreview34,p.token)
    if p.confirm!='استعادة سجلات النسخة':raise HTTPException(422,'اكتب عبارة تأكيد الاستعادة')
    if not token or token.actor_id!=u.id or token.backup_id!=bid or token.expires<datetime.utcnow():raise HTTPException(409,'أعد معاينة النسخة قبل الاستعادة')
    if digest(encode(current(db)))!=token.fingerprint:raise HTTPException(409,'تغيرت البيانات بعد المعاينة؛ أعد المعاينة')
    r=db.get(Backup34,bid);rows=restored_rows(db,r);make_backup(db,'before_restore')
    try:
        for table in TABLES:
            for value in rows[table.name]:
                condition=[c==value[c.name] for c in table.primary_key]
                if db.execute(select(table).where(*condition)).first():db.execute(table.update().where(*condition).values(**value))
                else:db.execute(table.insert().values(**value))
            if conn.dialect.name=='postgresql' and 'id' in table.c:
                conn.exec_driver_sql("SELECT setval(pg_get_serial_sequence('"+table.name+"','id'), COALESCE((SELECT MAX(id) FROM "+table.name+"),1), EXISTS(SELECT 1 FROM "+table.name+"))")
        db.delete(token);audit(db,u.id,u.mosque_id,'teaching_backup_restored_v34',str(bid));db.commit()
    except Exception:db.rollback();raise
    return {'ok':True}

def daily_backup():
    from app.api.student_file import today
    with SessionLocal() as db:
        if not db.scalar(select(User.id).where(User.role=='owner',User.active.is_(True))):return
        last=db.scalar(select(Backup34).where(Backup34.kind=='daily').order_by(Backup34.id.desc()))
        if last and last.created_at.replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('Asia/Riyadh')).date()==today():return
        make_backup(db,'daily')
        # Keep daily history for 30 days; manual and pre-restore copies are preserved.
        old=db.scalars(select(Backup34).where(Backup34.kind=='daily',Backup34.created_at<datetime.utcnow()-timedelta(days=30))).all()
        for r in old:
            db.query(RestorePreview34).filter(RestorePreview34.backup_id==r.id).delete();db.delete(r)
        db.commit()

def start_backup_worker():
    import logging
    stop=threading.Event()
    def loop():
        while not stop.is_set():
            try:daily_backup()
            except Exception:logging.getLogger(__name__).exception('Teaching backup failed')
            stop.wait(60)
    t=threading.Thread(target=loop,daemon=True,name='teaching-backups-v34');t.start();return stop,t
