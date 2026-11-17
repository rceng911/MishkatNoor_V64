"""Database-backed throttling for password login, including concurrent attempts."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from sqlalchemy import case, delete, select

from app.models import LoginAttempt

WINDOW = timedelta(minutes=15)
ACCOUNT_LIMIT = 10
ADDRESS_LIMIT = 30


def _key(scope: str, value: str) -> str:
    return hashlib.sha256(f"security48:{scope}:{value}".encode("utf-8")).hexdigest()


def request_address(request) -> str:
    # Use the socket peer only; never trust a client-supplied forwarded header.
    return request.client.host if request.client else "unknown"


def login_keys(identity: str, address: str) -> tuple[str, str]:
    return _key("account", identity.casefold()), _key("address", address)


def is_login_limited(db, identity: str, address: str, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    account_key, address_key = login_keys(identity, address)
    account = db.get(LoginAttempt, account_key)
    by_address = db.get(LoginAttempt, address_key)
    return bool(
        (account and account.failures >= ACCOUNT_LIMIT and account.last_attempt > now - WINDOW)
        or (by_address and by_address.failures >= ADDRESS_LIMIT and by_address.last_attempt > now - WINDOW)
    )


def record_login_failure(db, identity: str, address: str, now: datetime | None = None) -> None:
    now = now or datetime.utcnow()
    db.execute(delete(LoginAttempt).where(LoginAttempt.last_attempt < now - WINDOW))
    dialect = db.get_bind().dialect.name
    for key in login_keys(identity, address):
        if dialect in ("sqlite", "postgresql"):
            if dialect == "sqlite":
                from sqlalchemy.dialects.sqlite import insert
            else:
                from sqlalchemy.dialects.postgresql import insert
            statement = insert(LoginAttempt).values(key=key, failures=1, last_attempt=now)
            db.execute(statement.on_conflict_do_update(index_elements=[LoginAttempt.key], set_={
                "failures": case((LoginAttempt.last_attempt <= now - WINDOW, 1), else_=LoginAttempt.failures + 1),
                "last_attempt": now,
            }))
            continue
        row = db.scalar(select(LoginAttempt).where(LoginAttempt.key == key).with_for_update())
        if row is None:
            row = LoginAttempt(key=key, failures=0, last_attempt=now)
            db.add(row)
        elif row.last_attempt < now - WINDOW:
            row.failures = 0
        row.failures += 1
        row.last_attempt = now


def clear_account_failures(db, identity: str) -> None:
    account_key, _ = login_keys(identity, "")
    row = db.get(LoginAttempt, account_key)
    if row:
        db.delete(row)
    # Remove counters created by releases before the address-based limit.
    legacy_key = hashlib.sha256(identity.casefold().encode("utf-8")).hexdigest()
    legacy = db.get(LoginAttempt, legacy_key)
    if legacy:
        db.delete(legacy)


def audit_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:12]
