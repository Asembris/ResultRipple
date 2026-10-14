"""Demo identity: signed, expiring, HttpOnly sessions resolved server-side.

A request body can never name the actor. Roles come from the Person node in the
graph plus the signed cookie, so document ownership, a review-capable identity,
and a prompt are all insufficient on their own.

This is a sandbox permission model for a demo workspace, not enterprise
authentication.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import Settings, get_settings
from .deps import get_graph_client
from .graph import GraphClient, GraphUnavailable
from .service import Actor

ALLOWED_DEMO_ROLES = frozenset({"analyst", "reviewer", "operator"})


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
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no demo session")
        return None
    try:
        payload = _serializer(settings).loads(
            token, max_age=settings.session_max_age_seconds
        )
    except SignatureExpired as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired") from exc
    except BadSignature as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session") from exc

    # Identity is re-resolved from the graph on every request, so a revoked or
    # renamed person cannot act on a stale cookie claim.
    try:
        person = graph.person(str(payload.get("person_id", "")))
    except GraphUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"{exc.code}: authoritative context unavailable"
        ) from exc
    if person is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown demo identity")
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
