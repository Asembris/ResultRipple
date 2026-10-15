"""Demo identity: signed, expiring, HttpOnly sessions resolved server-side.

Naming an identity is not authenticating as one. Issuing a session for an
analyst, reviewer, or operator requires a server-side passcode that never
reaches the repository or the browser bundle; a request body can then never
name the actor, and roles come from the Person node in the graph plus the
signed cookie.

Anyone without a session is an observer: every read stays open, every mutation
requires an authenticated identity.

This is a sandbox permission model for a demo workspace, not enterprise
authentication.
"""

from __future__ import annotations

import logging
import secrets
import threading
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from . import domain
from .config import Settings, get_settings
from .deps import get_graph_client
from .graph import GraphClient, GraphUnavailable
from .service import Actor

logger = logging.getLogger("resultripple.auth")

# Only these roles may hold a session. Anything else observes.
ALLOWED_DEMO_ROLES = frozenset({"analyst", "reviewer", "operator"})

_generated_passcodes: dict[str, str] = {}
_generation_lock = threading.Lock()


def _parse_passcodes(raw: str) -> dict[str, str]:
    """Parse `person-ari=...,person-noor=...` from the environment."""
    parsed: dict[str, str] = {}
    for item in raw.split(","):
        entry = item.strip()
        if not entry:
            continue
        person_id, separator, passcode = entry.partition("=")
        if not separator or not person_id.strip() or not passcode.strip():
            raise ValueError("DEMO_PASSCODES entries must look like person-id=passcode")
        parsed[person_id.strip()] = passcode.strip()
    return parsed


def demo_passcodes(settings: Settings) -> dict[str, str]:
    """Configured credentials, or throwaway ones generated for local use.

    Generated values exist only in this process and are logged once so the
    operator can sign in. Configured values are never logged.
    """
    configured = _parse_passcodes(settings.demo_passcodes)
    if configured:
        return configured
    if not settings.is_local:
        # enforce_deployment_safety already refuses this at startup; if it is
        # ever reached, no identity is issuable rather than every identity.
        return {}
    with _generation_lock:
        if not _generated_passcodes:
            for person_id in domain.PROVISIONED_DEMO_IDENTITIES:
                _generated_passcodes[person_id] = secrets.token_urlsafe(9)
            logger.warning(
                "DEMO_PASSCODES is unset; generated development passcodes for this "
                "process only: %s",
                " ".join(f"{k}={v}" for k, v in _generated_passcodes.items()),
            )
        return dict(_generated_passcodes)


def authenticate_demo_identity(settings: Settings, person: dict, passcode: str) -> Actor:
    """Verify a demo credential before any session is issued."""
    person_id = person["person_id"]
    if person.get("demo_role") not in ALLOWED_DEMO_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {
                "code": "NOT_A_DEMO_IDENTITY",
                "detail": f"{person_id} observes this workspace and cannot hold a session",
            },
        )
    expected = demo_passcodes(settings).get(person_id)
    if not expected:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {
                "code": "NO_DEMO_CREDENTIAL",
                "detail": f"no server-side passcode is provisioned for {person_id}",
            },
        )
    if not secrets.compare_digest(passcode, expected):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            {
                "code": "INVALID_DEMO_CREDENTIAL",
                "detail": "that passcode does not match this demo identity",
            },
        )
    return Actor(
        person_id=person_id,
        display_name=person["display_name"],
        demo_role=person["demo_role"],
        review_capable=bool(person["review_capable"]),
    )


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="resultripple-demo-session")


def issue_session(response: Response, settings: Settings, actor: Actor) -> None:
    token = _serializer(settings).dumps({"person_id": actor.person_id})
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=False,  # local HTTP demo; a deployment behind TLS sets this true.
        path="/",
    )


def clear_session(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie, path="/")


def resolve_actor(
    request: Request,
    settings: Settings,
    graph: GraphClient,
    *,
    required: bool = True,
) -> Actor | None:
    token = request.cookies.get(settings.session_cookie)
    if not token:
        if required:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                {"code": "NO_SESSION", "detail": "sign in as a demo identity first"},
            )
        return None
    try:
        payload = _serializer(settings).loads(
            token, max_age=settings.session_max_age_seconds
        )
    except (BadSignature, SignatureExpired) as exc:
        # An expired or forged cookie is simply not a session. Mutations refuse
        # it; reads fall back to observing rather than breaking the page.
        if not required:
            return None
        code = "SESSION_EXPIRED" if isinstance(exc, SignatureExpired) else "INVALID_SESSION"
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            {"code": code, "detail": "this session is not usable; sign in again"},
        ) from exc

    # Identity is re-resolved from the graph on every request, so a revoked or
    # renamed person cannot act on a stale cookie claim.
    try:
        person = graph.person(str(payload.get("person_id", "")))
    except GraphUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"{exc.code}: authoritative context unavailable"
        ) from exc
    if person is None:
        if not required:
            return None
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            {"code": "UNKNOWN_IDENTITY", "detail": "this identity no longer exists"},
        )
    return Actor(
        person_id=person["person_id"],
        display_name=person["display_name"],
        demo_role=person["demo_role"],
        review_capable=bool(person["review_capable"]),
    )


def current_actor(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    graph: Annotated[GraphClient, Depends(get_graph_client)],
) -> Actor:
    actor = resolve_actor(request, settings, graph, required=True)
    assert actor is not None
    return actor


def optional_actor(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    graph: Annotated[GraphClient, Depends(get_graph_client)],
) -> Actor | None:
    return resolve_actor(request, settings, graph, required=False)
