import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { REPORTLAB_BASE14_FONTS } from '../constants/editorConstants';

function escapeCssFamilyName(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Manages platform font state, @font-face injection, and the font request API.
 * @param {Function} setStatus - Status reporter from useStatus
 * @returns {{ customFonts, availableFontValues, fontPickerGroups, fetchCustomFonts, requestFont }}
 */
export function useCustomFonts(setStatus) {
  const [customFonts, setCustomFonts] = useState([]);

  // Inject @font-face CSS rules whenever the platform fonts list changes.
  // Fonts are fetched as blobs with auth headers so the browser can load them
  // even when the /api/font-file/ endpoint requires authentication.
  useEffect(() => {
    const styleId = 'custom-font-face-rules';
    let cancelled = false;
    const blobUrls = [];

    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }
    if (!customFonts.length) {
      return undefined;
    }

    (async () => {
      const lines = await Promise.all(
        customFonts.map(async (font) => {
          const family = escapeCssFamilyName(font.name);
          const file = encodeURIComponent(font.file);
          try {
            const res = await apiFetch(`/api/font-file/${file}`);
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              blobUrls.push(url);
              return `@font-face{font-family:"${family}";src:url("${url}") format("truetype");font-display:swap;}`;
            }
          } catch { /* fall through to plain URL */ }
          // Fallback: use plain URL (works when auth is not required)
          return `@font-face{font-family:"${family}";src:url("/api/font-file/${file}") format("truetype");font-display:swap;}`;
        })
      );

      if (cancelled) {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = lines.join('\n');
      document.head.appendChild(style);
    })();

    return () => {
      cancelled = true;
      const node = document.getElementById(styleId);
      if (node) {
        node.remove();
      }
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [customFonts]);

  const availableFontValues = useMemo(
    () => new Set([
      ...REPORTLAB_BASE14_FONTS.map((f) => f.value),
      ...customFonts.map((f) => f.name),
    ]),
    [customFonts]
  );

  const fontPickerGroups = useMemo(() => ({
    builtIn: REPORTLAB_BASE14_FONTS,
    custom: customFonts.filter(
      (font) => !REPORTLAB_BASE14_FONTS.some((f) => f.value === font.name)
    ),
  }), [customFonts]);

  const fetchCustomFonts = async () => {
    try {
      const response = await apiFetch('/api/list-custom-fonts');
      if (!response.ok) {
        console.error('Failed to fetch platform fonts');
        return;
      }
      const data = await response.json();
      setCustomFonts(data.custom_fonts || []);
    } catch (error) {
      console.error('Error fetching platform fonts:', error);
    }
  };

  const requestFont = async (fontName) => {
    const name = String(fontName ?? '').trim();
    if (!name) return false;
    try {
      const response = await apiFetch('/api/request-font', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font_name: name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || `Server responded with ${response.status}`;
        setStatus(`Could not submit request — ${detail}`);
        return false;
      }
      setStatus(data.message || `Request for "${name}" submitted!`);
      return true;
    } catch (error) {
      setStatus('Could not submit the request — please try again.');
      return false;
    }
  };

  return { customFonts, availableFontValues, fontPickerGroups, fetchCustomFonts, requestFont };
}
