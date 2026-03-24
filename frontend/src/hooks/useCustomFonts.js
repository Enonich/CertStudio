import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { resolveFontTokenToCss } from '../lib/fontUtils';
import { REPORTLAB_BASE14_FONTS } from '../constants/editorConstants';

function escapeCssFamilyName(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Manages custom font state, @font-face injection, and font API operations.
 * @param {Function} setStatus - Status reporter from useStatus
 * @returns {{ customFonts, availableFontValues, fontPickerGroups, fetchCustomFonts, uploadFont, deleteFont }}
 */
export function useCustomFonts(setStatus) {
  const [customFonts, setCustomFonts] = useState([]);

  // Inject @font-face CSS rules whenever the custom fonts list changes.
  useEffect(() => {
    const styleId = 'custom-font-face-rules';
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }
    if (!customFonts.length) {
      return undefined;
    }

    const lines = customFonts.map((font) => {
      const family = escapeCssFamilyName(font.name);
      const file = encodeURIComponent(font.file);
      return `@font-face{font-family:"${family}";src:url("/api/font-file/${file}") format("truetype");font-display:swap;}`;
    });

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = lines.join('\n');
    document.head.appendChild(style);

    return () => {
      const node = document.getElementById(styleId);
      if (node) {
        node.remove();
      }
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
        console.error('Failed to fetch custom fonts');
        return;
      }
      const data = await response.json();
      setCustomFonts(data.custom_fonts || []);
    } catch (error) {
      console.error('Error fetching custom fonts:', error);
    }
  };

  const uploadFont = async (file) => {
    const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
    if (extension !== 'ttf') {
      setStatus('Only TrueType (.ttf) font files are supported. Please choose a .ttf file.', 'warning');
      return false;
    }

    const formData = new FormData();
    formData.append('font_file', file);

    try {
      const response = await apiFetch('/api/upload-font', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail = error?.detail || `Server responded with ${response.status}`;
        setStatus(`Could not add the font - ${detail}`);
        return false;
      }
      const data = await response.json();
      setStatus(`Font "${data.font_name}" added successfully!`);
      await fetchCustomFonts();
      return true;
    } catch (error) {
      setStatus('Could not add the font - please try again.');
      return false;
    }
  };

  const deleteFont = async (filename) => {
    try {
      const response = await apiFetch(`/api/delete-font/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail = error?.detail || `Server responded with ${response.status}`;
        setStatus(`Could not remove the font - ${detail}`);
        return false;
      }
      const data = await response.json();
      setStatus(data.message);
      await fetchCustomFonts();
      return true;
    } catch (error) {
      setStatus('Could not remove the font - please try again.');
      return false;
    }
  };

  return {
    customFonts,
    availableFontValues,
    fontPickerGroups,
    fetchCustomFonts,
    uploadFont,
    deleteFont,
  };
}
