import hashlib
import secrets
from datetime import datetime, timedelta
from sqlalchemy import select, delete
from app.db.session import SessionLocal
from app.models import AuthSession
from app.core.config import settings

COOKIE = "halaqat_session"
def device_label(user_agent: str = "") -> str:
    value = (user_agent or "").casefold()
    if "ipad" in value or "tablet" in value:
        return "جهاز لوحي"
    if "iphone" in value:
        return "iPhone"
    if "android" in value or "mobile" in value:
        return "هاتف Android"
    if "windows" in value:
        return "كمبيوتر Windows"
    if "macintosh" in value or "mac os" in value:
        return "كمبيوتر Mac"
    if "linux" in value:
        return "كمبيوتر Linux"
    return "جهاز غير معروف"

def create_session(user_id, lifetime_hours=None, user_agent="", *, db=None):
    raw = secrets.token_urlsafe(48)
    lifetime_hours = lifetime_hours or settings.session_hours
    def save(connection):
        connection.execute(delete(AuthSession).where(AuthSession.expires_at < datetime.utcnow()))
        connection.add(AuthSession(token_hash=hashlib.sha256(raw.encode()).hexdigest(), user_id=user_id, expires_at=datetime.utcnow() + timedelta(hours=lifetime_hours), device_label=device_label(user_agent)))
    if db is not None:
        save(db)
    else:
        with SessionLocal() as connection:
            save(connection)
            connection.commit()
    return raw

def get_session(raw):
    if not raw or len(raw) > 200:
        return None
    with SessionLocal() as db:
        return db.scalar(select(AuthSession).where(AuthSession.token_hash == hashlib.sha256(raw.encode()).hexdigest(), AuthSession.expires_at > datetime.utcnow()))

def delete_session(raw):
    if raw:
        with SessionLocal() as db:
            db.execute(delete(AuthSession).where(AuthSession.token_hash == hashlib.sha256(raw.encode()).hexdigest()))
            db.commit()
