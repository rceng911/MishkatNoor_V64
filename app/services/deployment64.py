"""Fail early on incomplete uploads and report DNS failures without secrets."""
from contextlib import contextmanager
from pathlib import Path
import socket


REQUIRED_UI_FILES51 = (
    "web/static/styles.css",
    "web/static/halaqat.js",
    "web/static/brand-logo.png",
    "web/templates/base.html",
    "web/templates/auth.html",
    "web/templates/halaqat.html",
    "web/templates/provider64.html",
)

DNS_STARTUP_MESSAGE51 = (
    "تعذّر بدء النظام: لم يتمكن الخادم من العثور على عنوان قاعدة البيانات (DNS). "
    "راجع DATABASE_URL في إعدادات خدمة Render وانسخ الرابط الحالي من قاعدة PostgreSQL الأصلية. "
    "للرابط الداخلي، يجب أن تكون الخدمة والقاعدة في مساحة العمل والمنطقة نفسيهما. "
    "تحقق من حالة القاعدة؛ لا تنشئ قاعدة فارغة بديلة ولا تغيّر بيانات القاعدة الأصلية."
)


def verify_ui_files51(root: Path) -> None:
    """Require the uploaded app and web folders to share one project root."""
    missing = [name for name in REQUIRED_UI_FILES51 if not (root / name).is_file()]
    if missing:
        raise RuntimeError(
            "ملفات الواجهة غير مكتملة؛ تعذّر بدء النظام. الملفات الناقصة: "
            + "، ".join(missing)
            + ". ارفع مجلد web كاملًا بجانب app وDockerfile وVERSION، ثم أعد النشر."
        )


def is_dns_failure51(error: BaseException) -> bool:
    """Inspect underlying errors without formatting SQLAlchemy statements/params."""
    pending = [error]
    seen = set()
    markers = (
        "failed to resolve host",
        "could not translate host name",
        "name or service not known",
        "temporary failure in name resolution",
        "getaddrinfo failed",
        "nodename nor servname provided",
        "no address associated with hostname",
    )
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, socket.gaierror):
            return True
        for attribute in ("orig", "__cause__", "__context__"):
            nested = getattr(current, attribute, None)
            if isinstance(nested, BaseException):
                pending.append(nested)
        if type(current).__module__.startswith("sqlalchemy"):
            continue
        for argument in current.args:
            if isinstance(argument, str) and any(marker in argument.lower() for marker in markers):
                return True
    return False


@contextmanager
def database_startup_guard51():
    """Keep startup failed, replacing only DNS errors with a safe explanation."""
    try:
        yield
    except Exception as error:
        if is_dns_failure51(error):
            raise RuntimeError(DNS_STARTUP_MESSAGE51) from None
        raise
