import io
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from backend import app_server


def test_write_upload_to_temp_rejects_large_file(tmp_path: Path) -> None:
    upload = UploadFile(filename="template.pdf", file=io.BytesIO(b"x" * 256))

    with pytest.raises(HTTPException) as excinfo:
        app_server.write_upload_to_temp(upload, suffix=".pdf", max_bytes=64)

    assert excinfo.value.status_code == 413
    assert "limit" in str(excinfo.value.detail).lower()


def test_parse_json_object_rejects_invalid_shape() -> None:
    with pytest.raises(HTTPException) as excinfo:
        app_server.parse_json_object('["not-an-object"]', "fields_json")

    assert excinfo.value.status_code == 400


def test_run_overlay_subprocess_reports_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(*args, **kwargs):  # noqa: ANN002, ANN003
        raise subprocess.TimeoutExpired(cmd="python certificate_overlay.py", timeout=1)

    monkeypatch.setattr(app_server.subprocess, "run", fake_run)

    with pytest.raises(HTTPException) as excinfo:
        app_server.run_overlay_subprocess(["python", "backend/certificate_overlay.py"])

    assert excinfo.value.status_code == 504
