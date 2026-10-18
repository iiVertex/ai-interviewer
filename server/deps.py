"""Shared FastAPI dependencies: the Supabase admin client and the signed-in user."""

from dataclasses import dataclass
from functools import lru_cache

from fastapi import Depends, Header, HTTPException
from supabase import Client, create_client

from .config import get_settings


@lru_cache
def get_db() -> Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        raise HTTPException(500, "Supabase is not configured on the server")
    # Service-role client: bypasses RLS, so every query below must filter by user id.
    return create_client(s.supabase_url, s.supabase_service_key)


@dataclass(frozen=True)
class User:
    id: str
    email: str | None


def current_user(authorization: str = Header(default=""), db: Client = Depends(get_db)) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token")
    try:
        res = db.auth.get_user(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    if not res or not res.user:
        raise HTTPException(401, "Invalid or expired session")
    return User(id=res.user.id, email=res.user.email)
