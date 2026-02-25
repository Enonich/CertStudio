import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

# load_dotenv() MUST be called before importing auth so that SUPABASE_URL and
# SUPABASE_JWT_SECRET are in os.environ when auth.py reads them at import time.
from dotenv import load_dotenv
load_dotenv()

import jwt as pyjwt
from auth import decode_supabase_token
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parent
FIELDS_FILE = ROOT_DIR / "fields.json"
FIELDS_STORE = ROOT_DIR / "fields_store"
FRONTEND_DIST = ROOT_DIR / "template-mapper-app" / "dist"

app = FastAPI(title="Certificate Mapper API")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Vite dev server to reach the API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── AUTH MIDDLEWARE ────────────────────────────────────────────────────────────
_SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
# Exact-match public paths
_PUBLIC_API_PATHS: frozenset[str] = frozenset({
    "/api/health",
    "/api/list-custom-fonts",  # needed by the font picker before CSS injection
})
# Prefix-match public paths — browser fetches these directly (CSS @font-face, etc.)
_PUBLIC_API_PREFIXES: tuple[str, ...] = ("/api/font-file/",)


@app.middleware("http")
async def _auth_middleware(request: Request, call_next):
    """Reject unauthenticated calls to /api/* (except public endpoints)."""
    path = request.url.path
    # Pass through: non-API paths, public exact paths, public prefixes, CORS preflight
    if (
        not path.startswith("/api/")
        or path in _PUBLIC_API_PATHS
        or any(path.startswith(p) for p in _PUBLIC_API_PREFIXES)
        or request.method == "OPTIONS"
    ):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or invalid Authorization header."},
        )

    token = auth_header.split(" ", 1)[1]
    try:
        decode_supabase_token(token)
    except pyjwt.ExpiredSignatureError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Token has expired."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except pyjwt.InvalidTokenError as exc:
        return JSONResponse(
            status_code=401,
            content={"detail": f"Invalid token: {exc}"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await call_next(request)


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


def resolve_fields_path(name: str | None) -> tuple[Path, str]:
    if not name:
        return FIELDS_FILE, "fields.json"
    cleaned = Path(name).name
    if not cleaned.lower().endswith(".json"):
        cleaned = f"{cleaned}.json"
    if cleaned == "fields.json":
        return FIELDS_FILE, cleaned
    return FIELDS_STORE / cleaned, cleaned


@app.get("/api/fields/list")
def list_fields() -> dict[str, list[str]]:
    files: list[str] = []
    if FIELDS_FILE.exists():
        files.append("fields.json")
    if FIELDS_STORE.exists():
        files.extend(sorted(path.name for path in FIELDS_STORE.glob("*.json")))
    return {"files": sorted(set(files))}


@app.get("/api/fields")
def get_fields(name: str | None = None) -> Any:
    target_path, display_name = resolve_fields_path(name)
    if not target_path.exists():
        if name is None:
            return {"page": 0, "default_font": "Helvetica", "default_size": 18, "fields": []}
        raise HTTPException(status_code=404, detail=f"Fields file not found: {display_name}")
    try:
        return json.loads(target_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {display_name}: {exc}") from exc


@app.post("/api/fields")
def save_fields(payload: dict[str, Any], name: str | None = None) -> dict[str, str]:
    target_path, display_name = resolve_fields_path(name)
    if target_path != FIELDS_FILE:
        target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"message": f"Saved: {display_name}"}


@app.post("/api/generate")
def generate_overlay(request: GenerateRequest) -> dict[str, Any]:
    return run_overlay_generation(request)


def run_overlay_generation(request: GenerateRequest) -> dict[str, Any]:
    temp_data_path: Path | None = None
    cmd = [
        sys.executable,
        "certificate_overlay.py",
        "--fields",
        request.fields,
        "--output",
        request.output,
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
        cmd.extend(["--template", request.template])
    if request.csv_path:
        cmd.extend(["--csv", request.csv_path])
    if request.data:
        temp_dir = ROOT_DIR / "out"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_data_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".json",
                dir=temp_dir,
            ).name
        )
        temp_data_path.write_text(json.dumps(request.data, indent=2), encoding="utf-8")
        cmd.extend(["--data-json", str(temp_data_path)])
    if request.placeholder_mode:
        cmd.append("--placeholder-mode")
    if request.debug:
        cmd.append("--debug")
    if request.font_path:
        cmd.extend(["--font-path", request.font_path])
    if request.overlay_only:
        cmd.append("--overlay-only")

    result = subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        check=False,
    )
    if temp_data_path and temp_data_path.exists():
        temp_data_path.unlink(missing_ok=True)
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
        "output": request.output,
        "stdout": result.stdout,
    }


def write_upload_to_temp(upload: UploadFile, suffix: str) -> Path:
    temp_dir = ROOT_DIR / "out"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = Path(
        tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            dir=temp_dir,
        ).name
    )
    contents = upload.file.read()
    temp_path.write_bytes(contents)
    return temp_path


@app.post("/api/generate-file")
def generate_overlay_file(request: GenerateRequest) -> FileResponse:
    result = run_overlay_generation(request)
    output_path = ROOT_DIR / result["output"]
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Generated file not found.")
    return FileResponse(
        output_path,
        media_type="application/pdf",
    )


@app.post("/api/generate-file-upload")
def generate_overlay_file_upload(
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
) -> FileResponse:
    template_path: Path | None = None
    temp_files: list[Path] = []

    if template is not None:
        template_path = write_upload_to_temp(template, suffix=Path(template.filename or "template.pdf").suffix)
        temp_files.append(template_path)
    elif not overlay_only:
         raise HTTPException(status_code=400, detail="Template file is required unless overlay_only is true.")

    fields_path = FIELDS_FILE
    if fields_json:
        temp_dir = ROOT_DIR / "out"
        temp_dir.mkdir(parents=True, exist_ok=True)
        fields_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".json",
                dir=temp_dir,
            ).name
        )
        fields_path.write_text(fields_json, encoding="utf-8")
        temp_files.append(fields_path)

    csv_path: Path | None = None
    if csv_file is not None:
        csv_path = write_upload_to_temp(csv_file, suffix=Path(csv_file.filename or "data.csv").suffix)
        temp_files.append(csv_path)

    data_path: Path | None = None
    if data_json:
        temp_dir = ROOT_DIR / "out"
        temp_dir.mkdir(parents=True, exist_ok=True)
        data_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".json",
                dir=temp_dir,
            ).name
        )
        data_path.write_text(data_json, encoding="utf-8")
        temp_files.append(data_path)

    field_mappings_path: Path | None = None
    if field_mappings_json:
        temp_dir = ROOT_DIR / "out"
        temp_dir.mkdir(parents=True, exist_ok=True)
        field_mappings_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".json",
                dir=temp_dir,
            ).name
        )
        field_mappings_path.write_text(field_mappings_json, encoding="utf-8")
        temp_files.append(field_mappings_path)

    fixed_values_path: Path | None = None
    if fixed_values_json:
        temp_dir = ROOT_DIR / "out"
        temp_dir.mkdir(parents=True, exist_ok=True)
        fixed_values_path = Path(
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".json",
                dir=temp_dir,
            ).name
        )
        fixed_values_path.write_text(fixed_values_json, encoding="utf-8")
        temp_files.append(fixed_values_path)

    if batch:
        # For batch generation, output is a directory
        output_name = f"batch_{uuid.uuid4().hex}"
        output_path = ROOT_DIR / "out" / output_name
    else:
        # For single generation, output is a file
        output_name = f"generated_{uuid.uuid4().hex}.pdf"
        output_path = ROOT_DIR / "out" / output_name

    cmd = [
        sys.executable,
        "certificate_overlay.py",
        "--fields",
        str(fields_path),
        "--output",
        str(output_path.relative_to(ROOT_DIR)),
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
        cmd.extend(["--font-path", font_path])
    if overlay_only:
        cmd.append("--overlay-only")
    if batch:
        cmd.append("--batch")

    result = subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        check=False,
    )

    if result.returncode != 0:
        for temp_file in temp_files:
            temp_file.unlink(missing_ok=True)
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
        # For batch generation, return the ZIP file containing all certificates
        zip_path = output_path.parent / f"{output_path.name}.zip"
        if not zip_path.exists():
            for temp_file in temp_files:
                temp_file.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Generated ZIP file not found.")
        
        # Cleanup input temp files
        for temp_file in temp_files:
            temp_file.unlink(missing_ok=True)
        
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename="certificates.zip",
        )
    else:
        # For single generation, return the generated file
        if not output_path.exists():
            for temp_file in temp_files:
                temp_file.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Generated file not found.")
        
        preview_file = output_path

    # Cleanup input temp files
    for temp_file in temp_files:
        temp_file.unlink(missing_ok=True)

    return FileResponse(
        preview_file,
        media_type="application/pdf",
    )


@app.post("/api/extract-fonts")
def extract_fonts(template: UploadFile = File(...)) -> dict[str, list[str]]:
    """Extract unique font names from a PDF template."""
    from certificate_overlay import extract_fonts_from_pdf
    
    temp_path = write_upload_to_temp(template, suffix=Path(template.filename or "template.pdf").suffix)
    
    try:
        fonts = extract_fonts_from_pdf(temp_path)
        return {"fonts": fonts}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract fonts: {str(e)}"
        )
    finally:
        temp_path.unlink(missing_ok=True)


@app.get("/api/list-custom-fonts")
def list_custom_fonts() -> dict[str, Any]:
    """List all custom fonts available in the fonts directory."""
    fonts_dir = ROOT_DIR / "fonts"
    
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
        for font_file in fonts_dir.glob("*.otf"):
            file_size = font_file.stat().st_size
            available_fonts.append({
                "name": font_file.stem,
                "file": font_file.name,
                "type": "otf",
                "size_kb": round(file_size / 1024, 2),
                "url": f"/api/font-file/{font_file.name}",
            })
    
    return {
        "fonts_directory": str(fonts_dir),
        "fonts_directory_exists": fonts_dir.exists(),
        "custom_fonts": sorted(available_fonts, key=lambda x: x["name"]),
        "count": len(available_fonts)
    }


@app.get("/api/font-file/{filename}")
def get_font_file(filename: str) -> FileResponse:
    """Serve a custom font file so the frontend can load it with @font-face."""
    fonts_dir = ROOT_DIR / "fonts"
    safe_filename = Path(filename).name
    font_path = fonts_dir / safe_filename

    if font_path.suffix.lower() not in [".ttf", ".otf"]:
        raise HTTPException(status_code=400, detail="Only .ttf and .otf font files are supported.")
    if not font_path.exists():
        raise HTTPException(status_code=404, detail=f"Font file '{safe_filename}' not found.")

    media_type = "font/ttf" if font_path.suffix.lower() == ".ttf" else "font/otf"
    return FileResponse(font_path, media_type=media_type, filename=safe_filename)


@app.post("/api/upload-font")
def upload_font(font_file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload a custom font file (.ttf or .otf) to the fonts directory."""
    fonts_dir = ROOT_DIR / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    
    # Validate file extension
    filename = font_file.filename or "unknown.ttf"
    file_ext = filename.lower().split(".")[-1]
    
    if file_ext not in ["ttf", "otf"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only .ttf and .otf files are allowed. Got: .{file_ext}"
        )
    
    # Sanitize filename (remove any path components and special chars)
    safe_filename = Path(filename).name
    safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in ".-_ ")
    
    target_path = fonts_dir / safe_filename
    
    # Check if file already exists
    if target_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Font file '{safe_filename}' already exists. Delete it first or rename your file."
        )
    
    # Write the uploaded file
    try:
        contents = font_file.file.read()
        target_path.write_bytes(contents)
        file_size = len(contents)
        
        return {
            "message": "Font uploaded successfully",
            "filename": safe_filename,
            "font_name": target_path.stem,
            "size_kb": round(file_size / 1024, 2),
            "path": str(target_path)
        }
    except Exception as e:
        if target_path.exists():
            target_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload font: {str(e)}"
        )


@app.delete("/api/delete-font/{filename}")
def delete_font(filename: str) -> dict[str, str]:
    """Delete a custom font file from the fonts directory."""
    fonts_dir = ROOT_DIR / "fonts"
    
    # Sanitize filename
    safe_filename = Path(filename).name
    font_path = fonts_dir / safe_filename
    
    if not font_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Font file '{safe_filename}' not found."
        )
    
    # Only allow deleting .ttf and .otf files
    if font_path.suffix.lower() not in [".ttf", ".otf"]:
        raise HTTPException(
            status_code=400,
            detail="Can only delete .ttf or .otf font files."
        )
    
    try:
        font_path.unlink()
        return {
            "message": f"Font '{safe_filename}' deleted successfully.",
            "filename": safe_filename
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete font: {str(e)}"
        )


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
            "Frontend build not found. Run `cd template-mapper-app && npm install && npm run build`.",
            status_code=503,
        )
