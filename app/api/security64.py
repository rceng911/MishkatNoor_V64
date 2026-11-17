"""Password-based account security and session management."""
import hashlib
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from app.api.routes import audit, session
from app.db.session import SessionLocal
from app.models import AuditLog, AuthSession, User
from app.services.session_store import COOKIE

router = APIRouter(prefix="/api/security48", tags=["security"])


def _authenticated_user(request, db):
    current = session(request)
    if not isinstance(current, AuthSession):
        raise HTTPException(401, "سجّل الدخول إلى حسابك أولًا")
    user = db.get(User, current.user_id)
    if not user or not user.active:
        raise HTTPException(401, "الحساب غير متاح")
    return user


@router.post("/sessions/revoke-others")
def revoke_other_sessions(request: Request):
    with SessionLocal() as db:
        user = _authenticated_user(request, db)
        current = request.cookies.get(COOKIE, "")
        if not current:
            raise HTTPException(401, "انتهت الجلسة؛ سجّل الدخول مرة أخرى")
        current_hash = hashlib.sha256(current.encode()).hexdigest()
        result = db.execute(delete(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.token_hash != current_hash,
        ))
        removed = result.rowcount or 0
        audit(db, user.id, user.mosque_id, "other_sessions_revoked_v48", str(removed))
        db.commit()
        return {"ok": True, "removed": removed}


@router.get("/sessions")
def list_sessions(request: Request):
    with SessionLocal() as db:
        user = _authenticated_user(request, db)
        current = request.cookies.get(COOKIE, "")
        current_hash = hashlib.sha256(current.encode()).hexdigest() if current else ""
        now = datetime.utcnow()
        rows = db.scalars(select(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.expires_at > now,
        ).order_by(AuthSession.created_at.desc().nullslast(), AuthSession.id.desc())).all()
        return {"items": [{
            "id": row.id,
            "device": row.device_label or "جلسة قديمة أو جهاز غير معروف",
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "current": bool(current_hash and row.token_hash == current_hash),
        } for row in rows]}


class SessionRevoke(BaseModel):
    session_id: int = Field(gt=0)


@router.post("/sessions/revoke")
async def revoke_session(request: Request):
    try:
        data = SessionRevoke.model_validate(await request.json())
    except Exception:
        raise HTTPException(422, "تعذر تحديد الجهاز المطلوب")
    with SessionLocal() as db:
        user = _authenticated_user(request, db)
        current = request.cookies.get(COOKIE, "")
        current_hash = hashlib.sha256(current.encode()).hexdigest() if current else ""
        row = db.scalar(select(AuthSession).where(
            AuthSession.id == data.session_id,
            AuthSession.user_id == user.id,
        ))
        if not row:
            raise HTTPException(404, "الجلسة غير موجودة أو انتهت")
        if row.token_hash == current_hash:
            raise HTTPException(400, "لا يمكن إنهاء الجهاز المستخدم حاليًا من هنا")
        db.delete(row)
        audit(db, user.id, user.mosque_id, "session_revoked_v48")
        db.commit()
        return {"ok": True}


@router.get("/events")
def security_events(request: Request):
    with SessionLocal() as db:
        user = _authenticated_user(request, db)
        if user.role != "owner":
            raise HTTPException(403, "سجل الأمان متاح للمالك فقط")
        labels = {
            "login": "تسجيل دخول",
            "login_failed": "محاولة دخول غير ناجحة",
            "login_failed_v48": "محاولة دخول غير ناجحة",
            "logout": "تسجيل خروج",
            "other_sessions_revoked_v48": "إنهاء جلسات أجهزة أخرى",
            "session_revoked_v48": "إنهاء جلسة جهاز",
            "password_changed": "تغيير كلمة المرور",
            "password_hash_upgraded49": "تحديث حماية كلمة المرور",
            "owner_account_removed_v50": "حذف حساب مالك وإيقاف دخوله",
        }
        rows = db.scalars(select(AuditLog).where(AuditLog.action.in_(list(labels))).order_by(AuditLog.created_at.desc()).limit(100)).all()
        result = []
        for row in rows:
            actor = db.get(User, row.user_id) if row.user_id else None
            result.append({
                "event": labels[row.action],
                "account": actor.full_name if actor else "محاولة على حساب غير معروف",
                "details": "عدد الجلسات المنتهية: " + row.details if row.action == "other_sessions_revoked_v48" else "",
                "at": row.created_at.isoformat() + "Z",
            })
        return {"items": result}
