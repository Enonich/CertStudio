import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export function clampBox(box, width, height) {
  const x = Math.max(0, Math.min(box.x, width - 1));
  const y = Math.max(0, Math.min(box.y, height - 1));
  const w = Math.max(8, Math.min(box.w, width - x));
  const h = Math.max(8, Math.min(box.h, height - y));
  return { ...box, x, y, w, h };
}

export function fitSizeForPreview(text, boxWidthPx, fontSizePx) {
  if (!text || !boxWidthPx || !fontSizePx) return fontSizePx;
  const widthEstimate = text.length * fontSizePx * 0.56;
  if (widthEstimate <= boxWidthPx) return fontSizePx;
  return Math.max(8, (boxWidthPx / widthEstimate) * fontSizePx);
}

export function uniqueFieldName(baseName, fields, excludeId = null) {
  const normalized = String(baseName ?? '').trim() || 'field';
  const existing = new Set(
    fields
      .filter((field) => field.id !== excludeId)
      .map((field) => String(field.name ?? '').trim())
  );
  if (!existing.has(normalized)) return normalized;

  let index = 2;
  while (existing.has(`${normalized}_${index}`)) {
    index += 1;
  }
  return `${normalized}_${index}`;
}

export function formatErrorDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object') {
    const parts = [];
    if (detail.message) parts.push(detail.message);
    if (detail.stderr) {
      const stderr = String(detail.stderr).trim();
      if (stderr) parts.push(`stderr: ${stderr}`);
    }
    if (detail.stdout) {
      const stdout = String(detail.stdout).trim();
      if (stdout) parts.push(`stdout: ${stdout}`);
    }
    if (parts.length > 0) return parts.join(' | ');
    try { return JSON.stringify(detail); } catch { return String(detail); }
  }
  return String(detail);
}

export function getFilenameFromContentDisposition(contentDisposition, fallbackName) {
  if (!contentDisposition) return fallbackName;
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)/i);
  if (!match?.[1]) return fallbackName;
  const raw = match[1].trim().replace(/"$/, '');
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl, fallbackName = 'template.bin', fallbackMimeType = 'application/octet-stream') {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) throw new Error('Invalid embedded template data.');

  const mimeType = match[1] || fallbackMimeType;
  const payload = decodeURIComponent(match[2] || '');
  const byteString = atob(payload);
  const bytes = new Uint8Array(byteString.length);
  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new File([bytes], fallbackName, { type: mimeType });
}

export async function loadTemplate(file, preset) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const pointsViewport = page.getViewport({ scale: 1.0 });
    const renderScale = 1.5;
    const renderViewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    return {
      src: canvas.toDataURL('image/png'),
      displayWidth: canvas.width,
      displayHeight: canvas.height,
      pageWidthPt: pointsViewport.width,
      pageHeightPt: pointsViewport.height,
      name: file.name,
    };
  }

  const imageUrl = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageUrl;
  });

  return {
    src: imageUrl,
    displayWidth: image.naturalWidth,
    displayHeight: image.naturalHeight,
    pageWidthPt: preset.width,
    pageHeightPt: preset.height,
    name: file.name,
  };
}
