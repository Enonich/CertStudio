import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PAGE_PRESETS = {
  letter: { label: 'Letter (612 x 792)', width: 612, height: 792 },
  a4: { label: 'A4 (595.28 x 841.89)', width: 595.2756, height: 841.8898 },
  legal: { label: 'Legal (612 x 1008)', width: 612, height: 1008 },
  custom: { label: 'Custom', width: 612, height: 792 },
};

function colorArrayToHex(color) {
  const [r, g, b] = Array.isArray(color) && color.length === 3 ? color : [0, 0, 0];
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(to255(r))}${toHex(to255(g))}${toHex(to255(b))}`;
}

function hexToColorArray(hex) {
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

function colorArrayToCss(color) {
  const [r, g, b] = Array.isArray(color) && color.length === 3 ? color : [0, 0, 0];
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');

  template.content
    .querySelectorAll('script,style,iframe,object,embed,link,meta')
    .forEach((node) => node.remove());

  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name;
      const value = attr.value;
      if (/^on/i.test(name)) {
        el.removeAttribute(name);
        return;
      }
      if ((name === 'href' || name === 'src') && typeof value === 'string' && value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(name);
      }
    });
  });

  return template.innerHTML;
}

function escapeCssString(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

// ReportLab Base-14 fonts (always available without custom registration)
const REPORTLAB_BASE14_FONTS = [
  { value: 'Helvetica', label: 'Helvetica (Sans-serif)' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Helvetica-Oblique', label: 'Helvetica Oblique' },
  { value: 'Helvetica-BoldOblique', label: 'Helvetica Bold Oblique' },
  { value: 'Times-Roman', label: 'Times Roman (Serif)' },
  { value: 'Times-Bold', label: 'Times Bold' },
  { value: 'Times-Italic', label: 'Times Italic' },
  { value: 'Times-BoldItalic', label: 'Times Bold Italic' },
  { value: 'Courier', label: 'Courier (Monospace)' },
  { value: 'Courier-Bold', label: 'Courier Bold' },
  { value: 'Courier-Oblique', label: 'Courier Oblique' },
  { value: 'Courier-BoldOblique', label: 'Courier Bold Oblique' },
  { value: 'Symbol', label: 'Symbol' },
  { value: 'ZapfDingbats', label: 'Zapf Dingbats' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clampBox(box, width, height) {
  const x = Math.max(0, Math.min(box.x, width - 1));
  const y = Math.max(0, Math.min(box.y, height - 1));
  const w = Math.max(8, Math.min(box.w, width - x));
  const h = Math.max(8, Math.min(box.h, height - y));
  return { ...box, x, y, w, h };
}

function fitSizeForPreview(text, boxWidthPx, fontSizePx) {
  if (!text || !boxWidthPx || !fontSizePx) {
    return fontSizePx;
  }
  const widthEstimate = text.length * fontSizePx * 0.56;
  if (widthEstimate <= boxWidthPx) {
    return fontSizePx;
  }
  return Math.max(8, (boxWidthPx / widthEstimate) * fontSizePx);
}

function uniqueFieldName(baseName, fields, excludeId = null) {
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

function formatErrorDetail(detail) {
  if (!detail) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (typeof detail === 'object') {
    const parts = [];
    if (detail.message) {
      parts.push(detail.message);
    }
    if (detail.stderr) {
      const stderr = String(detail.stderr).trim();
      if (stderr) {
        parts.push(`stderr: ${stderr}`);
      }
    }
    if (detail.stdout) {
      const stdout = String(detail.stdout).trim();
      if (stdout) {
        parts.push(`stdout: ${stdout}`);
      }
    }
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

function getFilenameFromContentDisposition(contentDisposition, fallbackName) {
  if (!contentDisposition) {
    return fallbackName;
  }
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)/i);
  if (!match?.[1]) {
    return fallbackName;
  }
  const raw = match[1].trim().replace(/"$/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function loadTemplate(file, preset) {
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

  const imageUrl = URL.createObjectURL(file);
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

export default function App() {
  const layerRef = useRef(null);
  const [theme, setTheme] = useState('dark');
  const [zoom, setZoom] = useState(1);
  const [templateFile, setTemplateFile] = useState(null);
  const [customFonts, setCustomFonts] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvFirstRow, setCsvFirstRow] = useState({});
  const [fieldMappings, setFieldMappings] = useState({});
  const [useCsv, setUseCsv] = useState(false);
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldsName, setSelectedFieldsName] = useState('');
  const [saveFieldsName, setSaveFieldsName] = useState('fields.json');
  const [template, setTemplate] = useState(null);
  const [panelState, setPanelState] = useState({
    fieldLayouts: true,
    dataSource: true,
    fontManager: true,
    generate: true,
    fields: true,
    selectedField: true,
    preview: true,
  });
  const [preset, setPreset] = useState('letter');
  const [customSize, setCustomSize] = useState({ width: 612, height: 792 });
  const [fields, setFields] = useState([]);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftBox, setDraftBox] = useState(null);
  const [sampleValues, setSampleValues] = useState({});
  const [sampleHtmlValues, setSampleHtmlValues] = useState({});
  const [isEditingText, setIsEditingText] = useState(false);
  const editingDraftRef = useRef({ name: null, html: '', text: '' });
  const lastSelectionRangeRef = useRef(null);
  const [interaction, setInteraction] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [status, setStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latestDownload, setLatestDownload] = useState(null);
  const [layoutsMenuOpen, setLayoutsMenuOpen] = useState(false);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [generateOptions, setGenerateOptions] = useState({
    row: 0,
    output_mode: 'full_pdf',
    dx: 0,
    dy: 0,
    grid_step: 0,
    page_size: 'letter',
    generate_all: false,
  });

  const pageSize = useMemo(() => {
    if (preset === 'custom') {
      return {
        width: Number(customSize.width) || 612,
        height: Number(customSize.height) || 792,
      };
    }
    return {
      width: PAGE_PRESETS[preset].width,
      height: PAGE_PRESETS[preset].height,
    };
  }, [preset, customSize]);

  const activeField = fields.find((field) => field.id === activeFieldId) ?? null;
  const availableFontValues = useMemo(
    () => new Set([
      ...REPORTLAB_BASE14_FONTS.map((f) => f.value),
      ...customFonts.map((f) => f.name),
    ]),
    [customFonts]
  );

  useEffect(() => {
    if (!isEditingText || !activeField?.name) {
      editingDraftRef.current = { name: null, html: '', text: '' };
      lastSelectionRangeRef.current = null;
      return;
    }

    const name = activeField.name;
    const text = sampleValues[name] ?? `{${name}}`;
    const html = sampleHtmlValues[name] ?? plainTextToHtml(text);
    editingDraftRef.current = { name, html, text };
    lastSelectionRangeRef.current = null;
  }, [isEditingText, activeFieldId]);

  useEffect(() => {
    if (!isEditingText || !activeField?.id) {
      return;
    }

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
      if (!editorEl) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (range && !range.collapsed && editorEl.contains(range.startContainer) && editorEl.contains(range.endContainer)) {
        lastSelectionRangeRef.current = range.cloneRange();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isEditingText, activeFieldId]);

  const parseCsvHeaders = async (file) => {
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      return;
    }
    try {
      const text = await file.text();
      const lines = text.split('\n');
      if (lines.length === 0) {
        setCsvHeaders([]);
        setCsvFirstRow({});
        return;
      }
      const headerLine = lines[0].trim();
      const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setCsvHeaders(headers);
      
      // Parse first data row
      if (lines.length > 1) {
        const firstDataLine = lines[1].trim();
        if (firstDataLine) {
          const values = firstDataLine.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const firstRow = {};
          headers.forEach((header, idx) => {
            firstRow[header] = values[idx] || '';
          });
          setCsvFirstRow(firstRow);
        }
      }
    } catch (error) {
      setStatus(`Failed to parse CSV: ${error.message}`);
      setCsvHeaders([]);
      setCsvFirstRow({});
    }
  };

  const handleCsvFileChange = async (event) => {
    const file = event.target.files?.[0] ?? null;
    setCsvFile(file);
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      setFieldMappings({});
    } else {
      await parseCsvHeaders(file);
    }
  };

  const updateFieldMapping = (fieldName, csvColumn) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldName]: csvColumn
    }));
    
    // Update sample value from CSV first row if mapped
    if (csvColumn && csvFirstRow[csvColumn]) {
      setSampleValues(prev => ({
        ...prev,
        [fieldName]: csvFirstRow[csvColumn]
      }));

      setSampleHtmlValues((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, fieldName)) {
          return prev;
        }
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const togglePanel = (key) => {
    setPanelState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const stopPanelToggle = (event) => {
    event.stopPropagation();
  };

  const refreshFieldsList = async () => {
    try {
      const response = await fetch('/api/fields/list');
      if (!response.ok) {
        setStatus('Failed to load fields list.');
        return;
      }
      const data = await response.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      setFieldsList(files);
      if (selectedFieldsName && !files.includes(selectedFieldsName)) {
        setSelectedFieldsName('');
      }
      if (files.length > 0 && (!saveFieldsName || !saveFieldsName.trim())) {
        setSaveFieldsName(files[0]);
      }
    } catch (error) {
      setStatus(`Failed to load fields list: ${error}`);
    }
  };

  useEffect(() => {
    refreshFieldsList();
    fetchCustomFonts();
  }, []);

  useEffect(() => {
    const styleId = 'custom-font-face-rules';
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }
    if (!customFonts.length) {
      return;
    }

    const lines = customFonts.map((font) => {
      const family = escapeCssString(font.name);
      const file = encodeURIComponent(font.file);
      const format = font.type === 'otf' ? 'opentype' : 'truetype';
      return `@font-face{font-family:"${family}";src:url("/api/font-file/${file}") format("${format}");font-display:swap;}`;
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

  const fetchCustomFonts = async () => {
    try {
      const response = await fetch('/api/list-custom-fonts');
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
    const formData = new FormData();
    formData.append('font_file', file);

    try {
      const response = await fetch('/api/upload-font', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        setStatus(`Failed to upload font: ${error.detail || 'Unknown error'}`);
        return false;
      }

      const data = await response.json();
      setStatus(`Font "${data.font_name}" uploaded successfully!`);
      await fetchCustomFonts();
      return true;
    } catch (error) {
      setStatus(`Error uploading font: ${error.message}`);
      return false;
    }
  };

  const deleteFont = async (filename) => {
    if (!confirm(`Delete font "${filename}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/delete-font/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        setStatus(`Failed to delete font: ${error.detail || 'Unknown error'}`);
        return false;
      }

      const data = await response.json();
      setStatus(data.message);
      await fetchCustomFonts();
      return true;
    } catch (error) {
      setStatus(`Error deleting font: ${error.message}`);
      return false;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedButton = event.target.closest('.menu-button');
      const clickedDropdown = event.target.closest('.dropdown-menu');
      
      if (layoutsMenuOpen && !clickedButton?.textContent?.includes('Layouts') && !clickedDropdown) {
        setLayoutsMenuOpen(false);
      }
      if (generateMenuOpen && !clickedButton?.textContent?.includes('Generate') && !clickedDropdown) {
        setGenerateMenuOpen(false);
      }
      if (fontMenuOpen && !clickedButton?.textContent?.includes('Fonts') && !clickedDropdown) {
        setFontMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [layoutsMenuOpen, generateMenuOpen, fontMenuOpen]);

  useEffect(() => {
    const classList = document.documentElement.classList;
    if (theme === 'dark') {
      classList.add('theme-dark');
    } else {
      classList.remove('theme-dark');
    }
  }, [theme]);

  const scales = useMemo(() => {
    if (!template) {
      return null;
    }
    return {
      x: template.pageWidthPt / template.displayWidth,
      y: template.pageHeightPt / template.displayHeight,
    };
  }, [template]);

  const buildPayload = () => {
    if (!template || !scales) {
      return null;
    }

    return {
      page: 0,
      default_font: 'Helvetica',
      default_size: 18,
      fields: fields.map((field) => {
        const leftPt = field.x * scales.x;
        const rightPt = (field.x + field.w) * scales.x;
        const topPt = (template.displayHeight - field.y) * scales.y;
        const maxWidthPt = field.w * scales.x;
        const fieldSizePt = Number(field.size);
        const baselineY = topPt - fieldSizePt;

        // Build font name with bold/italic variants
        let fontName = field.font || 'Helvetica';
        if (field.bold || field.italic) {
          // Map base font to appropriate variant
          const baseFont = fontName.replace(/-Bold|-Italic|-Oblique|-BoldOblique|-BoldItalic/g, '');
          if (baseFont === 'Helvetica') {
            fontName = field.bold && field.italic ? 'Helvetica-BoldOblique' :
                       field.bold ? 'Helvetica-Bold' :
                       field.italic ? 'Helvetica-Oblique' : 'Helvetica';
          } else if (baseFont === 'Times' || baseFont === 'Times-Roman') {
            fontName = field.bold && field.italic ? 'Times-BoldItalic' :
                       field.bold ? 'Times-Bold' :
                       field.italic ? 'Times-Italic' : 'Times-Roman';
          } else if (baseFont === 'Courier') {
            fontName = field.bold && field.italic ? 'Courier-BoldOblique' :
                       field.bold ? 'Courier-Bold' :
                       field.italic ? 'Courier-Oblique' : 'Courier';
          }
        }

        // Keep the original field name (don't replace with CSV mapping)
        const mapped = {
          name: field.name,
          x: field.align === 'center' ? (leftPt + rightPt) / 2 : field.align === 'right' ? rightPt : leftPt,
          y: baselineY,
          font: fontName,
          size: fieldSizePt,
          align: field.align,
          color: field.color,
        };

        if (field.maxWidth) {
          mapped.max_width = maxWidthPt;
        }

        // Always send box geometry so Python can do multi-line rendering
        // (needed for both explicit \n newlines and word-wrap).
        mapped.wrap_start_y = topPt;
        mapped.box_width = maxWidthPt;
        mapped.box_height = field.h * scales.y;

        if (field.wrapText) {
          mapped.wrap_text = true;
          // wrap_width is separate from max_width so that fit_font_size in Python
          // is not triggered by the wrap setting alone.
          mapped.wrap_width = maxWidthPt;
        }

        return mapped;
      }),
    };
  };

  const getFieldValuePayload = (fieldName) => {
    if (isEditingText && editingDraftRef.current.name === fieldName) {
      const draftText = editingDraftRef.current.text ?? '';
      const draftHtml = sanitizeHtml(editingDraftRef.current.html ?? plainTextToHtml(draftText));
      return { text: draftText, html: draftHtml };
    }
    const text = sampleValues[fieldName] ?? '';
    const html = sanitizeHtml(sampleHtmlValues[fieldName] ?? plainTextToHtml(text));
    return { text, html };
  };

  const buildDataPayload = () => {
    const payload = {};
    fields.forEach((field) => {
      if (!field.name) {
        return;
      }
      payload[field.name] = getFieldValuePayload(field.name);
    });
    return payload;
  };

  const payloadToBoxes = (payload) => {
    if (!template || !scales || !payload || !Array.isArray(payload.fields)) {
      return [];
    }

    return payload.fields.map((field, idx) => {
      const align = field.align ?? 'left';
      const widthPt = Number(field.box_width ?? field.max_width ?? 150);
      const widthPx = widthPt / scales.x;
      const sizePt = Number(field.size ?? payload.default_size ?? 18);
      const estimatedHeightPt = Math.max(
        24,
        ((sizePt * 1.6) / template.pageHeightPt) * template.displayHeight * scales.y
      );
      const heightPt = Number(field.box_height ?? estimatedHeightPt);
      const heightPx = Math.max(8, heightPt / scales.y);
      const anchorX = Number(field.x) / scales.x;
      const wrapTopPt = Number(field.wrap_start_y);
      const legacyY = Number(field.y);
      const topPt = Number.isFinite(wrapTopPt)
        ? wrapTopPt
        : Number.isFinite(legacyY)
          ? legacyY + sizePt
          : template.pageHeightPt;

      let leftX = anchorX;
      if (align === 'center') {
        leftX = anchorX - widthPx / 2;
      } else if (align === 'right') {
        leftX = anchorX - widthPx;
      }

      const y = template.displayHeight - (topPt / scales.y);

      // Extract bold/italic from font name
      const fontName = field.font ?? payload.default_font ?? 'Helvetica';
      let baseFont = fontName;
      let bold = false;
      let italic = false;

      if (fontName.includes('Bold')) {
        bold = true;
      }
      if (fontName.includes('Oblique') || fontName.includes('Italic')) {
        italic = true;
      }

      // Get base font family
      if (fontName.startsWith('Helvetica')) {
        baseFont = 'Helvetica';
      } else if (fontName.startsWith('Times')) {
        baseFont = 'Times-Roman';
      } else if (fontName.startsWith('Courier')) {
        baseFont = 'Courier';
      }
      const resolvedFont = availableFontValues.has(baseFont)
        ? baseFont
        : availableFontValues.has(fontName)
          ? fontName
          : 'Helvetica';

      return clampBox(
        {
          id: uid(),
          name: field.name ?? `field_${idx + 1}`,
          x: leftX,
          y,
          w: widthPx,
          h: heightPx,
          align,
          font: resolvedFont,
          size: sizePt,
          color: Array.isArray(field.color) ? field.color : [0, 0, 0],
          maxWidth: field.max_width !== undefined,
          // Default to wrapped text for backward compatibility with older
          // layouts that do not have wrap_text persisted yet.
          wrapText: field.wrap_text !== false,
          bold,
          italic,
        },
        template.displayWidth,
        template.displayHeight
      );
    });
  };

  const loadFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }

    const loaded = await loadTemplate(file, pageSize);
    setTemplate(loaded);
    setTemplateFile(file);
    setFields([]);
    setActiveFieldId(null);
    setSampleValues({});
    setSampleHtmlValues({});
    setStatus(`Loaded template: ${loaded.name}`);

    // Extract fonts from PDF template
    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const formData = new FormData();
        formData.append('template', file);
        const response = await fetch('/api/extract-fonts', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          setStatus(`Loaded template: ${loaded.name} (${data.fonts?.length || 0} fonts detected)`);
        }
      } catch (error) {
        console.error('Failed to extract fonts:', error);
      }
    }
  };

  const getPointFromEvent = (event) => {
    const rect = layerRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };

  const beginDraw = (event) => {
    if (!template || interaction) {
      return;
    }
    
    // Check if click is on a field box - if not, deselect active field
    const isFieldBox = event.target.closest('.field-box');
    if (!isFieldBox) {
      setActiveFieldId(null);
    }
    
    const point = getPointFromEvent(event);
    setIsDrawing(true);
    setDraftBox({
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      w: 1,
      h: 1,
    });
  };

  const beginMove = (event, fieldId) => {
    event.preventDefault();
    event.stopPropagation();
    
    const point = getPointFromEvent(event);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }
    setActiveFieldId(fieldId);
    setIsEditingText(false);
    setInteraction({ mode: 'move', fieldId, startX: point.x, startY: point.y, initial: field });
  };

  const beginResize = (event, fieldId, direction) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getPointFromEvent(event);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }
    setActiveFieldId(fieldId);
    setInteraction({ mode: 'resize', fieldId, startX: point.x, startY: point.y, initial: field, direction });
  };

  const getActiveEditorEl = () =>
    document.querySelector('.field-box.active .field-preview');

  const selectionInsideEditor = (editorEl, selection) => {
    if (!editorEl || !selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return editorEl.contains(range.startContainer) && editorEl.contains(range.endContainer);
  };

  const applyFormatting = (command, value = null) => {
    const editorEl = getActiveEditorEl();
    if (!editorEl || !activeField?.name) {
      return false;
    }
    if (!editorEl.isContentEditable) {
      return false;
    }

    // Check live selection BEFORE calling focus (focus can collapse it).
    const selectionBefore = window.getSelection();
    const hasLiveSelection =
      !!selectionBefore &&
      !selectionBefore.isCollapsed &&
      selectionInsideEditor(editorEl, selectionBefore);
    const hasSavedSelection = !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);

    if (!hasLiveSelection && !hasSavedSelection) {
      return false;
    }

    // Only call focus when we need to restore a saved selection (no live selection).
    if (!hasLiveSelection && hasSavedSelection) {
      editorEl.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        try {
          sel.addRange(lastSelectionRangeRef.current);
        } catch (error) {
          return false;
        }
      }
    }

    const selectionAfterRestore = window.getSelection();
    if (
      !selectionAfterRestore ||
      selectionAfterRestore.isCollapsed ||
      !selectionInsideEditor(editorEl, selectionAfterRestore)
    ) {
      return false;
    }

    document.execCommand(command, false, value);

    editingDraftRef.current = {
      name: activeField.name,
      html: editorEl.innerHTML,
      text: editorEl.innerText,
    };

    return true;
  };

  const applyWholeFieldStyle = (fieldPatch) => {
    if (!activeField) {
      return;
    }
    updateField(activeField.id, fieldPatch);

    // Whole-field style should not be overridden by previously saved rich inline spans.
    setSampleHtmlValues((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, activeField.name)) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeField.name];
      return next;
    });

    if (editingDraftRef.current.name === activeField.name) {
      const nextText = editingDraftRef.current.text ?? '';
      editingDraftRef.current = {
        name: activeField.name,
        text: nextText,
        html: plainTextToHtml(nextText),
      };
      const editorEl = getActiveEditorEl();
      if (editorEl && editorEl.isContentEditable) {
        editorEl.innerHTML = editingDraftRef.current.html;
      }
    }
  };

  const handleInlineStyleClick = (command, fieldPatchKey) => {
    if (!activeField) {
      return;
    }

    const editorEl = getActiveEditorEl();
    const inEditorContext = !!editorEl && (isEditingText || editorEl.isContentEditable);
    if (inEditorContext) {
      const didApply = applyFormatting(command);
      if (!didApply) {
        applyWholeFieldStyle({ [fieldPatchKey]: !activeField[fieldPatchKey] });
      }
      return;
    }

    applyWholeFieldStyle({ [fieldPatchKey]: !activeField[fieldPatchKey] });
  };

  const applyInlineCommandOrFieldUpdate = ({
    command,
    value = null,
    fieldPatch,
    requireSelection = false,
    selectionMessage = null,
  }) => {
    if (!activeField) {
      return;
    }

    const editorEl = getActiveEditorEl();
    const inEditorContext = !!editorEl && (isEditingText || editorEl.isContentEditable);

    if (inEditorContext) {
      const selection = window.getSelection();
      const hasSelection =
        !!selection &&
        !selection.isCollapsed &&
        selectionInsideEditor(editorEl, selection);
      const hasSavedSelection = !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);

      if (hasSelection || hasSavedSelection || !requireSelection) {
        const didApply = applyFormatting(command, value);
        if (didApply) {
          return;
        }
      }

      applyWholeFieldStyle(fieldPatch);
      return;
    }

    applyWholeFieldStyle(fieldPatch);
  };

  const moveDraw = (event) => {
    if (!template) {
      return;
    }

    if (interaction) {
      const point = getPointFromEvent(event);
      const dx = point.x - interaction.startX;
      const dy = point.y - interaction.startY;
      if (interaction.mode === 'move') {
        const newX = interaction.initial.x + dx;
        const newY = interaction.initial.y + dy;
        
        updateField(interaction.fieldId, {
          x: newX,
          y: newY,
        });
        
        // Calculate alignment guides
        const guides = [];
        const threshold = 5; // pixels
        const movingField = fields.find(f => f.id === interaction.fieldId);
        
        if (movingField) {
          const movingCenterX = newX + movingField.w / 2;
          const movingCenterY = newY + movingField.h / 2;
          const movingLeft = newX;
          const movingRight = newX + movingField.w;
          const movingTop = newY;
          const movingBottom = newY + movingField.h;
          
          fields.forEach(field => {
            if (field.id === interaction.fieldId) return;
            
            const centerX = field.x + field.w / 2;
            const centerY = field.y + field.h / 2;
            const left = field.x;
            const right = field.x + field.w;
            const top = field.y;
            const bottom = field.y + field.h;
            
            // Vertical alignment guides
            if (Math.abs(movingLeft - left) < threshold) {
              guides.push({ type: 'vertical', x: left });
            }
            if (Math.abs(movingRight - right) < threshold) {
              guides.push({ type: 'vertical', x: right });
            }
            if (Math.abs(movingCenterX - centerX) < threshold) {
              guides.push({ type: 'vertical', x: centerX });
            }
            
            // Horizontal alignment guides
            if (Math.abs(movingTop - top) < threshold) {
              guides.push({ type: 'horizontal', y: top });
            }
            if (Math.abs(movingBottom - bottom) < threshold) {
              guides.push({ type: 'horizontal', y: bottom });
            }
            if (Math.abs(movingCenterY - centerY) < threshold) {
              guides.push({ type: 'horizontal', y: centerY });
            }
          });
        }
        
        setAlignmentGuides(guides);
      } else if (interaction.mode === 'resize') {
        const dir = interaction.direction;
        const newBox = { ...interaction.initial };
        
        // Handle horizontal resizing
        if (dir.includes('e')) {
          // Resize from right edge
          newBox.w = interaction.initial.w + dx;
        } else if (dir.includes('w')) {
          // Resize from left edge
          newBox.x = interaction.initial.x + dx;
          newBox.w = interaction.initial.w - dx;
        }
        
        // Handle vertical resizing
        if (dir.includes('s')) {
          // Resize from bottom edge
          newBox.h = interaction.initial.h + dy;
        } else if (dir.includes('n')) {
          // Resize from top edge
          newBox.y = interaction.initial.y + dy;
          newBox.h = interaction.initial.h - dy;
        }

        if (newBox.w < 0) {
          newBox.x += newBox.w;
          newBox.w = Math.abs(newBox.w);
        }
        if (newBox.h < 0) {
          newBox.y += newBox.h;
          newBox.h = Math.abs(newBox.h);
        }
        
        updateField(interaction.fieldId, newBox);
      }
      return;
    }

    if (!isDrawing || !draftBox) {
      return;
    }
    const point = getPointFromEvent(event);
    const x = Math.min(draftBox.startX, point.x);
    const y = Math.min(draftBox.startY, point.y);
    const w = Math.abs(point.x - draftBox.startX);
    const h = Math.abs(point.y - draftBox.startY);
    setDraftBox({ ...draftBox, x, y, w, h });
  };

  const endDraw = () => {
    if (interaction) {
      setInteraction(null);
      setAlignmentGuides([]);
      return;
    }

    if (!template || !draftBox) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);

    if (draftBox.w < 8 || draftBox.h < 8) {
      setDraftBox(null);
      return;
    }

    const newField = {
      id: uid(),
      name: uniqueFieldName(`field_${fields.length + 1}`, fields),
      x: draftBox.x,
      y: draftBox.y,
      w: draftBox.w,
      h: draftBox.h,
      align: 'left',
      font: 'Helvetica',
      size: 18,
      color: [0, 0, 0],
      maxWidth: false,
      wrapText: true,
      bold: false,
      italic: false,
    };

    setFields((prev) => [...prev, clampBox(newField, template.displayWidth, template.displayHeight)]);
    setActiveFieldId(newField.id);
    setDraftBox(null);
  };

  const updateField = (id, patch) => {
    if (!template) {
      return;
    }
    
    // If field name is being changed, update dependent maps and enforce uniqueness.
    if (patch.name !== undefined) {
      const oldField = fields.find(f => f.id === id);
      if (oldField) {
        patch = { ...patch, name: uniqueFieldName(patch.name, fields, id) };
      }
      if (oldField && oldField.name !== patch.name && fieldMappings[oldField.name]) {
        setFieldMappings(prev => {
          const newMappings = { ...prev };
          newMappings[patch.name] = newMappings[oldField.name];
          delete newMappings[oldField.name];
          return newMappings;
        });
      }
      if (oldField && oldField.name !== patch.name) {
        setSampleValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) {
            return prev;
          }
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) {
            next[patch.name] = next[oldField.name];
          }
          delete next[oldField.name];
          return next;
        });
        setSampleHtmlValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) {
            return prev;
          }
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) {
            next[patch.name] = next[oldField.name];
          }
          delete next[oldField.name];
          return next;
        });
      }
    }
    
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== id) {
          return field;
        }
        return clampBox({ ...field, ...patch }, template.displayWidth, template.displayHeight);
      })
    );
  };

  const deleteField = (id) => {
    const fieldToDelete = fields.find(f => f.id === id);
    setFields((prev) => prev.filter((field) => field.id !== id));
    if (activeFieldId === id) {
      setActiveFieldId(null);
    }
    // Clean up field mapping when field is deleted
    if (fieldToDelete && fieldMappings[fieldToDelete.name]) {
      setFieldMappings(prev => {
        const newMappings = { ...prev };
        delete newMappings[fieldToDelete.name];
        return newMappings;
      });
    }
  };

  const exportJson = () => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fields.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToBackend = async () => {
    const payload = buildPayload();
    if (!payload) {
      setStatus('Load a template and create fields first.');
      return;
    }

    const targetName = saveFieldsName?.trim() || 'fields.json';

    const response = await fetch(`/api/fields?name=${encodeURIComponent(targetName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setStatus(`Failed to save ${targetName} to backend.`);
      return;
    }
    setStatus(`Saved ${targetName} on backend.`);
    refreshFieldsList();
  };

  const loadFromBackend = async () => {
    if (!template) {
      setStatus('Load template first so coordinates can be mapped to canvas.');
      return;
    }

    const targetName = selectedFieldsName?.trim() || 'fields.json';
    if (!selectedFieldsName?.trim()) {
      setStatus('Select a backend fields file first.');
      return;
    }

    const response = await fetch(`/api/fields?name=${encodeURIComponent(targetName)}`);
    if (!response.ok) {
      setStatus(`Failed to load backend ${targetName}.`);
      return;
    }
    const payload = await response.json();
    const next = payloadToBoxes(payload);
    setFields(next);
    setActiveFieldId(next[0]?.id ?? null);
    setStatus(`Loaded ${targetName} from backend.`);
  };

  const loadFromFile = async (event) => {
    if (!template) {
      setStatus('Load template first so coordinates can be mapped to canvas.');
      return;
    }
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const next = payloadToBoxes(payload);
      setFields(next);
      setActiveFieldId(next[0]?.id ?? null);
      setStatus(`Loaded ${file.name} from disk.`);
    } catch (error) {
      setStatus(`Failed to load fields file: ${error}`);
    }
  };

  const handleFieldDoubleClick = (field) => {
    let nextName = field.name;
    if (!nextName) {
      const nameInput = window.prompt('Enter a field name:', '');
      if (!nameInput) {
        return;
      }
      nextName = nameInput.trim();
      if (!nextName) {
        return;
      }
      updateField(field.id, { name: nextName });
    }
    const currentValue = sampleValues[nextName] ?? '';
    const valueInput = window.prompt(`Enter value for ${nextName}:`, currentValue);
    if (valueInput === null) {
      return;
    }
    setSampleValues((prev) => ({
      ...prev,
      [nextName]: valueInput,
    }));

    setSampleHtmlValues((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, nextName)) {
        return prev;
      }
      const next = { ...prev };
      delete next[nextName];
      return next;
    });
  };

  const generatePdf = async () => {
    if (!templateFile) {
      setStatus('Upload a template first.');
      return;
    }
    const fieldsPayload = buildPayload();
    if (!fieldsPayload) {
      setStatus('Create fields before generating a PDF.');
      return;
    }
    if (useCsv && !csvFile) {
      setStatus('Upload a CSV file or turn off CSV mode.');
      return;
    }
    const payload = {
      ...generateOptions,
      row: Number(generateOptions.row) || 0,
      dx: Number(generateOptions.dx) || 0,
      dy: Number(generateOptions.dy) || 0,
      grid_step: Number(generateOptions.grid_step) || 0,
      placeholder_mode: false,
      overlay_only: generateOptions.output_mode === 'overlay_only',
    };
    const formData = new FormData();
    formData.append('template', templateFile);
    formData.append('fields_json', JSON.stringify(fieldsPayload));
    formData.append('row', String(payload.row));
    formData.append('page_size', payload.page_size);
    formData.append('dx', String(payload.dx));
    formData.append('dy', String(payload.dy));
    formData.append('grid_step', String(payload.grid_step));
    formData.append('placeholder_mode', String(useCsv ? false : false));
    formData.append('overlay_only', String(payload.overlay_only));
    
    if (useCsv) {
      formData.append('csv_file', csvFile);
      
      // Send field mappings (which fields map to which CSV columns)
      const cleanedMappings = {};
      Object.entries(fieldMappings).forEach(([fieldName, csvColumn]) => {
        if (csvColumn) {
          cleanedMappings[fieldName] = csvColumn;
        }
      });
      formData.append('field_mappings_json', JSON.stringify(cleanedMappings));
      
      // Send fixed values for fields that are NOT mapped to CSV
      const fixedValues = {};
      fields.forEach((field) => {
        if (!fieldMappings[field.name]) {
          const { text, html } = getFieldValuePayload(field.name);
          if (text) {
            fixedValues[field.name] = { text, html };
          }
        }
      });
      formData.append('fixed_values_json', JSON.stringify(fixedValues));
      
      // Enable batch generation if user selected "generate all"
      formData.append('batch', String(generateOptions.generate_all));
    } else {
      formData.append('data_json', JSON.stringify(buildDataPayload()));
    }
    
    let response;
    try {
      response = await fetch('/api/generate-file-upload', {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      setStatus(`Failed to reach server: ${error}`);
      return;
    }
    if (!response.ok) {
      let detail = '';
      const contentType = response.headers.get('content-type') || '';
      try {
        if (contentType.includes('application/json')) {
          const data = await response.json();
          detail = formatErrorDetail(data?.detail ?? data);
        } else {
          detail = await response.text();
        }
      } catch (error) {
        detail = `HTTP ${response.status}`;
      }
      const suffix = detail ? ` ${detail}` : '';
      setStatus(`Failed to generate PDF. HTTP ${response.status}.${suffix}`);
      return;
    }
    const responseForText = response.clone();
    const contentType = response.headers.get('content-type') || 'n/a';
    const contentDisposition = response.headers.get('content-disposition') || '';
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      let detail = '';
      try {
        detail = await responseForText.text();
      } catch (error) {
        detail = '';
      }
      const contentLength = response.headers.get('content-length') || 'n/a';
      const suffix = detail ? ` ${detail}` : '';
      setStatus(
        `Generated file is empty. HTTP ${response.status} content-length=${contentLength} content-type=${contentType}.${suffix}`
      );
      return;
    }
    
    const isZipResponse =
      contentType.includes('application/zip') ||
      contentType.includes('application/x-zip-compressed') ||
      /\.zip/i.test(contentDisposition);

    // Handle batch ZIP download
    if (useCsv && generateOptions.generate_all && isZipResponse) {
      const blob = new Blob([buffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const filename = getFilenameFromContentDisposition(contentDisposition, 'certificates.zip');
      if (latestDownload?.url) {
        URL.revokeObjectURL(latestDownload.url);
      }
      setLatestDownload({ url, filename, kind: 'zip' });
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('Downloaded ZIP file containing all certificates.');
      return;
    }
    
    // Handle single PDF preview
    if (!contentType.includes('application/pdf')) {
      let detail = '';
      try {
        detail = await responseForText.text();
      } catch (error) {
        detail = '';
      }
      const suffix = detail ? ` ${detail}` : '';
      setStatus(`Unexpected response type: ${contentType}. ${suffix}`);
      return;
    }
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    if (latestDownload?.url) {
      URL.revokeObjectURL(latestDownload.url);
    }
    setLatestDownload({ url: downloadUrl, filename: 'certificate.pdf', kind: 'pdf' });

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setPanelState((prev) => ({ ...prev, preview: true }));
    
    setStatus('Generated PDF preview. Use Download PDF to save it.');
  };

  const downloadLatestFile = () => {
    if (!latestDownload?.url) {
      setStatus('Generate a file first, then download.');
      return;
    }
    const a = document.createElement('a');
    a.href = latestDownload.url;
    a.download = latestDownload.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(
      latestDownload.kind === 'zip'
        ? 'Downloaded ZIP file containing all certificates.'
        : 'Downloaded the latest generated certificate.'
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand">
            <span className="brand-mark">CS</span>
            <div className="brand-text">
              <h1>CertStudio</h1>
            </div>
            <span className="brand-divider"></span>
            <button
              type="button"
              className="menu-button"
              onClick={() => {
                setLayoutsMenuOpen(!layoutsMenuOpen);
                setGenerateMenuOpen(false);
                setFontMenuOpen(false);
              }}
            >
              Layouts
            </button>
            <button
              type="button"
              className="menu-button"
              onClick={() => {
                setGenerateMenuOpen(!generateMenuOpen);
                setLayoutsMenuOpen(false);
                setFontMenuOpen(false);
              }}
            >
              Generate
            </button>
            <button
              type="button"
              className="menu-button"
              onClick={() => {
                setFontMenuOpen(!fontMenuOpen);
                setLayoutsMenuOpen(false);
                setGenerateMenuOpen(false);
              }}
            >
              Fonts
            </button>
            {generateMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-content">
                  <label>
                    <span className="label-title">Output mode</span>
                    <select
                      value={generateOptions.output_mode}
                      onChange={(event) =>
                        setGenerateOptions((prev) => ({ ...prev, output_mode: event.target.value }))
                      }
                    >
                      <option value="full_pdf">Full PDF (with template)</option>
                      <option value="overlay_only">Overlay only (for pre-printed sheets)</option>
                    </select>
                  </label>
                  <label>
                    <span className="label-title">Page size</span>
                    <select
                      value={generateOptions.page_size}
                      onChange={(event) =>
                        setGenerateOptions((prev) => ({ ...prev, page_size: event.target.value }))
                      }
                    >
                      <option value="letter">letter</option>
                      <option value="a4">a4</option>
                      <option value="legal">legal</option>
                    </select>
                  </label>
                  <div className="grid-two">
                    <label>
                      <span className="label-title">Global X offset (pt)</span>
                      <input
                        type="number"
                        value={generateOptions.dx}
                        onChange={(event) =>
                          setGenerateOptions((prev) => ({ ...prev, dx: Number(event.target.value) }))
                        }
                      />
                    </label>
                    <label>
                      <span className="label-title">Global Y offset (pt)</span>
                      <input
                        type="number"
                        value={generateOptions.dy}
                        onChange={(event) =>
                          setGenerateOptions((prev) => ({ ...prev, dy: Number(event.target.value) }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span className="label-title">Grid step (pt, 0 to hide)</span>
                    <input
                      type="number"
                      value={generateOptions.grid_step}
                      onChange={(event) =>
                        setGenerateOptions((prev) => ({ ...prev, grid_step: Number(event.target.value) }))
                      }
                    />
                  </label>
                  {useCsv && csvFile && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={generateOptions.generate_all}
                        onChange={(event) =>
                          setGenerateOptions((prev) => ({ ...prev, generate_all: event.target.checked }))
                        }
                      />
                      <span>Generate for all candidates in CSV</span>
                    </label>
                  )}
                  <div className="button-row">
                    <button type="button" onClick={generatePdf} className="primary-button">
                      Generate PDF
                    </button>
                    <button type="button" onClick={downloadLatestFile} disabled={!latestDownload?.url}>
                      {latestDownload?.kind === 'zip' ? 'Download ZIP' : 'Download PDF'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {layoutsMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-content">
                  <label>
                    <span className="label-title">Saved layouts</span>
                    <select
                      value={selectedFieldsName}
                      onChange={(event) => setSelectedFieldsName(event.target.value)}
                    >
                      <option value="">Select layout...</option>
                      {fieldsList.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="button-row">
                    <button type="button" onClick={loadFromBackend} disabled={!selectedFieldsName} className="secondary-button">
                      Load
                    </button>
                    <button type="button" onClick={saveToBackend} disabled={!template || fields.length === 0} className="secondary-button">
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => refreshFieldsList()}
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="section-divider"></div>
                  <label>
                    <span className="label-title">Import from file</span>
                    <input type="file" accept=".json" onChange={loadFromFile} />
                  </label>
                  <label>
                    <span className="label-title">Export name</span>
                    <input
                      value={saveFieldsName}
                      onChange={(event) => setSaveFieldsName(event.target.value)}
                      placeholder="fields.json"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={exportJson}
                    disabled={!template || fields.length === 0}
                    className="secondary-button"
                  >
                    Export to file
                  </button>
                </div>
              </div>
            )}
            {fontMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-content">
                  <label>
                    <span className="label-title">Upload font file (.ttf or .otf)</span>
                    <input
                      type="file"
                      accept=".ttf,.otf"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          await uploadFont(file);
                          event.target.value = '';
                        }
                      }}
                    />
                  </label>

                  {customFonts.length > 0 ? (
                    <div>
                      <div className="label-title" style={{ marginTop: '12px', marginBottom: '8px' }}>
                        Installed fonts ({customFonts.length})
                      </div>
                      <div style={{ display: 'grid', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                        {customFonts.map((font) => (
                          <div
                            key={font.file}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              background: 'var(--panel-soft)',
                              border: '1px solid var(--line)',
                              borderRadius: 'var(--radius)',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {font.name}
                              </div>
                              <div style={{ fontSize: '0.688rem', color: 'var(--ink-muted)', marginTop: '2px' }}>
                                {font.file} • {font.size_kb} KB
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteFont(font.file)}
                              style={{
                                marginLeft: '8px',
                                padding: '4px 8px',
                                fontSize: '0.688rem',
                                background: 'var(--danger)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius)',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="hint" style={{ marginTop: '12px' }}>
                      No custom fonts uploaded yet. Upload .ttf or .otf files to use them in your certificates.
                    </p>
                  )}

                  <div style={{ marginTop: '12px', padding: '8px', background: 'var(--panel-soft)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', fontSize: '0.688rem', color: 'var(--ink-soft)' }}>
                    <strong>Tip:</strong> Download free fonts from{' '}
                    <a href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                      Google Fonts
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="topbar-right">
            <div className="theme-toggle" aria-label="Theme">
              <button
                type="button"
                className={`theme-pill ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={`theme-pill ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
            </div>
          <div className="topbar-meta">
            <span className="meta-label">Template</span>
            <span className="meta-value">
              {template?.name ?? 'No file loaded'}
            </span>
            </div>
          </div>
        </div>
        <div className="topbar-secondary">
          {/* Left side: Template controls (compact) */}
          <div className="topbar-left-controls">
            <div className="topbar-group compact">
              <label>
                <span className="label-title">Template file</span>
                <span className="label-hint">PDF, JPG, or PNG</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={loadFile} />
              </label>
            </div>
            <div className="topbar-group compact">
              <label>
                <span className="label-title">Page size for images</span>
                <select value={preset} onChange={(event) => setPreset(event.target.value)}>
                  {Object.entries(PAGE_PRESETS).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {preset === 'custom' && (
                <div className="custom-size">
                  <label>
                    Width (pt)
                    <input
                      type="number"
                      value={customSize.width}
                      onChange={(event) => setCustomSize((prev) => ({ ...prev, width: Number(event.target.value) }))}
                    />
                  </label>
                  <label>
                    Height (pt)
                    <input
                      type="number"
                      value={customSize.height}
                      onChange={(event) => setCustomSize((prev) => ({ ...prev, height: Number(event.target.value) }))}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="topbar-group compact">
              <label className="slider-label">
                <span className="label-title">Zoom</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.05"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <span className="slider-value">{Math.round(zoom * 100)}%</span>
                </div>
              </label>
            </div>
          </div>

          {/* Right side: Editing controls (greyed out when no field is selected) - Photoshop style */}
          <div className={`topbar-editing-controls ${!activeField ? 'disabled' : ''}`}>
            <div className="text-control-item medium">
              <span className="label-title">Field name</span>
              <input
                value={activeField?.name || ''}
                onChange={(event) => activeField && updateField(activeField.id, { name: event.target.value })}
                placeholder="Select field"
              />
            </div>
            
            <span className="control-divider"></span>
            
            <div className="text-control-item wide">
              <span className="label-title">Font family</span>
              <select
                value={availableFontValues.has(activeField?.font) ? activeField.font : 'Helvetica'}
                onChange={(event) =>
                  applyInlineCommandOrFieldUpdate({
                    command: 'fontName',
                    value: event.target.value,
                    fieldPatch: { font: event.target.value },
                    requireSelection: true,
                    selectionMessage: 'Select text in the field to apply font family.',
                  })
                }
              >
                <optgroup label="ReportLab Built-in Fonts">
                  {REPORTLAB_BASE14_FONTS.map((family) => (
                    <option key={family.value} value={family.value}>
                      {family.label}
                    </option>
                  ))}
                </optgroup>
                {customFonts.length > 0 && (
                  <optgroup label="Uploaded Custom Fonts">
                    {customFonts
                      .filter((font) => !REPORTLAB_BASE14_FONTS.some((f) => f.value === font.name))
                      .map((font) => (
                        <option key={font.name} value={font.name}>
                          {font.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
            
            <div className="text-control-item small">
              <span className="label-title">Size (pt)</span>
              <input
                type="number"
                value={activeField?.size ?? ''}
                onChange={(event) => activeField && updateField(activeField.id, { size: Number(event.target.value) })}
                placeholder="12"
              />
            </div>
            
            <div className="text-control-item mini">
              <span className="label-title">Color</span>
              <input
                type="color"
                value={activeField ? colorArrayToHex(activeField.color) : '#000000'}
                onChange={(event) =>
                  applyInlineCommandOrFieldUpdate({
                    command: 'foreColor',
                    value: event.target.value,
                    fieldPatch: {
                      color: hexToColorArray(event.target.value),
                    },
                    requireSelection: true,
                    selectionMessage: 'Select text in the field to apply color.',
                  })
                }
                style={{ width: '100%', padding: '2px' }}
              />
            </div>
            
            <span className="control-divider"></span>
            
            <div className="icon-buttons-group">
              <button
                type="button"
                className={`icon-button ${activeField?.bold ? 'active' : ''}`}
                onMouseDown={(event) => {
                  const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
                  if (editorEl) {
                    event.preventDefault();
                  }
                }}
                onClick={() => handleInlineStyleClick('bold', 'bold')}
                title={isEditingText ? "Bold (select text first)" : "Bold"}
              >
                B
              </button>
              <button
                type="button"
                className={`icon-button ${activeField?.italic ? 'active' : ''}`}
                onMouseDown={(event) => {
                  const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
                  if (editorEl) {
                    event.preventDefault();
                  }
                }}
                onClick={() => handleInlineStyleClick('italic', 'italic')}
                title={isEditingText ? "Italic (select text first)" : "Italic"}
                style={{ fontStyle: 'italic' }}
              >
                I
              </button>
            </div>
            
            <span className="control-divider"></span>
            
            <div className="text-control-item small">
              <span className="label-title">Align</span>
              <select
                value={activeField?.align || 'left'}
                onChange={(event) => activeField && updateField(activeField.id, { align: event.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            
            <div className="text-control-item" style={{ marginLeft: '4px' }}>
              <span className="label-title">Fit to box</span>
              <label className="check-row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={activeField?.maxWidth || false}
                  onChange={(event) => activeField && updateField(activeField.id, { maxWidth: event.target.checked })}
                />
              </label>
            </div>

            <div className="text-control-item" style={{ marginLeft: '4px' }}>
              <span className="label-title">Wrap text</span>
              <label className="check-row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={activeField?.wrapText || false}
                  onChange={(event) => activeField && updateField(activeField.id, { wrapText: event.target.checked })}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      {status && <div className="status-bar">{status}</div>}

      <main className="workspace">
        <section className="sidebar sidebar-left">
          {/* FIELDS LIST */}
          <div className={`panel ${panelState.fields ? '' : 'collapsed'}`}>
            <div className="panel-header" onClick={() => togglePanel('fields')}>
              <h2>Fields</h2>
              <div className="panel-actions">
                <button
                  type="button"
                  className="panel-toggle"
                  data-state={panelState.fields ? 'open' : 'closed'}
                  aria-label="Toggle fields list"
                  onClick={(event) => {
                    stopPanelToggle(event);
                    togglePanel('fields');
                  }}
                />
              </div>
            </div>
            <div className="panel-body">
              <div className="field-list">
                {fields.map((field) => (
                  <button
                    type="button"
                    key={field.id}
                    className={`field-row ${activeFieldId === field.id ? 'selected' : ''}`}
                    onClick={() => setActiveFieldId(field.id)}
                  >
                    <span className="field-row-name">{field.name}</span>
                    <span className="field-row-meta">{field.align}</span>
                  </button>
                ))}
                {fields.length === 0 && (
                  <p className="hint">Drag on the template to create your first field.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="canvas-panel">
          {!template && (
            <div className="empty-state">
              <h2>Start by loading a template</h2>
              <p>Pick a certificate PDF or image above, then drag boxes on this canvas to define each field.</p>
            </div>
          )}
          {template && (
            <div
              className="template-layer"
              ref={layerRef}
              style={{
                width: template.displayWidth,
                height: template.displayHeight,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
              onMouseDown={beginDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
            >
              <img src={template.src} alt="Template" draggable={false} className="template-image" />

              {fields.map((field) => {
                const sampleText = sampleValues[field.name] ?? `{${field.name}}`;
                const committedHtml = sampleHtmlValues[field.name];
                const fallbackHtml = plainTextToHtml(sampleText);
                const displayHtml = committedHtml ?? fallbackHtml;
                const previewFontPx = (Number(field.size) / template.pageHeightPt) * template.displayHeight;
                const fittedPx = field.maxWidth ? fitSizeForPreview(sampleText, field.w, previewFontPx) : previewFontPx;
                const isActive = activeFieldId === field.id;

                return (
                  <div
                    key={field.id}
                    className={`field-box ${isActive ? 'active' : ''}`}
                    style={{ left: field.x, top: field.y, width: field.w, height: field.h }}
                    onMouseDown={(event) => {
                      const target = event.target;
                      if (!(target instanceof HTMLElement)) {
                        return;
                      }
                      const isResizeHandle = !!target.closest('.resize-handle');
                      if (isResizeHandle) {
                        return;
                      }

                      const previewEl = target.closest('.field-preview');
                      if (previewEl) {
                        event.stopPropagation();
                        setActiveFieldId(field.id);

                        const isSameEditingField =
                          isEditingText && editingDraftRef.current.name === field.name;
                        if (!isSameEditingField) {
                          // Seed editing draft immediately so rich formatting is preserved.
                          editingDraftRef.current = {
                            name: field.name,
                            html: displayHtml,
                            text: sampleText,
                          };
                          lastSelectionRangeRef.current = null;
                        }

                        setIsEditingText(true);
                        setTimeout(() => {
                          if (previewEl instanceof HTMLElement) {
                            previewEl.focus();
                          }
                        }, 0);
                        return;
                      }
                      
                      // Otherwise, we're clicking on the edge/border - start moving
                      beginMove(event, field.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      const target = event.target;
                      if (!(target instanceof HTMLElement)) {
                        return;
                      }
                      if (!target.closest('.field-preview') && !target.closest('.resize-handle')) {
                        setActiveFieldId(field.id);
                        setIsEditingText(false);
                      }
                    }}
                    onDoubleClick={(event) => {
                      const target = event.target;
                      if (!(target instanceof HTMLElement)) {
                        return;
                      }
                      if (!target.closest('.field-preview') && !target.closest('.resize-handle')) {
                        handleFieldDoubleClick(field);
                      }
                    }}
                  >
                    <div
                      className={`field-preview align-${field.align}`}
                      contentEditable={isActive && isEditingText}
                      suppressContentEditableWarning={true}
                      spellCheck={false}
                      style={{
                        fontSize: fittedPx,
                        fontFamily: field.font,
                        color: colorArrayToCss(field.color),
                        fontWeight: field.bold ? 'bold' : 'normal',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        whiteSpace: field.wrapText ? 'pre-wrap' : 'pre',
                        overflowWrap: field.wrapText ? 'break-word' : 'normal',
                        wordWrap: field.wrapText ? 'break-word' : 'normal',
                      }}
                      onInput={(event) => {
                        if (isActive && isEditingText) {
                          editingDraftRef.current = {
                            name: field.name,
                            html: event.currentTarget.innerHTML,
                            text: event.currentTarget.innerText,
                          };
                        }
                      }}
                      onMouseDown={(event) => {
                        // When in edit mode, stop propagation to allow text selection
                        if (isActive && isEditingText) {
                          event.stopPropagation();
                        }
                      }}
                      onBlur={(event) => {
                        const nextTarget = event.relatedTarget;
                        const keepEditing =
                          nextTarget instanceof HTMLElement &&
                          !!nextTarget.closest('.topbar-editing-controls');
                        if (keepEditing) {
                          return;
                        }
                        if (editingDraftRef.current.name === field.name) {
                          const nextText = editingDraftRef.current.text ?? '';
                          const nextHtml = sanitizeHtml(editingDraftRef.current.html ?? plainTextToHtml(nextText));
                          setSampleValues((prev) => ({
                            ...prev,
                            [field.name]: nextText,
                          }));
                          setSampleHtmlValues((prev) => ({
                            ...prev,
                            [field.name]: nextHtml,
                          }));
                        }
                        lastSelectionRangeRef.current = null;
                        setIsEditingText(false);
                      }}
                      dangerouslySetInnerHTML={{
                        __html:
                          isActive && isEditingText && editingDraftRef.current.name === field.name
                            ? editingDraftRef.current.html
                            : displayHtml,
                      }}
                    >
                      {null}
                    </div>
                    {/* 8 resize handles: 4 corners + 4 edges */}
                    <span className="resize-handle resize-handle-nw" onMouseDown={(event) => beginResize(event, field.id, 'nw')} />
                    <span className="resize-handle resize-handle-n" onMouseDown={(event) => beginResize(event, field.id, 'n')} />
                    <span className="resize-handle resize-handle-ne" onMouseDown={(event) => beginResize(event, field.id, 'ne')} />
                    <span className="resize-handle resize-handle-e" onMouseDown={(event) => beginResize(event, field.id, 'e')} />
                    <span className="resize-handle resize-handle-se" onMouseDown={(event) => beginResize(event, field.id, 'se')} />
                    <span className="resize-handle resize-handle-s" onMouseDown={(event) => beginResize(event, field.id, 's')} />
                    <span className="resize-handle resize-handle-sw" onMouseDown={(event) => beginResize(event, field.id, 'sw')} />
                    <span className="resize-handle resize-handle-w" onMouseDown={(event) => beginResize(event, field.id, 'w')} />
                  </div>
                );
              })}

              {draftBox && (
                <div
                  className="draft-box"
                  style={{ left: draftBox.x, top: draftBox.y, width: draftBox.w, height: draftBox.h }}
                />
              )}
              
              {/* Alignment guides */}
              {alignmentGuides.map((guide, idx) => (
                guide.type === 'vertical' ? (
                  <div
                    key={`guide-v-${idx}`}
                    className="alignment-guide-vertical"
                    style={{
                      position: 'absolute',
                      left: guide.x,
                      top: 0,
                      width: 1,
                      height: '100%',
                      backgroundColor: '#00ff00',
                      pointerEvents: 'none',
                      zIndex: 1000,
                    }}
                  />
                ) : (
                  <div
                    key={`guide-h-${idx}`}
                    className="alignment-guide-horizontal"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: guide.y,
                      width: '100%',
                      height: 1,
                      backgroundColor: '#00ff00',
                      pointerEvents: 'none',
                      zIndex: 1000,
                    }}
                  />
                )
              ))}
            </div>
          )}
        </section>

        <aside className="sidebar sidebar-right">
          {/* DATA SOURCE */}
          <div className={`panel ${panelState.dataSource ? '' : 'collapsed'}`}>
            <div className="panel-header" onClick={() => togglePanel('dataSource')}>
              <h2>Data source</h2>
              <div className="panel-actions">
                <button
                  type="button"
                  className="panel-toggle"
                  data-state={panelState.dataSource ? 'open' : 'closed'}
                  aria-label="Toggle data source"
                  onClick={(event) => {
                    stopPanelToggle(event);
                    togglePanel('dataSource');
                  }}
                />
              </div>
            </div>
            <div className="panel-body">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={useCsv}
                  onChange={(event) => setUseCsv(event.target.checked)}
                />
                <span>Use CSV data</span>
              </label>
              {useCsv && (
                <>
                  <label>
                    <span className="label-title">Upload CSV file</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                    />
                  </label>
                  {csvFile && csvHeaders.length > 0 && (
                    <div className="csv-headers-section">
                      <span className="label-title">CSV Headers Found:</span>
                      <div className="csv-headers-list">
                        {csvHeaders.map((header, idx) => (
                          <span key={idx} className="csv-header-chip">{header}</span>
                        ))}
                      </div>
                      <div className="section-divider"></div>
                      <span className="label-title">Field Mappings</span>
                      {fields.length > 0 ? (
                        <div className="field-mappings">
                          {fields.map((field) => (
                            <label key={field.id} className="mapping-row">
                              <span className="mapping-field-name">{field.name}</span>
                              <select
                                value={fieldMappings[field.name] || ''}
                                onChange={(event) => updateFieldMapping(field.name, event.target.value)}
                              >
                                <option value="">-- Use preview value --</option>
                                {csvHeaders.map((header) => (
                                  <option key={header} value={header}>
                                    {header}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="hint">Create fields first to set up mappings</p>
                      )}
                    </div>
                  )}
                  {csvFile && csvHeaders.length === 0 && (
                    <p className="hint">No headers found in CSV file</p>
                  )}
                </>
              )}
              {!useCsv && (
                <p className="hint">Enable to generate PDFs from CSV rows</p>
              )}
            </div>
          </div>

          {activeField && template && scales && (
            <div className={`panel ${panelState.selectedField ? '' : 'collapsed'}`}>
              <div className="panel-header" onClick={() => togglePanel('selectedField')}>
                <h2>Selected field</h2>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="panel-toggle"
                    data-state={panelState.selectedField ? 'open' : 'closed'}
                    aria-label="Toggle selected field"
                    onClick={(event) => {
                      stopPanelToggle(event);
                      togglePanel('selectedField');
                    }}
                  />
                </div>
              </div>
              <div className="panel-body editor">
                <label>
                  <span className="label-title">Preview value</span>
                  <textarea
                    value={sampleValues[activeField.name] ?? ''}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSampleValues((prev) => ({
                        ...prev,
                        [activeField.name]: nextValue,
                      }));

                      setSampleHtmlValues((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(prev, activeField.name)) {
                          return prev;
                        }
                        const next = { ...prev };
                        delete next[activeField.name];
                        return next;
                      });

                      if (editingDraftRef.current.name === activeField.name) {
                        editingDraftRef.current = {
                          name: activeField.name,
                          text: nextValue,
                          html: plainTextToHtml(nextValue),
                        };
                      }
                    }}
                    rows={3}
                    placeholder="Enter preview text (press Enter for new line)"
                  />
                </label>

                <div className="grid-two">
                  <label>
                    <span className="label-title">X (px)</span>
                    <input
                      type="number"
                      value={Math.round(activeField.x)}
                      onChange={(event) => updateField(activeField.id, { x: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span className="label-title">Y (px)</span>
                    <input
                      type="number"
                      value={Math.round(activeField.y)}
                      onChange={(event) => updateField(activeField.id, { y: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span className="label-title">W (px)</span>
                    <input
                      type="number"
                      value={Math.round(activeField.w)}
                      onChange={(event) => updateField(activeField.id, { w: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span className="label-title">H (px)</span>
                    <input
                      type="number"
                      value={Math.round(activeField.h)}
                      onChange={(event) => updateField(activeField.id, { h: Number(event.target.value) })}
                    />
                  </label>
                </div>

                <div className="metrics">
                  <div>
                    Anchor X (pt):{' '}
                    <strong>
                      {(
                        activeField.align === 'left'
                          ? activeField.x * scales.x
                          : activeField.align === 'center'
                          ? (activeField.x + activeField.w / 2) * scales.x
                          : (activeField.x + activeField.w) * scales.x
                      ).toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    Anchor Y (pt):{' '}
                    <strong>
                      {(((template.displayHeight - activeField.y) * scales.y) - Number(activeField.size)).toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    max_width (pt): <strong>{(activeField.w * scales.x).toFixed(2)}</strong>
                  </div>
                </div>

                <button type="button" className="danger" onClick={() => deleteField(activeField.id)}>
                  Delete field
                </button>
              </div>
            </div>
          )}

          {previewUrl && (
            <div className={`panel ${panelState.preview ? '' : 'collapsed'}`}>
              <div className="panel-header" onClick={() => togglePanel('preview')}>
                <h2>Latest preview</h2>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={(event) => {
                      stopPanelToggle(event);
                      if (previewUrl) {
                        window.open(previewUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    Open in tab
                  </button>
                  <button
                    type="button"
                    className="panel-toggle"
                    data-state={panelState.preview ? 'open' : 'closed'}
                    aria-label="Toggle preview"
                    onClick={(event) => {
                      stopPanelToggle(event);
                      togglePanel('preview');
                    }}
                  />
                </div>
              </div>
              <div className="panel-body preview-body">
                <iframe
                  title="Certificate preview"
                  src={previewUrl}
                  className="preview-frame"
                />
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
