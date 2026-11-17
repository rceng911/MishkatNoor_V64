"""Primary-owner permissions bind to a database identity, never a client role."""
import hashlib
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.models import AuthSession, PrimaryOwner50, User
from app.services.account_policy import normalize_username
from app.services.session_store import COOKIE


def bind_primary_owner50(db):
    binding = db.get(PrimaryOwner50, 1)
    if binding:
        return binding
    identity = normalize_username(settings.system_owner_username)
    if not identity:
        return None
    user = db.scalar(select(User).where(User.username == identity, User.role == "owner", User.active.is_(True)))
    if not user:
        return None
    try:
        with db.begin_nested():
            binding = PrimaryOwner50(id=1, user_id=user.id)
            db.add(binding)
            db.flush()
    except IntegrityError:
        binding = db.get(PrimaryOwner50, 1)
    return binding


def real_user50(request, db):
    if getattr(request.state, "practice_user36", None) or getattr(request.state, "demo42", False):
        raise HTTPException(403, "إدارة الملاك متاحة من الحساب الأساسي فقط")
    raw = request.cookies.get(COOKIE, "")
    if not raw or len(raw) > 200:
        raise HTTPException(401, "سجّل الدخول إلى حسابك أولًا")
    current = db.scalar(select(AuthSession).where(AuthSession.token_hash == hashlib.sha256(raw.encode()).hexdigest(), AuthSession.expires_at > datetime.utcnow()))
    user = db.get(User, current.user_id) if current else None
    if not user or not user.active:
        raise HTTPException(401, "الحساب غير متاح أو انتهت الجلسة")
    if user.force_password_change:
        raise HTTPException(403, "غيّر الرمز المؤقت أولًا")
    return user


def can_manage_owners50(request, db, user):
    if getattr(request.state, "practice_user36", None) or getattr(request.state, "demo42", False):
        return False
    binding = db.get(PrimaryOwner50, 1)
    return bool(binding and user.role == "owner" and user.active and user.id == binding.user_id)


def primary_actor50(request, db):
    user = real_user50(request, db)
    if not can_manage_owners50(request, db, user):
        raise HTTPException(403, "حذف حسابات الملاك متاح لمالك النظام الأساسي وحده")
    return user
