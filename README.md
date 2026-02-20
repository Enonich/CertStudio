# CertStudio Certificate Generator

CertStudio is a certificate layout and generation toolkit with:

- A React visual mapper (`template-mapper-app`) for drawing text and image regions.
- A FastAPI server (`app_server.py`) that serves the UI and generation APIs.
- A Python rendering engine (`certificate_overlay.py`) that generates PDF certificates.

It supports single-certificate generation and CSV batch generation (ZIP), custom font upload, rich text, and image overlays.

## Current Architecture

- Frontend: React + Vite (`template-mapper-app`)
- Backend: FastAPI (`app_server.py`)
- PDF engine: ReportLab + pypdf (`certificate_overlay.py`)
- Optional PDF inspection: PyMuPDF (`extract_template_coords.py` and extraction endpoints)

Coordinates use PDF points (`72 pt = 1 inch`) with bottom-left origin.

## Quick Start (Local)

### 1) Python setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2) Frontend build

```powershell
cd template-mapper-app
npm install
npm run build
cd ..
```

### 3) Run server

```powershell
uvicorn app_server:app --reload
```

Open: `http://127.0.0.1:8000`

If frontend assets are missing, `/` returns a `503` message with build instructions.

## What the App Can Do Today

- Load template from PDF/PNG/JPG.
- Draw draggable/resizable text fields and image elements (e.g., signatures/logos).
- Edit text style: font, size, color, bold/italic, align, fit-to-width, wrapping.
- Rich text editing in field sample content (stored as HTML + plain text).
- Switch between manual values and CSV mode with per-field CSV mapping.
- Generate:
  - Single PDF (template merged), or
  - Overlay-only PDF (for pre-printed stock), or
  - Batch ZIP from all CSV rows.
- Save/load layout JSON via backend (`fields.json` + `fields_store/*.json`).
- Upload, list, and delete custom `.ttf`/`.otf` fonts from the UI.
- Extract font names from uploaded template PDFs.

## API Endpoints

Core:

- `GET /api/health`
- `GET /api/fields/list`
- `GET /api/fields?name=<layout.json>`
- `POST /api/fields?name=<layout.json>`
- `POST /api/generate`
- `POST /api/generate-file`
- `POST /api/generate-file-upload`

Fonts:

- `POST /api/extract-fonts`
- `GET /api/list-custom-fonts`
- `GET /api/font-file/{filename}`
- `POST /api/upload-font`
- `DELETE /api/delete-font/{filename}`

## CLI Usage (`certificate_overlay.py`)

Use the engine directly without the UI.

### Overlay-only with CSV row

```powershell
python certificate_overlay.py `
  --fields fields.json `
  --csv sample.csv `
  --row 0 `
  --output out/certificate_overlay_only.pdf `
  --overlay-only `
  --page-size letter
```

### Merge onto template PDF

```powershell
python certificate_overlay.py `
  --template certificate_template.pdf `
  --fields fields.json `
  --csv sample.csv `
  --row 0 `
  --output out/certificate_full.pdf
```

### Batch from CSV (creates PDFs + ZIP)

```powershell
python certificate_overlay.py `
  --template certificate_template.pdf `
  --fields fields.json `
  --csv sample.csv `
  --field-mappings field_mappings.json `
  --fixed-values fixed_values.json `
  --batch `
  --output out/batch_run
```

### Alignment / debugging aids

- `--placeholder-mode`
- `--dx`, `--dy`
- `--debug`
- `--grid-step`

## Layout JSON Format (Current)

Top-level keys commonly used:

- `page`
- `default_font`, `default_size`
- `fields` (text fields)
- `images` (optional image overlays)

Field keys supported by renderer:

- `name` or `text`
- `x`, `y`
- `font`, `size`, `align`
- `color` as `[r, g, b]` in `0..1`
- `bold`, `italic`
- `max_width`
- `wrap_text`, `wrap_width`
- `box_width`, `box_height`, `wrap_start_y`
- optional `html` (rich text source)

Image keys:

- `name`, `x`, `y`, `w`, `h`, `src`
- `src` may be a data URL (`data:image/...;base64,...`) or file path.

## Coordinate & Template Helpers

To inspect template text positions and build starting coordinates:

```powershell
python extract_template_coords.py `
  --template certificate_template.pdf `
  --page 0 `
  --contains "Certificate" `
  --output-json out/template_coords.json
```

Or generate an annotated PDF:

```powershell
python extract_template_coords.py `
  --template certificate_template.pdf `
  --page 0 `
  --annotate out/template_annotated.pdf
```

## Docker

This repo includes a multi-stage Docker build that compiles the frontend and runs FastAPI.

```powershell
docker build -t certstudio .
docker run --rm -p 7860:7860 certstudio
```

Open: `http://127.0.0.1:7860`

## Notes

- Built-in ReportLab Base-14 fonts are always available.
- Custom fonts are auto-registered from `fonts/` by filename stem.
- For print alignment, keep printer scaling at actual size (no fit-to-page).
