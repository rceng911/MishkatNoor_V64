"""Read-only prospect portal, separate URL namespace and isolated synthetic data."""
import hashlib
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Request, HTTPException, Form
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import Field, model_validator
from sqlalchemy import select, delete, update, ForeignKey, String, DateTime, Boolean, event
from sqlalchemy.orm import Mapped, mapped_column
from starlette.concurrency import run_in_threadpool

from app.core.config import ROOT, settings
from app.db.session import Base, PrimarySession, practice_session36
from app.api.halaqat import Input
from app.api.practice64 import make_workspace, real_owner
from app.models import LoginAttempt
from app.services.auth import verify_password

router = APIRouter()
templates = Jinja2Templates(directory=str(ROOT / 'web/templates'))
COOKIE = 'halaqat_demo42'
LINK_COOKIE = 'halaqat_demo52'
ROLES = {'supervisor':'المشرف','teacher':'المعلم','student':'الطالب','guardian':'ولي الأمر'}

class DemoAccount42(Base):
    __tablename__ = 'demo_accounts_v42'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180))
    username: Mapped[str] = mapped_column(String(30), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class DemoSession42(Base):
    __tablename__ = 'demo_sessions_v42'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey('demo_accounts_v42.id'))
    expires_at: Mapped[datetime] = mapped_column(DateTime)

class DemoTrial52(Base):
    __tablename__ = 'demo_trials_v52'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180))
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class DemoSession52(Base):
    __tablename__ = 'demo_sessions_v52'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    trial_id: Mapped[int] = mapped_column(ForeignKey('demo_trials_v52.id'), index=True)
    access_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)

class Duration53(Input):
    duration_value:int=Field(strict=True,ge=1)
    duration_unit:Literal['hours','days']='days'

    def expiry(self,now):
        try:return now+timedelta(**{self.duration_unit:self.duration_value})
        except OverflowError:raise HTTPException(422,'تجاوزت المدة نطاق التاريخ المتاح')

class NewTrial52(Duration53):
    name:str=Field(min_length=2,max_length=180)

def owner_only(request):
    if getattr(request.state,'practice_user36',None) or getattr(request.state,'demo42',False):
        raise HTTPException(403,'متاح للمالك من حسابه الأساسي فقط')
    owner = real_owner(request)
    if not owner:
        raise HTTPException(403,'متاح للمالك فقط')
    return owner

def pack(a):
    return {'id':a.id,'name':a.name,'username':a.username,'expires_at':a.expires_at.isoformat()+'Z','active':a.active,'expired':a.expires_at<=datetime.utcnow()}

def trial_pack52(a):
    return {'id':a.id,'name':a.name,'expires_at':a.expires_at.isoformat()+'Z','created_at':a.created_at.isoformat()+'Z','active':a.active,'expired':a.expires_at<=datetime.utcnow()}

def digest52(token):
    return hashlib.sha256(token.encode()).hexdigest()

def expire_trials52(db, now):
    # Every demo request checks the database clock boundary, including open tabs.
    expired = select(DemoTrial52.id).where(DemoTrial52.expires_at<=now)
    db.execute(delete(DemoSession52).where((DemoSession52.expires_at<=now) | DemoSession52.trial_id.in_(expired)))
    db.execute(update(DemoTrial52).where(DemoTrial52.expires_at<=now).values(active=False,token_hash=None))
    db.execute(delete(DemoSession42).where((DemoSession42.expires_at<=now) | DemoSession42.account_id.in_(select(DemoAccount42.id).where(DemoAccount42.expires_at<=now))))

def issue52(a):
    token=secrets.token_urlsafe(48)
    a.token_hash=digest52(token)
    # Relative URLs avoid trusting Host or an HTTP connection behind HTTPS proxy.
    return '/demo/access/'+token

@router.get('/api/demo42/trials')
def trials52(request:Request):
    owner_only(request)
    with PrimarySession() as db:
        expire_trials52(db,datetime.utcnow());db.commit()
        return {'trials':[trial_pack52(a) for a in db.scalars(select(DemoTrial52).order_by(DemoTrial52.id.desc()))]}

@router.post('/api/demo42/trials')
def create_trial52(p:NewTrial52,request:Request):
    owner=owner_only(request)
    now=datetime.utcnow()
    with PrimarySession() as db:
        expire_trials52(db,now)
        expires=p.expiry(now)
        a=DemoTrial52(name=p.name,created_by=owner,expires_at=expires,active=True)
        url=issue52(a)
        db.add(a);db.commit()
        return {'trial':trial_pack52(a),'url':url}

@router.post('/api/demo42/trials/{tid}/revoke')
def revoke_trial52(tid:int,request:Request):
    owner_only(request)
    with PrimarySession() as db:
        a=db.scalar(select(DemoTrial52).where(DemoTrial52.id==tid).with_for_update())
        if not a:raise HTTPException(404,'التجربة غير موجودة')
        a.active=False;a.token_hash=None
        db.execute(delete(DemoSession52).where(DemoSession52.trial_id==tid));db.commit()
    return {'ok':True}

@router.post('/api/demo42/trials/{tid}/reissue')
def reissue_trial52(tid:int,request:Request):
    owner_only(request)
    with PrimarySession() as db:
        a=db.scalar(select(DemoTrial52).where(DemoTrial52.id==tid).with_for_update())
        if not a:raise HTTPException(404,'التجربة غير موجودة')
        if not a.active or a.expires_at<=datetime.utcnow():
            raise HTTPException(409,'انتهت التجربة أو أُلغيت؛ أنشئ تجربة جديدة')
        db.execute(delete(DemoSession52).where(DemoSession52.trial_id==tid))
        url=issue52(a);db.commit()
        return {'trial':trial_pack52(a),'url':url}

def expiry_label46(account):
    value=account.expires_at
    if value.tzinfo is None:value=value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone(timedelta(hours=3))).strftime('%Y-%m-%d · %H:%M')

@router.get('/api/demo42/accounts')
def accounts(request:Request):
    owner_only(request)
    with PrimarySession() as db:
        return {'accounts':[pack(a) for a in db.scalars(select(DemoAccount42).order_by(DemoAccount42.id.desc()))], 'url':'/demo'}

@router.post('/api/demo42/accounts')
def create_account(request:Request):
    owner_only(request)
    raise HTTPException(410,'استخدم إنشاء تجربة برابط دخول دون كلمة مرور')

@router.post('/api/demo42/accounts/{aid}/revoke')
def revoke(aid:int,request:Request):
    owner_only(request)
    with PrimarySession() as db:
        a=db.get(DemoAccount42,aid)
        if not a:raise HTTPException(404,'الحساب غير موجود')
        a.active=False
        db.execute(delete(DemoSession42).where(DemoSession42.account_id==aid));db.commit()
    return {'ok':True}

def demo_account(request):
    now=datetime.utcnow()
    link_token=request.cookies.get(LINK_COOKIE,'')
    with PrimarySession() as db:
        expire_trials52(db,now);db.commit()
        if link_token:
            if len(link_token)>200:return None
            s=db.get(DemoSession52,digest52(link_token))
            if not s or s.expires_at<=now:return None
            a=db.get(DemoTrial52,s.trial_id)
            return a if a and a.active and a.expires_at>now and a.token_hash==s.access_hash else None
    token=request.cookies.get(COOKIE,'')
    if not token or len(token)>200:return None
    with PrimarySession() as db:
        s=db.get(DemoSession42,hashlib.sha256(token.encode()).hexdigest())
        if not s or s.expires_at<=now:return None
        a=db.get(DemoAccount42,s.account_id)
        return a if a and a.active and a.expires_at>now else None

def clear_demo_cookies52(response):
    response.delete_cookie(LINK_COOKIE,path='/demo')
    response.delete_cookie(COOKIE,path='/demo')
    return response

def isolated_headers52(scope, request, include_sessions=False):
    headers=[(k,v) for k,v in scope['headers'] if k.lower() not in (b'cookie',b'x-workspace36')]
    names=['halaqat_csrf48']+([COOKIE,LINK_COOKIE] if include_sessions else [])
    cookies=[]
    for name in names:
        value=request.cookies.get(name,'')
        if value and len(value)<=200 and all(c.isascii() and (c.isalnum() or c in '_-') for c in value):
            cookies.append(name+'='+value)
    if cookies:headers.append((b'cookie','; '.join(cookies).encode('ascii')))
    return headers

def unavailable52(request):
    response=templates.TemplateResponse(request=request,name='demo64.html',context={'title':'التجربة غير متاحة','account':None,'account_expiry46':'','roles':ROLES,'error':'رابط التجربة غير متاح؛ قد يكون انتهى أو أُلغي أو أُعيد إصداره.'},status_code=410)
    return clear_demo_cookies52(response)

@router.get('/demo/access/{token}')
def access52(token:str,request:Request):
    now=datetime.utcnow()
    if not 60<=len(token)<=100 or not all(c.isascii() and (c.isalnum() or c in '_-') for c in token):
        return unavailable52(request)
    with PrimarySession() as db:
        expire_trials52(db,now)
        a=db.scalar(select(DemoTrial52).where(DemoTrial52.token_hash==digest52(token),DemoTrial52.active.is_(True),DemoTrial52.expires_at>now).with_for_update())
        if not a:
            db.commit()
            return unavailable52(request)
        raw=secrets.token_urlsafe(48)
        # Rotation binds sessions to the current link, including concurrent opens.
        db.add(DemoSession52(token_hash=digest52(raw),trial_id=a.id,access_hash=a.token_hash,expires_at=a.expires_at))
        expires=a.expires_at
        db.commit()
    response=RedirectResponse('/demo',303)
    response.delete_cookie(COOKIE,path='/demo')
    response.set_cookie(LINK_COOKIE,raw,path='/demo',httponly=True,secure=settings.secure_cookie or request.url.scheme=='https',samesite='lax',max_age=max(1,int((expires-now).total_seconds())))
    return response

@router.get('/demo')
@router.get('/demo/')
def landing(request:Request):
    account=demo_account(request)
    error='رابط التجربة غير متاح؛ قد يكون انتهى أو أُلغي أو أُعيد إصداره.' if request.query_params.get('unavailable') else ''
    response=templates.TemplateResponse(request=request,name='demo64.html',context={'title':'تجربة حلقات مشكاة ونور','account':account,'account_expiry46':expiry_label46(account) if account else '','roles':ROLES,'error':error})
    return clear_demo_cookies52(response) if not account and (request.cookies.get(LINK_COOKIE) or request.cookies.get(COOKIE)) else response

@router.post('/demo/login')
def login(request:Request,username:str=Form(...),password:str=Form(...)):
    from app.services.account_policy import normalize_username
    identity=normalize_username(username)
    # Limit both guessed accounts and password attempts from a single client.
    ip=request.client.host if request.client else 'unknown'
    keys=[hashlib.sha256(('demo42:'+identity).encode()).hexdigest(),hashlib.sha256(('demo42-ip:'+ip).encode()).hexdigest()]
    now=datetime.utcnow()
    with PrimarySession() as db:
        attempts=[db.get(LoginAttempt,k) for k in keys]
        if any(a and a.failures>=10 and a.last_attempt>now-timedelta(minutes=15) for a in attempts):
            raise HTTPException(429,'محاولات كثيرة؛ حاول بعد 15 دقيقة')
        a=db.scalar(select(DemoAccount42).where(DemoAccount42.username==identity))
        if len(password)>128 or not a or not a.active or a.expires_at<=now or not verify_password(password,a.password_hash):
            for key,attempt in zip(keys,attempts):
                if not attempt:attempt=LoginAttempt(key=key,failures=0);db.add(attempt)
                if attempt.last_attempt and attempt.last_attempt<now-timedelta(minutes=15):attempt.failures=0
                attempt.failures+=1;attempt.last_attempt=now
            db.commit()
            return templates.TemplateResponse(request=request,name='demo64.html',context={'title':'التجربة','account':None,'account_expiry46':'','roles':ROLES,'error':'الحساب أو كلمة المرور غير صحيحة، أو انتهت صلاحية التجربة.'},status_code=401)
        for attempt in attempts:
            if attempt:db.delete(attempt)
        token=secrets.token_urlsafe(48)
        db.execute(delete(DemoSession42).where(DemoSession42.expires_at<=now))
        db.add(DemoSession42(token_hash=hashlib.sha256(token.encode()).hexdigest(),account_id=a.id,expires_at=min(a.expires_at,now+timedelta(hours=8))))
        db.commit()
    response=RedirectResponse('/demo',303)
    response.delete_cookie(LINK_COOKIE,path='/demo')
    response.set_cookie(COOKIE,token,path='/demo',httponly=True,secure=settings.secure_cookie,samesite='lax',max_age=8*3600)
    return response

@router.post('/demo/logout')
def logout(request:Request):
    token=request.cookies.get(COOKIE,'')
    with PrimarySession() as db:
        db.execute(delete(DemoSession42).where(DemoSession42.token_hash==hashlib.sha256(token.encode()).hexdigest()))
        db.execute(delete(DemoSession52).where(DemoSession52.token_hash==digest52(request.cookies.get(LINK_COOKIE,''))))
        db.commit()
    return clear_demo_cookies52(RedirectResponse('/demo',303))

_fixture=None
_lock=threading.Lock()
def seed_evaluations52(workspace):
    """Give each synthetic family a current score without touching live records."""
    from app.api.student_file import today
    from app.models import HalaqaProgress, HalaqaStudent
    from app.models.scoring64 import DailyEvaluation52, DailyScoringPolicy52
    from app.services.scoring64 import points52
    day=today()
    with workspace['factory']() as db:
        db.add(DailyScoringPolicy52(mosque_id=1,activated_on=day,activated_by=workspace['users']['teacher']))
        for index, student in enumerate(db.scalars(select(HalaqaStudent).order_by(HalaqaStudent.id))):
            scores={'behavior_score':9,'memorization_score':8+index%3,'tajweed_score':9,
                    'recitation_score':9,'tarteel_score':8,'plan_commitment_score':10}
            progress=HalaqaProgress(student_id=student.id,day=day,attendance='present',
                memorized='سورة النبأ: 1–10',revision='سورة الإخلاص',memorized_amount=1,revision_amount=2,
                memorization_score=scores['memorization_score'],tajweed_score=scores['tajweed_score'],
                notes='تقييم وهمي للتوضيح: أداء جيد مع العناية بمخارج الحروف.',created_by=workspace['users']['teacher'])
            db.add(progress)
            db.add(DailyEvaluation52(progress=progress,ring_id=student.halaqa_id,**scores,**points52(scores),
                notes=progress.notes,evaluated_by=workspace['users']['teacher']))
        db.commit()

def fixture(request):
    global _fixture
    with _lock:
        # One small immutable fixture per worker. Never uses the live database.
        if _fixture is None:
            workspace=make_workspace(0,request)
            try:seed_evaluations52(workspace)
            except Exception:
                workspace['engine'].dispose();workspace['directory'].cleanup();raise
            _fixture=workspace
            @event.listens_for(_fixture['engine'],'connect')
            def readonly(connection,_):connection.execute('PRAGMA query_only=ON')
        return _fixture

class DemoBoundary42:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']=='websocket' and scope.get('path','').startswith('/demo/'):
            return await send({'type':'websocket.close','code':1008})
        if scope['type']!='http':return await self.app(scope,receive,send)
        path=scope['path']
        if path=='/demo' or path.startswith('/demo/') or path.startswith('/api/demo42/'):
            original_send=send
            async def private_send(message):
                if message['type']=='http.response.start':
                    blocked={b'referrer-policy',b'x-robots-tag',b'cache-control'}
                    message=dict(message)
                    message['headers']=[(k,v) for k,v in message.get('headers',[]) if k.lower() not in blocked]+[(b'referrer-policy',b'no-referrer'),(b'x-robots-tag',b'noindex, nofollow, noarchive'),(b'cache-control',b'no-store')]
                await original_send(message)
            send=private_send
        if not path.startswith('/demo/view/'):
            if path=='/demo' or path.startswith('/demo/'):
                # A stale owner-practice cookie must never intercept public
                # trial login, logout or a newly issued access link.
                inner=dict(scope)
                inner['headers']=isolated_headers52(scope,Request(scope),include_sessions=True)
                return await self.app(inner,receive,send)
            return await self.app(scope,receive,send)
        request=Request(scope)
        parts=path.split('/',4)
        role=parts[3] if len(parts)>3 else ''
        target='/'+parts[4] if len(parts)>4 else '/halaqat'
        a=await run_in_threadpool(demo_account,request)
        if not a:
            response=JSONResponse({'detail':'انتهت التجربة أو لم تسجل الدخول','redirect':'/demo'},401) if target.startswith('/api/') else RedirectResponse('/demo',303)
            return await clear_demo_cookies52(response)(scope,receive,send)
        if role not in ROLES:
            return await JSONResponse({'detail':'واجهة غير متاحة'},404)(scope,receive,send)
        if request.method not in ('GET','HEAD'):
            return await JSONResponse({'detail':'حساب تجريبي للعرض فقط؛ الإضافة والتعديل والحذف والإرسال غير متاحة.'},403)(scope,receive,send)
        safe_api=target.startswith(('/api/halaqat/','/api/access/','/api/v32/','/api/v33/','/api/v34/','/api/v35/','/api/v37/','/api/v38/','/api/v52/','/api/v53/'))
        if not (target=='/halaqat' or safe_api) or target.startswith(('/api/v34/backups','/api/v34/whatsapp')) or target.endswith(('/offline-snapshot','/offline-sync')) or any(part in ('.','..','') for part in target.split('/')[1:]):
            return await JSONResponse({'detail':'هذا الإجراء غير متاح في العرض التجريبي'},403)(scope,receive,send)
        w=await run_in_threadpool(fixture,request)
        inner=dict(scope)
        inner['path']=target;inner['raw_path']=target.encode()
        # Forward only the CSRF cookie. Replacing it on every synthetic fetch
        # would invalidate the already-rendered logout form and the owner's tab.
        inner['headers']=isolated_headers52(scope,request)
        inner['state']=dict(scope.get('state',{}),practice_user36=w['users'][role],demo42=True,demo_base42='/demo/view/'+role,demo_role42=role,demo_expires_at46=expiry_label46(a))
        binding=practice_session36.set(w['factory'])
        try:await self.app(inner,receive,send)
        finally:practice_session36.reset(binding)

@router.put('/api/demo42/trials/{tid}/duration')
def change_duration(tid:int,p:Duration53,request:Request):
    owner_only(request)
    now=datetime.utcnow()
    with PrimarySession() as db:
        row=db.scalar(select(DemoTrial52).where(DemoTrial52.id==tid).with_for_update())
        if not row or not row.active or row.expires_at<=now:raise HTTPException(409,'اختر تجربة فعالة')
        row.expires_at=p.expiry(now)
        db.execute(update(DemoSession52).where(DemoSession52.trial_id==tid).values(expires_at=row.expires_at))
        db.commit()
        return trial_pack52(row)
