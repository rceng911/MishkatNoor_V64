"""Owner-only practice sessions. Each workspace has a separate disposable database.

The real login cookie is never replaced. A practice cookie is bound to that live
owner session; losing either credential closes access, never falls back to live
data. Browser workspace markers reject actions from stale tabs after switching.
"""
import asyncio
import hashlib
import secrets
import tempfile
import time
from datetime import timedelta
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.db.session import Base, PrimarySession, practice_session36
from app.models import User, Mosque, Halaqa, HalaqaTeacher, HalaqaSupervisor, HalaqaStudent, HalaqaProgress, StudentPlan, RingCalendar, Assignment
from app.services.session_store import COOKIE, get_session
from app.api.halaqat import Input
from app.api.student_file import today

router = APIRouter(prefix='/api/practice36')
DEMO_COOKIE = 'halaqat_practice36'
ROLES = {'owner':'المالك التجريبي', 'supervisor':'مشرف المجمع', 'teacher':'المعلم', 'student':'الطالب', 'guardian':'ولي الأمر'}
workspaces = {}
LIFETIME = 7200


def real_owner(request):
    s = get_session(request.cookies.get(COOKIE))
    if not s:
        return None
    with PrimarySession() as db:
        u = db.get(User, s.user_id)
        return u.id if u and u.active and u.role == 'owner' and not u.force_password_change else None


def bound_workspace(request, owner):
    w = workspaces.get(request.cookies.get(DEMO_COOKIE))
    fingerprint = hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest()
    return w if w and w['owner'] == owner and w['session'] == fingerprint and w['expires'] > time.monotonic() else None


def make_workspace(owner, request):
    # Called under the middleware gate; no request can still be using a removed DB.
    for key, old in list(workspaces.items()):
        if old['expires'] <= time.monotonic():
            old['engine'].dispose(); old['directory'].cleanup(); del workspaces[key]
    if len(workspaces) >= 20:
        raise HTTPException(429, 'عدد التجارب المفتوحة وصل للحد؛ أغلق تجربة سابقة ثم حاول مجددًا')
    directory = tempfile.TemporaryDirectory(prefix='mishkat-practice36-')
    engine = create_engine('sqlite:///' + (Path(directory.name) / 'practice.db').as_posix(), poolclass=NullPool, connect_args={'check_same_thread':False, 'timeout':30})
    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        Base.metadata.create_all(engine)
        with factory() as db:
            db.add(Mosque(id=1, name='مجمع التجربة — بيانات وهمية')); db.flush()
            users = {}
            for key, label in ROLES.items():
                role = {'owner':'owner', 'supervisor':'halaqa_supervisor', 'teacher':'halaqa_teacher', 'student':'halaqa_student', 'guardian':'halaqa_student'}[key]
                user = User(username='practice_'+key, email=key+'@example.invalid', password_hash='disabled-practice-login', full_name=label+' التجريبي' if key!='owner' else label, role=role, account_type=key if key in ('student','guardian') else '', mosque_id=1)
                db.add(user); db.flush(); users[key]=user.id
            rings=[]
            for name in ('حلقة الحفظ التجريبية','حلقة المراجعة التجريبية'):
                r=Halaqa(mosque_id=1,name=name,schedule='بعد العصر',supervisor_id=users['supervisor']);db.add(r);db.flush();rings.append(r.id)
                db.add(HalaqaSupervisor(halaqa_id=r.id,user_id=users['supervisor'],assigned_by=users['owner']))
                db.add(HalaqaTeacher(halaqa_id=r.id,user_id=users['teacher'],assigned_by=users['owner']))
                db.add(RingCalendar(halaqa_id=r.id,weekdays_json='[0,1,2,3,4,5,6]',time_text='بعد العصر'))
            for index, (name, recipient) in enumerate((('طالب التجربة الأول','student'),('ابن ولي الأمر التجريبي','guardian'),('ابنة ولي الأمر التجريبية','guardian'))):
                s=HalaqaStudent(halaqa_id=rings[index%2],user_id=users[recipient],full_name=name,recipient_type=recipient,guardian_name='ولي الأمر التجريبي',school_grade='الصف السادس',current_memorization='جزء عم',notes='بيانات وهمية للتجربة فقط')
                db.add(s);db.flush()
                db.add(StudentPlan(student_id=s.id,memorization_amount=1,revision_amount=2,sessions_per_week=5,updated_by=users['teacher']))
                for days in range(1,8):
                    db.add(HalaqaProgress(student_id=s.id,day=today()-timedelta(days=days),attendance='absent' if days==4 else 'present',memorized='سورة النبأ',revision='سورة الإخلاص',memorized_amount=0 if days==4 else 1,revision_amount=2,memorization_score=None if days==4 else 8,tajweed_score=None if days==4 else 9,created_by=users['teacher']))
                db.add(Assignment(student_id=s.id,due=today(),memorization='النبأ: 1–10',revision='الإخلاص',created_by=users['teacher']))
            from app.api.features64 import Admission34
            db.add(Admission34(mosque_id=1,ring_id=rings[0],full_name='طلب قبول تجريبي',created_by=users['supervisor']))
            db.commit()
    except Exception:
        engine.dispose();directory.cleanup();raise
    return {'owner':owner,'session':hashlib.sha256(request.cookies.get(COOKIE,'').encode()).hexdigest(),'expires':time.monotonic()+LIFETIME,'directory':directory,'engine':engine,'factory':factory,'users':users,'role':'teacher','marker':secrets.token_hex(16)}


@router.get('/status')
def status(request:Request):
    owner=real_owner(request);w=bound_workspace(request,owner) if owner else None
    return {'allowed':False,'active':bool(w),'role':w['role'] if w else None,'marker':w['marker'] if w else 'live','roles':ROLES if owner else {}}


class Start(Input):
    role:Literal['owner','supervisor','teacher','student','guardian']='teacher'


@router.post('/start')
def start(p:Start,request:Request):
    raise HTTPException(410,'تم إلغاء تجربة الواجهات')

@router.post('/reset')
def reset(request:Request):
    raise HTTPException(410,'تم إلغاء تجربة الواجهات')


@router.post('/exit')
def leave(request:Request):
    owner=real_owner(request);w=bound_workspace(request,owner) if owner else None
    if w:
        w['engine'].dispose();w['directory'].cleanup();workspaces.pop(request.cookies.get(DEMO_COOKIE),None)
    response=JSONResponse({'ok':True}) if request.headers.get('accept')=='application/json' else RedirectResponse('/halaqat#home',303)
    response.delete_cookie(DEMO_COOKIE,secure=settings.secure_cookie,httponly=True,samesite='lax')
    return response


class PracticeBoundary36:
    def __init__(self, app):
        self.app=app;self.gate=asyncio.Lock()

    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        request=Request(scope);path=request.url.path
        if path.startswith('/static/') or path in ('/sw.js','/healthz'):
            return await self.app(scope,receive,send)
        is_control=path.startswith('/api/practice36/')
        cookie=request.cookies.get(DEMO_COOKIE)
        marker=request.headers.get('x-workspace36')
        if not cookie and not is_control:
            if marker and marker!='live':
                return await JSONResponse({'detail':'انتهت التجربة أو تغيّرت الواجهة؛ أعد فتح الصفحة','redirect':'/halaqat#home'},409)(scope,receive,send)
            return await self.app(scope,receive,send)
        async with self.gate:
            owner=await run_in_threadpool(real_owner,request)
            w=bound_workspace(request,owner) if owner else None
            expected=w['marker'] if w else 'live'
            if is_control:
                # Exit must remain usable even if the session or workspace expired.
                if path!='/api/practice36/exit' and request.method!='GET' and marker and marker!=expected:
                    return await JSONResponse({'detail':'تغيّرت جلسة التجربة؛ حدّث الصفحة','redirect':'/halaqat#home'},409)(scope,receive,send)
                return await self.app(scope,receive,send)
            if w:
                with w['factory']() as db:
                    selected=db.get(User,w['users'][w['role']])
                    if not selected or not selected.active or selected.force_password_change:w=None
            if not w:
                if path.startswith('/api/'):
                    response=JSONResponse({'detail':'انتهت جلسة التجربة؛ ارجع لحساب المالك','redirect':'/halaqat'},409)
                else:
                    response=HTMLResponse('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>انتهت التجربة</title><h1>انتهت جلسة التجربة</h1><p>بياناتك الأساسية محفوظة. ارجع لحسابك ثم ابدأ تجربة جديدة.</p><form method="post" action="/api/practice36/exit"><button>الرجوع لحسابي</button></form></html>',409,headers={'Cache-Control':'no-store'})
                return await response(scope,receive,send)
            if path.startswith('/api/') and marker and marker!=expected:
                return await JSONResponse({'detail':'تغيّرت الواجهة في تبويب آخر؛ حدّث الصفحة','redirect':'/halaqat#home'},409)(scope,receive,send)
            if request.method not in ('GET','HEAD','OPTIONS') and marker!=expected:
                return await JSONResponse({'detail':'حدّث صفحة التجربة قبل إجراء التعديل'},409)(scope,receive,send)
            if path in ('/login','/logout','/setup','/account/security','/offline') or path.endswith(('/offline-snapshot','/offline-sync')) or (request.method not in ('GET','HEAD','OPTIONS') and (path.startswith('/api/notifications/') or path.startswith('/api/v34/whatsapp/'))):
                return await JSONResponse({'detail':'هذا الإجراء غير متاح في التجربة. استخدم زر الرجوع للمالك لحسابك الأساسي.'},403)(scope,receive,send)
            scope.setdefault('state',{})['practice_user36']=w['users'][w['role']]
            scope['state']['practice_marker36']=w['marker']
            binding=practice_session36.set(w['factory'])
            try:return await self.app(scope,receive,send)
            finally:practice_session36.reset(binding)
