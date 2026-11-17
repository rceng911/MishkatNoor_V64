from __future__ import annotations
import base64
import hashlib
import hmac
import os

_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(dk).decode("ascii").rstrip("="),
    )


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_password(password: str, password_hash: str) -> bool:
    if not isinstance(password, str) or len(password) > 128:
        return False
    if password_hash.startswith("pbkdf2_sha256$"):
        try:
            _, iters, salt_b64, hash_b64 = password_hash.split("$", 3)
            iterations = int(iters)
            if not 1 <= iterations <= 10_000_000:
                return False
            expected = _b64decode(hash_b64)
            actual = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), _b64decode(salt_b64), iterations
            )
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

    # Compatibility with accounts created in older releases on Render.
    if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("ascii"))
        except Exception:
            return False
    return False


def needs_password_rehash(password_hash: str) -> bool:
    try:
        return not password_hash.startswith("pbkdf2_sha256$") or int(password_hash.split("$", 2)[1]) < _ITERATIONS
    except (ValueError, IndexError):
        return True
