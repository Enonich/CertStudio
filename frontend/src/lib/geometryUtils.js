export function clampBox(box, width, height) {
  const x = Math.max(0, Math.min(box.x, width - 1));
  const y = Math.max(0, Math.min(box.y, height - 1));
  const w = Math.max(8, Math.min(box.w, width - x));
  const h = Math.max(8, Math.min(box.h, height - y));
  return { ...box, x, y, w, h };
}

export function fitSizeForPreview(text, boxWidthPx, fontSizePx) {
  if (!text || !boxWidthPx || !fontSizePx) {
    return fontSizePx;
  }
  const widthEstimate = text.length * fontSizePx * 0.56;
  if (widthEstimate <= boxWidthPx) {
    return fontSizePx;
  }
  return Math.max(8, (boxWidthPx / widthEstimate) * fontSizePx);
}

/**
 * Strip characters that could break CSV mapping, JSON keys, or downstream templates.
 * Allows letters, digits, spaces, hyphens, underscores, and periods.
 */
export function sanitizeFieldName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[^\w\s.\-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export function uniqueFieldName(baseName, fields, excludeId = null) {
  const normalized = String(baseName ?? '').trim() || 'field';
  const existing = new Set(
    fields
      .filter((field) => field.id !== excludeId)
      .map((field) => String(field.name ?? '').trim())
  );
  if (!existing.has(normalized)) {
    return normalized;
  }

  let index = 2;
  while (existing.has(`${normalized}_${index}`)) {
    index += 1;
  }
  return `${normalized}_${index}`;
}
