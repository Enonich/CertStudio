import argparse
import csv
import io
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


_BASE14_FONTS = {
    "Courier",
    "Courier-Bold",
    "Courier-Oblique",
    "Courier-BoldOblique",
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Oblique",
    "Helvetica-BoldOblique",
    "Times-Roman",
    "Times-Bold",
    "Times-Italic",
    "Times-BoldItalic",
    "Symbol",
    "ZapfDingbats",
}


def _normalize_font_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _font_is_available(font_name: str) -> bool:
    if font_name in _BASE14_FONTS:
        return True
    try:
        pdfmetrics.getFont(font_name)
        return True
    except Exception:
        return False


def resolve_font_name(font_name: str, fallback_font: str = "Helvetica") -> str:
    if _font_is_available(font_name):
        return font_name

    # Try case/spacing-insensitive match against registered fonts.
    normalized = _normalize_font_name(font_name)
    for candidate in list(pdfmetrics.getRegisteredFontNames()) + list(_BASE14_FONTS):
        if _normalize_font_name(candidate) == normalized and _font_is_available(candidate):
            return candidate

    if _font_is_available(fallback_font):
        print(f"[WARN] Font '{font_name}' is unavailable. Falling back to '{fallback_font}'.")
        return fallback_font

    print(f"[WARN] Font '{font_name}' is unavailable. Falling back to 'Helvetica'.")
    return "Helvetica"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Overlay CSV values/placeholders onto a pre-printed certificate template PDF."
    )
    parser.add_argument("--template", help="Path to the template PDF.")
    parser.add_argument("--fields", help="Path to fields JSON config.")
    parser.add_argument("--csv", dest="csv_path", help="Path to CSV file with values.")
    parser.add_argument("--data-json", help="Path to JSON file with values.")
    parser.add_argument(
        "--output",
        help="Output PDF path. For alignment tests, print this on your pre-printed sheet.",
    )
    parser.add_argument("--row", type=int, default=0, help="CSV row index to use.")
    parser.add_argument(
        "--field-mappings",
        help="Path to JSON file mapping field names to CSV columns.",
    )
    parser.add_argument(
        "--fixed-values",
        help="Path to JSON file with fixed values for non-mapped fields.",
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Generate certificates for all CSV rows. Output path becomes a directory.",
    )
    parser.add_argument(
        "--placeholder-mode",
        action="store_true",
        help="Use {field_name} placeholder text instead of CSV values.",
    )
    parser.add_argument("--dx", type=float, default=0.0, help="Global X offset in points.")
    parser.add_argument("--dy", type=float, default=0.0, help="Global Y offset in points.")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Draw anchors/guide lines for calibration.",
    )
    parser.add_argument(
        "--grid-step",
        type=float,
        default=0.0,
        help="Draw a light calibration grid with this spacing (points). 0 disables grid.",
    )
    parser.add_argument(
        "--font-path",
        help="Optional TTF font path to register as 'CustomFont'.",
    )
    parser.add_argument(
        "--overlay-only",
        action="store_true",
        help="Generate only the positioned text on a blank page (no template merge).",
    )
    parser.add_argument(
        "--page-size",
        default="letter",
        choices=["letter", "a4", "legal"],
        help="Page size used with --overlay-only.",
    )
    parser.add_argument(
        "--use-template-anchors",
        action="store_true",
        help="Use template placeholder text to set field coordinates.",
    )
    parser.add_argument(
        "--template-anchor-page",
        type=int,
        default=None,
        help="Template page index for anchor extraction (defaults to fields.json page).",
    )
    parser.add_argument(
        "--extract-coords",
        action="store_true",
        help="Extract text coordinates from the template and exit.",
    )
    parser.add_argument(
        "--extract-page",
        type=int,
        default=0,
        help="Template page index for --extract-coords.",
    )
    parser.add_argument(
        "--extract-contains",
        help="Filter extracted text spans by substring (case-insensitive).",
    )
    parser.add_argument(
        "--extract-min-len",
        type=int,
        default=1,
        help="Minimum text length to include in --extract-coords.",
    )
    parser.add_argument(
        "--extract-max-items",
        type=int,
        default=0,
        help="Limit extracted items (0 = no limit).",
    )
    parser.add_argument(
        "--extract-output-json",
        help="Write extracted coordinates to JSON.",
    )
    parser.add_argument(
        "--extract-annotate",
        help="Write an annotated PDF with boxes and labels.",
    )
    return parser.parse_args()


def extract_template_coords(
    template_path: Path,
    page_index: int,
    contains: str | None,
    min_len: int,
    max_items: int,
    output_json: Path | None,
    annotate_path: Path | None,
) -> None:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required for --extract-coords. Install pymupdf.") from exc

    doc = fitz.open(template_path)
    if page_index < 0 or page_index >= len(doc):
        raise IndexError(f"Page {page_index} out of range. PDF has {len(doc)} page(s).")

    page = doc[page_index]
    page_w = float(page.rect.width)
    page_h = float(page.rect.height)
    needle = contains.lower() if contains else None

    items: list[dict] = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if len(text) < min_len:
                    continue
                if needle and needle not in text.lower():
                    continue

                bbox_top_left = list(span.get("bbox", [0, 0, 0, 0]))
                origin = span.get("origin")

                x0, y0, x1, y1 = bbox_top_left
                bbox_bottom_left = [x0, page_h - y1, x1, page_h - y0]

                origin_bottom_left = None
                if origin:
                    origin_bottom_left = [origin[0], page_h - origin[1]]

                items.append(
                    {
                        "text": text,
                        "font": span.get("font"),
                        "size": span.get("size"),
                        "bbox_top_left": bbox_top_left,
                        "bbox_bottom_left": bbox_bottom_left,
                        "origin_top_left": list(origin) if origin else None,
                        "origin_bottom_left": origin_bottom_left,
                    }
                )

                if max_items and len(items) >= max_items:
                    break
            if max_items and len(items) >= max_items:
                break
        if max_items and len(items) >= max_items:
            break

    print(f"Template: {template_path}")
    print(f"Page: {page_index}  Size: {page_w:.2f} x {page_h:.2f} points")
    print(f"Matches: {len(items)}")
    for idx, item in enumerate(items, start=1):
        bbox = item["bbox_bottom_left"]
        print(
            f"{idx:03d} | '{item['text']}' | font={item['font']} size={item['size']:.1f} | "
            f"bbox_bl=({bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f})"
        )

    if output_json:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "template": str(template_path),
            "page": page_index,
            "page_size_points": [page_w, page_h],
            "items": items,
        }
        output_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote JSON: {output_json}")

    if annotate_path:
        annotate_path.parent.mkdir(parents=True, exist_ok=True)
        for idx, item in enumerate(items, start=1):
            rect = fitz.Rect(item["bbox_top_left"])
            page.draw_rect(rect, color=(1, 0, 0), width=0.7)
            label = f"{idx:03d}"
            page.insert_text(
                rect.tl + fitz.Point(0, -2),
                label,
                fontsize=7,
                color=(1, 0, 0),
            )
        doc.save(annotate_path)
        print(f"Wrote annotated PDF: {annotate_path}")


def extract_fonts_from_pdf(template_path: Path) -> list[str]:
    """Extract unique font names from all pages of a PDF."""
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required for font extraction. Install pymupdf.") from exc

    doc = fitz.open(template_path)
    fonts = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        data = page.get_text("dict")
        for block in data.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    font_name = span.get("font")
                    if font_name:
                        fonts.add(font_name)

    return sorted(list(fonts))


def normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def build_template_anchor_map(
    template_path: Path,
    page_index: int,
) -> dict[str, dict]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required for --use-template-anchors.") from exc

    doc = fitz.open(template_path)
    if page_index < 0 or page_index >= len(doc):
        raise IndexError(f"Page {page_index} out of range. PDF has {len(doc)} page(s).")

    page = doc[page_index]
    page_h = float(page.rect.height)
    anchors: dict[str, dict] = {}

    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text:
                    continue
                key = normalize_text(text)
                if key in anchors:
                    continue
                bbox_top_left = list(span.get("bbox", [0, 0, 0, 0]))
                origin = span.get("origin")
                x0, y0, x1, y1 = bbox_top_left
                bbox_bottom_left = [x0, page_h - y1, x1, page_h - y0]
                origin_bottom_left = None
                if origin:
                    origin_bottom_left = [origin[0], page_h - origin[1]]
                anchors[key] = {
                    "text": text,
                    "bbox_bottom_left": bbox_bottom_left,
                    "origin_bottom_left": origin_bottom_left,
                }

    return anchors


def apply_template_anchors(fields_cfg: dict, anchors: dict[str, dict]) -> dict:
    updated_fields = []
    for field in fields_cfg.get("fields", []):
        template_text = field.get("template_text")
        if not template_text:
            updated_fields.append(field)
            continue

        key = normalize_text(str(template_text))
        anchor = anchors.get(key)
        if not anchor:
            print(f"Warning: template_text not found: {template_text}")
            updated_fields.append(field)
            continue

        bbox = anchor["bbox_bottom_left"]
        origin = anchor["origin_bottom_left"]
        align = field.get("align", "left").lower()

        if align == "center":
            x = (bbox[0] + bbox[2]) / 2.0
        elif align == "right":
            x = bbox[2]
        else:
            x = origin[0] if origin else bbox[0]

        y = origin[1] if origin else bbox[1]

        new_field = dict(field)
        new_field["x"] = x
        new_field["y"] = y
        updated_fields.append(new_field)

    new_cfg = dict(fields_cfg)
    new_cfg["fields"] = updated_fields
    return new_cfg


def register_fonts_from_directory(fonts_dir: Path) -> dict[str, str]:
    """Auto-register all TTF fonts from a directory.
    
    Returns a dict mapping font names to file paths.
    """
    font_map = {}
    if not fonts_dir.exists():
        return font_map
    
    for font_file in fonts_dir.glob("*.ttf"):
        try:
            font_name = font_file.stem  # filename without .ttf extension
            pdfmetrics.registerFont(TTFont(font_name, str(font_file)))
            font_map[font_name] = str(font_file)
            print(f"[OK] Registered font: {font_name}")
        except Exception as e:
            print(f"[FAIL] Failed to register {font_file.name}: {e}")
    
    # Also support .otf files
    for font_file in fonts_dir.glob("*.otf"):
        try:
            font_name = font_file.stem
            pdfmetrics.registerFont(TTFont(font_name, str(font_file)))
            font_map[font_name] = str(font_file)
            print(f"[OK] Registered font: {font_name}")
        except Exception as e:
            print(f"[FAIL] Failed to register {font_file.name}: {e}")
    
    return font_map


def load_fields(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_csv_row(path: Path, index: int) -> dict:
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError("CSV has no data rows.")
    if index < 0 or index >= len(rows):
        raise IndexError(f"Row index {index} out of range. CSV has {len(rows)} row(s).")
    return rows[index]


def load_all_csv_rows(path: Path) -> list[dict]:
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError("CSV has no data rows.")
    return rows


def merge_csv_and_fixed_values(
    csv_row: dict,
    field_mappings: dict[str, str] | None,
    fixed_values: dict[str, str] | None,
) -> dict:
    """Merge CSV row data with fixed UI values.
    
    For fields with mappings, use the CSV column value.
    For fields without mappings, use the fixed value if available.
    """
    result = {}
    
    # Start with fixed values (UI-entered values)
    if fixed_values:
        result.update(fixed_values)
    
    # Apply field mappings: map field names to CSV column values
    if field_mappings and csv_row:
        for field_name, csv_column in field_mappings.items():
            if csv_column and csv_column in csv_row:
                result[field_name] = csv_row[csv_column]
    
    return result


def fit_font_size(font_name: str, text: str, size: float, max_width: float | None) -> float:
    if not max_width or max_width <= 0:
        return size
    # Measure the widest individual line so multi-line text isn't over-shrunk.
    lines = text.split("\n") if "\n" in text else [text]
    max_line_width = max((pdfmetrics.stringWidth(line, font_name, size) for line in lines), default=0)
    if max_line_width <= max_width:
        return size
    if max_line_width == 0:
        return size
    return max(6.0, size * (max_width / max_line_width))


def wrap_text_to_lines(font_name: str, text: str, size: float, max_width: float) -> list[str]:
    """Break *text* into lines that each fit within *max_width* at *size* pt.

    Preserves explicit newlines and performs greedy word-wrap within each
    paragraph.  A single word that is still wider than max_width is kept as its
    own line (no character-level breaking).
    """
    result: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            result.append("")
            continue
        words = paragraph.split(" ")
        current: str = ""
        for word in words:
            candidate = (current + " " + word).strip() if current else word
            if pdfmetrics.stringWidth(candidate, font_name, size) <= max_width:
                current = candidate
            else:
                if current:
                    result.append(current)
                current = word
        if current:
            result.append(current)
    return result if result else [""]


def normalize_color(color: list | tuple | None, fallback: tuple[float, float, float]) -> tuple[float, float, float]:
    if not isinstance(color, (list, tuple)) or len(color) != 3:
        return fallback
    try:
        r = max(0.0, min(1.0, float(color[0])))
        g = max(0.0, min(1.0, float(color[1])))
        b = max(0.0, min(1.0, float(color[2])))
        return (r, g, b)
    except Exception:
        return fallback


def parse_css_color(value: str, fallback: tuple[float, float, float]) -> tuple[float, float, float]:
    if not isinstance(value, str):
        return fallback
    s = value.strip().lower()
    named = {
        "black": (0.0, 0.0, 0.0),
        "white": (1.0, 1.0, 1.0),
        "red": (1.0, 0.0, 0.0),
        "green": (0.0, 0.5, 0.0),
        "blue": (0.0, 0.0, 1.0),
        "yellow": (1.0, 1.0, 0.0),
        "gray": (0.5, 0.5, 0.5),
        "grey": (0.5, 0.5, 0.5),
    }
    if s in named:
        return named[s]
    if s.startswith("#"):
        hexv = s[1:]
        if len(hexv) == 3:
            hexv = "".join(ch * 2 for ch in hexv)
        if len(hexv) == 6 and all(ch in "0123456789abcdef" for ch in hexv):
            return (
                int(hexv[0:2], 16) / 255.0,
                int(hexv[2:4], 16) / 255.0,
                int(hexv[4:6], 16) / 255.0,
            )
    m = re.match(r"rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)", s)
    if m:
        return (
            max(0, min(255, int(m.group(1)))) / 255.0,
            max(0, min(255, int(m.group(2)))) / 255.0,
            max(0, min(255, int(m.group(3)))) / 255.0,
        )
    return fallback


def parse_font_family(value: str | None) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    primary = value.split(",")[0].strip().strip("'\"")
    return primary or None


def _decompose_font_style(font_name: str) -> tuple[str, bool, bool]:
    if font_name.startswith("Helvetica"):
        if font_name == "Helvetica-BoldOblique":
            return ("Helvetica", True, True)
        if font_name == "Helvetica-Bold":
            return ("Helvetica", True, False)
        if font_name == "Helvetica-Oblique":
            return ("Helvetica", False, True)
        return ("Helvetica", False, False)
    if font_name.startswith("Times"):
        if font_name == "Times-BoldItalic":
            return ("Times-Roman", True, True)
        if font_name == "Times-Bold":
            return ("Times-Roman", True, False)
        if font_name == "Times-Italic":
            return ("Times-Roman", False, True)
        return ("Times-Roman", False, False)
    if font_name.startswith("Courier"):
        if font_name == "Courier-BoldOblique":
            return ("Courier", True, True)
        if font_name == "Courier-Bold":
            return ("Courier", True, False)
        if font_name == "Courier-Oblique":
            return ("Courier", False, True)
        return ("Courier", False, False)
    return (font_name, False, False)


def apply_emphasis_to_font(
    base_font_name: str,
    bold: bool,
    italic: bool,
    fallback_font: str,
) -> str:
    base_font, base_bold, base_italic = _decompose_font_style(base_font_name)
    eff_bold = base_bold or bold
    eff_italic = base_italic or italic

    if base_font == "Helvetica":
        candidate = (
            "Helvetica-BoldOblique" if eff_bold and eff_italic
            else "Helvetica-Bold" if eff_bold
            else "Helvetica-Oblique" if eff_italic
            else "Helvetica"
        )
        return resolve_font_name(candidate, fallback_font=fallback_font)
    if base_font == "Times-Roman":
        candidate = (
            "Times-BoldItalic" if eff_bold and eff_italic
            else "Times-Bold" if eff_bold
            else "Times-Italic" if eff_italic
            else "Times-Roman"
        )
        return resolve_font_name(candidate, fallback_font=fallback_font)
    if base_font == "Courier":
        candidate = (
            "Courier-BoldOblique" if eff_bold and eff_italic
            else "Courier-Bold" if eff_bold
            else "Courier-Oblique" if eff_italic
            else "Courier"
        )
        return resolve_font_name(candidate, fallback_font=fallback_font)

    # For custom fonts, keep the same family and ignore synthetic bold/italic.
    return resolve_font_name(base_font_name, fallback_font=fallback_font)


def parse_style_attr(style_text: str) -> dict:
    out: dict = {}
    if not isinstance(style_text, str):
        return out
    for part in style_text.split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        k = key.strip().lower()
        v = value.strip()
        if k == "color":
            out["color"] = v
        elif k == "font-family":
            out["font_family"] = v
        elif k == "font-weight" and (v.lower() == "bold" or v == "700"):
            out["bold"] = True
        elif k == "font-style" and v.lower() == "italic":
            out["italic"] = True
    return out


class InlineHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[dict] = []
        self.style_stack: list[dict] = [{"bold": False, "italic": False, "font_family": None, "color": None}]
        self.tag_stack: list[tuple[str, bool]] = []

    def _push_style(self, tag: str, updates: dict) -> None:
        style = dict(self.style_stack[-1])
        style.update({k: v for k, v in updates.items() if v is not None})
        self.style_stack.append(style)
        self.tag_stack.append((tag, True))

    def _push_no_style(self, tag: str) -> None:
        self.tag_stack.append((tag, False))

    def _add_newline(self, source: str) -> None:
        self.tokens.append({"newline": True, "source": source})

    def _pop_tag(self, tag: str) -> None:
        if not self.tag_stack:
            return
        last_tag, had_style = self.tag_stack.pop()
        if had_style and len(self.style_stack) > 1:
            self.style_stack.pop()
        if last_tag in {"p", "div", "li"}:
            self._add_newline("block")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        attrs_map = {k.lower(): (v or "") for k, v in attrs}
        if name == "br":
            self._add_newline("br")
            self._push_no_style(name)
            return
        if name in {"b", "strong"}:
            self._push_style(name, {"bold": True})
            return
        if name in {"i", "em"}:
            self._push_style(name, {"italic": True})
            return
        if name == "font":
            self._push_style(
                name,
                {
                    "font_family": attrs_map.get("face"),
                    "color": attrs_map.get("color"),
                },
            )
            return
        if name == "span":
            self._push_style(name, parse_style_attr(attrs_map.get("style", "")))
            return
        if name in {"p", "div", "li"}:
            self._push_no_style(name)
            return
        self._push_no_style(name)

    def handle_endtag(self, tag: str) -> None:
        self._pop_tag(tag.lower())

    def handle_data(self, data: str) -> None:
        if not data:
            return
        # Ignore editor-introduced indentation/newline text nodes between tags.
        if data.strip() == "" and ("\n" in data or "\r" in data or "\t" in data):
            return
        parts = data.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        current_style = self.style_stack[-1]
        for idx, part in enumerate(parts):
            if part:
                self.tokens.append({"text": part, "style": dict(current_style)})
            if idx < len(parts) - 1:
                self._add_newline("text")


def build_rich_tokens_from_html(html_text: str) -> list[dict]:
    parser = InlineHtmlParser()
    parser.feed(str(html_text))
    parser.close()
    normalized: list[dict] = []
    for token in parser.tokens:
        if not token.get("newline"):
            normalized.append(token)
            continue

        source = token.get("source", "block")
        if not normalized:
            # Drop leading block-driven line breaks.
            if source == "block":
                continue
            normalized.append({"newline": True})
            continue

        prev = normalized[-1]
        if prev.get("newline"):
            # Keep consecutive newlines only when both are explicit user breaks.
            prev_source = prev.get("source", "block")
            explicit_prev = prev_source in {"br", "text"}
            explicit_curr = source in {"br", "text"}
            if explicit_prev and explicit_curr:
                normalized.append({"newline": True, "source": source})
            # Otherwise collapse block-driven duplicates.
            continue

        normalized.append({"newline": True, "source": source})

    # Trim trailing block newline noise.
    while normalized and normalized[-1].get("newline") and normalized[-1].get("source", "block") == "block":
        normalized.pop()

    return normalized


def resolve_field_content(field: dict, name: str | None, data: dict | None, placeholder_mode: bool) -> tuple[str, str | None]:
    if "text" in field:
        text = str(field["text"])
        html_text = field.get("html")
        return text, str(html_text) if html_text is not None else None
    if not name:
        raise ValueError("Each field must define either 'name' or 'text'.")
    if placeholder_mode or data is None:
        return "{" + name + "}", None

    value = data.get(name, "")
    if isinstance(value, dict):
        text_value = str(value.get("text", ""))
        html_value = value.get("html")
        return text_value, str(html_value) if html_value is not None else None
    return str(value), None


def build_styled_tokens(
    plain_text: str,
    html_text: str | None,
    base_font: str,
    base_color: tuple[float, float, float],
    fallback_font: str,
) -> list[dict]:
    if html_text:
        parsed = build_rich_tokens_from_html(html_text)
    else:
        parsed = []
        parts = plain_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for idx, part in enumerate(parts):
            parsed.append({"text": part, "style": {}})
            if idx < len(parts) - 1:
                parsed.append({"newline": True})

    tokens: list[dict] = []
    for token in parsed:
        if token.get("newline"):
            tokens.append({"newline": True})
            continue
        text = token.get("text", "")
        if text == "":
            continue
        style = token.get("style", {})
        style_font = parse_font_family(style.get("font_family"))
        font_for_style = resolve_font_name(style_font, fallback_font=base_font) if style_font else base_font
        draw_font = apply_emphasis_to_font(
            base_font_name=font_for_style,
            bold=bool(style.get("bold", False)),
            italic=bool(style.get("italic", False)),
            fallback_font=fallback_font,
        )
        draw_color = parse_css_color(str(style.get("color", "")), base_color) if style.get("color") else base_color
        tokens.append({"text": text, "font": draw_font, "color": draw_color})
    return tokens


def _trim_line_runs(runs: list[dict], size: float) -> tuple[list[dict], float]:
    trimmed = [dict(run) for run in runs]
    while trimmed and trimmed[-1]["text"].isspace():
        trimmed.pop()
    if trimmed and trimmed[-1]["text"] != trimmed[-1]["text"].rstrip():
        trimmed[-1]["text"] = trimmed[-1]["text"].rstrip()
    width = sum(pdfmetrics.stringWidth(run["text"], run["font"], size) for run in trimmed)
    return trimmed, width


def layout_styled_lines(tokens: list[dict], size: float, wrap_width: float | None) -> list[dict]:
    lines: list[dict] = []
    current_runs: list[dict] = []
    current_width = 0.0

    def push_line(force_empty: bool = False) -> None:
        nonlocal current_runs, current_width
        if not current_runs and not force_empty:
            return
        trimmed_runs, line_width = _trim_line_runs(current_runs, size)
        lines.append({"runs": trimmed_runs, "width": line_width})
        current_runs = []
        current_width = 0.0

    wrap_enabled = bool(wrap_width and wrap_width > 0)

    for token in tokens:
        if token.get("newline"):
            push_line(force_empty=True)
            continue
        text = token.get("text", "")
        if text == "":
            continue

        font = token["font"]
        color = token["color"]
        chunks = [text] if not wrap_enabled else re.findall(r"\S+|\s+", text)
        for chunk in chunks:
            if chunk == "":
                continue
            if wrap_enabled and not current_runs and chunk.isspace():
                continue
            chunk_w = pdfmetrics.stringWidth(chunk, font, size)
            if (
                wrap_enabled
                and current_runs
                and (current_width + chunk_w > float(wrap_width))
                and not chunk.isspace()
            ):
                push_line(force_empty=False)
                if chunk.isspace():
                    continue
            if current_runs and current_runs[-1]["font"] == font and current_runs[-1]["color"] == color:
                current_runs[-1]["text"] += chunk
            else:
                current_runs.append({"text": chunk, "font": font, "color": color})
            current_width += chunk_w

    push_line(force_empty=True)
    return lines if lines else [{"runs": [], "width": 0.0}]


def fit_font_size_for_lines(
    tokens: list[dict],
    initial_size: float,
    wrap_width: float | None,
    box_height: float | None,
    min_size: float = 6.0,
) -> tuple[float, bool]:
    """Fit font size so wrapped/multiline content can fit inside box height.

    Returns (size, fits_height).  If fitting can't be achieved above min_size,
    returns min_size and fits_height=False.
    """
    if not box_height or box_height <= 0:
        return initial_size, True

    size = max(min_size, float(initial_size))
    for _ in range(80):
        lines = layout_styled_lines(tokens, size, wrap_width)
        line_count = max(1, len(lines))
        line_height = size * 1.2
        required_height = size + (line_count - 1) * line_height
        if required_height <= box_height:
            return size, True
        if size <= min_size:
            return min_size, False
        size = max(min_size, size - 0.5)

    # Fallback if loop exits unexpectedly.
    return size, False


def draw_styled_line(c: canvas.Canvas, runs: list[dict], x: float, y: float, size: float) -> None:
    cursor_x = x
    for run in runs:
        text = run["text"]
        if not text:
            continue
        c.setFont(run["font"], size)
        c.setFillColor(Color(*run["color"]))
        c.drawString(cursor_x, y, text)
        cursor_x += pdfmetrics.stringWidth(text, run["font"], size)


def draw_grid(c: canvas.Canvas, page_w: float, page_h: float, step: float) -> None:
    if step <= 0:
        return
    c.saveState()
    c.setStrokeColor(Color(0.75, 0.75, 0.75, alpha=0.35))
    c.setLineWidth(0.35)
    x = 0.0
    while x <= page_w:
        c.line(x, 0, x, page_h)
        x += step
    y = 0.0
    while y <= page_h:
        c.line(0, y, page_w, y)
        y += step
    c.restoreState()


def draw_anchor(c: canvas.Canvas, x: float, y: float) -> None:
    c.saveState()
    c.setStrokeColor(Color(1, 0, 0, alpha=0.8))
    c.setLineWidth(0.7)
    c.line(x - 6, y, x + 6, y)
    c.line(x, y - 6, x, y + 6)
    c.restoreState()


def draw_overlay(
    page_w: float,
    page_h: float,
    fields_cfg: dict,
    data: dict | None,
    placeholder_mode: bool,
    dx: float,
    dy: float,
    debug: bool,
    grid_step: float,
    custom_font_registered: bool,
) -> bytes:
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=(page_w, page_h))

    draw_grid(c, page_w, page_h, grid_step)

    default_font = fields_cfg.get("default_font", "Helvetica")
    default_font = resolve_font_name(str(default_font), fallback_font="Helvetica")
    default_size = float(fields_cfg.get("default_size", 20))

    for field in fields_cfg.get("fields", []):
        name = field.get("name")
        raw_x = float(field["x"]) + dx
        raw_y = float(field["y"]) + dy

        align = field.get("align", "left").lower()
        font_name = str(field.get("font", default_font))
        if custom_font_registered and font_name.lower() == "customfont":
            font_name = "CustomFont"
        font_name = resolve_font_name(font_name, fallback_font=default_font)
        size = float(field.get("size", default_size))
        color = field.get("color", [0, 0, 0])
        max_width = field.get("max_width")
        base_color = normalize_color(color, (0.0, 0.0, 0.0))
        text, html_text = resolve_field_content(field, name, data, placeholder_mode)

        fitted_size = fit_font_size(
            font_name=font_name,
            text=text,
            size=size,
            max_width=float(max_width) if max_width is not None else None,
        )

        c.setFillColor(Color(*base_color))
        c.setFont(font_name, fitted_size)

        wrap_text = field.get("wrap_text", False)
        wrap_width = field.get("wrap_width")   # set when "Wrap text" checkbox is on
        has_newlines = "\n" in text
        rich_tokens = build_styled_tokens(
            plain_text=text,
            html_text=html_text,
            base_font=font_name,
            base_color=base_color,
            fallback_font=default_font,
        )
        wrap_width_pt = float(wrap_width) if (wrap_text and wrap_width) else None
        box_height_pt = float(field.get("box_height", fitted_size * 1.5))
        box_width_pt = float(field.get("box_width", wrap_width_pt or max_width or 0.0))
        styled_lines = layout_styled_lines(
            rich_tokens,
            fitted_size,
            wrap_width_pt,
        )
        has_rich_content = bool(html_text)
        multiple_lines = len(styled_lines) > 1
        needs_multiline_layout = has_newlines or (wrap_text and wrap_width) or multiple_lines

        # Use multi-line rendering whenever text has explicit newlines OR
        # word-wrap is requested.  wrap_start_y (top of box) and box_height
        # are always sent from the frontend for every field.
        wrap_start_y = float(field.get("wrap_start_y", raw_y + box_height_pt))
        should_clip_to_box = box_width_pt > 0 and box_height_pt > 0 and (
            needs_multiline_layout or has_rich_content
        )
        if should_clip_to_box:
            if align == "center":
                clip_x = raw_x - (box_width_pt / 2.0)
            elif align == "right":
                clip_x = raw_x - box_width_pt
            else:
                clip_x = raw_x
            clip_y = wrap_start_y - box_height_pt
            c.saveState()
            clip_path = c.beginPath()
            clip_path.rect(clip_x, clip_y, box_width_pt, box_height_pt)
            c.clipPath(clip_path, stroke=0, fill=0)

        if needs_multiline_layout:
            line_height = fitted_size * 1.2
            # First baseline sits one font-size below the top of the box.
            first_y = wrap_start_y - fitted_size
            bottom_limit = wrap_start_y - box_height_pt
            clip_to_box = box_height_pt > 0

            for i, line in enumerate(styled_lines):
                y_pos = first_y - i * line_height
                if clip_to_box and y_pos < bottom_limit:
                    break
                line_width = float(line["width"])
                if align == "center":
                    start_x = raw_x - (line_width / 2.0)
                elif align == "right":
                    start_x = raw_x - line_width
                else:
                    start_x = raw_x
                draw_styled_line(c, line["runs"], start_x, y_pos, fitted_size)
        elif has_rich_content:
            line = styled_lines[0] if styled_lines else {"runs": [], "width": 0.0}
            line_width = float(line["width"])
            if align == "center":
                start_x = raw_x - (line_width / 2.0)
            elif align == "right":
                start_x = raw_x - line_width
            else:
                start_x = raw_x
            draw_styled_line(c, line["runs"], start_x, raw_y, fitted_size)
        else:
            if align == "center":
                c.drawCentredString(raw_x, raw_y, text)
            elif align == "right":
                c.drawRightString(raw_x, raw_y, text)
            else:
                c.drawString(raw_x, raw_y, text)

        if should_clip_to_box:
            c.restoreState()

        if debug:
            draw_anchor(c, raw_x, raw_y)
            c.saveState()
            c.setStrokeColor(Color(0, 0, 1, alpha=0.35))
            c.setLineWidth(0.6)
            c.line(0, raw_y, page_w, raw_y)
            c.line(raw_x, 0, raw_x, page_h)
            c.restoreState()

    c.showPage()
    c.save()
    packet.seek(0)
    return packet.read()


def get_page_size_points(page_size: str) -> tuple[float, float]:
    sizes = {
        "letter": (612.0, 792.0),
        "a4": (595.2756, 841.8898),
        "legal": (612.0, 1008.0),
    }
    return sizes[page_size]


def generate_single_certificate(
    template_path: Path | None,
    fields_cfg: dict,
    data: dict | None,
    output_path: Path,
    args: argparse.Namespace,
    custom_font_registered: bool,
) -> None:
    """Generate a single certificate PDF."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.overlay_only:
        if template_path:
            reader = PdfReader(str(template_path))
            target_page = int(fields_cfg.get("page", 0))
            if target_page < 0 or target_page >= len(reader.pages):
                raise IndexError(
                    f"Config page={target_page} but template has {len(reader.pages)} page(s)."
                )
            page = reader.pages[target_page]
            page_w = float(page.mediabox.width)
            page_h = float(page.mediabox.height)
        else:
            page_w, page_h = get_page_size_points(args.page_size)
        overlay_bytes = draw_overlay(
            page_w=page_w,
            page_h=page_h,
            fields_cfg=fields_cfg,
            data=data,
            placeholder_mode=args.placeholder_mode,
            dx=args.dx,
            dy=args.dy,
            debug=args.debug,
            grid_step=args.grid_step,
            custom_font_registered=custom_font_registered,
        )
        with output_path.open("wb") as f:
            f.write(overlay_bytes)
    else:
        if not args.template:
            raise ValueError("Provide --template when not using --overlay-only.")

        if not template_path:
            raise ValueError("Provide --template when not using --overlay-only.")
        reader = PdfReader(str(template_path))
        writer = PdfWriter()

        target_page = int(fields_cfg.get("page", 0))
        if target_page < 0 or target_page >= len(reader.pages):
            raise IndexError(f"Config page={target_page} but template has {len(reader.pages)} page(s).")

        for i, page in enumerate(reader.pages):
            if i == target_page:
                page_w = float(page.mediabox.width)
                page_h = float(page.mediabox.height)
                overlay_bytes = draw_overlay(
                    page_w=page_w,
                    page_h=page_h,
                    fields_cfg=fields_cfg,
                    data=data,
                    placeholder_mode=args.placeholder_mode,
                    dx=args.dx,
                    dy=args.dy,
                    debug=args.debug,
                    grid_step=args.grid_step,
                    custom_font_registered=custom_font_registered,
                )
                overlay_page = PdfReader(io.BytesIO(overlay_bytes)).pages[0]
                page.merge_page(overlay_page)
            writer.add_page(page)

        with output_path.open("wb") as f:
            writer.write(f)


def main() -> None:
    args = parse_args()
    if args.extract_coords:
        if not args.template:
            raise ValueError("Provide --template when using --extract-coords.")
        extract_template_coords(
            template_path=Path(args.template),
            page_index=args.extract_page,
            contains=args.extract_contains,
            min_len=args.extract_min_len,
            max_items=args.extract_max_items,
            output_json=Path(args.extract_output_json) if args.extract_output_json else None,
            annotate_path=Path(args.extract_annotate) if args.extract_annotate else None,
        )
        return

    if not args.fields:
        raise ValueError("Provide --fields.")
    if not args.output:
        raise ValueError("Provide --output.")

    fields_path = Path(args.fields)
    output_path = Path(args.output)

    fields_cfg = load_fields(fields_path)

    template_path = Path(args.template) if args.template else None
    if args.use_template_anchors:
        if not template_path:
            raise ValueError("Provide --template when using --use-template-anchors.")
        anchor_page = (
            args.template_anchor_page
            if args.template_anchor_page is not None
            else int(fields_cfg.get("page", 0))
        )
        anchors = build_template_anchor_map(template_path, anchor_page)
        fields_cfg = apply_template_anchors(fields_cfg, anchors)
    if args.placeholder_mode and (args.csv_path or args.data_json):
        raise ValueError("Use either --placeholder-mode or --csv/--data-json, not both.")
    if args.csv_path and args.data_json:
        raise ValueError("Use either --csv or --data-json, not both.")
    if not args.placeholder_mode and not args.csv_path and not args.data_json:
        raise ValueError("Provide --csv, --data-json, or use --placeholder-mode.")

    # Auto-register fonts from fonts/ directory next to the fields file,
    # and also from the script's own fonts/ directory (covers temp-file paths).
    script_dir = Path(__file__).parent
    fonts_dirs = [fields_path.parent / "fonts", script_dir / "fonts"]
    registered_fonts: dict[str, str] = {}
    for fonts_dir in fonts_dirs:
        registered_fonts.update(register_fonts_from_directory(fonts_dir))
    if registered_fonts:
        print(f"\nRegistered {len(registered_fonts)} custom font(s)")

    if args.font_path:
        pdfmetrics.registerFont(TTFont("CustomFont", args.font_path))
        custom_font_registered = True
    else:
        custom_font_registered = False

    # Load field mappings and fixed values
    field_mappings = None
    if args.field_mappings:
        field_mappings = json.loads(Path(args.field_mappings).read_text(encoding="utf-8"))
    
    fixed_values = None
    if args.fixed_values:
        fixed_values = json.loads(Path(args.fixed_values).read_text(encoding="utf-8"))

    # Handle batch generation
    if args.batch:
        if not args.csv_path:
            raise ValueError("--batch requires --csv")
        
        csv_rows = load_all_csv_rows(Path(args.csv_path))
        output_dir = Path(args.output)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"Generating {len(csv_rows)} certificates...")
        pdf_files = []
        for idx, csv_row in enumerate(csv_rows):
            data = merge_csv_and_fixed_values(csv_row, field_mappings, fixed_values)
            output_file = output_dir / f"certificate_{idx + 1:04d}.pdf"
            generate_single_certificate(
                template_path=template_path,
                fields_cfg=fields_cfg,
                data=data,
                output_path=output_file,
                args=args,
                custom_font_registered=custom_font_registered,
            )
            pdf_files.append(output_file)
            print(f"  [{idx + 1}/{len(csv_rows)}] {output_file.name}")
        
        # Create ZIP file containing all certificates
        zip_path = output_dir.parent / f"{output_dir.name}.zip"
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for pdf_file in pdf_files:
                zipf.write(pdf_file, pdf_file.name)
        
        print(f"Done! Generated {len(csv_rows)} certificates in {output_dir}")
        print(f"Created ZIP archive: {zip_path}")
        return

    data = None
    if not args.placeholder_mode:
        if args.data_json:
            data = json.loads(Path(args.data_json).read_text(encoding="utf-8"))
        elif args.csv_path:
            csv_row = load_csv_row(Path(args.csv_path), args.row)
            data = merge_csv_and_fixed_values(csv_row, field_mappings, fixed_values)
        else:
            data = {}

    output_path = Path(args.output)
    generate_single_certificate(
        template_path=template_path,
        fields_cfg=fields_cfg,
        data=data,
        output_path=output_path,
        args=args,
        custom_font_registered=custom_font_registered,
    )
    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
