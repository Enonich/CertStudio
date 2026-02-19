# Certificate Print Overlay Alignment

This project generates a PDF overlay that places CSV data (or placeholders) at exact coordinates on an existing certificate template.
It also supports generating an overlay-only PDF (no template merge) for pre-printed certificates.

## 1) Install

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2) Prepare files

1. Put your certificate template PDF in the project folder (example: `template.pdf`).
2. Copy `fields.json` to `fields.json` and edit field coordinates.
3. Use `sample.csv` format for your real data file.

Coordinates are in PDF points (`72 points = 1 inch`) using bottom-left origin.

## 3) Alignment pass (recommended first)

Use placeholders and visual guides:

```powershell
.\.venv\Scripts\Activate.ps1
python certificate_overlay.py 
  --fields fields.json 
  --csv sample.csv --row 0 
  --output out/certificate_clean.pdf 
  --overlay-only 
  --page-size letter```


** If you want template-merge mode instead of overlay-only, use **
```powershell
python certificate_overlay.py `
  --template template.pdf `
  --fields fields.json `
  --csv sample.csv `
  --row 0 `
  --output out/alignment.pdf `
```
python certificate_overlay.py --template certificate_template.pdf --fields fields.json --csv sample.csv --row 0 --output out/alignment.pdf



Print `out/alignment.pdf` on top of a pre-printed certificate and inspect offset.

Adjust global offsets and repeat:

```powershell
python certificate_overlay.py `
  --template template.pdf `
  --fields fields.json `
  --output out/alignment_nudged.pdf `
  --placeholder-mode `
  --debug `
  --dx 2.0 `
  --dy -1.5
```

Then fine-tune per-field `x/y` in `fields.json`.

## 3c) Extract coordinates from template (PyMuPDF)

If your template PDF already contains labels (e.g. "Certificate awarded to"), you can
extract their coordinates and use them as starting points for `fields.json`.

List matching text spans (bottom-left coordinates shown):

```powershell
python extract_template_coords.py `
  --template certificate_template.pdf `
  --page 0 `
  --contains "Certificate" `
  --output-json out/template_coords.json
```

Create an annotated PDF with bounding boxes and numeric labels:

```powershell
python extract_template_coords.py `
  --template certificate_template.pdf `
  --page 0 `
  --annotate out/template_annotated.pdf
```

Use the reported `bbox_bottom_left` or `origin_bottom_left` values as the `x/y` anchor
when setting `fields.json` entries.

## 3b) Overlay-only mode (no template PDF)

Use this when your certificate background is already physically pre-printed and you only want text/placeholders at aligned positions:

```powershell
python certificate_overlay.py `
  --fields fields.json `
  --output out/alignment_overlay_only.pdf `
  --placeholder-mode `
  --overlay-only `
  --page-size letter `
  --debug `
  --grid-step 36
```

For production values:

```powershell
python certificate_overlay.py `
  --fields fields.json `
  --csv sample.csv `
  --row 0 `
  --output out/certificate_overlay_only.pdf `
  --overlay-only `
  --page-size letter
```

Notes:

- `--overlay-only` does not require `--template`.
- Keep printer settings consistent (`actual size` / no scaling) for reliable alignment.

## 4) Generate real certificate data

```powershell
python certificate_overlay.py `
  --template template.pdf `
  --fields fields.json `
  --csv sample.csv `
  --row 0 `
  --output out/certificate_row0.pdf
```

## Fields config notes

Each field supports:

- `name`: CSV column name
- `x`, `y`: anchor position in points
- `font`, `size`: text styling
- `align`: `left` | `center` | `right`
- `max_width`: optional auto-shrink width cap
- `color`: optional RGB array `[r,g,b]` from `0..1`

Font support:

- Use ReportLab built-in fonts, or custom fonts registered from `fonts/`.
- Built-in fonts: `Helvetica`, `Times-Roman`, `Courier` (and their Bold/Italic variants), plus `Symbol`, `ZapfDingbats`.
- Custom fonts are selected by filename stem (for example `GreatVibes-Regular.ttf` -> `GreatVibes-Regular`).
- Template-extracted font names are informational and are not guaranteed renderable unless registered.

Top-level keys:

- `page`: zero-based template page index to overlay
- `default_font`, `default_size`: defaults for fields

## React template mapper (new)

A React tool is included at `template-mapper-app/` to create field placeholders visually.

### Start

```powershell
cd template-mapper-app
npm install
npm run dev
```

### Workflow

1. Upload a certificate template (`PDF`/`PNG`/`JPG`).
2. Draw a box where each candidate detail should appear.
3. Select each box and set:
   - `Field name` (must match CSV column name)
   - `align`, `font`, `size`
   - `max_width` toggle (recommended for long names)
4. Enter sample values to preview fit inside each box.
5. Click **Export fields.json**.
6. Use exported file with `certificate_overlay.py`.

### Coordinate model

- Export uses PDF-point coordinates (bottom-left origin), matching the Python overlay script.
- For PDF uploads, page size is read from the first page directly.
- For image uploads, choose page size preset (Letter/A4/Legal) or custom points.

## FastAPI integration (frontend + backend)

The project now includes `app_server.py` so React and Python overlay tools run under one server.

### 1) Build the React frontend

```powershell
cd template-mapper-app
npm install
npm run build
cd ..
```

### 2) Start the FastAPI server

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app_server:app --reload
```

Open `http://127.0.0.1:8000`.

### API routes

- `GET /api/health` -> server status
- `GET /api/fields` -> read `fields.json`
- `POST /api/fields` -> save `fields.json`
- `POST /api/generate` -> run `certificate_overlay.py` from JSON options
- `POST /api/generate-file` -> run overlay generation and return the generated PDF for download
