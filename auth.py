"""
FastAPI JWT authentication dependency powered by Supabase.

All protected API routes declare `current_user: dict = Depends(get_current_user)`.
The middleware in app_server.py also guards every /api/* route (except /api/health)
at the transport level so unprotected route definitions cannot slip through.

Required environment variables (set in .env):
    SUPABASE_JWT_SECRET  –  Project Settings → API → JWT Settings → JWT Secret
    SUPABASE_URL         –  Project Settings → API → Project URL
                           (required when Supabase issues RS256-signed tokens)
"""

from __future__ import annotations

import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")

_bearer = HTTPBearer(auto_error=True)

# Lazy-initialised JWKS client (only used for RS256 / asymmetric tokens)
_jwks_client: Optional[jwt.PyJWKClient] = None


def _get_jwks_client() -> Optional[jwt.PyJWKClient]:
    global _jwks_client
    if _jwks_client is None and SUPABASE_URL:
        _jwks_client = jwt.PyJWKClient(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


def decode_supabase_token(token: str) -> dict:
    """
    Decode and validate a Supabase JWT regardless of whether it is HS256 or
    RS256-signed.  Raises jwt.InvalidTokenError (or a subclass) on failure.
    """
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")

    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            raise jwt.InvalidTokenError(
                "SUPABASE_JWT_SECRET is not set — cannot validate HS256 token."
            )
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )

    # RS256 / ES256 / other asymmetric algorithms → use JWKS
    client = _get_jwks_client()
    if client is None:
        raise jwt.InvalidTokenError(
            f"Token uses {alg} but SUPABASE_URL is not set — "
            "cannot fetch JWKS to verify asymmetric token."
        )
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=[alg],
        options={"verify_aud": False},
    )


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Decode and validate the Supabase JWT supplied as a Bearer token.

    Returns the decoded payload dict (contains `sub`, `email`, `role`, etc.).
    Raises HTTP 401 on any validation failure.
    """
    try:
        return decode_supabase_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
