import argparse
import json
from pathlib import Path

import fitz


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract text coordinates from a PDF template using PyMuPDF."
    )
    parser.add_argument("--template", required=True, help="Path to template PDF.")
    parser.add_argument("--page", type=int, default=0, help="Zero-based page index.")
    parser.add_argument(
        "--contains",
        help="Filter spans containing this text (case-insensitive).",
    )
    parser.add_argument(
        "--min-len",
        type=int,
        default=1,
        help="Minimum text length to include.",
    )
    parser.add_argument(
        "--output-json",
        help="Optional JSON output path for extracted spans.",
    )
    parser.add_argument(
        "--annotate",
        help="Optional output PDF with boxes and labels drawn on top of the template.",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=0,
        help="Limit number of items (0 = no limit).",
    )
    return parser.parse_args()


def to_bottom_left_bbox(bbox: list[float], page_h: float) -> list[float]:
    x0, y0, x1, y1 = bbox
    return [x0, page_h - y1, x1, page_h - y0]


def to_bottom_left_point(x: float, y: float, page_h: float) -> list[float]:
    return [x, page_h - y]


def iter_spans(page: fitz.Page):
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                yield span


def main() -> None:
    args = parse_args()
    template_path = Path(args.template)

    doc = fitz.open(template_path)
    if args.page < 0 or args.page >= len(doc):
        raise IndexError(f"Page {args.page} out of range. PDF has {len(doc)} page(s).")

    page = doc[args.page]
    page_w = float(page.rect.width)
    page_h = float(page.rect.height)

    needle = args.contains.lower() if args.contains else None

    items: list[dict] = []
    for span in iter_spans(page):
        text = (span.get("text") or "").strip()
        if len(text) < args.min_len:
            continue
        if needle and needle not in text.lower():
            continue

        bbox_top_left = list(span.get("bbox", [0, 0, 0, 0]))
        origin = span.get("origin")

        items.append(
            {
                "text": text,
                "font": span.get("font"),
                "size": span.get("size"),
                "bbox_top_left": bbox_top_left,
                "bbox_bottom_left": to_bottom_left_bbox(bbox_top_left, page_h),
                "origin_top_left": list(origin) if origin else None,
                "origin_bottom_left": (
                    to_bottom_left_point(origin[0], origin[1], page_h) if origin else None
                ),
            }
        )

        if args.max_items and len(items) >= args.max_items:
            break

    print(f"Template: {template_path}")
    print(f"Page: {args.page}  Size: {page_w:.2f} x {page_h:.2f} points")
    print(f"Matches: {len(items)}")
    for idx, item in enumerate(items, start=1):
        bbox = item["bbox_bottom_left"]
        print(
            f"{idx:03d} | '{item['text']}' | font={item['font']} size={item['size']:.1f} | "
            f"bbox_bl=({bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f})"
        )

    if args.output_json:
        output_path = Path(args.output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "template": str(template_path),
            "page": args.page,
            "page_size_points": [page_w, page_h],
            "items": items,
        }
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote JSON: {output_path}")

    if args.annotate:
        annot_path = Path(args.annotate)
        annot_path.parent.mkdir(parents=True, exist_ok=True)
        for idx, item in enumerate(items, start=1):
            bbox = item["bbox_top_left"]
            rect = fitz.Rect(bbox)
            page.draw_rect(rect, color=(1, 0, 0), width=0.7)
            label = f"{idx:03d}"
            page.insert_text(
                rect.tl + fitz.Point(0, -2),
                label,
                fontsize=7,
                color=(1, 0, 0),
            )
        doc.save(annot_path)
        print(f"Wrote annotated PDF: {annot_path}")


if __name__ == "__main__":
    main()
