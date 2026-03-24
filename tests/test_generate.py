import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend import auth
from backend import app_server


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


def build_token(secret: str, claims: dict | None = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": "test-user",
        "role": "authenticated",
        "email": "tester@example.com",
        "exp": int(time.time()) + 3600,
    }
    if claims:
        payload.update(claims)

    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_b64 = _b64url(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


@pytest.fixture(autouse=True)
def auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CERTSTUDIO_AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.delenv("SUPABASE_JWT_AUD", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_ISS", raising=False)


def auth_credentials(secret: str = "test-secret") -> HTTPAuthorizationCredentials:
    token = build_token(secret)
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_requires_bearer_token() -> None:
    with pytest.raises(HTTPException) as excinfo:
        auth.get_authenticated_user(None)
    assert excinfo.value.status_code == 401


def test_accepts_valid_supabase_token() -> None:
    user = auth.get_authenticated_user(auth_credentials())
    assert user.sub == "test-user"
    assert user.role == "authenticated"


def test_rejects_output_path_traversal() -> None:
    with pytest.raises(HTTPException) as excinfo:
        app_server.resolve_output_path("../escape.pdf")
    assert excinfo.value.status_code == 400
    assert "out/" in str(excinfo.value.detail)
