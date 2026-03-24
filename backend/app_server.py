import base64
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Security, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from reportlab.pdfbase.ttfonts import TTFont

try:
    from .auth import AuthenticatedUser, bearer_scheme, get_authenticated_user
except ImportError:  # pragma: no cover - allows running app_server.py directly
    from auth import AuthenticatedUser, bearer_scheme, get_authenticated_user


ROOT_DIR = Path(__file__).resolve().parent.parent  # project root
load_dotenv(ROOT_DIR / ".env")  # load .env before any os.getenv() calls

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)
_jwt_secret_loaded = bool(os.getenv("SUPABASE_JWT_SECRET", "").strip())
logger.warning("SUPABASE_JWT_SECRET %s", "loaded [ok]" if _jwt_secret_loaded else "NOT SET - auth will return 503")

OUT_DIR = ROOT_DIR / "out"
FIELDS_FILE = ROOT_DIR / "config" / "fields.json"
FIELDS_STORE = ROOT_DIR / "config" / "fields_store"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
CERT_OVERLAY_SCRIPT = Path(__file__).parent / "certificate_overlay.py"

# Approved base directories for server-side file references
ALLOWED_TEMPLATE_DIR = ROOT_DIR / "assets" / "templates"
ALLOWED_DATA_DIR = ROOT_DIR / "data"
ALLOWED_FONTS_DIR = ROOT_DIR / "assets" / "fonts"

app = FastAPI(title="Certificate Mapper API")

DEFAULT_MAX_REQUEST_BYTES = 30 * 1024 * 1024
DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
DEFAULT_MAX_JSON_TEXT_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_FONT_UPLOAD_BYTES = 10 * 1024 * 1024
DEFAULT_SUBPROCESS_TIMEOUT_SECONDS = 180
UPLOAD_CHUNK_SIZE = 1024 * 1024


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(minimum, parsed)


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64 = parts[1]
    padding = "=" * (-len(payload_b64) % 4)
    try:
        payload_raw = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _looks_like_service_role_key(token: str) -> bool:
    if not token:
        return False
    payload = _decode_jwt_payload(token)
    if not payload:
        return False
    role = str(payload.get("role", "")).strip().lower()
    return role == "service_role"


MAX_REQUEST_BODY_BYTES = _env_int("CERTSTUDIO_MAX_REQUEST_BYTES", DEFAULT_MAX_REQUEST_BYTES)
MAX_UPLOAD_FILE_BYTES = _env_int("CERTSTUDIO_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES)
MAX_JSON_TEXT_BYTES = _env_int("CERTSTUDIO_MAX_JSON_TEXT_BYTES", DEFAULT_MAX_JSON_TEXT_BYTES)
MAX_FONT_UPLOAD_BYTES = _env_int("CERTSTUDIO_MAX_FONT_UPLOAD_BYTES", DEFAULT_MAX_FONT_UPLOAD_BYTES)
SUBPROCESS_TIMEOUT_SECONDS = _env_int(
    "CERTSTUDIO_SUBPROCESS_TIMEOUT_SECONDS",
    DEFAULT_SUBPROCESS_TIMEOUT_SECONDS,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "message": "Request validation failed.",
            "detail": exc.errors(),
            "body": exc.body,
        },
    )


@app.middleware("http")
async def enforce_request_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"message": "Invalid Content-Length header."},
            )
        if request_size > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"message": f"Request body too large. Limit is {MAX_REQUEST_BODY_BYTES} bytes."},
            )
    return await call_next(request)


class GenerateRequest(BaseModel):
    output: str = "out/generated_overlay.pdf"
    fields: str = "fields.json"
    template: str | None = None
    csv_path: str | None = None
    data: dict[str, Any] | None = None
    row: int = 0
    placeholder_mode: bool = False
    dx: float = 0.0
    dy: float = 0.0
    debug: bool = False
    grid_step: float = 0.0
    font_path: str | None = None
    overlay_only: bool = True
    page_size: str = "letter"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/runtime-config")
def runtime_config() -> dict[str, str]:
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    if _looks_like_service_role_key(supabase_anon_key):
        logger.error("SUPABASE_ANON_KEY appears to be a service_role key; refusing to expose it.")
        supabase_anon_key = ""
    return {
        "supabase_url": os.getenv("SUPABASE_URL", ""),
        "supabase_anon_key": supabase_anon_key,
    }

_USER_SUB_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_\-]{0,63}$")


def _validate_user_sub(sub: str) -> str:
    """Ensure the user sub from the JWT is safe to use as a directory name."""
    if not _USER_SUB_RE.fullmatch(sub):
        raise HTTPException(status_code=403, detail="Invalid user identifier in token.")
    return sub


def _user_fields_dir(user_sub: str) -> Path:
    """Return the per-user fields directory: config/fields_store/{user_sub}/"""
    return FIELDS_STORE / _validate_user_sub(user_sub)


def resolve_fields_path(name: str | None, user_sub: str) -> tuple[Path, str]:
    """Resolve a fields-file name to an absolute path scoped to user_sub.

    All layout files live under config/fields_store/{user_sub}/.
    The shared config/fields.json is kept only as a read-only system fallback
    for GET requests (handled in get_fields below).
    """
    user_dir = _user_fields_dir(user_sub)
    if not name:
        return user_dir / "fields.json", "fields.json"
    cleaned = Path(name).name  # strip any directory component
    if not cleaned.lower().endswith(".json"):
        cleaned = f"{cleaned}.json"
    return user_dir / cleaned, cleaned

def require_authenticated_user(
    credentials=Security(bearer_scheme),
) -> AuthenticatedUser:
    return get_authenticated_user(credentials)


def safe_unlink(path: Path | None) -> None:
    if not path:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return


def safe_rmtree(path: Path | None) -> None:
    if not path:
        return
    try:
        shutil.rmtree(path, ignore_errors=True)
    except OSError:
        return


def cleanup_batch_output(batch_dir: Path, zip_path: Path) -> None:
    safe_unlink(zip_path)
    safe_rmtree(batch_dir)


def ensure_json_text_limit(raw_value: str, field_name: str) -> None:
    if len(raw_value.encode("utf-8")) > MAX_JSON_TEXT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"{field_name} exceeds the {MAX_JSON_TEXT_BYTES}-byte limit.",
        )


def parse_json_text(raw_value: str | None, field_name: str) -> Any | None:
    if raw_value is None:
        return None
    ensure_json_text_limit(raw_value, field_name)
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be valid JSON.") from exc


def parse_json_object(raw_value: str | None, field_name: str) -> dict[str, Any] | None:
    parsed = parse_json_text(raw_value, field_name)
    if parsed is None:
        return None
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON object.")
    return parsed


def write_json_payload_to_temp(payload: Any) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = Path(
        tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".json",
            dir=OUT_DIR,
        ).name
    )
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return temp_path


def stream_upload_to_path(upload: UploadFile, target_path: Path, max_bytes: int) -> int:
    bytes_written = 0
    with target_path.open("wb") as output:
        while True:
            chunk = upload.file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Uploaded file exceeds the {max_bytes}-byte limit.",
                )
            output.write(chunk)
    return bytes_written


def write_upload_to_temp(upload: UploadFile, suffix: str, max_bytes: int = MAX_UPLOAD_FILE_BYTES) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    normalized_suffix = suffix if suffix and suffix.startswith(".") else ""
    temp_path = Path(
        tempfile.NamedTemporaryFile(
            delete=False,
            suffix=normalized_suffix,
            dir=OUT_DIR,
        ).name
    )
    try:
        stream_upload_to_path(upload, temp_path, max_bytes=max_bytes)
    except Exception:
        safe_unlink(temp_path)
        raise
    return temp_path


def _resolve_within(user_path: str, allowed_dir: Path, param_name: str) -> Path:
    """Resolve user_path and ensure it falls strictly within allowed_dir.

    Rejects absolute paths and path-traversal attempts (e.g. ../../etc/passwd).
    Raises HTTPException(400) for invalid / out-of-bounds paths and
    HTTPException(404) when the resolved file does not exist.
    """
    p = Path(user_path)
    if p.is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"{param_name} must be a relative path.",
        )
    try:
        candidate = (allowed_dir / p).resolve()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid path for {param_name}.",
        ) from exc
    try:
        candidate.relative_to(allowed_dir.resolve())
    except ValueError as exc:
        rel = allowed_dir.relative_to(ROOT_DIR)
        raise HTTPException(
            status_code=400,
            detail=f"{param_name} must point to a file inside {rel}/.",
        ) from exc
    if not candidate.exists():
        raise HTTPException(
            status_code=404,
            detail=f"File not found for {param_name}: {p}",
        )
    return candidate


def resolve_output_path(output: str) -> Path:
    raw_output = Path(output)
    if raw_output.is_absolute():
        raise HTTPException(status_code=400, detail="Output path must be relative to the project directory.")
    resolved = (ROOT_DIR / raw_output).resolve()
    out_root = OUT_DIR.resolve()
    try:
        resolved.relative_to(out_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Output path must be inside the out/ directory.") from exc
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def run_overlay_subprocess(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            check=False,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else (exc.stdout.decode("utf-8", errors="replace") if exc.stdout else "")
        stderr = exc.stderr if isinstance(exc.stderr, str) else (exc.stderr.decode("utf-8", errors="replace") if exc.stderr else "")
        raise HTTPException(
            status_code=504,
            detail={
                "message": "Overlay generation timed out.",
                "command": cmd,
                "timeout_seconds": SUBPROCESS_TIMEOUT_SECONDS,
                "stdout": stdout,
                "stderr": stderr,
            },
        ) from exc


@app.get("/api/fields/list")
def list_fields(user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict[str, list[str]]:
    user_dir = _user_fields_dir(user.sub)
    files: list[str] = []
    if user_dir.exists():
        files.extend(sorted(path.name for path in user_dir.glob("*.json")))
    return {"files": sorted(set(files))}


@app.get("/api/fields")
def get_fields(name: str | None = None, user: AuthenticatedUser = Depends(require_authenticated_user)) -> Any:
    target_path, display_name = resolve_fields_path(name, user.sub)
    if not target_path.exists():
        if name is None:
            # Fall back to the shared system default (read-only) when the user
            # has not yet saved their own layout.
            if FIELDS_FILE.exists():
                try:
                    return json.loads(FIELDS_FILE.read_text(encoding="utf-8"))
                except json.JSONDecodeError as exc:
                    raise HTTPException(status_code=500, detail=f"Invalid JSON in system fields.json: {exc}") from exc
            return {"page": 0, "default_font": "Helvetica", "default_size": 18, "fields": []}
        raise HTTPException(status_code=404, detail=f"Fields file not found: {display_name}")
    try:
        return json.loads(target_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {display_name}: {exc}") from exc


@app.post("/api/fields")
def save_fields(
    payload: dict[str, Any],
    name: str | None = None,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, str]:
    target_path, display_name = resolve_fields_path(name, user.sub)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"message": f"Saved: {display_name}"}


@app.post("/api/generate")
def generate_overlay(
    request: GenerateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, Any]:
    return run_overlay_generation(request, user)


def run_overlay_generation(request: GenerateRequest, user: AuthenticatedUser) -> dict[str, Any]:
    temp_data_path: Path | None = None
    fields_path, fields_name = resolve_fields_path(request.fields, user.sub)
    if not fields_path.exists():
        raise HTTPException(status_code=404, detail=f"Fields file not found: {fields_name}")

    output_path = resolve_output_path(request.output)
    output_rel_path = str(output_path.relative_to(ROOT_DIR))

    cmd = [
        sys.executable,
        str(CERT_OVERLAY_SCRIPT),
        "--fields",
        str(fields_path),
        "--output",
        output_rel_path,
        "--row",
        str(request.row),
        "--dx",
        str(request.dx),
        "--dy",
        str(request.dy),
        "--grid-step",
        str(request.grid_step),
        "--page-size",
        request.page_size,
    ]

    if request.template:
        resolved_template = _resolve_within(request.template, ALLOWED_TEMPLATE_DIR, "template")
        cmd.extend(["--template", str(resolved_template)])
    if request.csv_path:
        resolved_csv = _resolve_within(request.csv_path, ALLOWED_DATA_DIR, "csv_path")
        cmd.extend(["--csv", str(resolved_csv)])
    if request.data:
        temp_data_path = write_json_payload_to_temp(request.data)
        cmd.extend(["--data-json", str(temp_data_path)])
    if request.placeholder_mode:
        cmd.append("--placeholder-mode")
    if request.debug:
        cmd.append("--debug")
    if request.font_path:
        resolved_font = _resolve_within(request.font_path, ALLOWED_FONTS_DIR, "font_path")
        cmd.extend(["--font-path", str(resolved_font)])
    if request.overlay_only:
        cmd.append("--overlay-only")
    try:
        result = run_overlay_subprocess(cmd)
    finally:
        safe_unlink(temp_data_path)
    if result.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Overlay generation failed.",
                "command": cmd,
                "stdout": result.stdout,
                "stderr": result.stderr,
            },
        )

    return {
        "message": "Overlay generated.",
        "output": output_rel_path,
        "stdout": result.stdout,
    }


@app.post("/api/generate-file")
def generate_overlay_file(
    request: GenerateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> FileResponse:
    result = run_overlay_generation(request, user)
    output_path = resolve_output_path(result["output"])
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Generated file not found.")
    return FileResponse(
        output_path,
        media_type="application/pdf",
    )


@app.post("/api/generate-file-upload")
def generate_overlay_file_upload(
    background_tasks: BackgroundTasks,
    template: UploadFile | None = File(None),
    fields_json: str | None = Form(None),
    csv_file: UploadFile | None = File(None),
    data_json: str | None = Form(None),
    field_mappings_json: str | None = Form(None),
    fixed_values_json: str | None = Form(None),
    row: int = Form(0),
    placeholder_mode: bool = Form(False),
    dx: float = Form(0.0),
    dy: float = Form(0.0),
    debug: bool = Form(False),
    grid_step: float = Form(0.0),
    font_path: str | None = Form(None),
    overlay_only: bool = Form(True),
    page_size: str = Form("letter"),
    batch: bool = Form(False),
    _user: AuthenticatedUser = Depends(require_authenticated_user),
) -> FileResponse:
    template_path: Path | None = None
    temp_files: list[Path] = []
    csv_path: Path | None = None
    try:
        if template is not None:
            template_path = write_upload_to_temp(
                template,
                suffix=Path(template.filename or "template.pdf").suffix,
                max_bytes=MAX_UPLOAD_FILE_BYTES,
            )
            temp_files.append(template_path)
        elif not overlay_only:
            raise HTTPException(status_code=400, detail="Template file is required unless overlay_only is true.")

        fields_path = FIELDS_FILE
        if fields_json:
            parsed_fields = parse_json_object(fields_json, "fields_json")
            fields_path = write_json_payload_to_temp(parsed_fields)
            temp_files.append(fields_path)
        elif not fields_path.exists():
            raise HTTPException(status_code=400, detail="No fields layout provided and default fields.json is missing.")

        if csv_file is not None:
            csv_path = write_upload_to_temp(
                csv_file,
                suffix=Path(csv_file.filename or "data.csv").suffix,
                max_bytes=MAX_UPLOAD_FILE_BYTES,
            )
            temp_files.append(csv_path)

        data_path: Path | None = None
        if data_json:
            parsed_data = parse_json_object(data_json, "data_json")
            data_path = write_json_payload_to_temp(parsed_data)
            temp_files.append(data_path)

        field_mappings_path: Path | None = None
        if field_mappings_json:
            parsed_field_mappings = parse_json_object(field_mappings_json, "field_mappings_json")
            field_mappings_path = write_json_payload_to_temp(parsed_field_mappings)
            temp_files.append(field_mappings_path)

        fixed_values_path: Path | None = None
        if fixed_values_json:
            parsed_fixed_values = parse_json_object(fixed_values_json, "fixed_values_json")
            fixed_values_path = write_json_payload_to_temp(parsed_fixed_values)
            temp_files.append(fixed_values_path)

        if batch:
            output_name = f"batch_{uuid.uuid4().hex}"
            output_path = OUT_DIR / output_name
        else:
            output_name = f"generated_{uuid.uuid4().hex}.pdf"
            output_path = OUT_DIR / output_name
        output_rel = str(output_path.relative_to(ROOT_DIR))

        cmd = [
            sys.executable,
            str(CERT_OVERLAY_SCRIPT),
            "--fields",
            str(fields_path),
            "--output",
            output_rel,
            "--row",
            str(row),
            "--dx",
            str(dx),
            "--dy",
            str(dy),
            "--grid-step",
            str(grid_step),
            "--page-size",
            page_size,
        ]

        if template_path:
            cmd.extend(["--template", str(template_path)])
        if csv_path:
            cmd.extend(["--csv", str(csv_path)])
        if data_path:
            cmd.extend(["--data-json", str(data_path)])
        if field_mappings_path:
            cmd.extend(["--field-mappings", str(field_mappings_path)])
        if fixed_values_path:
            cmd.extend(["--fixed-values", str(fixed_values_path)])
        if placeholder_mode:
            cmd.append("--placeholder-mode")
        if debug:
            cmd.append("--debug")
        if font_path:
            resolved_font = _resolve_within(font_path, ALLOWED_FONTS_DIR, "font_path")
            cmd.extend(["--font-path", str(resolved_font)])
        if overlay_only:
            cmd.append("--overlay-only")
        if batch:
            cmd.append("--batch")

        result = run_overlay_subprocess(cmd)
        if result.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Overlay generation failed.",
                    "command": cmd,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                },
            )

        if batch:
            zip_path = output_path.parent / f"{output_path.name}.zip"
            if not zip_path.exists():
                raise HTTPException(status_code=500, detail="Generated ZIP file not found.")
            background_tasks.add_task(cleanup_batch_output, output_path, zip_path)
            return FileResponse(
                zip_path,
                media_type="application/zip",
                filename="certificates.zip",
                background=background_tasks,
            )

        if not output_path.exists():
            raise HTTPException(status_code=500, detail="Generated file not found.")
        background_tasks.add_task(safe_unlink, output_path)
        return FileResponse(
            output_path,
            media_type="application/pdf",
            background=background_tasks,
        )
    finally:
        for temp_file in temp_files:
            safe_unlink(temp_file)
        if template is not None:
            template.file.close()
        if csv_file is not None:
            csv_file.file.close()


@app.post("/api/merge-pdfs-for-print")
def merge_pdfs_for_print(
    background_tasks: BackgroundTasks,
    pdf_files: list[UploadFile] = File(...),
    _user: AuthenticatedUser = Depends(require_authenticated_user),
) -> FileResponse:
    """
    Merge multiple PDF certificates into a single PDF for printing.
    Each certificate becomes a page in the output document.
    """
    try:
        from pypdf import PdfWriter
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF merging library not available.",
        )

    if not pdf_files or len(pdf_files) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one PDF file is required.",
        )

    temp_files: list[Path] = []
    try:
        # Write uploaded PDFs to temporary files
        pdf_paths: list[Path] = []
        for pdf_file in pdf_files:
            if not pdf_file.filename:
                raise HTTPException(
                    status_code=400,
                    detail="All files must have filenames.",
                )
            
            temp_path = write_upload_to_temp(
                pdf_file,
                suffix=".pdf",
                max_bytes=MAX_UPLOAD_FILE_BYTES,
            )
            pdf_paths.append(temp_path)
            temp_files.append(temp_path)

        # Merge PDFs
        writer = PdfWriter()
        for pdf_path in pdf_paths:
            try:
                # Read the PDF and add all pages to the writer
                from pypdf import PdfReader
                reader = PdfReader(str(pdf_path))
                for page in reader.pages:
                    writer.add_page(page)
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to read PDF: {exc}",
                ) from exc

        # Write merged PDF to temporary file
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        merged_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".pdf",
                dir=OUT_DIR,
            ).name
        )
        temp_files.append(merged_path)

        try:
            with merged_path.open("wb") as output_file:
                writer.write(output_file)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write merged PDF: {exc}",
            ) from exc

        if not merged_path.exists() or merged_path.stat().st_size == 0:
            raise HTTPException(
                status_code=500,
                detail="Merged PDF is empty or failed to create.",
            )

        # Return the merged PDF; schedule cleanup after the response is sent
        background_tasks.add_task(cleanup_temp_files, temp_files)
        temp_files = []  # ownership transferred to background task
        return FileResponse(
            merged_path,
            media_type="application/pdf",
        )

    except HTTPException:
        # Clean up synchronously on error - background task was never scheduled
        cleanup_temp_files(temp_files)
        raise
    except Exception as exc:
        cleanup_temp_files(temp_files)
        raise HTTPException(
            status_code=500,
            detail=f"PDF merging failed: {exc}",
        ) from exc
    finally:
        # Close uploaded file handles regardless of outcome
        for pdf_file in pdf_files:
            try:
                pdf_file.file.close()
            except Exception:
                pass


def cleanup_temp_files(files: list[Path]) -> None:
    """Clean up a list of temporary files."""
    for file_path in files:
        safe_unlink(file_path)


@app.post("/api/extract-fonts")
def extract_fonts(
    template: UploadFile = File(...),
    _user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, list[str]]:
    """Extract unique font names from a PDF template."""
    try:
        from .certificate_overlay import extract_fonts_from_pdf
    except ImportError:  # pragma: no cover - allows running app_server.py directly
        from certificate_overlay import extract_fonts_from_pdf

    temp_path = write_upload_to_temp(
        template,
        suffix=Path(template.filename or "template.pdf").suffix,
        max_bytes=MAX_UPLOAD_FILE_BYTES,
    )
    try:
        fonts = extract_fonts_from_pdf(temp_path)
        return {"fonts": fonts}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract fonts: {exc}",
        ) from exc
    finally:
        safe_unlink(temp_path)
        template.file.close()


@app.get("/api/list-custom-fonts")
def list_custom_fonts(_user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict[str, Any]:
    """List all custom TrueType fonts available in the fonts directory."""
    fonts_dir = ROOT_DIR / "assets" / "fonts"
    
    available_fonts = []
    if fonts_dir.exists():
        for font_file in fonts_dir.glob("*.ttf"):
            file_size = font_file.stat().st_size
            available_fonts.append({
                "name": font_file.stem,
                "file": font_file.name,
                "type": "ttf",
                "size_kb": round(file_size / 1024, 2),
                "url": f"/api/font-file/{font_file.name}",
            })
    
    return {
        "custom_fonts": sorted(available_fonts, key=lambda x: x["name"]),
        "count": len(available_fonts)
    }


@app.get("/api/font-file/{filename}")
def get_font_file(
    filename: str,
) -> FileResponse:
    """Serve a custom font file so the frontend can load it with @font-face."""
    fonts_dir = ROOT_DIR / "assets" / "fonts"
    safe_filename = Path(filename).name
    font_path = fonts_dir / safe_filename

    if font_path.suffix.lower() != ".ttf":
        raise HTTPException(status_code=400, detail="Only .ttf font files are supported.")
    if not font_path.exists():
        raise HTTPException(status_code=404, detail=f"Font file '{safe_filename}' not found.")

    return FileResponse(
        font_path,
        media_type="font/ttf",
        headers={"Content-Disposition": "inline"},
    )


@app.post("/api/upload-font")
def upload_font(
    font_file: UploadFile = File(...),
    _user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, Any]:
    """Upload a custom TrueType font file (.ttf) to the fonts directory."""
    fonts_dir = ROOT_DIR / "assets" / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    
    # Validate file extension
    filename = font_file.filename or "unknown.ttf"
    file_ext = filename.lower().split(".")[-1]
    
    if file_ext != "ttf":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid file type '.{file_ext}'. Only .ttf fonts are supported for PDF generation. "
                "Please upload a TrueType (.ttf) font."
            ),
        )
    
    # Sanitize filename (remove any path components and special chars)
    safe_filename = Path(filename).name
    safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in ".-_ ")
    if not safe_filename or safe_filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid font filename.")
    
    target_path = fonts_dir / safe_filename
    
    # Check if file already exists
    if target_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Font file '{safe_filename}' already exists. Delete it first or rename your file."
        )
    
    # Write the uploaded file
    try:
        file_size = stream_upload_to_path(
            font_file,
            target_path,
            max_bytes=MAX_FONT_UPLOAD_BYTES,
        )

        # Ensure the uploaded file is a real TrueType font that ReportLab can parse.
        try:
            TTFont(target_path.stem, str(target_path))
        except Exception as exc:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=(
                    "Uploaded file is not a valid TrueType (.ttf) font ReportLab can render. "
                    f"Details: {exc}"
                ),
            ) from exc
        
        return {
            "message": "Font uploaded successfully",
            "filename": safe_filename,
            "font_name": target_path.stem,
            "size_kb": round(file_size / 1024, 2),
        }
    except HTTPException:
        raise
    except Exception as exc:
        if target_path.exists():
            safe_unlink(target_path)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload font: {exc}",
        ) from exc
    finally:
        font_file.file.close()


@app.delete("/api/delete-font/{filename}")
def delete_font(
    filename: str,
    _user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, str]:
    """Delete a custom font file from the fonts directory."""
    fonts_dir = ROOT_DIR / "assets" / "fonts"
    
    # Sanitize filename
    safe_filename = Path(filename).name
    font_path = fonts_dir / safe_filename
    
    if not font_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Font file '{safe_filename}' not found."
        )
    
    # Only allow deleting supported font files.
    if font_path.suffix.lower() != ".ttf":
        raise HTTPException(
            status_code=400,
            detail="Can only delete .ttf font files."
        )
    
    try:
        font_path.unlink()
        return {
            "message": f"Font '{safe_filename}' deleted successfully.",
            "filename": safe_filename
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete font: {exc}",
        ) from exc


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    def root() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        target = FRONTEND_DIST / path
        if target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
else:

    @app.get("/", include_in_schema=False)
    def no_frontend() -> PlainTextResponse:
        return PlainTextResponse(
            "Frontend build not found. Run `cd frontend && npm install && npm run build`.",
            status_code=503,
        )
