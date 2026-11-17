"""Resolve the browser's public origin without trusting forwarded client headers."""
import os
from urllib.parse import urlsplit

from app.core.config import settings


def normalize_origin(value):
    try:
        parsed = urlsplit(value or "")
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return None
        scheme = parsed.scheme.lower()
        host = parsed.hostname.lower().rstrip(".")
        port = parsed.port
        if ":" in host:
            host = "[" + host + "]"
        suffix = "" if port is None or port == (443 if scheme == "https" else 80) else ":" + str(port)
        return scheme + "://" + host + suffix
    except (ValueError, TypeError):
        return None


def allowed_origins(request):
    configured = [os.getenv(name, "").strip() for name in ("APP_PUBLIC_URL", "RENDER_EXTERNAL_URL")]
    configured = [value for value in configured if value]
    if configured:
        return {origin for value in configured if (origin := normalize_origin(value))}
    host = request.headers.get("host", request.url.netloc)
    scheme = "https" if settings.secure_cookie else request.url.scheme
    origins = {normalize_origin(scheme + "://" + host)}
    # HTTPS can terminate at a proxy while the app receives HTTP on the same host.
    # Matching the exact authority keeps other origins blocked without trusting X-Forwarded-*.
    if request.url.scheme == "http":
        origins.add(normalize_origin("https://" + host))
    return origins - {None}


def source_origin(request):
    return normalize_origin(request.headers.get("origin") or request.headers.get("referer"))


def source_is_allowed(request):
    return source_origin(request) in allowed_origins(request)


