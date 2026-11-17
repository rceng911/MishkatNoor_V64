from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import secrets
import os
from urllib.parse import parse_qs

from fastapi import FastAPI, Form, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError

from app.core.config import ROOT, settings
from app.services.deployment64 import database_startup_guard51, verify_ui_files51

verify_ui_files51(ROOT)

from app.db.session import engine, Base, SessionLocal
from app.db.migrations import ensure_v10_schema, ensure_v48_schema
from app.models import User, Mosque, AuthSession
from app.api.halaqat import router, PORTAL_ROLES
from app.api.student_file import router as student_router
from app.api.routes import audit, session
from app.services.session_store import create_session, delete_session, COOKIE
from app.services.auth import hash_password, verify_password, needs_password_rehash
from app.services.account_policy import normalize_username, validate_username
from app.services.password_policy import validate_password
from app.services.security64 import audit_fingerprint, clear_account_failures, is_login_limited, record_login_failure, request_address

from app.services.origin64 import source_is_allowed

CSRF_COOKIE = "halaqat_csrf48"
_UNKNOWN_LOGIN_HASH = hash_password(secrets.token_urlsafe(24))

@asynccontextmanager
async def lifespan(app):
    with database_startup_guard51():
        Base.metadata.create_all(engine)
        ensure_v10_schema(engine)
        ensure_v48_schema(engine)
        # Singleton organization serializes the one-time owner setup.
        with SessionLocal() as db:
            from app.services.owner_policy64 import bind_primary_owner50
            bind_primary_owner50(db)
            db.commit()
            if not db.get(Mosque, 1) and not db.scalar(select(User.id).where(User.role == "owner")):
                db.add(Mosque(id=1, name="جهة التحفيظ"))
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
    from app.services.notifications import start_worker
    worker = start_worker() if os.getenv('NOTIFICATION_WORKER', '1' if settings.secure_cookie else '0') == '1' else None
    from app.api.backups64 import start_backup_worker
    backup_worker = start_backup_worker() if os.getenv('BACKUP_WORKER', '1' if settings.secure_cookie else '0') == '1' else None
    from app.api.whatsapp64 import start_worker as start_whatsapp_worker
    whatsapp_worker = start_whatsapp_worker() if os.getenv('WHATSAPP_WORKER', '1' if settings.secure_cookie else '0') == '1' else None
    try:
        yield
    finally:
        if worker:
            worker[0].set()
            worker[1].join(timeout=2)
        if backup_worker:
            backup_worker[0].set()
            backup_worker[1].join(timeout=2)
        if whatsapp_worker:
            whatsapp_worker[0].set()
            whatsapp_worker[1].join(timeout=2)

app = FastAPI(title="حلقات مشكاة ونور", version=settings.app_version, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=str(ROOT / "web" / "static")), name="static")
templates = Jinja2Templates(directory=str(ROOT / "web" / "templates"))
app.include_router(router)
app.include_router(student_router)
from app.api.security64 import router as security48_router
app.include_router(security48_router)
from app.api.followup import router as followup_router
app.include_router(followup_router)
from app.api.scoring64 import router as scoring52_router
app.include_router(scoring52_router)
from app.api.development import router as development_router
app.include_router(development_router)
from app.api.management import router as management_router
app.include_router(management_router)
from app.api.learning import router as learning_router
app.include_router(learning_router)
from app.api.advancement import router as advancement_router
from app.api.notifications import router as notifications_router
from app.api.access import router as access_router
app.include_router(advancement_router)
app.include_router(notifications_router)
app.include_router(access_router)
from app.api.accounts64 import router as accounts32_router
app.include_router(accounts32_router)
from app.api.owner_admin64 import router as owner_admin50_router
app.include_router(owner_admin50_router)
from app.api.staff_tools64 import router as staff_tools50_router
app.include_router(staff_tools50_router)

@app.get('/sw.js')
def service_worker():
    from fastapi.responses import FileResponse
    return FileResponse(ROOT / 'web' / 'static' / 'sw.js', media_type='application/javascript', headers={'Service-Worker-Allowed':'/', 'Cache-Control':'no-cache'})

@app.get('/offline')
def offline_page():
    from fastapi.responses import FileResponse
    return FileResponse(ROOT / 'web' / 'static' / 'offline.html',media_type='text/html')

def user_for(request):
    s = session(request)
    if not s:
        return None
    with SessionLocal() as db:
        u = db.get(User, s.user_id)
        return u if u and u.active else None

def has_owner():
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.role == "owner")) is not None

def page(request, mode, error="", status=200, required=False):
    account_user = user_for(request) if mode == "security" else None
    return templates.TemplateResponse(request=request, name="auth.html", context={
        "title": {"login": "تسجيل الدخول", "setup": "إعداد المالك", "security": "الأمان وكلمة المرور"}[mode],
        "mode": mode, "error": error, "required": required, "production": settings.secure_cookie,
        "csrf_token": getattr(request.state, "csrf49_token", request.cookies.get(CSRF_COOKIE, "")),
        "account_user": account_user, "show_security_events": bool(account_user and account_user.role == "owner"),
    }, status_code=status)

def signed_in_response(user_id, url, remember=False, request=None):
    lifetime_hours = settings.remember_days * 24 if remember else settings.session_hours
    if request:
        delete_session(request.cookies.get(COOKIE))
    token = create_session(user_id, lifetime_hours, request.headers.get("user-agent", "") if request else "")
    response = RedirectResponse(url, status_code=303)
    cookie_options = {"httponly": True, "secure": settings.secure_cookie, "samesite": "lax", "path": "/"}
    if remember:
        cookie_options["max_age"] = lifetime_hours * 3600
    response.set_cookie(COOKIE, token, **cookie_options)
    return response

@app.middleware("http")
async def security_boundary(request, call_next):
    path = request.url.path
    cookie_token = request.cookies.get(CSRF_COOKIE, "")
    valid_cookie = 32 <= len(cookie_token) <= 128 and all(char.isascii() and (char.isalnum() or char in "_-") for char in cookie_token)
    request.state.csrf49_token = cookie_token if valid_cookie else secrets.token_urlsafe(32)
    response = None
    signed_webhook = path == "/api/v34/whatsapp/webhook" and request.method == "POST"
    if request.method not in ("GET", "HEAD", "OPTIONS") and not signed_webhook:
        form_paths = {"/login", "/setup", "/account/security", "/logout", "/demo/login", "/demo/logout"}
        presented = request.headers.get("x-csrf-token", "")
        if path in form_paths and request.headers.get("content-type", "").split(";", 1)[0] == "application/x-www-form-urlencoded":
            body = await request.body()
            if len(body) <= 65536:
                try:
                    presented = parse_qs(body.decode("utf-8", "replace"), max_num_fields=100).get("csrf_token", [""])[0]
                except ValueError:
                    presented = ""
        matched = bool(valid_cookie and presented and secrets.compare_digest(cookie_token.encode(), presented.encode()))
        explicit_source = "origin" in request.headers or "referer" in request.headers
        message = ""
        if request.headers.get("sec-fetch-site") == "cross-site" or (explicit_source and not source_is_allowed(request)):
            message = "تعذر تأكيد مصدر الطلب. افتح الموقع من رابطه الصحيح ثم أعد المحاولة."
        elif not explicit_source and not matched:
            message = "حدّث الصفحة ثم أعد المحاولة لتجديد حماية الطلب."
        elif (path.startswith("/api/") or path in form_paths) and not matched:
            message = "انتهت حماية الطلب؛ حدّث الصفحة ثم أعد المحاولة."
        if message:
            response = JSONResponse({"detail": message}, status_code=403) if path.startswith("/api/") else page(request, "login", message, 403)
    if response is None and path not in ("/login", "/login/verify", "/logout", "/account/security", "/healthz", "/demo") and not path.startswith(("/static/", "/demo/")):
        u = user_for(request)
        if u and u.force_password_change:
            if path.startswith("/api/"):
                response = JSONResponse({"detail": "غيّر الرمز المؤقت أولًا", "redirect": "/account/security"}, status_code=403)
            else:
                response = RedirectResponse("/account/security", status_code=303)
    if response is None:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    if not path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store"
    if settings.secure_cookie:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    if not valid_cookie:
        response.set_cookie(
            CSRF_COOKIE,
            request.state.csrf49_token,
            httponly=False,
            secure=settings.secure_cookie,
            samesite="strict",
            path="/",
        )
    return response

@app.exception_handler(IntegrityError)
async def conflict(request, exc):
    return JSONResponse({"detail": "يوجد سجل بنفس البيانات أو تحديث متزامن؛ حدّث الصفحة وحاول مجددًا"}, status_code=409)

@app.get("/healthz")
def health():
    try:
        with SessionLocal() as db:
            db.execute(select(1))
        return {"ok": True}
    except Exception:
        return JSONResponse({"ok": False}, status_code=503)

@app.get("/")
def home(request: Request):
    return RedirectResponse("/setup" if not has_owner() else "/halaqat" if user_for(request) else "/login", status_code=303)

@app.get("/setup")
def setup_page(request: Request):
    return RedirectResponse("/login", status_code=303) if has_owner() else page(request, "setup")

@app.post("/setup")
def setup(request: Request, organization: str=Form(...), full_name: str=Form(...), username: str=Form(...),
          password: str=Form(...), confirm_password: str=Form(...), setup_token: str=Form("")):
    if settings.secure_cookie and (not settings.setup_token or not secrets.compare_digest(setup_token.encode(), settings.setup_token.encode())):
        return page(request, "setup", "رمز إعداد المالك غير صحيح", 403)
    username = normalize_username(username)
    valid, error = validate_username(username)
    if not valid:
        return page(request, "setup", error, 422)
    valid, error = validate_password(password)
    if not valid or len(password) > 128:
        return page(request, "setup", error or "الرمز طويل جدًا", 422)
    if password != confirm_password:
        return page(request, "setup", "كلمتا المرور غير متطابقتين", 422)
    if not 2 <= len(full_name.strip()) <= 180 or not 2 <= len(organization.strip()) <= 180:
        return page(request, "setup", "أدخل اسمك واسم جهة التحفيظ", 422)
    with SessionLocal() as db:
        org = db.scalar(select(Mosque).where(Mosque.id == 1).with_for_update())
        if db.scalar(select(User.id).where(User.role == "owner")):
            return RedirectResponse("/login", status_code=303)
        org.name = organization.strip()
        u = User(email="owner@accounts.invalid", username=username, full_name=full_name.strip(), password_hash=hash_password(password), role="owner", mosque_id=1)
        db.add(u); db.flush()
        audit(db, u.id, 1, "owner_setup")
        db.commit()
        uid = u.id
    return signed_in_response(uid, "/halaqat", request=request)

@app.get("/login")
def login_page(request: Request):
    return RedirectResponse("/setup", status_code=303) if not has_owner() else page(request, "login")

@app.post("/login")
def login(request: Request, identity: str=Form(...), password: str=Form(...), remember_me: str=Form("")):
    identity = normalize_username(identity)
    address = request_address(request)
    now = datetime.utcnow()
    with SessionLocal() as db:
        if is_login_limited(db, identity, address, now):
            return page(request, "login", "محاولات كثيرة؛ حاول بعد 15 دقيقة أو تواصل مع المالك", 429)
        u = db.scalar(select(User).where(User.username == identity, User.active.is_(True))) if len(identity) <= 80 else None
        password_ok = verify_password(password, u.password_hash if u else _UNKNOWN_LOGIN_HASH) if len(password) <= 128 else False
        if not u or not password_ok:
            record_login_failure(db, identity, address, now)
            audit(db, u.id if u else None, u.mosque_id if u else None, "login_failed_v48", f"account={audit_fingerprint(identity)} address={audit_fingerprint(address)} method=password")
            db.commit()
            return page(request, "login", "اسم المستخدم أو الرمز غير صحيح", 401)
        clear_account_failures(db, identity)
        if needs_password_rehash(u.password_hash):
            u.password_hash = hash_password(password)
            audit(db, u.id, u.mosque_id, "password_hash_upgraded49")
        audit(db, u.id, u.mosque_id, "login")
        db.commit()
        uid, required = u.id, u.force_password_change
    return signed_in_response(uid, "/account/security" if required else "/halaqat", remember_me == "1", request)

@app.get("/login/verify")
def retired_verification_page():
    return RedirectResponse("/login", status_code=303)

@app.get("/account/security")
def password_page(request: Request):
    u = user_for(request)
    return page(request, "security", required=u.force_password_change) if u else RedirectResponse("/login", status_code=303)

@app.post("/account/security")
def password_update(request: Request, current_password: str=Form(...), new_password: str=Form(...), confirm_password: str=Form(...)):
    u = user_for(request)
    if not u:
        return RedirectResponse("/login", status_code=303)
    error = ""
    valid, policy_error = validate_password(new_password)
    if not verify_password(current_password, u.password_hash):
        error = "الرمز الحالي غير صحيح"
    elif new_password != confirm_password:
        error = "الرمزان الجديدان غير متطابقين"
    elif not valid or len(new_password) > 128:
        error = policy_error or "الرمز طويل جدًا"
    elif verify_password(new_password, u.password_hash):
        error = "اختر رمزًا مختلفًا عن الرمز الحالي"
    if error:
        return page(request, "security", error, 422, required=u.force_password_change)
    active_session = session(request)
    remember = bool(active_session and active_session.expires_at > datetime.utcnow() + timedelta(hours=settings.session_hours + 1))
    with SessionLocal() as db:
        current = db.get(User, u.id)
        current.password_hash = hash_password(new_password)
        current.force_password_change = False
        db.execute(delete(AuthSession).where(AuthSession.user_id == u.id))
        audit(db, u.id, u.mosque_id, "password_changed")
        db.commit()
    return signed_in_response(u.id, "/halaqat", remember, request)

@app.post("/logout")
def logout(request: Request):
    current_user = user_for(request)
    delete_session(request.cookies.get(COOKIE))
    if current_user:
        with SessionLocal() as db:
            audit(db, current_user.id, current_user.mosque_id, "logout")
            db.commit()
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(COOKIE)
    return response

@app.get("/halaqat")
def portal(request: Request):
    u = user_for(request)
    if not u:
        return RedirectResponse("/login", status_code=303)
    return templates.TemplateResponse(request=request, name="halaqat.html", context={
        "title": "حلقات مشكاة ونور", "show_version": u.role == "owner", "app_version": settings.app_version
    })

from app.api.release64 import router as release31_router
from app.api.deletion64 import router as deletion31_router
app.include_router(release31_router)
app.include_router(deletion31_router)

from app.api.service64 import router as service32_router
app.include_router(service32_router)

from app.api.profile64 import router as profile33_router
app.include_router(profile33_router)

from app.api.features64 import router as features34_router
from app.api.backups64 import router as backups34_router
app.include_router(features34_router)
app.include_router(backups34_router)
from app.api.whatsapp64 import router as whatsapp34_router
app.include_router(whatsapp34_router)
from app.api.workspace64 import router as workspace35_router
app.include_router(workspace35_router)
from app.api.practice64 import router as practice36_router, PracticeBoundary36
app.include_router(practice36_router)
app.add_middleware(PracticeBoundary36)
from app.api.workflow64 import router as workflow37_router
app.include_router(workflow37_router)

from app.api.engagement64 import router as engagement38_router
app.include_router(engagement38_router)

from app.api.demo64 import router as demo42_router, DemoBoundary42
app.include_router(demo42_router)
app.add_middleware(DemoBoundary42)

from app.api.day64 import router as day53_router
app.include_router(day53_router)

from app.api.week64 import router as week56_router
app.include_router(week56_router)

from app.api.period64 import router as period_router64
app.include_router(period_router64)
