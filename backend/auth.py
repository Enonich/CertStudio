import base64
import hashlib
import hmac
import json
import logging
import os
import threading
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    sub: str
    role: str
    email: str | None
    claims: dict[str, Any]


def _decode_base64url(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(f"{segment}{padding}")


def _decode_json_segment(segment: str) -> dict[str, Any]:
    try:
        raw = _decode_base64url(segment).decode("utf-8")
        value = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token.") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=401, detail="Invalid bearer token.")
    return value


def _is_auth_required() -> bool:
    return os.getenv("CERTSTUDIO_AUTH_REQUIRED", "true").strip().lower() not in {"0", "false", "no"}


def _expected_roles() -> set[str]:
    raw = os.getenv("CERTSTUDIO_ALLOWED_ROLES", "authenticated,service_role")
    values = {value.strip() for value in raw.split(",") if value.strip()}
    return values or {"authenticated", "service_role"}


def _validate_claim_audience(claims: dict[str, Any]) -> None:
    expected_aud = os.getenv("SUPABASE_JWT_AUD", "").strip()
    if not expected_aud:
        return

    aud = claims.get("aud")
    if isinstance(aud, str):
        if aud == expected_aud:
            return
    elif isinstance(aud, list):
        if expected_aud in aud:
            return
    raise HTTPException(status_code=401, detail="Token audience is invalid.")


def _validate_claim_issuer(claims: dict[str, Any]) -> None:
    expected_iss = os.getenv("SUPABASE_JWT_ISS", "").strip()
    if not expected_iss:
        return
    if str(claims.get("iss", "")) != expected_iss:
        raise HTTPException(status_code=401, detail="Token issuer is invalid.")


# ── JWKS cache for ES256 / asymmetric verification ─────────────────────

_jwks_cache: dict[str, Any] = {}
_jwks_lock = threading.Lock()
_JWKS_TTL = 3600  # re-fetch every hour


def _fetch_jwks() -> list[dict[str, Any]]:
    """Fetch the JWKS key-set from the Supabase auth endpoint."""
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not supabase_url:
        return []
    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        req = urllib.request.Request(jwks_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            keys = data.get("keys", [])
            if keys:
                logger.info("Fetched %d key(s) from JWKS endpoint", len(keys))
            return keys
    except Exception as exc:
        logger.warning("Failed to fetch JWKS from %s: %s", jwks_url, exc)
        return []


def _get_jwks_keys() -> list[dict[str, Any]]:
    """Return cached JWKS keys, refreshing if stale."""
    now = time.time()
    with _jwks_lock:
        cached_keys = _jwks_cache.get("keys")
        fetched_at = _jwks_cache.get("fetched_at", 0)
        if cached_keys is not None and (now - fetched_at) < _JWKS_TTL:
            return cached_keys

    keys = _fetch_jwks()
    with _jwks_lock:
        _jwks_cache["keys"] = keys
        _jwks_cache["fetched_at"] = time.time()
    return keys


def _find_ec_jwk(kid: str | None) -> dict[str, Any] | None:
    """Find an EC (ES256) JWK, preferring a match on *kid*."""
    keys = _get_jwks_keys()
    # Prefer exact kid match
    if kid:
        for key in keys:
            if key.get("kid") == kid and key.get("kty") == "EC":
                return key
    # Fallback: first EC key
    for key in keys:
        if key.get("kty") == "EC":
            return key
    return None


def _verify_es256(signing_input: bytes, signature_bytes: bytes, jwk: dict[str, Any]) -> bool:
    """Verify an ES256 (ECDSA P-256 / SHA-256) JWT signature using a JWK."""
    try:
        from cryptography.hazmat.primitives.asymmetric.ec import (
            ECDSA,
            EllipticCurvePublicNumbers,
            SECP256R1,
        )
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
        from cryptography.hazmat.primitives.hashes import SHA256
    except ImportError:
        logger.error(
            "The 'cryptography' package is required for ES256 JWT verification. "
            "Install it with:  pip install cryptography"
        )
        return False

    try:
        x_bytes = _decode_base64url(jwk["x"])
        y_bytes = _decode_base64url(jwk["y"])

        public_numbers = EllipticCurvePublicNumbers(
            x=int.from_bytes(x_bytes, "big"),
            y=int.from_bytes(y_bytes, "big"),
            curve=SECP256R1(),
        )
        public_key = public_numbers.public_key()

        # ES256 JWT signatures are raw r‖s (each 32 bytes for P-256).
        if len(signature_bytes) != 64:
            logger.warning("ES256 signature length is %d, expected 64", len(signature_bytes))
            return False
        r = int.from_bytes(signature_bytes[:32], "big")
        s = int.from_bytes(signature_bytes[32:], "big")
        der_sig = encode_dss_signature(r, s)

        public_key.verify(der_sig, signing_input, ECDSA(SHA256()))
        return True
    except Exception as exc:
        logger.warning("ES256 signature verification failed: %s", exc)
        return False


# ── Core JWT validation ─────────────────────────────────────────────────

def _validate_jwt(token: str, hs256_secret: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        logger.warning("JWT rejected: token does not have 3 parts")
        raise HTTPException(status_code=401, detail="Invalid bearer token.")

    header = _decode_json_segment(parts[0])
    alg = str(header.get("alg", "")).upper()

    signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")

    try:
        actual_signature = _decode_base64url(parts[2])
    except Exception as exc:
        logger.warning("JWT rejected: could not decode signature segment — %s", exc)
        raise HTTPException(status_code=401, detail="Invalid bearer token signature.") from exc

    # ── Signature verification (HS256 or ES256) ─────────────────────────
    if alg == "HS256":
        if not hs256_secret:
            logger.warning("JWT rejected: HS256 token received but no HMAC secret configured")
            raise HTTPException(status_code=401, detail="Server cannot verify HS256 tokens.")
        expected_signature = hmac.new(
            hs256_secret.encode("utf-8"), signing_input, hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected_signature, actual_signature):
            logger.warning("JWT rejected: HS256 signature mismatch — check SUPABASE_JWT_SECRET in .env")
            raise HTTPException(status_code=401, detail="Invalid bearer token signature.")

    elif alg == "ES256":
        kid = header.get("kid")
        jwk = _find_ec_jwk(kid)
        if jwk is None:
            logger.warning(
                "JWT rejected: ES256 token received but no matching EC key found in JWKS "
                "(kid=%s). Ensure SUPABASE_URL is set correctly in .env.",
                kid,
            )
            raise HTTPException(
                status_code=401,
                detail="No matching public key found for ES256 verification.",
            )
        if not _verify_es256(signing_input, actual_signature, jwk):
            logger.warning("JWT rejected: ES256 signature verification failed (kid=%s)", kid)
            raise HTTPException(status_code=401, detail="Invalid bearer token signature.")
    else:
        logger.warning("JWT rejected: unsupported algorithm '%s'", alg)
        raise HTTPException(status_code=401, detail=f"Unsupported JWT algorithm: {alg}")

    # ── Claims validation ───────────────────────────────────────────────
    claims = _decode_json_segment(parts[1])
    now = int(time.time())

    exp = claims.get("exp")
    if exp is not None:
        try:
            if int(exp) <= now:
                logger.warning("JWT rejected: token expired (exp=%s, now=%s)", exp, now)
                raise HTTPException(status_code=401, detail="Bearer token is expired.")
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid bearer token expiration.") from exc

    nbf = claims.get("nbf")
    if nbf is not None:
        try:
            if int(nbf) > now:
                logger.warning("JWT rejected: token not yet active (nbf=%s, now=%s)", nbf, now)
                raise HTTPException(status_code=401, detail="Bearer token is not active yet.")
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid bearer token activation time.") from exc

    _validate_claim_audience(claims)
    _validate_claim_issuer(claims)
    return claims


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None,
) -> AuthenticatedUser:
    if not _is_auth_required():
        return AuthenticatedUser(
            sub="local-dev-user",
            role="service_role",
            email=None,
            claims={},
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        logger.warning("JWT rejected: no Bearer token in request")
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "").strip()

    # We need at least one verification method: an HMAC secret (HS256) or
    # a Supabase URL from which we can fetch JWKS keys (ES256).
    if not jwt_secret and not supabase_url:
        raise HTTPException(
            status_code=503,
            detail=(
                "Server auth misconfiguration: neither SUPABASE_JWT_SECRET "
                "nor SUPABASE_URL is set."
            ),
        )

    claims = _validate_jwt(credentials.credentials, jwt_secret)
    role = str(claims.get("role", "")).strip()
    if role not in _expected_roles():
        logger.warning("JWT rejected: role '%s' not in allowed roles %s", role, _expected_roles())
        raise HTTPException(status_code=403, detail="Not authorized for this resource.")

    sub = str(claims.get("sub", "")).strip() or "unknown-user"
    email_value = claims.get("email")
    email = str(email_value).strip() if isinstance(email_value, str) else None
    return AuthenticatedUser(sub=sub, role=role, email=email, claims=claims)
