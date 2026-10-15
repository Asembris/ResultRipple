"""Same-origin guard for every state-changing request.

The session cookie is `SameSite=Lax`, which already keeps it off most
cross-site subrequests. This is the second, explicit line: a POST, PUT, PATCH or
DELETE must say where it came from, and that origin must be the site's own.

The browser sets `Origin` on every such fetch; `Referer` is the fallback for the
rare client that omits it. In a deployment a request that names neither is
refused. Locally, a request with neither is a test client or a script talking to
the API directly and is let through, but a named foreign origin never is.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import Request, status
from fastapi.responses import JSONResponse

from .config import get_settings

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def claimed_origin(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin is not None:
        return origin.strip().rstrip("/")
    referer = request.headers.get("referer")
    if referer:
        parts = urlsplit(referer)
        if parts.scheme and parts.netloc:
            return f"{parts.scheme}://{parts.netloc}"
        return referer
    return None


def _refuse(code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN, content={"code": code, "detail": detail}
    )


async def same_origin_guard(request: Request, call_next):
    if request.method in SAFE_METHODS:
        return await call_next(request)
    settings = get_settings()
    origin = claimed_origin(request)
    if origin is None:
        if not settings.is_local:
            return _refuse(
                "ORIGIN_REQUIRED", "a state-changing request must come from this site"
            )
    elif origin not in settings.allowed_origins:
        return _refuse("ORIGIN_REFUSED", "this request did not come from this site")
    return await call_next(request)
