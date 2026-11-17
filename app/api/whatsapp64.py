"""Opted-in weekly template delivery through Meta Cloud API, inactive until configured."""
import hashlib, hmac, json, os, re, threading
from datetime import date, datetime, timedelta
from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import Field, model_validator
from sqlalchemy import Integer, String, Boolean, DateTime, Date, ForeignKey, UniqueConstraint, select, update
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.exc import IntegrityError
from app.db.session import Base, get_db, SessionLocal
from app.models import HalaqaStudent, Halaqa, User
from app.api.halaqat import Input, _actor, _ring_ids_for, SUPERVISOR_ROLE, TEACHER_ROLE
from app.api.student_file import access_student, today
from app.api.features64 import weekly
from app.api.routes import audit

router=APIRouter(prefix='/api/v34/whatsapp')

class WhatsAppSettings34(Base):
    __tablename__='whatsapp_settings_v34'
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    enabled: Mapped[bool]=mapped_column(Boolean,default=False)

class WhatsAppRecipient34(Base):
    __tablename__='whatsapp_recipients_v34'
    student_id: Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),primary_key=True)
    phone: Mapped[str]=mapped_column(String(16),default='')
    recipient: Mapped[str]=mapped_column(String(20),default='guardian')
    opted_in: Mapped[bool]=mapped_column(Boolean,default=False)
    changed_by: Mapped[int]=mapped_column(ForeignKey('users.id'))
    updated_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class WhatsAppJob34(Base):
    __tablename__='whatsapp_jobs_v34'
    __table_args__=(UniqueConstraint('student_id','end','phone',name='uq_wa_week_v34'),)
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    student_id: Mapped[int]=mapped_column(ForeignKey('halaqa_students.id'),index=True)
    end: Mapped[date]=mapped_column(Date)
    phone: Mapped[str]=mapped_column(String(16))
    status: Mapped[str]=mapped_column(String(24),default='pending')
    message_id: Mapped[str]=mapped_column(String(200),default='',index=True)
    error: Mapped[str]=mapped_column(String(250),default='')
    created_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
    updated_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class WhatsAppReceipt34(Base):
    __tablename__='whatsapp_receipts_v34'
    message_id: Mapped[str]=mapped_column(String(200),primary_key=True)
    status: Mapped[str]=mapped_column(String(24))
    updated_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

REQUIRED=('WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME','WHATSAPP_API_VERSION','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN')
def configured():
    return all(os.getenv(k,'').strip() for k in REQUIRED) and bool(re.fullmatch(r'v\d+\.\d+',os.getenv('WHATSAPP_API_VERSION',''))) and os.getenv('WHATSAPP_PHONE_NUMBER_ID','').isdigit()
def owner(request,db):
    u=_actor(request,db)
    if u.role!='owner':raise HTTPException(403,'إعداد الإرسال التلقائي للمالك')
    return u
def enabled(db):
    r=db.get(WhatsAppSettings34,1);return bool(r and r.enabled and configured())

class Toggle(Input):enabled:bool
@router.get('/settings')
def settings_get(request:Request,db=Depends(get_db)):
    owner(request,db);r=db.get(WhatsAppSettings34,1)
    return {'configured':configured(),'enabled':bool(r and r.enabled),'schedule':'الأحد الساعة 18:00 بتوقيت الرياض؛ تقرير الأسبوع المكتمل من الأحد إلى السبت','missing':[k for k in REQUIRED if not os.getenv(k,'').strip()]}
@router.put('/settings')
def settings_put(p:Toggle,request:Request,db=Depends(get_db)):
    u=owner(request,db)
    if p.enabled and not configured():raise HTTPException(422,'أكمل ربط واتساب أعمال أولًا')
    r=db.get(WhatsAppSettings34,1)
    if not r:r=WhatsAppSettings34(id=1);db.add(r)
    r.enabled=p.enabled;audit(db,u.id,u.mosque_id,'whatsapp_automation_updated_v34',str(p.enabled));db.commit();return {'ok':True}

def normalize_phone(v):
    v=v.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩','0123456789'))
    if not re.fullmatch(r'[+0-9 ()-]*',v):raise ValueError('رقم واتساب غير صحيح')
    v=re.sub(r'\D','',v)
    if v.startswith('00'):v=v[2:]
    if re.fullmatch(r'05\d{8}',v):v='966'+v[1:]
    if not re.fullmatch(r'[1-9]\d{7,14}',v):raise ValueError('أدخل رقم واتساب مع رمز الدولة، مثال: 966501234567')
    return v
class RecipientInput(Input):
    phone:str=Field('',max_length=40)
    recipient:str=Field('guardian',pattern=r'^(student|guardian)$')
    opted_in:bool
    @model_validator(mode='after')
    def phone_valid(self):
        self.phone=normalize_phone(self.phone) if self.phone else ''
        if self.opted_in and not self.phone:raise ValueError('أدخل رقم المستلم')
        return self

@router.get('/mosques/{mid}/students/{sid}')
def recipient_get(mid:int,sid:int,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    _,s=evaluation_access52(db,request,mid,sid);r=db.get(WhatsAppRecipient34,sid)
    return {'configured':configured(),'automation_active':enabled(db),'recipient':{'phone':r.phone,'recipient':r.recipient,'opted_in':r.opted_in} if r else {'phone':s.guardian_phone or s.phone,'recipient':'guardian' if s.guardian_phone else 'student','opted_in':False},
      'jobs':[{'id':j.id,'end':str(j.end),'status':j.status,'error':j.error} for j in db.scalars(select(WhatsAppJob34).where(WhatsAppJob34.student_id==sid).order_by(WhatsAppJob34.id.desc()).limit(10))]}

@router.put('/mosques/{mid}/students/{sid}')
def recipient_put(mid:int,sid:int,p:RecipientInput,request:Request,db=Depends(get_db)):
    # Families manage their linked students; staff manage only circles within their scope.
    from app.api.scoring64 import evaluation_access52
    u,_=evaluation_access52(db,request,mid,sid)
    r=db.get(WhatsAppRecipient34,sid)
    if not r:r=WhatsAppRecipient34(student_id=sid,changed_by=u.id);db.add(r)
    for k,v in p.model_dump().items():setattr(r,k,v)
    r.updated_at=datetime.utcnow();r.changed_by=u.id
    audit(db,u.id,mid,'whatsapp_recipient_updated_v34',str(sid));db.commit();return {'ok':True}

def enqueue(db,sid,end):
    r=db.get(WhatsAppRecipient34,sid)
    if not r or not r.opted_in or not r.phone:raise HTTPException(422,'سجل رقم المستلم وموافقته أولًا')
    old=db.scalar(select(WhatsAppJob34).where(WhatsAppJob34.student_id==sid,WhatsAppJob34.end==end,WhatsAppJob34.phone==r.phone))
    if old:return old
    j=WhatsAppJob34(student_id=sid,end=end,phone=r.phone);db.add(j);db.flush();return j

@router.post('/mosques/{mid}/students/{sid}/queue')
def queue_now(mid:int,sid:int,request:Request,db=Depends(get_db)):
    access_student(db,request,mid,sid,True)
    raise HTTPException(422,'عاين التقرير أولًا ثم أكد إرساله من المعاينة')


def metric(v):return 'لم يسجل' if v is None else str(v)
def amount(v):return str(v['page'])+' وجه، '+str(v['ayah'])+' آية'
def parameters(report):
    c=report['current'];n=report['next'];notes='؛ '.join(x['note'] for x in report['notes']) or 'لا توجد ملاحظات'
    grade=metric(c['score'])+'/10 · التغير '+metric(report['score_change'])
    daily=c.get('daily_evaluation52')
    if daily and daily['evaluations_complete']:
        components=daily['average_components']
        grade+=' · متوسط التقييم اليومي '+metric(daily['average'])+'/10'
    return [report['student'],report['from']+' إلى '+report['to'],metric(c['attendance_percent'])+'% · الغياب '+str(c['absent'])+' · غائب بعذر '+str(c.get('excused',0))+' · مستأذن '+str(c.get('permission',0)),
      amount(c['memorized']),amount(c['revision']),grade,
      (n['due']+' · '+n['memorization']+' · '+n['revision']) if n else 'لا يوجد ورد مسجل',notes]

def body_parameters(report):
    return [re.sub(r'\s+',' ',str(s))[:500] or '—' for s in parameters(report)]

def template_payload(phone,report):
    return {'messaging_product':'whatsapp','to':phone,'type':'template','template':{'name':os.environ['WHATSAPP_TEMPLATE_NAME'],'language':{'code':os.getenv('WHATSAPP_TEMPLATE_LANGUAGE','ar')},'components':[{'type':'body','parameters':[{'type':'text','text':s} for s in body_parameters(report)]}]}}

def send_template(payload):
    version=os.environ['WHATSAPP_API_VERSION'];phone_id=os.environ['WHATSAPP_PHONE_NUMBER_ID']
    if not re.fullmatch(r'v\d+\.\d+',version) or not phone_id.isdigit():raise ValueError('invalid_provider_configuration')
    req=URLRequest('https://graph.facebook.com/'+version+'/'+phone_id+'/messages',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['WHATSAPP_ACCESS_TOKEN'],'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=20) as response:body=json.loads(response.read(1024*1024))
        return body['messages'][0]['id']
    except HTTPError as e:
        # A rejected API request is known not to be accepted; never retain provider response secrets.
        raise ValueError('provider_rejected_'+str(e.code)) from None
    except (URLError,TimeoutError,KeyError,ValueError):raise RuntimeError('delivery_unknown') from None

def schedule_reports(db,now):
    if not enabled(db):return
    if now.weekday()==6 and now.hour<18:return
    end=now.date()-timedelta(days=(now.weekday()+1)%7+1)
    for r in db.scalars(select(WhatsAppRecipient34).where(WhatsAppRecipient34.opted_in.is_(True))):
        s=db.get(HalaqaStudent,r.student_id);ring=db.get(Halaqa,s.halaqa_id) if s else None
        if s and s.active and ring and ring.active:enqueue(db,s.id,end)

def process_one():
    with SessionLocal() as db:
        if not enabled(db):return False
        # No repeat after an interrupted request: acceptance may have happened before the crash.
        stale=db.scalars(select(WhatsAppJob34).where(WhatsAppJob34.status=='sending',WhatsAppJob34.updated_at<datetime.utcnow()-timedelta(minutes=5))).all()
        for j in stale:j.status='unknown';j.error='انقطع تأكيد الإرسال؛ تحقق من المنصة قبل إعادة الإرسال'
        db.commit()
        j=db.scalar(select(WhatsAppJob34).where(WhatsAppJob34.status=='pending').order_by(WhatsAppJob34.id).with_for_update(skip_locked=True))
        if not j:return False
        r=db.get(WhatsAppRecipient34,j.student_id);s=db.get(HalaqaStudent,j.student_id);ring=db.get(Halaqa,s.halaqa_id) if s else None
        if not r or not r.opted_in or r.phone!=j.phone or not s or not s.active or not ring or not ring.active:
            j.status='cancelled';db.commit();return True
        # Generate with the same scoped serializer, without forging a user/session.
        from app.api.features64 import week_summary
        from app.models import HalaqaProgress, Assignment
        start=j.end-timedelta(days=6)
        rows=db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id==s.id,HalaqaProgress.day>=start-timedelta(days=7),HalaqaProgress.day<=j.end).order_by(HalaqaProgress.day)).all()
        cur=week_summary([x for x in rows if x.day>=start],db);prev=week_summary([x for x in rows if x.day<start],db);n=db.scalar(select(Assignment).where(Assignment.student_id==s.id,Assignment.status=='pending').order_by(Assignment.due,Assignment.id))
        report={'student':s.full_name,'from':str(start),'to':str(j.end),'current':cur,'score_change':round(cur['score']-prev['score'],1) if cur['score'] is not None and prev['score'] is not None else None,
          'next':{'due':str(n.due),'memorization':n.memorization,'revision':n.revision} if n else None,'notes':[{'note':x.notes} for x in rows if x.day>=start and x.notes]}
        from app.api.engagement64 import ReportPreview38
        preview=db.scalar(select(ReportPreview38).where(ReportPreview38.job_id==j.id))
        if preview:report=json.loads(preview.payload)['report']
        payload=template_payload(j.phone,report);jid=j.id
        claimed=db.execute(update(WhatsAppJob34).where(WhatsAppJob34.id==jid,WhatsAppJob34.status=='pending').values(status='sending',updated_at=datetime.utcnow()))
        if claimed.rowcount!=1:db.rollback();return True
        db.commit()
    try:message_id=send_template(payload);status='accepted';error=''
    except ValueError:message_id='';status='failed';error='رفضت المنصة الطلب؛ تحقق من الرقم والقالب وإعدادات الربط'
    except Exception:message_id='';status='unknown';error='تعذر تأكيد قبول الإرسال؛ تحقق من المنصة قبل إعادة الإرسال'
    with SessionLocal() as db:
        j=db.get(WhatsAppJob34,jid)
        if j:
            # Webhook can arrive before this transaction. Keep the more advanced status.
            j.message_id=message_id
            if j.status=='sending':j.status=status;j.error=error
            receipt=db.get(WhatsAppReceipt34,message_id) if message_id else None
            if receipt:
                j.status=receipt.status
                j.error='تعذر توصيل الرسالة وفق إشعار واتساب' if receipt.status=='failed' else ''
            j.updated_at=datetime.utcnow();db.commit()
    return True

@router.post('/mosques/{mid}/students/{sid}/jobs/{jid}/retry')
def retry_failed(mid:int,sid:int,jid:int,request:Request,db=Depends(get_db)):
    from app.api.scoring64 import evaluation_access52
    u,_=evaluation_access52(db,request,mid,sid,True)
    if not enabled(db):raise HTTPException(422,'الإرسال التلقائي غير مفعّل')
    j=db.scalar(select(WhatsAppJob34).where(WhatsAppJob34.id==jid,WhatsAppJob34.student_id==sid).with_for_update())
    if not j:raise HTTPException(404,'التقرير غير موجود')
    if j.status!='failed':raise HTTPException(409,'إعادة المحاولة للطلبات التي فشل إرسالها فقط')
    j.status='pending';j.error='';j.message_id='';j.updated_at=datetime.utcnow()
    audit(db,u.id,mid,'whatsapp_report_retry_v34',str(jid));db.commit();return {'ok':True}

@router.get('/webhook')
def verify(request:Request):
    q=request.query_params;token=os.getenv('WHATSAPP_VERIFY_TOKEN','')
    if token and q.get('hub.mode')=='subscribe' and hmac.compare_digest(q.get('hub.verify_token','').encode(),token.encode()):return PlainTextResponse(q.get('hub.challenge',''))
    raise HTTPException(403,'Verification failed')

@router.post('/webhook')
async def callback(request:Request):
    raw=await request.body();secret=os.getenv('WHATSAPP_APP_SECRET','')
    if len(raw)>1024*1024:raise HTTPException(413,'Payload too large')
    expected='sha256='+hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
    if not secret or not hmac.compare_digest(request.headers.get('X-Hub-Signature-256','').encode(),expected.encode()):raise HTTPException(403,'Invalid signature')
    try:payload=json.loads(raw)
    except ValueError:raise HTTPException(400,'Invalid JSON')
    rank={'accepted':0,'sent':1,'delivered':2,'read':3}
    with SessionLocal() as db:
        for entry in payload.get('entry',[]):
            for change in entry.get('changes',[]):
                value=change.get('value',{})
                if value.get('metadata',{}).get('phone_number_id',os.getenv('WHATSAPP_PHONE_NUMBER_ID'))!=os.getenv('WHATSAPP_PHONE_NUMBER_ID'):continue
                for message in value.get('messages',[]):
                    text=message.get('text',{}).get('body','').strip().lower()
                    if text in ('stop','إيقاف','ايقاف','إلغاء','الغاء'):
                        phone=message.get('from','')
                        for recipient in db.scalars(select(WhatsAppRecipient34).where(WhatsAppRecipient34.phone==phone)):
                            recipient.opted_in=False;recipient.updated_at=datetime.utcnow()
                            audit(db,recipient.changed_by,None,'whatsapp_optout_received_v34',str(recipient.student_id))
                for event in value.get('statuses',[]):
                    j=db.scalar(select(WhatsAppJob34).where(WhatsAppJob34.message_id==event.get('id',''),WhatsAppJob34.message_id!=''))
                    state=event.get('status')
                    message_id=event.get('id','')
                    if state in ('sent','delivered','read','failed') and 0<len(message_id)<=200:
                        receipt=db.get(WhatsAppReceipt34,message_id)
                        if not receipt:receipt=WhatsAppReceipt34(message_id=message_id,status=state);db.add(receipt)
                        elif (state=='failed' and receipt.status not in ('delivered','read')) or rank.get(state,-1)>rank.get(receipt.status,-1):receipt.status=state
                        receipt.updated_at=datetime.utcnow()
                    if j and state in ('sent','delivered','read','failed'):
                        if state=='failed' and j.status not in ('delivered','read'):j.status='failed';j.error='تعذر توصيل الرسالة وفق إشعار واتساب'
                        elif rank.get(state,-1)>rank.get(j.status,-1):j.status=state;j.error=''
                        j.updated_at=datetime.utcnow()
        db.query(WhatsAppReceipt34).filter(WhatsAppReceipt34.updated_at<datetime.utcnow()-timedelta(days=30)).delete()
        db.commit()
    return {'ok':True}

def start_worker():
    import logging
    stop=threading.Event()
    def loop():
        while not stop.is_set():
            try:
                with SessionLocal() as db:
                    schedule_reports(db,datetime.now(ZoneInfo('Asia/Riyadh')));db.commit()
                for _ in range(20):
                    if stop.is_set() or not process_one():break
            except IntegrityError:pass
            except Exception:logging.getLogger(__name__).error('WhatsApp worker paused after an error')
            stop.wait(30)
    t=threading.Thread(target=loop,daemon=True,name='whatsapp-reports-v34');t.start();return stop,t
