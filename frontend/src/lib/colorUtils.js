import { resolveFontTokenToCss } from './fontUtils';
import { plainTextToHtml, sanitizeHtml } from './htmlUtils';
import { createRangeFromOffset, getCaretOffset } from './caretUtils';

export function colorArrayToHex(color) {
  const [r, g, b] = Array.isArray(color) && color.length === 3 ? color : [0, 0, 0];
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(to255(r))}${toHex(to255(g))}${toHex(to255(b))}`;
}

export function hexToColorArray(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    return [0, 0, 0];
  }
  let r;
  let g;
  let b;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const toUnit = (v) => Math.max(0, Math.min(1, v / 255));
  return [toUnit(r), toUnit(g), toUnit(b)];
}

export function colorArrayToCss(color) {
  const [r, g, b] = Array.isArray(color) && color.length === 3 ? color : [0, 0, 0];
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

export { resolveFontTokenToCss, plainTextToHtml, sanitizeHtml, createRangeFromOffset, getCaretOffset };
