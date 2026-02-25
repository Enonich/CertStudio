import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { useAuth } from './contexts/AuthContext';
import { apiFetch } from './lib/apiFetch';
import Auth from './components/Auth';

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

/**
 * Normalize HTML produced by Chrome's contentEditable inside a flex container.
 * Chrome wraps content in <div> blocks when execCommand (bold/font/etc.) runs
 * on a flex contentEditable element, turning "Hello World" into
 * "<div>Hello World</div>". This function unwraps those block elements back to
 * inline content separated by <br> tags, preserving intentional line breaks
 * while removing accidental block wrappers.
 */
function normalizeEditorHtml(html) {
  if (!html || !html.includes('<div') && !html.includes('<p')) {
    return html;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html);

  // Unwrap <div> and <p> blocks: move their children before them, then add
  // a <br> separator, then remove the block element itself.
  tpl.content.querySelectorAll('div, p').forEach((block) => {
    const frag = document.createDocumentFragment();
    while (block.firstChild) {
      frag.appendChild(block.firstChild);
    }
    const br = document.createElement('br');
    frag.appendChild(br);
    block.replaceWith(frag);
  });

  // Trim trailing <br> elements.
  let last = tpl.content.lastChild;
  while (last && last.nodeName === 'BR') {
    const prev = last.previousSibling;
    last.remove();
    last = prev;
  }

  return tpl.innerHTML;
}

function escapeCssString(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function resolveFontTokenToCss(fontToken) {
  const token = String(fontToken ?? '').trim();
  if (!token) {
    return {
      family: '',
      weight: '',
      style: '',
    };
  }

  const hasBold = /bold/i.test(token);
  const hasItalic = /(oblique|italic)/i.test(token);
  const quotedToken = `"${escapeCssString(token)}"`;

  if (token.startsWith('Helvetica')) {
    return {
      family: `${quotedToken}, Helvetica, Arial, sans-serif`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token.startsWith('Times')) {
    return {
      family: `${quotedToken}, "Times New Roman", Times, serif`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token.startsWith('Courier')) {
    return {
      family: `${quotedToken}, "Courier New", Courier, monospace`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token === 'Symbol') {
    return {
      family: `${quotedToken}, Symbol`,
      weight: '',
      style: '',
    };
  }
  if (token === 'ZapfDingbats') {
    return {
      family: `${quotedToken}, "Zapf Dingbats", Wingdings, fantasy`,
      weight: '',
      style: '',
    };
  }

  return {
    family: quotedToken,
    weight: '',
    style: '',
  };
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

const COMMON_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72];

const QUICK_COLOR_SWATCHES = [
  '#000000', '#1f1f1f', '#444444', '#666666', '#888888', '#aaaaaa', '#ffffff',
  '#d9534f', '#f0ad4e', '#ffd166', '#5cb85c', '#28a745', '#20c997', '#17a2b8',
  '#1f9fff', '#0d6efd', '#6f42c1', '#e83e8c', '#ff6b6b', '#ffa94d', '#74c0fc',
];

const MAX_HISTORY_STEPS = 100;
const PROJECT_HANDLE_DB_NAME = 'template-mapper-project-db';
const PROJECT_HANDLE_STORE_NAME = 'project-handles';
const PROJECT_HANDLE_KEY = 'current-project-file';

function cloneHistoryValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeProjectFilename(rawName) {
  const value = typeof rawName === 'string' ? rawName.trim() : '';
  const lowered = value.toLowerCase();
  const fallback = 'certificate-project';
  const baseCandidate =
    !value || lowered === 'undefined' || lowered === 'null' || lowered === 'nan'
      ? fallback
      : value.replace(/\.json$/i, '');
  const sanitized = baseCandidate
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/g, '')
    .trim();
  const base = sanitized || fallback;
  return `${base}.json`;
}

function canUseSavePicker() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.showSaveFilePicker === 'function'
  );
}

function runIndexedDbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function openProjectHandleDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(PROJECT_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_HANDLE_STORE_NAME)) {
        db.createObjectStore(PROJECT_HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

async function getStoredProjectFileHandle() {
  const db = await openProjectHandleDb();
  if (!db) {
    return null;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    return (await runIndexedDbRequest(store.get(PROJECT_HANDLE_KEY))) || null;
  } finally {
    db.close();
  }
}

async function setStoredProjectFileHandle(handle) {
  const db = await openProjectHandleDb();
  if (!db) {
    return;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    await runIndexedDbRequest(store.put(handle, PROJECT_HANDLE_KEY));
  } finally {
    db.close();
  }
}

async function clearStoredProjectFileHandle() {
  const db = await openProjectHandleDb();
  if (!db) {
    return;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    await runIndexedDbRequest(store.delete(PROJECT_HANDLE_KEY));
  } finally {
    db.close();
  }
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fallbackName = 'template.bin', fallbackMimeType = 'application/octet-stream') {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) {
    throw new Error('Invalid embedded template data.');
  }

  const mimeType = match[1] || fallbackMimeType;
  const payload = decodeURIComponent(match[2] || '');
  const byteString = atob(payload);
  const bytes = new Uint8Array(byteString.length);
  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new File([bytes], fallbackName, { type: mimeType });
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

// ── Zip name modal ────────────────────────────────────────────────────────────
function ZipNameModal({ suggestedName, onConfirm, onCancel }) {
  const [name, setName] = useState(suggestedName ?? 'certificates');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onConfirm(name);
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="zip-modal-backdrop" onClick={onCancel}>
      <div className="zip-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zip-modal-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>Download certificates</span>
        </div>
        <div className="zip-modal-body">
          <label className="zip-modal-label">ZIP file name</label>
          <div className="zip-modal-input-row">
            <input
              ref={inputRef}
              className="zip-modal-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="certificates"
            />
            <span className="zip-modal-ext">.zip</span>
          </div>
          <p className="zip-modal-hint">
            {typeof window.showSaveFilePicker === 'function'
              ? 'A save dialog will open so you can choose the location.'
              : 'The file will be saved to your default downloads folder.'}
          </p>
        </div>
        <div className="zip-modal-footer">
          <button type="button" className="zip-modal-btn zip-modal-btn--cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="zip-modal-btn zip-modal-btn--confirm" onClick={() => onConfirm(name)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Save ZIP
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, signOut } = useAuth();
  const layerRef = useRef(null);
  const fontPickerRef = useRef(null);
  const sizePickerRef = useRef(null);
  const templateInputRef = useRef(null);
  const [theme, setTheme] = useState('dark');
  const [zoom, setZoom] = useState(1);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateFileDataUrl, setTemplateFileDataUrl] = useState('');
  const [customFonts, setCustomFonts] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvFirstRow, setCsvFirstRow] = useState({});
  const [fieldMappings, setFieldMappings] = useState({});
  const [useCsv, setUseCsv] = useState(false);
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldsName, setSelectedFieldsName] = useState('');
  const [saveFieldsName, setSaveFieldsName] = useState('certificate-project.json');
  const [projectFileHandle, setProjectFileHandle] = useState(null);
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
  const [imageItems, setImageItems] = useState([]);
  const [activeImageId, setActiveImageId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftBox, setDraftBox] = useState(null);
  const [sampleValues, setSampleValues] = useState({});
  const [sampleHtmlValues, setSampleHtmlValues] = useState({});
  const [isEditingText, setIsEditingText] = useState(false);
  const editingDraftRef = useRef({ name: null, html: '', text: '' });
  const lastSelectionRangeRef = useRef(null);
  const toolbarInteractionRef = useRef(false);
  const [interaction, setInteraction] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [statusInfo, setStatusInfo] = useState({ text: '', type: 'info' });
  const setStatus = (msg, type) => {
    const m = String(msg || '');
    const resolvedType = type ?? (
      /fail|error|cannot|invalid|not found|unexpected/i.test(m) ? 'error' :
      /saved|success|generated|uploaded|imported|loaded|deleted/i.test(m) ? 'success' :
      /csv mode|upload a csv|turn off use csv|upload.*first|create.*first|select.*first|load.*first/i.test(m) ? 'warning' :
      'info'
    );
    setStatusInfo({ text: m, type: resolvedType });
  };
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latestDownload, setLatestDownload] = useState(null);
  const [zipNameModal, setZipNameModal] = useState({ open: false, suggestedName: 'certificates' });
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontHoverFamily, setFontHoverFamily] = useState('');
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const [sizeHoverValue, setSizeHoverValue] = useState(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorHoverValue, setColorHoverValue] = useState('');
  const [activeEditorFont, setActiveEditorFont] = useState('');
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [layoutsMenuOpen, setLayoutsMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const statusTimeoutRef = useRef(null);
  const [generateOptions, setGenerateOptions] = useState({
    row: 0,
    output_mode: 'full_pdf',
    page_size: 'letter',
    generate_all: false,
  });
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const historyCurrentRef = useRef(null);
  const historySignatureRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const preDragSnapshotRef = useRef(null);
  const [leftTab, setLeftTab] = useState('fields');

  useEffect(() => {
    let cancelled = false;
    const restoreProjectHandle = async () => {
      if (!canUseSavePicker()) {
        return;
      }
      try {
        const storedHandle = await getStoredProjectFileHandle();
        if (!cancelled && storedHandle) {
          setProjectFileHandle(storedHandle);
        }
      } catch (error) {
        console.warn('Failed to restore project file handle:', error);
      }
    };
    restoreProjectHandle();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }

    if (!statusInfo.text) {
      return undefined;
    }

    const isGeneratingMessage = /^generating\.{0,3}$/i.test(statusInfo.text.trim());
    if (isGenerating && isGeneratingMessage) {
      return undefined;
    }

    const timeoutMs =
      statusInfo.type === 'error' ? 9000 :
      statusInfo.type === 'warning' ? 7000 :
      4500;

    statusTimeoutRef.current = setTimeout(() => {
      setStatusInfo((current) => {
        if (current.text !== statusInfo.text) {
          return current;
        }
        return { text: '', type: current.type };
      });
      statusTimeoutRef.current = null;
    }, timeoutMs);

    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
    };
  }, [statusInfo, isGenerating]);

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
  const activeImage = imageItems.find((image) => image.id === activeImageId) ?? null;
  const isGenerateActionDisabled = !template || fields.length === 0;
  const generateDisabledTooltip = 'Load a template to generate';

  const buildHistorySnapshot = () => ({
    fields: cloneHistoryValue(fields),
    imageItems: cloneHistoryValue(imageItems),
    sampleValues: cloneHistoryValue(sampleValues),
    sampleHtmlValues: cloneHistoryValue(sampleHtmlValues),
    fieldMappings: cloneHistoryValue(fieldMappings),
    useCsv,
    generateOptions: cloneHistoryValue(generateOptions),
  });

  const applyHistorySnapshot = (snapshot) => {
    const safeSnapshot = cloneHistoryValue(snapshot);
    isApplyingHistoryRef.current = true;
    historyCurrentRef.current = safeSnapshot;
    historySignatureRef.current = JSON.stringify(safeSnapshot);

    setFields(safeSnapshot.fields ?? []);
    setImageItems(safeSnapshot.imageItems ?? []);
    setSampleValues(safeSnapshot.sampleValues ?? {});
    setSampleHtmlValues(safeSnapshot.sampleHtmlValues ?? {});
    setFieldMappings(safeSnapshot.fieldMappings ?? {});
    setUseCsv(Boolean(safeSnapshot.useCsv));
    setGenerateOptions((prev) => ({ ...prev, ...(safeSnapshot.generateOptions ?? {}) }));
    // Selection state (activeFieldId, activeImageId, isEditingText) is intentionally
    // NOT restored — undo/redo only affects document content, not UI selection.

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  };

  const performUndo = () => {
    if (undoStackRef.current.length === 0) {
      return false;
    }

    const previousSnapshot = undoStackRef.current.pop();
    const currentSnapshot = buildHistorySnapshot();
    redoStackRef.current.push(currentSnapshot);
    if (redoStackRef.current.length > MAX_HISTORY_STEPS) {
      redoStackRef.current.shift();
    }

    applyHistorySnapshot(previousSnapshot);
    return true;
  };

  const performRedo = () => {
    if (redoStackRef.current.length === 0) {
      return false;
    }

    const nextSnapshot = redoStackRef.current.pop();
    const currentSnapshot = buildHistorySnapshot();
    undoStackRef.current.push(currentSnapshot);
    if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
      undoStackRef.current.shift();
    }

    applyHistorySnapshot(nextSnapshot);
    return true;
  };

  useEffect(() => {
    const snapshot = buildHistorySnapshot();
    const signature = JSON.stringify(snapshot);

    if (historySignatureRef.current === null) {
      historyCurrentRef.current = snapshot;
      historySignatureRef.current = signature;
      return;
    }

    if (signature === historySignatureRef.current) {
      return;
    }

    if (isApplyingHistoryRef.current) {
      historyCurrentRef.current = snapshot;
      historySignatureRef.current = signature;
      return;
    }

    if (historyCurrentRef.current) {
      undoStackRef.current.push(historyCurrentRef.current);
      if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
        undoStackRef.current.shift();
      }
    }
    redoStackRef.current = [];
    historyCurrentRef.current = snapshot;
    historySignatureRef.current = signature;
  }, [
    fields,
    imageItems,
    sampleValues,
    sampleHtmlValues,
    fieldMappings,
    useCsv,
    generateOptions,
    // activeFieldId, activeImageId, isEditingText are excluded: selection changes
    // are not undoable document operations.
  ]);

  const availableFontValues = useMemo(
    () => new Set([
      ...REPORTLAB_BASE14_FONTS.map((f) => f.value),
      ...customFonts.map((f) => f.name),
    ]),
    [customFonts]
  );

  const fontPickerGroups = useMemo(() => {
    const custom = customFonts.filter((font) => !REPORTLAB_BASE14_FONTS.some((f) => f.value === font.name));
    return {
      builtIn: REPORTLAB_BASE14_FONTS,
      custom,
    };
  }, [customFonts]);

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
    if (!activeFieldId) {
      setFontHoverFamily('');
      setActiveEditorFont('');
      setFontPickerOpen(false);
      setSizeHoverValue(null);
      setSizePickerOpen(false);
      setColorHoverValue('');
      setColorPickerOpen(false);
    }
  }, [activeFieldId]);

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

    if (csvColumn && activeField?.name === fieldName) {
      commitActiveEditingDraft();
      setIsEditingText(false);
    }
    
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
      const response = await apiFetch('/api/fields/list');
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
    const formData = new FormData();
    formData.append('font_file', file);

    try {
      const response = await apiFetch('/api/upload-font', {
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
    try {
      const response = await apiFetch(`/api/delete-font/${encodeURIComponent(filename)}`, {
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
      const clickedNavItem = event.target.closest('.nav-menu-item');
      const clickedGenerateGroup = event.target.closest('.topbar-generate');
      const clickedSettingsDock = event.target.closest('.settings-dock');
      const insideFontPicker = fontPickerRef.current && fontPickerRef.current.contains(event.target);
      const insideSizePicker = sizePickerRef.current && sizePickerRef.current.contains(event.target);
      const clickedColorPicker = event.target.closest('.color-picker');

      if (insertMenuOpen && !clickedNavItem) setInsertMenuOpen(false);
      if (layoutsMenuOpen && !clickedNavItem) setLayoutsMenuOpen(false);
      if (generateMenuOpen && !clickedGenerateGroup) setGenerateMenuOpen(false);
      if (settingsMenuOpen && !clickedSettingsDock) { setSettingsMenuOpen(false); setSettingsTab(null); }
      if (fontPickerOpen && !insideFontPicker) {
        setFontPickerOpen(false);
        setFontHoverFamily('');
      }
      if (sizePickerOpen && !insideSizePicker) {
        setSizePickerOpen(false);
        setSizeHoverValue(null);
      }
      if (colorPickerOpen && !clickedColorPicker) {
        setColorPickerOpen(false);
        setColorHoverValue('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [insertMenuOpen, layoutsMenuOpen, settingsMenuOpen, generateMenuOpen, fontPickerOpen, sizePickerOpen, colorPickerOpen]);

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

  const buildPayload = (includeTemplateAsset = true) => {
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
          bold: Boolean(field.bold),
          italic: Boolean(field.italic),
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
      images: imageItems.map((image) => {
        const imageWidthPt = image.w * scales.x;
        const imageHeightPt = image.h * scales.y;
        const imageTopPt = (template.displayHeight - image.y) * scales.y;
        const imageBottomPt = imageTopPt - imageHeightPt;
        return {
          id: image.id,
          name: image.name,
          x: image.x * scales.x,
          y: imageBottomPt,
          w: imageWidthPt,
          h: imageHeightPt,
          src: image.src,
        };
      }),
      layout_state: {
        sample_values: sampleValues,
        sample_html_values: sampleHtmlValues,
        field_mappings: fieldMappings,
        use_csv: useCsv,
        generate_options: generateOptions,
        template_asset:
          includeTemplateAsset && templateFileDataUrl && templateFile
            ? {
                file_name: templateFile.name,
                file_type: templateFile.type || '',
                data_url: templateFileDataUrl,
              }
            : null,
      },
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

  const payloadToLayout = (payload, templateOverride = null) => {
    const templateForLayout = templateOverride ?? template;
    if (!templateForLayout || !payload || !Array.isArray(payload.fields)) {
      return {
        fields: [],
        images: [],
        layoutState: null,
      };
    }

    const localScales = {
      x: templateForLayout.pageWidthPt / templateForLayout.displayWidth,
      y: templateForLayout.pageHeightPt / templateForLayout.displayHeight,
    };

    const mappedFields = payload.fields.map((field, idx) => {
      const align = field.align ?? 'left';
      const widthPt = Number(field.box_width ?? field.max_width ?? 150);
      const widthPx = widthPt / localScales.x;
      const sizePt = Number(field.size ?? payload.default_size ?? 18);
      const estimatedHeightPt = Math.max(
        24,
        ((sizePt * 1.6) / templateForLayout.pageHeightPt) * templateForLayout.displayHeight * localScales.y
      );
      const heightPt = Number(field.box_height ?? estimatedHeightPt);
      const heightPx = Math.max(8, heightPt / localScales.y);
      const anchorX = Number(field.x) / localScales.x;
      const wrapTopPt = Number(field.wrap_start_y);
      const legacyY = Number(field.y);
      const topPt = Number.isFinite(wrapTopPt)
        ? wrapTopPt
        : Number.isFinite(legacyY)
          ? legacyY + sizePt
          : templateForLayout.pageHeightPt;

      let leftX = anchorX;
      if (align === 'center') {
        leftX = anchorX - widthPx / 2;
      } else if (align === 'right') {
        leftX = anchorX - widthPx;
      }

      const y = templateForLayout.displayHeight - (topPt / localScales.y);

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
      if (typeof field.bold === 'boolean') {
        bold = field.bold;
      }
      if (typeof field.italic === 'boolean') {
        italic = field.italic;
      }

      // Get base font family
      if (fontName.startsWith('Helvetica')) {
        baseFont = 'Helvetica';
      } else if (fontName.startsWith('Times')) {
        baseFont = 'Times-Roman';
      } else if (fontName.startsWith('Courier')) {
        baseFont = 'Courier';
      }
      const resolvedFont = availableFontValues.has(fontName)
        ? fontName
        : availableFontValues.has(baseFont)
          ? baseFont
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
        templateForLayout.displayWidth,
        templateForLayout.displayHeight
      );
    });

    const mappedImages = Array.isArray(payload.images)
      ? payload.images
          .map((image, idx) => {
            const wPt = Number(image.w ?? 0);
            const hPt = Number(image.h ?? 0);
            const xPt = Number(image.x ?? 0);
            const yPt = Number(image.y ?? 0);
            const src = typeof image.src === 'string' ? image.src : '';
            if (!src || !Number.isFinite(wPt) || !Number.isFinite(hPt) || wPt <= 0 || hPt <= 0) {
              return null;
            }

            const widthPx = Math.max(8, wPt / localScales.x);
            const heightPx = Math.max(8, hPt / localScales.y);
            const xPx = xPt / localScales.x;
            const topPt = yPt + hPt;
            const yPx = templateForLayout.displayHeight - (topPt / localScales.y);

            return clampBox(
              {
                id: image.id ?? uid(),
                name: image.name ?? `image_${idx + 1}`,
                x: xPx,
                y: yPx,
                w: widthPx,
                h: heightPx,
                src,
              },
              templateForLayout.displayWidth,
              templateForLayout.displayHeight
            );
          })
          .filter(Boolean)
      : [];

    const layoutState = payload.layout_state && typeof payload.layout_state === 'object'
      ? payload.layout_state
      : null;

    return {
      fields: mappedFields,
      images: mappedImages,
      layoutState,
    };
  };

  const readImageAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });

  const getImageNaturalSize = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Failed to load image.'));
      image.src = src;
    });

  const importImageElement = async (event) => {
    if (!template) {
      setStatus('Load a template before importing an image.');
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const src = await readImageAsDataUrl(file);
      const natural = await getImageNaturalSize(src);
      const maxPreviewWidth = Math.min(260, template.displayWidth * 0.4);
      const maxPreviewHeight = Math.min(120, template.displayHeight * 0.25);
      const scale = Math.min(
        1,
        maxPreviewWidth / Math.max(1, natural.width),
        maxPreviewHeight / Math.max(1, natural.height)
      );

      const nextImage = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '') || `image_${imageItems.length + 1}`,
        x: 24,
        y: 24,
        w: Math.max(16, natural.width * scale),
        h: Math.max(16, natural.height * scale),
        src,
      };

      setImageItems((prev) => [
        ...prev,
        clampBox(nextImage, template.displayWidth, template.displayHeight),
      ]);
      commitActiveEditingDraft();
      setActiveImageId(nextImage.id);
      setActiveFieldId(null);
      setIsEditingText(false);
      setStatus(`Imported image: ${file.name}`);
    } catch (error) {
      setStatus(`Failed to import image: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const loadTemplateFile = async (file) => {
    const loaded = await loadTemplate(file, pageSize);
    const fileDataUrl = await readFileAsDataUrl(file);
    setTemplate(loaded);
    setTemplateFile(file);
    setTemplateFileDataUrl(fileDataUrl);
    setFields([]);
    setImageItems([]);
    setActiveFieldId(null);
    setActiveImageId(null);
    setSampleValues({});
    setSampleHtmlValues({});
    setStatus(`Loaded template: ${loaded.name}`);

    // Auto-fit zoom so the template is fully visible in the canvas panel on load
    requestAnimationFrame(() => {
      const canvasEl = document.getElementById('canvasArea');
      if (canvasEl && loaded.displayWidth && loaded.displayHeight) {
        const availW = canvasEl.clientWidth - 96;   // minus scroll-body padding (40×2) + margin
        const availH = canvasEl.clientHeight - 96;
        if (availW > 0 && availH > 0) {
          const fitZoom = Math.min(availW / loaded.displayWidth, availH / loaded.displayHeight, 1);
          setZoom(Math.max(0.25, parseFloat(fitZoom.toFixed(2))));
        }
      }
    });

    // Extract fonts from PDF template
    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const formData = new FormData();
        formData.append('template', file);
        const response = await apiFetch('/api/extract-fonts', {
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

  const loadFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    try {
      await loadTemplateFile(file);
    } catch (error) {
      setStatus(`Failed to load template: ${error?.message || error}`);
    } finally {
      event.target.value = '';
    }
  };

  const restoreTemplateFromLayoutState = async (layoutState) => {
    const asset = layoutState && typeof layoutState === 'object' ? layoutState.template_asset : null;
    if (!asset || typeof asset !== 'object' || !asset.data_url) {
      return null;
    }

    const restoredFile = dataUrlToFile(
      asset.data_url,
      asset.file_name || 'template.bin',
      asset.file_type || 'application/octet-stream'
    );
    const restoredTemplate = await loadTemplate(restoredFile, pageSize);
    setTemplate(restoredTemplate);
    setTemplateFile(restoredFile);
    setTemplateFileDataUrl(asset.data_url);
    return restoredTemplate;
  };

  const getPointFromEvent = (event) => {
    const rect = layerRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };

  const commitFieldDraft = (fieldName) => {
    const resolvedName = String(fieldName ?? '').trim();
    if (!resolvedName) {
      return;
    }

    const hasDraft = editingDraftRef.current.name === resolvedName;
    const textValue = hasDraft
      ? editingDraftRef.current.text ?? ''
      : sampleValues[resolvedName] ?? '';
    // normalizeEditorHtml strips Chrome-inserted <div> block wrappers that
    // execCommand (bold/font) produces when run inside a flex contentEditable.
    const htmlValue = sanitizeHtml(
      normalizeEditorHtml(
        hasDraft
          ? editingDraftRef.current.html ?? plainTextToHtml(textValue)
          : sampleHtmlValues[resolvedName] ?? plainTextToHtml(textValue)
      )
    );

    setSampleValues((prev) => {
      if (prev[resolvedName] === textValue) {
        return prev;
      }
      return {
        ...prev,
        [resolvedName]: textValue,
      };
    });
    setSampleHtmlValues((prev) => {
      if (prev[resolvedName] === htmlValue) {
        return prev;
      }
      return {
        ...prev,
        [resolvedName]: htmlValue,
      };
    });

    if (hasDraft) {
      editingDraftRef.current = {
        name: resolvedName,
        html: htmlValue,
        text: textValue,
      };
    }
  };

  const commitActiveEditingDraft = () => {
    if (!isEditingText) {
      return;
    }
    const draftName = editingDraftRef.current.name;
    if (draftName) {
      commitFieldDraft(draftName);
      return;
    }
    if (activeField?.name) {
      commitFieldDraft(activeField.name);
    }
  };

  const beginDraw = (event) => {
    if (!template || interaction) {
      return;
    }
    
    // Check if click is on a field box - if not, deselect active field
    const isFieldBox = event.target.closest('.field-box');
    if (!isFieldBox) {
      commitActiveEditingDraft();
      setIsEditingText(false);
      setActiveFieldId(null);
      setActiveImageId(null);
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

  const beginMove = (event, targetId, targetType = 'field') => {
    event.preventDefault();
    event.stopPropagation();
    
    const point = getPointFromEvent(event);
    const target = targetType === 'image'
      ? imageItems.find((item) => item.id === targetId)
      : fields.find((item) => item.id === targetId);
    if (!target) {
      return;
    }
    commitActiveEditingDraft();
    // Capture state before the drag so we can push a single undo entry on drop.
    preDragSnapshotRef.current = buildHistorySnapshot();
    isApplyingHistoryRef.current = true;
    if (targetType === 'image') {
      setActiveImageId(targetId);
      setActiveFieldId(null);
    } else {
      setActiveFieldId(targetId);
      setActiveImageId(null);
    }
    setIsEditingText(false);
    setInteraction({ mode: 'move', targetType, targetId, startX: point.x, startY: point.y, initial: target });
  };

  const beginResize = (event, targetId, direction, targetType = 'field') => {
    event.preventDefault();
    event.stopPropagation();
    const point = getPointFromEvent(event);
    const target = targetType === 'image'
      ? imageItems.find((item) => item.id === targetId)
      : fields.find((item) => item.id === targetId);
    if (!target) {
      return;
    }
    commitActiveEditingDraft();
    // Capture state before the resize so we can push a single undo entry on release.
    preDragSnapshotRef.current = buildHistorySnapshot();
    isApplyingHistoryRef.current = true;
    setIsEditingText(false);
    if (targetType === 'image') {
      setActiveImageId(targetId);
      setActiveFieldId(null);
    } else {
      setActiveFieldId(targetId);
      setActiveImageId(null);
    }
    setInteraction({ mode: 'resize', targetType, targetId, startX: point.x, startY: point.y, initial: target, direction });
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

  const cacheSelectionRangeFromEditor = () => {
    const editorEl = getActiveEditorEl();
    const selection = window.getSelection();
    if (!editorEl || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }
    if (!selectionInsideEditor(editorEl, selection)) {
      return;
    }
    lastSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  const applyFontFamilyToSelection = (editorEl, range, fontToken) => {
    if (!editorEl || !range || range.collapsed) {
      return false;
    }
    const token = String(fontToken ?? '').trim();
    if (!token) {
      return false;
    }

    const cssFont = resolveFontTokenToCss(token);
    const wrapper = document.createElement('span');
    wrapper.style.fontFamily = cssFont.family || token;
    if (cssFont.weight) {
      wrapper.style.fontWeight = cssFont.weight;
    }
    if (cssFont.style) {
      wrapper.style.fontStyle = cssFont.style;
    }

    try {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);

      const selection = window.getSelection();
      if (selection) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(wrapper);
        selection.removeAllRanges();
        selection.addRange(nextRange);
        lastSelectionRangeRef.current = nextRange.cloneRange();
      }
      return true;
    } catch (error) {
      return false;
    }
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

    const htmlBeforeCommand = editorEl.innerHTML;
    let didApply = false;

    if (command === 'fontName' && typeof value === 'string' && value.trim()) {
      didApply = applyFontFamilyToSelection(
        editorEl,
        selectionAfterRestore.getRangeAt(0),
        value
      );
    } else {
      try {
        document.execCommand('styleWithCSS', false, true);
      } catch (error) {
        // no-op
      }
      didApply = document.execCommand(command, false, value);
      if (!didApply && editorEl.innerHTML !== htmlBeforeCommand) {
        didApply = true;
      }
    }
    if (!didApply) {
      return false;
    }

    // Normalize Chrome-inserted <div> block wrappers produced by execCommand
    // on a flex contentEditable (they break layout when rendered outside editing).
    const normalizedHtml = normalizeEditorHtml(editorEl.innerHTML);
    if (normalizedHtml !== editorEl.innerHTML) {
      // Restore selection after patching innerHTML, then re-save it.
      const sel = window.getSelection();
      const rangeToRestore = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
      editorEl.innerHTML = normalizedHtml;
      if (rangeToRestore) {
        try {
          const newSel = window.getSelection();
          if (newSel) { newSel.removeAllRanges(); newSel.addRange(rangeToRestore); }
        } catch (_) { /* best-effort */ }
      }
    }

    editingDraftRef.current = {
      name: activeField.name,
      html: normalizedHtml,
      text: editorEl.innerText,
    };
    const selectionAfterCommand = window.getSelection();
    if (selectionAfterCommand && selectionAfterCommand.rangeCount > 0) {
      lastSelectionRangeRef.current = selectionAfterCommand.getRangeAt(0).cloneRange();
    }

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
          // When a font is applied inline to selected text, also persist the font
          // choice on the field itself so the toolbar reflects the change and
          // subsequent whole-field style updates (bold, size, …) don't revert it.
          if (command === 'fontName' && fieldPatch?.font) {
            updateField(activeField.id, { font: fieldPatch.font });
          }
          return;
        }
      }

      if (requireSelection && selectionMessage) {
        setStatus(selectionMessage);
        return;
      }

      applyWholeFieldStyle(fieldPatch);
      return;
    }

    applyWholeFieldStyle(fieldPatch);
  };

  const isTypingSurface = (target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
      return true;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const typingSurface = isTypingSurface(target);
      const modKey = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape' && isEditingText) {
        event.preventDefault();
        commitActiveEditingDraft();
        lastSelectionRangeRef.current = null;
        setIsEditingText(false);
        return;
      }

      if (modKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const wantsUndo = key === 'z' && !event.shiftKey;
        const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey);
        if (wantsUndo || wantsRedo) {
          if (typingSurface) {
            return;
          }
          event.preventDefault();
          const didApply = wantsUndo ? performUndo() : performRedo();
          if (!didApply) {
            setStatus(wantsUndo ? 'Nothing to undo.' : 'Nothing to redo.');
          }
          return;
        }
        if (key === 'b') {
          if (activeField) {
            event.preventDefault();
            handleInlineStyleClick('bold', 'bold');
          }
          return;
        }
        if (key === 'i') {
          if (activeField) {
            event.preventDefault();
            handleInlineStyleClick('italic', 'italic');
          }
          return;
        }
        if (key === 'u') {
          const editorEl = getActiveEditorEl();
          if (activeField && editorEl && (isEditingText || editorEl.isContentEditable)) {
            event.preventDefault();
            applyInlineCommandOrFieldUpdate({
              command: 'underline',
              fieldPatch: {},
              requireSelection: true,
              selectionMessage: 'Select text in the field to underline.',
            });
          }
          return;
        }
      }

      if (typingSurface) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingText) {
        if (activeFieldId) {
          event.preventDefault();
          deleteField(activeFieldId);
          return;
        }
        if (activeImageId) {
          event.preventDefault();
          deleteImage(activeImageId);
        }
        return;
      }

      if (isEditingText) {
        return;
      }

      const keyStep = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case 'ArrowLeft':
          dx = -keyStep;
          break;
        case 'ArrowRight':
          dx = keyStep;
          break;
        case 'ArrowUp':
          dy = -keyStep;
          break;
        case 'ArrowDown':
          dy = keyStep;
          break;
        default:
          return;
      }

      if (activeFieldId && activeField) {
        event.preventDefault();
        updateField(activeFieldId, {
          x: activeField.x + dx,
          y: activeField.y + dy,
        });
        return;
      }
      if (activeImageId && activeImage) {
        event.preventDefault();
        updateImage(activeImageId, {
          x: activeImage.x + dx,
          y: activeImage.y + dy,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isEditingText,
    activeField,
    activeImage,
    activeFieldId,
    activeImageId,
    performUndo,
    performRedo,
    applyInlineCommandOrFieldUpdate,
    handleInlineStyleClick,
  ]);

  const normalizeFontMatch = (fontName) => {
    if (!fontName) {
      return '';
    }
    const cleaned = String(fontName)
      .split(',')[0]
      .replace(/^['"]+|['"]+$/g, '')
      .trim();
    if (!cleaned) {
      return '';
    }
    const directMatch = [...availableFontValues].find((value) => value === cleaned);
    if (directMatch) {
      return directMatch;
    }
    const insensitive = [...availableFontValues].find(
      (value) => value.toLowerCase() === cleaned.toLowerCase()
    );
    return insensitive || '';
  };

  const updateActiveEditorFont = () => {
    if (!isEditingText || !activeField) {
      setActiveEditorFont('');
      return;
    }
    const editorEl = getActiveEditorEl();
    if (!editorEl || !editorEl.isContentEditable) {
      setActiveEditorFont('');
      return;
    }

    const selection = window.getSelection();
    const inEditor =
      !!selection && selection.rangeCount > 0 && selectionInsideEditor(editorEl, selection);
    if (!inEditor) {
      setActiveEditorFont('');
      return;
    }

    const commandFont = normalizeFontMatch(document.queryCommandValue('fontName'));
    setActiveEditorFont(commandFont || '');
  };

  useEffect(() => {
    if (!isEditingText || !activeField) {
      setActiveEditorFont('');
      return;
    }

    const handleSelectionOrKey = () => updateActiveEditorFont();
    document.addEventListener('selectionchange', handleSelectionOrKey);
    document.addEventListener('keyup', handleSelectionOrKey);
    setTimeout(updateActiveEditorFont, 0);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionOrKey);
      document.removeEventListener('keyup', handleSelectionOrKey);
    };
  }, [isEditingText, activeFieldId, availableFontValues]);

  const displayedFontValue =
    fontHoverFamily ||
    (isEditingText && activeEditorFont ? activeEditorFont : activeField?.font || 'Helvetica');
  const displayedSizeValue =
    sizeHoverValue ?? Number(activeField?.size ?? 18);
  const displayedColorValue =
    colorHoverValue || (activeField ? colorArrayToHex(activeField.color) : '#000000');
  const activeFieldIsCsvMapped =
    !!activeField && useCsv && Boolean(fieldMappings[activeField.name]);

  const moveDraw = (event) => {
    if (!template) {
      return;
    }

    if (interaction) {
      const point = getPointFromEvent(event);
      const dx = point.x - interaction.startX;
      const dy = point.y - interaction.startY;
      if (interaction.mode === 'move') {
        // Ignore micro-movements so a plain click doesn't accidentally nudge the field
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        const newX = interaction.initial.x + dx;
        const newY = interaction.initial.y + dy;

        if (interaction.targetType === 'image') {
          updateImage(interaction.targetId, {
            x: newX,
            y: newY,
          });
          setAlignmentGuides([]);
          return;
        }

        updateField(interaction.targetId, {
          x: newX,
          y: newY,
        });
        
        // Calculate alignment guides
        const guides = [];
        const threshold = 5; // pixels
        const movingField = fields.find(f => f.id === interaction.targetId);
        
        if (movingField) {
          const movingCenterX = newX + movingField.w / 2;
          const movingCenterY = newY + movingField.h / 2;
          const movingLeft = newX;
          const movingRight = newX + movingField.w;
          const movingTop = newY;
          const movingBottom = newY + movingField.h;
          
          fields.forEach(field => {
            if (field.id === interaction.targetId) return;
            
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
        
        if (interaction.targetType === 'image') {
          updateImage(interaction.targetId, newBox);
        } else {
          updateField(interaction.targetId, newBox);
        }
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
      // Commit the move/resize as a single undo entry.
      const preDrag = preDragSnapshotRef.current;
      if (preDrag) {
        const postDragSig = JSON.stringify(buildHistorySnapshot());
        if (JSON.stringify(preDrag) !== postDragSig) {
          undoStackRef.current.push(preDrag);
          if (undoStackRef.current.length > MAX_HISTORY_STEPS) undoStackRef.current.shift();
          redoStackRef.current = [];
        }
        preDragSnapshotRef.current = null;
      }
      // Resume normal history tracking after React has flushed the final state.
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
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

  useEffect(() => {
    if (!interaction && !isDrawing) {
      return;
    }

    const handleGlobalMove = (event) => {
      if (!layerRef.current) {
        return;
      }
      moveDraw(event);
    };

    const handleGlobalUp = () => {
      endDraw();
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [interaction, isDrawing, moveDraw, endDraw]);

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

  const updateImage = (id, patch) => {
    if (!template) {
      return;
    }
    setImageItems((prev) =>
      prev.map((image) => {
        if (image.id !== id) {
          return image;
        }
        return clampBox({ ...image, ...patch }, template.displayWidth, template.displayHeight);
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

  const deleteImage = (id) => {
    setImageItems((prev) => prev.filter((image) => image.id !== id));
    if (activeImageId === id) {
      setActiveImageId(null);
    }
  };

  const exportJson = () => {
    const payload = buildPayload(false);
    if (!payload) {
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFieldsName?.trim() || 'fields.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildProjectSaveBundle = () => {
    const payload = buildPayload(true);
    if (!payload) {
      setStatus('Load a template and create fields first.');
      return null;
    }

    const filename = normalizeProjectFilename(saveFieldsName);
    return {
      filename,
      serialized: JSON.stringify(payload, null, 2),
    };
  };

  const downloadProjectFallback = (serialized, filename, statusMessage = 'Saved project file to Downloads (browser fallback).') => {
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(statusMessage);
  };

  const persistProjectFileHandle = async (fileHandle) => {
    setProjectFileHandle(fileHandle);
    try {
      await setStoredProjectFileHandle(fileHandle);
    } catch (error) {
      console.warn('Unable to persist project file handle:', error);
    }
  };

  const clearPersistedProjectFileHandle = async () => {
    setProjectFileHandle(null);
    try {
      await clearStoredProjectFileHandle();
    } catch (error) {
      console.warn('Unable to clear stored project file handle:', error);
    }
  };

  const writeProjectToHandle = async (fileHandle, serialized, fallbackFilename) => {
    try {
      if (!fileHandle) {
        setStatus('No project file is selected. Use Save Project As... first.');
        return false;
      }
      const writable = await fileHandle.createWritable();
      await writable.write(serialized);
      await writable.close();

       if (typeof fileHandle.getFile === 'function' && serialized.length > 0) {
        const savedFile = await fileHandle.getFile();
        if (savedFile && savedFile.size === 0) {
          setStatus('Project save produced an empty file. A download fallback will be used.');
          return false;
        }
      }

      await persistProjectFileHandle(fileHandle);
      setStatus(`Saved project to ${fileHandle.name || fallbackFilename}.`);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Save cancelled.');
        return false;
      }
      if (error?.name === 'NotFoundError') {
        await clearPersistedProjectFileHandle();
        setStatus('The previous project file is no longer available. Choose Save Project As... to pick a new location.');
        return false;
      }
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        setStatus('Write access was denied. Try Save Project As... and choose a writable location.');
        return false;
      }
      throw error;
    }
  };

  const saveProjectAsToFile = async (bundleOverride = null) => {
    const isBundleObject =
      bundleOverride &&
      typeof bundleOverride === 'object' &&
      typeof bundleOverride.filename === 'string' &&
      typeof bundleOverride.serialized === 'string';
    const bundle = isBundleObject ? bundleOverride : buildProjectSaveBundle();
    if (!bundle) {
      return;
    }
    const { filename, serialized } = bundle;

    try {
      if (canUseSavePicker()) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'JSON project file',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const didSave = await writeProjectToHandle(fileHandle, serialized, filename);
        if (!didSave) {
          downloadProjectFallback(
            serialized,
            filename,
            'Direct file save failed. Downloaded a project file fallback.'
          );
          return;
        }
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Save cancelled.');
        return;
      }
      setStatus(`Save picker failed (${error?.message || error}). Downloaded file instead.`);
    }

    downloadProjectFallback(serialized, filename);
  };

  const saveProjectToFile = async () => {
    const bundle = buildProjectSaveBundle();
    if (!bundle) {
      return;
    }
    const { filename, serialized } = bundle;

    if (!canUseSavePicker()) {
      downloadProjectFallback(
        serialized,
        filename,
        'Browser does not support direct file save. Downloaded project file instead.'
      );
      return;
    }

    if (!projectFileHandle) {
      await saveProjectAsToFile(bundle);
      return;
    }

    try {
      const didSave = await writeProjectToHandle(projectFileHandle, serialized, filename);
      if (!didSave) {
        downloadProjectFallback(
          serialized,
          filename,
          'Direct save failed. Downloaded a project file fallback. Use Save Project As... to re-link the target file.'
        );
        return;
      }
    } catch (error) {
      setStatus(`Failed to save project (${error?.message || error}).`);
    }
  };

  const saveToBackend = async (includeTemplateAsset) => {
    const payload = buildPayload(includeTemplateAsset);
    if (!payload) {
      setStatus('Load a template and create fields first.');
      return;
    }

    const targetName = saveFieldsName?.trim() || 'fields.json';

    const response = await apiFetch(`/api/fields?name=${encodeURIComponent(targetName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setStatus(`Failed to save ${targetName} to backend.`);
      return;
    }
    setStatus(
      includeTemplateAsset
        ? `Saved project ${targetName} (template + layout) on backend.`
        : `Saved layout ${targetName} (without template) on backend.`
    );
    refreshFieldsList();
  };

  const loadFromBackend = async () => {
    const targetName = selectedFieldsName?.trim() || 'fields.json';
    if (!selectedFieldsName?.trim()) {
      setStatus('Select a backend fields file first.');
      return;
    }

    const response = await apiFetch(`/api/fields?name=${encodeURIComponent(targetName)}`);
    if (!response.ok) {
      setStatus(`Failed to load backend ${targetName}.`);
      return;
    }
    const payload = await response.json();
    let templateForLayout = template;
    try {
      const restoredTemplate = await restoreTemplateFromLayoutState(payload.layout_state);
      if (restoredTemplate) {
        templateForLayout = restoredTemplate;
      }
    } catch (error) {
      setStatus(`Failed to restore template from ${targetName}: ${error?.message || error}`);
      return;
    }

    if (!templateForLayout) {
      setStatus(`No template is currently loaded and ${targetName} does not include an embedded template.`);
      return;
    }

    const next = payloadToLayout(payload, templateForLayout);
    setFields(next.fields);
    setImageItems(next.images);
    setActiveFieldId(next.fields[0]?.id ?? null);
    setActiveImageId(null);
    if (next.layoutState) {
      setSampleValues(next.layoutState.sample_values && typeof next.layoutState.sample_values === 'object' ? next.layoutState.sample_values : {});
      setSampleHtmlValues(next.layoutState.sample_html_values && typeof next.layoutState.sample_html_values === 'object' ? next.layoutState.sample_html_values : {});
      setFieldMappings(next.layoutState.field_mappings && typeof next.layoutState.field_mappings === 'object' ? next.layoutState.field_mappings : {});
      setUseCsv(Boolean(next.layoutState.use_csv));
      if (next.layoutState.generate_options && typeof next.layoutState.generate_options === 'object') {
        setGenerateOptions((prev) => ({ ...prev, ...next.layoutState.generate_options }));
      }
    } else {
      setSampleValues({});
      setSampleHtmlValues({});
      setFieldMappings({});
      setUseCsv(false);
    }
    const loadedWithCsvMode = Boolean(next.layoutState?.use_csv);
    if (loadedWithCsvMode && !csvFile) {
      setStatus(`Loaded ${targetName} from backend. This layout uses CSV mode—upload a CSV file before generating, or turn off Use CSV.`);
    } else {
      setStatus(`Loaded ${targetName} from backend.`);
    }
  };

  const loadProjectFile = async (file) => {
    try {
      const text = await file.text();
      const raw = String(text ?? '');
      const trimmed = raw.trim();
      if (!trimmed) {
        setStatus(`Failed to load ${file.name}: file is empty. Save the project again, then re-import.`);
        return;
      }
      if (trimmed === 'undefined') {
        setStatus(
          `Failed to load ${file.name}: file contains "undefined" (invalid JSON). Save again using Project -> Save Project As..., then import that file.`
        );
        return;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch (parseError) {
        setStatus(`Failed to load ${file.name}: invalid JSON (${parseError?.message || parseError}).`);
        return;
      }
      let templateForLayout = template;
      try {
        const restoredTemplate = await restoreTemplateFromLayoutState(payload.layout_state);
        if (restoredTemplate) {
          templateForLayout = restoredTemplate;
        }
      } catch (error) {
        setStatus(`Failed to restore template from ${file.name}: ${error?.message || error}`);
        return;
      }

      if (!templateForLayout) {
        setStatus(`No template is currently loaded and ${file.name} does not include an embedded template.`);
        return;
      }

      const next = payloadToLayout(payload, templateForLayout);
      setFields(next.fields);
      setImageItems(next.images);
      setActiveFieldId(next.fields[0]?.id ?? null);
      setActiveImageId(null);
      if (next.layoutState) {
        setSampleValues(next.layoutState.sample_values && typeof next.layoutState.sample_values === 'object' ? next.layoutState.sample_values : {});
        setSampleHtmlValues(next.layoutState.sample_html_values && typeof next.layoutState.sample_html_values === 'object' ? next.layoutState.sample_html_values : {});
        setFieldMappings(next.layoutState.field_mappings && typeof next.layoutState.field_mappings === 'object' ? next.layoutState.field_mappings : {});
        setUseCsv(Boolean(next.layoutState.use_csv));
        if (next.layoutState.generate_options && typeof next.layoutState.generate_options === 'object') {
          setGenerateOptions((prev) => ({ ...prev, ...next.layoutState.generate_options }));
        }
      } else {
        setSampleValues({});
        setSampleHtmlValues({});
        setFieldMappings({});
        setUseCsv(false);
      }
      const loadedWithCsvMode = Boolean(next.layoutState?.use_csv);
      if (loadedWithCsvMode && !csvFile) {
        setStatus(`Loaded ${file.name} from disk. This layout uses CSV mode—upload a CSV file before generating, or turn off Use CSV.`);
      } else {
        setStatus(`Loaded ${file.name} from disk.`);
      }
    } catch (error) {
      setStatus(`Failed to load file: ${error}`);
    }
  };

  const loadFromFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    try {
      await loadProjectFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const handleWorkspaceBrowseFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isProjectFile = extension === 'json' || extension === 'certproj';
    try {
      if (isProjectFile) {
        await loadProjectFile(file);
      } else {
        await loadTemplateFile(file);
      }
    } catch (error) {
      setStatus(`Failed to load ${file.name}: ${error?.message || error}`);
    } finally {
      event.target.value = '';
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
    if (isGenerating) {
      return;
    }

    try {
      setIsGenerating(true);
      setStatus('Generating...');

      if (!templateFile) {
        setStatus('Upload a template first.');
        return;
      }
      const fieldsPayload = buildPayload(false);
      if (!fieldsPayload) {
        setStatus('Create fields before generating a PDF.');
        return;
      }
      if (useCsv && !csvFile) {
        setPanelState((prev) => ({ ...prev, dataSource: true }));
        setStatus('This layout is in CSV mode. Upload a CSV file in Data source, or turn off Use CSV, then generate again.');
        return;
      }

      const payload = {
        ...generateOptions,
        row: Number(generateOptions.row) || 0,
        dx: 0,
        dy: 0,
        grid_step: 0,
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
      formData.append('placeholder_mode', String(false));
      formData.append('overlay_only', String(payload.overlay_only));

      if (useCsv) {
        formData.append('csv_file', csvFile);

        const cleanedMappings = {};
        Object.entries(fieldMappings).forEach(([fieldName, csvColumn]) => {
          if (csvColumn) {
            cleanedMappings[fieldName] = csvColumn;
          }
        });
        formData.append('field_mappings_json', JSON.stringify(cleanedMappings));

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
        formData.append('batch', String(generateOptions.generate_all));
      } else {
        formData.append('data_json', JSON.stringify(buildDataPayload()));
      }

      let response;
      try {
        response = await apiFetch('/api/generate-file-upload', {
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

      if (useCsv && generateOptions.generate_all && isZipResponse) {
        const zipBlob = new Blob([buffer], { type: 'application/zip' });
        const zipUrl = URL.createObjectURL(zipBlob);
        const filename = getFilenameFromContentDisposition(contentDisposition, 'certificates.zip');
        if (latestDownload?.url) {
          URL.revokeObjectURL(latestDownload.url);
        }
        setLatestDownload({ url: zipUrl, filename, kind: 'zip' });

        // Extract the first PDF from the ZIP and render it as preview
        let certCount = 0;
        try {
          const zip = await JSZip.loadAsync(buffer);
          const pdfFiles = Object.values(zip.files).filter(
            (f) => !f.dir && f.name.toLowerCase().endsWith('.pdf')
          );
          certCount = pdfFiles.length;
          if (pdfFiles.length > 0) {
            const firstPdfBuffer = await pdfFiles[0].async('arraybuffer');
            const firstBlob = new Blob([firstPdfBuffer], { type: 'application/pdf' });
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(firstBlob));
            setPanelState((prev) => ({ ...prev, preview: true }));
          }
        } catch (zipErr) {
          console.warn('Could not extract preview from ZIP:', zipErr);
        }

        const countLabel = certCount > 0 ? `${certCount} certificates` : 'certificates';
        setStatus(`Generated ${countLabel}. Click Download to save the ZIP.`);
        return;
      }

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
    } catch (error) {
      setStatus(`Generation failed unexpectedly: ${error?.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadLatestFile = () => {
    if (!latestDownload?.url) {
      setStatus('Generate a file first, then download.');
      return;
    }
    if (latestDownload.kind === 'zip') {
      // Prompt user for the ZIP folder name before downloading
      const suggested = (latestDownload.filename || 'certificates.zip').replace(/\.zip$/i, '');
      setZipNameModal({ open: true, suggestedName: suggested });
      return;
    }
    const a = document.createElement('a');
    a.href = latestDownload.url;
    a.download = latestDownload.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Downloaded the latest generated certificate.');
  };

  const confirmZipDownload = async (chosenName) => {
    setZipNameModal({ open: false, suggestedName: chosenName });
    if (!latestDownload?.url) return;

    const finalName = `${chosenName.trim() || 'certificates'}.zip`;

    // Prefer the File System Access API so the user can pick a folder/location
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: finalName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
        const response = await fetch(latestDownload.url);
        const blob = await response.blob();
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(`ZIP saved as "${fileHandle.name}".`);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // user cancelled picker
        console.warn('showSaveFilePicker failed, falling back to anchor download:', err);
      }
    }

    // Fallback: standard anchor download with the custom filename
    const a = document.createElement('a');
    a.href = latestDownload.url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(`Downloaded ZIP as "${finalName}".`);
  };

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f0e0d', color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
        Loading…
      </div>
    );
  }
  if (!session) return <Auth />;

  return (
    <div className="app-shell">
      {/* ── TOP BAR ── */}
      <div className="topbar">
        <div className="logo">
          <div className="logo-mark">CS</div>
          <div className="logo-name">Cert<span>Studio</span></div>
        </div>
        <div className="topbar-divider" />

        <div className="topbar-menu">
          {/* FILE menu */}
          <div className="nav-menu-item">
            <button
              type="button"
              className={`menu-btn ${insertMenuOpen ? 'open' : ''}`}
              onClick={() => { setInsertMenuOpen(!insertMenuOpen); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/></svg>
              File
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {insertMenuOpen && (
              <div className="nav-dropdown nav-dropdown--wide">
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Open</div>
                  <label className="nav-dropdown-item nav-dropdown-item--file">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="3" width="14" height="11" rx="1.5"/><path d="M1 6h14M5 1l-2 2M11 1l2 2"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Open template…</span>
                      <span className="nav-item-hint">PDF, JPG, or PNG — resets canvas</span>
                    </span>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { if (fields.length > 0 || imageItems.length > 0) { if (!window.confirm('Opening a new template will clear all current fields and images. Continue?')) { event.target.value = ''; return; } } loadFile(event); setInsertMenuOpen(false); }} />
                  </label>
                  <label className="nav-dropdown-item nav-dropdown-item--file">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 1v9M4 6l4 4 4-4"/><path d="M1 12v2a1 1 0 001 1h12a1 1 0 001-1v-2"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Open project…</span>
                      <span className="nav-item-hint">Load saved .json or .certproj work</span>
                    </span>
                    <input type="file" accept=".json,.certproj" onChange={(event) => { loadFromFile(event); setInsertMenuOpen(false); }} />
                  </label>
                </div>
                <div className="nav-dropdown-divider" />
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Save</div>
                  <button type="button" className="nav-dropdown-item" onClick={() => { saveProjectToFile(); setInsertMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 14H3a1 1 0 01-1-1V3a1 1 0 011-1h7.5L14 5.5V13a1 1 0 01-1 1z"/><rect x="5" y="9" width="6" height="5"/><rect x="4" y="1" width="6" height="4"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Save project</span>
                      <span className="nav-item-hint">{projectFileHandle?.name ? `Overwrite ${projectFileHandle.name}` : 'Save template + layout'}</span>
                    </span>
                    <span className="nav-item-shortcut">Ctrl+S</span>
                  </button>
                  <button type="button" className="nav-dropdown-item" onClick={() => { saveProjectAsToFile(); setInsertMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 14H3a1 1 0 01-1-1V3a1 1 0 011-1h7.5L14 5.5V13a1 1 0 01-1 1z"/><path d="M9 1v4M11 3H7"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Save project as…</span>
                      <span className="nav-item-hint">Choose another file location</span>
                    </span>
                    <span className="nav-item-shortcut">Ctrl+Shift+S</span>
                  </button>
                </div>
                <div className="nav-dropdown-divider" />
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Insert</div>
                  <label className="nav-dropdown-item nav-dropdown-item--file">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M2 10.5l3.5-3.5 3 3 2-2 3.5 3.5"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Place image / signature…</span>
                      <span className="nav-item-hint">Draggable image overlay</span>
                    </span>
                    <input type="file" accept="image/*" onChange={(event) => { importImageElement(event); setInsertMenuOpen(false); }} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* LAYOUTS menu */}
          <div className="nav-menu-item">
            <button
              type="button"
              className={`menu-btn ${layoutsMenuOpen ? 'open' : ''}`}
              onClick={() => { setLayoutsMenuOpen(!layoutsMenuOpen); setInsertMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Layouts
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {layoutsMenuOpen && (
              <div className="nav-dropdown nav-dropdown--wide">
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Layout library (server)</div>
                  <div className="nav-dropdown-inline-row">
                    <select value={selectedFieldsName} onChange={(event) => setSelectedFieldsName(event.target.value)} className="nav-dropdown-select">
                      <option value="">Select saved layout…</option>
                      {fieldsList.map((name) => (<option key={name} value={name}>{name}</option>))}
                    </select>
                    <button type="button" className="nav-inline-btn" onClick={loadFromBackend} disabled={!selectedFieldsName}>Load</button>
                    <button type="button" className="nav-inline-btn" onClick={() => saveToBackend(false)} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>Save</button>
                    <button type="button" className="nav-inline-btn nav-inline-btn--icon" onClick={refreshFieldsList} data-tip="Refresh">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.7 8A5.7 5.7 0 112.3 5.3"/><path d="M2 2v3.3h3.3"/></svg>
                    </button>
                  </div>
                </div>
                <div className="nav-dropdown-divider" />
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Local files</div>
                  <label className="nav-dropdown-item nav-dropdown-item--file">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 1v9M4 6l4 4 4-4"/><path d="M1 12v2a1 1 0 001 1h12a1 1 0 001-1v-2"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Import layout / project…</span>
                      <span className="nav-item-hint">Load a local .json or .certproj file</span>
                    </span>
                    <input type="file" accept=".json,.certproj" onChange={(event) => { loadFromFile(event); setLayoutsMenuOpen(false); }} />
                  </label>
                  <div className="nav-dropdown-inline-row">
                    <input className="nav-dropdown-input" value={saveFieldsName} onChange={(event) => setSaveFieldsName(event.target.value)} placeholder="certificate-project.json" />
                    <button type="button" className="nav-inline-btn" onClick={() => { exportJson(); setLayoutsMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>Export JSON</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="topbar-spacer" />

        <div className="template-status">
          <div className="template-dot" />
          {template?.name ?? 'No template loaded'}
        </div>

        <div className="topbar-actions">
          <button type="button" className="btn-icon" data-tip="Undo (Ctrl+Z)" onClick={performUndo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6M3.51 15A9 9 0 1019.5 6.5L13 13"/></svg>
          </button>
          <button type="button" className="btn-icon" data-tip="Redo (Ctrl+Y)" onClick={performRedo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6M20.49 15A9 9 0 114.5 6.5L11 13"/></svg>
          </button>
          {previewUrl && (
            <button type="button" className="btn-icon" data-tip="Open preview" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          )}
          <div style={{ width: 8 }} />
          <div className="topbar-generate" title={isGenerateActionDisabled ? generateDisabledTooltip : ''}>
            <div className="generate-btn-group">
              <button type="button" className="btn-generate" disabled={isGenerateActionDisabled || isGenerating} onClick={generatePdf}>
                {isGenerating ? (<><span className="generate-spinner" />Generating…</>) : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Generate PDF</>)}
              </button>
              <button type="button" className="btn-generate-arrow" disabled={isGenerateActionDisabled} onClick={() => { setGenerateMenuOpen(!generateMenuOpen); setInsertMenuOpen(false); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </div>
            {generateMenuOpen && (
              <div className="nav-dropdown nav-dropdown--right nav-dropdown--wide">
                <div className="nav-dropdown-section">
                  <div className="nav-dropdown-section-title">Output settings</div>
                  <div className="nav-form-row">
                    <label className="nav-form-label">Output mode</label>
                    <select className="nav-dropdown-select" value={generateOptions.output_mode} onChange={(event) => setGenerateOptions((prev) => ({ ...prev, output_mode: event.target.value }))}>
                      <option value="full_pdf">Full PDF — includes background</option>
                      <option value="overlay_only">Overlay only — no background</option>
                    </select>
                  </div>
                  <div className="nav-form-row">
                    <label className="nav-form-label">Page size</label>
                    <select className="nav-dropdown-select" value={generateOptions.page_size} onChange={(event) => setGenerateOptions((prev) => ({ ...prev, page_size: event.target.value }))}>
                      <option value="letter">Letter (8.5 × 11 in)</option>
                      <option value="a4">A4 (210 × 297 mm)</option>
                      <option value="legal">Legal (8.5 × 14 in)</option>
                    </select>
                  </div>
                </div>
                {useCsv && csvFile && (
                  <>
                    <div className="nav-dropdown-divider" />
                    <div className="nav-dropdown-section">
                      <div className="nav-dropdown-section-title">CSV batch</div>
                      <label className="nav-dropdown-item nav-dropdown-item--check">
                        <input type="checkbox" checked={generateOptions.generate_all} onChange={(event) => setGenerateOptions((prev) => ({ ...prev, generate_all: event.target.checked }))} />
                        <span className="nav-item-text">
                          <span className="nav-item-label">Generate all rows</span>
                          <span className="nav-item-hint">Creates one certificate per CSV row, downloads as ZIP</span>
                        </span>
                      </label>
                    </div>
                  </>
                )}
                {latestDownload?.url && (
                  <>
                    <div className="nav-dropdown-divider" />
                    <div className="nav-dropdown-section">
                      <button type="button" className="nav-dropdown-item nav-dropdown-item--download" onClick={() => { downloadLatestFile(); setGenerateMenuOpen(false); }}>
                        <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 14h12"/></svg></span>
                        <span className="nav-item-text">
                          <span className="nav-item-label">{latestDownload.kind === 'zip' ? 'Download certificates ZIP' : 'Download certificate PDF'}</span>
                          <span className="nav-item-hint">Last generated output</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {/* ── SIGN OUT ── */}
        <div style={{ marginLeft: '8px' }}>
          <button
            type="button"
            className="btn-icon"
            data-tip={`Sign out (${session?.user?.email ?? ''})`}
            onClick={signOut}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        {/* Field name */}
        <div className="tool-group">
          <input
            className="font-picker-trigger"
            style={{ minWidth: 120 }}
            value={activeField?.name || ''}
            onChange={(event) => activeField && updateField(activeField.id, { name: event.target.value })}
            placeholder="— field name —"
            disabled={!activeField}
          />
        </div>

        <div className="tool-sep" />

        {/* Font picker */}
        <div className="tool-group" ref={fontPickerRef}>
          <button
            type="button"
            className="font-picker-trigger"
            onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
            onClick={() => { setFontPickerOpen((prev) => !prev); setFontHoverFamily(''); }}
            style={{ fontFamily: resolveFontTokenToCss(displayedFontValue).family || displayedFontValue }}
            title={displayedFontValue}
            disabled={!activeField}
          >
            {displayedFontValue || 'Font'}
          </button>
          {fontPickerOpen && (
            <div className="font-picker-menu" onMouseLeave={() => setFontHoverFamily('')}>
              <div className="font-picker-group-title">ReportLab Built-in Fonts</div>
              {fontPickerGroups.builtIn.map((family) => {
                const cssFont = resolveFontTokenToCss(family.value);
                return (
                  <button
                    key={family.value}
                    type="button"
                    className={`font-picker-option ${displayedFontValue === family.value ? 'active' : ''}`}
                    onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
                    onMouseEnter={() => setFontHoverFamily(family.value)}
                    onClick={() => { setFontHoverFamily(''); setFontPickerOpen(false); applyInlineCommandOrFieldUpdate({ command: 'fontName', value: family.value, fieldPatch: { font: family.value }, requireSelection: false }); setActiveEditorFont(family.value); }}
                    title={family.label}
                    style={{ fontFamily: cssFont.family || family.value, fontWeight: cssFont.weight || 'normal', fontStyle: cssFont.style || 'normal' }}
                  >
                    {family.label}
                  </button>
                );
              })}
              {fontPickerGroups.custom.length > 0 && (
                <>
                  <div className="font-picker-group-title">Custom Fonts</div>
                  {fontPickerGroups.custom.map((font) => (
                    <button
                      key={font.name}
                      type="button"
                      className={`font-picker-option ${displayedFontValue === font.name ? 'active' : ''}`}
                      onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
                      onMouseEnter={() => setFontHoverFamily(font.name)}
                      onClick={() => { setFontHoverFamily(''); setFontPickerOpen(false); applyInlineCommandOrFieldUpdate({ command: 'fontName', value: font.name, fieldPatch: { font: font.name }, requireSelection: false }); setActiveEditorFont(font.name); }}
                      title={font.name}
                      style={{ fontFamily: resolveFontTokenToCss(font.name).family || font.name }}
                    >
                      {font.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Size */}
        <div className="tool-group" ref={sizePickerRef}>
          <input
            className="size-input"
            type="number"
            value={displayedSizeValue}
            onChange={(event) => activeField && updateField(activeField.id, { size: Number(event.target.value) })}
            disabled={!activeField}
          />
          <button
            type="button"
            className="font-picker-trigger size-trigger"
            onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
            onClick={() => { setSizePickerOpen((prev) => !prev); setSizeHoverValue(null); }}
            disabled={!activeField}
          >▾</button>
          {sizePickerOpen && (
            <div className="font-picker-menu size-picker-menu" onMouseLeave={() => setSizeHoverValue(null)}>
              <div className="font-picker-group-title">Quick Sizes</div>
              {COMMON_FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`font-picker-option ${Number(activeField?.size) === size ? 'active' : ''}`}
                  onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
                  onMouseEnter={() => setSizeHoverValue(size)}
                  onClick={() => { setSizeHoverValue(null); setSizePickerOpen(false); if (activeField) updateField(activeField.id, { size }); }}
                >
                  {size} pt
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tool-sep" />

        {/* Bold / Italic */}
        <div className="tool-group"
          onMouseDownCapture={() => { cacheSelectionRangeFromEditor(); toolbarInteractionRef.current = true; window.setTimeout(() => { toolbarInteractionRef.current = false; }, 0); }}
        >
          <button data-tip="Bold" type="button" className={`tool-btn ${activeField?.bold ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('bold', 'bold')} style={{ fontWeight: 700 }}>B</button>
          <button data-tip="Italic" type="button" className={`tool-btn ${activeField?.italic ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('italic', 'italic')} style={{ fontStyle: 'italic' }}>I</button>
        </div>

        <div className="tool-sep" />

        {/* Alignment */}
        <div className="tool-group">
          <button type="button" data-tip="Align left" className={`tool-btn ${activeField?.align === 'left' || !activeField?.align ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'left' })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
          </button>
          <button type="button" data-tip="Center" className={`tool-btn ${activeField?.align === 'center' ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'center' })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
          </button>
          <button type="button" data-tip="Align right" className={`tool-btn ${activeField?.align === 'right' ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'right' })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
          </button>
        </div>

        <div className="tool-sep" />

        {/* Color */}
        <div className="tool-group" style={{ position: 'relative' }}>
          <div
            className="toolbar-color-swatch"
            style={{ background: displayedColorValue }}
            data-tip="Text color"
            onClick={() => { setColorPickerOpen((prev) => !prev); setColorHoverValue(''); }}
          />
          {colorPickerOpen && (
            <div className="font-picker-menu color-picker-menu" onMouseLeave={() => setColorHoverValue('')}>
              <div className="font-picker-group-title">Quick Colors</div>
              <div className="color-swatch-grid">
                {QUICK_COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={`color-swatch ${displayedColorValue.toLowerCase() === hex.toLowerCase() ? 'active' : ''}`}
                    style={{ background: hex }}
                    onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
                    onMouseEnter={() => setColorHoverValue(hex)}
                    onClick={() => { setColorHoverValue(''); setColorPickerOpen(false); applyInlineCommandOrFieldUpdate({ command: 'foreColor', value: hex, fieldPatch: { color: hexToColorArray(hex) }, requireSelection: true, selectionMessage: 'Select text to apply color.' }); }}
                    title={hex}
                  />
                ))}
              </div>
              <div style={{ padding: '4px 6px 8px' }}>
                <input
                  type="color"
                  value={displayedColorValue}
                  style={{ width: '100%', height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  onChange={(event) => applyInlineCommandOrFieldUpdate({ command: 'foreColor', value: event.target.value, fieldPatch: { color: hexToColorArray(event.target.value) }, requireSelection: true, selectionMessage: 'Select text to apply color.' })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="tool-sep" />

        {/* Fit / Wrap */}
        <div className="tool-group">
          <button data-tip="Fit to width" type="button" className={`tool-btn ${activeField?.maxWidth ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { maxWidth: !activeField.maxWidth })}>Fit</button>
          <button data-tip="Wrap text" type="button" className={`tool-btn ${activeField?.wrapText ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { wrapText: !activeField.wrapText })}>Wrap</button>
        </div>

        <div className="tool-sep" />

        {/* Page size */}
        <select className="page-select" value={preset} onChange={(event) => setPreset(event.target.value)}>
          {Object.entries(PAGE_PRESETS).map(([value, item]) => (
            <option key={value} value={value}>{item.label}</option>
          ))}
        </select>

        <div className="toolbar-spacer" />

        {/* Zoom */}
        <div className="zoom-group">
          <button data-tip="Zoom out" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.max(0.25, parseFloat((z - 0.1).toFixed(2))))}>−</button>
          <input type="range" min="0.25" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          <button data-tip="Zoom in" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(2))))}>+</button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* ── STATUS NOTIFICATION ── */}
      {statusInfo.text && (
        <div className={`status-notification status-notification--${statusInfo.type}`}>
          {statusInfo.type === 'success' && '✓ '}
          {statusInfo.type === 'error' && '✕ '}
          {statusInfo.type === 'warning' && '⚠ '}
          {statusInfo.text}
        </div>
      )}

      {/* ── APP BODY ── */}
      <div className="app-body">

        {/* LEFT SIDEBAR */}
        <div className="sidebar-left">
          <div className="sidebar-tabs">
            <button className={`stab ${leftTab === 'fields' ? 'active' : ''}`} onClick={() => setLeftTab('fields')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Fields
            </button>
            <button className={`stab ${leftTab === 'images' ? 'active' : ''}`} onClick={() => setLeftTab('images')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Images
            </button>
            <button className={`stab ${leftTab === 'layers' ? 'active' : ''}`} onClick={() => setLeftTab('layers')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              Layers
            </button>
          </div>

          {leftTab === 'fields' && (
            <div className="sidebar-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="tab-count">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
              </div>
              {fields.map((field) => (
                <div
                  key={field.id}
                  className={`field-item ${activeFieldId === field.id ? 'selected' : ''}`}
                  onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); setActiveImageId(null); setActiveFieldId(field.id); }}
                >
                  <div className="field-icon text-icon">T</div>
                  <div className="field-info">
                    <div className="field-name">{field.name}</div>
                    <div className="field-meta">{field.font} · {field.size}pt · {field.align || 'left'}</div>
                  </div>
                </div>
              ))}
              {fields.length === 0 && (
                <div className="fields-empty">
                  <p>Drag on the canvas to create your first text field.</p>
                </div>
              )}
            </div>
          )}

          {leftTab === 'images' && (
            <div className="sidebar-content">
              {imageItems.map((image) => (
                <div
                  key={image.id}
                  className={`field-item ${activeImageId === image.id ? 'selected' : ''}`}
                  onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); setActiveFieldId(null); setActiveImageId(image.id); }}
                >
                  <div className="field-icon img-icon">IMG</div>
                  <div className="field-info">
                    <div className="field-name">{image.name || 'Image'}</div>
                    <div className="field-meta">{Math.round(image.w)} × {Math.round(image.h)} px</div>
                  </div>
                </div>
              ))}
              {imageItems.length === 0 && (
                <div className="fields-empty">
                  <p>No image overlays yet.<br/>Add signatures, logos, or seals.</p>
                  <p className="hint">Use File → Insert to place an image</p>
                </div>
              )}
              <label className="add-image-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Place image…
                <input type="file" accept="image/*" onChange={(event) => { importImageElement(event); }} />
              </label>
            </div>
          )}

          {leftTab === 'layers' && (
            <div className="sidebar-content">
              {[...fields].reverse().map((field) => (
                <div
                  key={field.id}
                  className={`field-item ${activeFieldId === field.id ? 'selected' : ''}`}
                  onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); setActiveImageId(null); setActiveFieldId(field.id); }}
                >
                  <div className="field-icon text-icon">T</div>
                  <div className="field-info">
                    <div className="field-name">{field.name}</div>
                    <div className="field-meta">text · layer</div>
                  </div>
                </div>
              ))}
              {imageItems.map((image) => (
                <div
                  key={image.id}
                  className={`field-item ${activeImageId === image.id ? 'selected' : ''}`}
                  onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); setActiveFieldId(null); setActiveImageId(image.id); }}
                >
                  <div className="field-icon img-icon">IMG</div>
                  <div className="field-info">
                    <div className="field-name">{image.name || 'Image'}</div>
                    <div className="field-meta">image · layer</div>
                  </div>
                </div>
              ))}
              {fields.length === 0 && imageItems.length === 0 && (
                <div className="fields-empty">
                  <p>No layers yet. Create fields or place images to see them here.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CANVAS */}
        <div className="canvas-area" id="canvasArea">
          <input
            ref={templateInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.json,.certproj"
            className="hidden-file-input"
            onChange={handleWorkspaceBrowseFile}
          />

          {/* Scrollable body — centred when small, scrollable when large */}
          <div className="canvas-scroll-body">
          {!template && (
            <div className="drop-overlay">
              <div className="drop-zone" onClick={() => templateInputRef.current?.click()}>
                <div className="drop-icon">📄</div>
                <div className="drop-title">Open a Template or Project</div>
                <div className="drop-sub">Import a PDF or image to use as your certificate background, or load a saved project JSON to resume editing.</div>
                <button className="btn-browse" type="button">Browse File</button>
                <div className="drop-formats">PDF · PNG · JPG · JSON PROJECT</div>
              </div>
            </div>
          )}

          {template && (
            <div
              className="canvas-wrapper"
              style={{
                width: template.displayWidth * zoom,
                height: template.displayHeight * zoom,
              }}
            >
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
              >
                <img src={template.src} alt="Template" draggable={false} className="template-image" />

                {fields.map((field) => {
                  const sampleText = sampleValues[field.name] ?? `{${field.name}}`;
                  const committedHtml = sampleHtmlValues[field.name];
                  const fallbackHtml = plainTextToHtml(sampleText);
                  const displayHtml = committedHtml ?? fallbackHtml;
                  const isCsvMappedField = useCsv && Boolean(fieldMappings[field.name]);
                  const hoveredColorArray = colorHoverValue ? hexToColorArray(colorHoverValue) : field.color;
                  const previewSizePt = activeFieldId === field.id && sizeHoverValue ? Number(sizeHoverValue) : Number(field.size);
                  const previewFontPx = (previewSizePt / template.pageHeightPt) * template.displayHeight;
                  const fittedPx = field.maxWidth ? fitSizeForPreview(sampleText, field.w, previewFontPx) : previewFontPx;
                  const isActive = activeFieldId === field.id;
                  const isInlineEditing = isActive && isEditingText && !isCsvMappedField;
                  const previewFontToken = isActive && fontHoverFamily ? fontHoverFamily : field.font;
                  const previewFontCss = resolveFontTokenToCss(previewFontToken);
                  const previewColor = isActive ? hoveredColorArray : field.color;

                  return (
                    <div
                      key={field.id}
                      className={`field-box ${isActive ? 'active' : ''}`}
                      style={{ left: field.x, top: field.y, width: field.w, height: field.h }}
                      onMouseDown={(event) => {
                        const target = event.target;
                        if (!(target instanceof HTMLElement)) return;
                        const isResizeHandle = !!target.closest('.resize-handle');
                        if (isResizeHandle) return;
                        const previewEl = target.closest('.field-preview');
                        if (previewEl) {
                          event.stopPropagation();
                          if (!isActive) {
                            // First click on an inactive field: select it and arm for dragging.
                            // Don't enter text-edit mode yet — that happens on a second click.
                            if (isCsvMappedField) { setActiveFieldId(field.id); setActiveImageId(null); return; }
                            beginMove(event, field.id);
                            return;
                          }
                          // Field is already active — second click enters text-editing mode.
                          setActiveFieldId(field.id);
                          setActiveImageId(null);
                          if (isCsvMappedField) { setIsEditingText(false); setStatus(`"${field.name}" is mapped to CSV column "${fieldMappings[field.name]}" and is read-only.`); return; }
                          const isSameEditingField = isEditingText && editingDraftRef.current.name === field.name;
                          if (!isSameEditingField) { editingDraftRef.current = { name: field.name, html: displayHtml, text: sampleText }; lastSelectionRangeRef.current = null; }
                          setIsEditingText(true);
                          setTimeout(() => { if (previewEl instanceof HTMLElement) previewEl.focus(); }, 0);
                          return;
                        }
                        beginMove(event, field.id);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        const target = event.target;
                        if (!(target instanceof HTMLElement)) return;
                        if (!target.closest('.field-preview') && !target.closest('.resize-handle')) { commitActiveEditingDraft(); setActiveFieldId(field.id); setActiveImageId(null); setIsEditingText(false); }
                      }}
                      onDoubleClick={(event) => {
                        const target = event.target;
                        if (!(target instanceof HTMLElement)) return;
                        if (target.closest('.field-preview') && !isCsvMappedField) {
                          // Double-click on text area: enter editing directly
                          const previewEl = target.closest('.field-preview');
                          const isSameEditingField = isEditingText && editingDraftRef.current.name === field.name;
                          if (!isSameEditingField) { editingDraftRef.current = { name: field.name, html: displayHtml, text: sampleText }; lastSelectionRangeRef.current = null; }
                          setActiveFieldId(field.id);
                          setActiveImageId(null);
                          setIsEditingText(true);
                          setTimeout(() => { if (previewEl instanceof HTMLElement) previewEl.focus(); }, 0);
                          return;
                        }
                        if (!target.closest('.field-preview') && !target.closest('.resize-handle')) { handleFieldDoubleClick(field); }
                      }}
                    >
                      <div
                        className={`field-preview align-${field.align}`}
                        contentEditable={isInlineEditing}
                        suppressContentEditableWarning={true}
                        spellCheck={false}
                        ref={(node) => {
                          if (!node || !isInlineEditing) return;
                          const expectedName = editingDraftRef.current.name === field.name ? editingDraftRef.current.name : null;
                          if (!expectedName) return;
                          const shouldSeed = node.dataset.editingField !== expectedName || !node.innerHTML || node.innerHTML === '<br>';
                          if (shouldSeed) { node.innerHTML = editingDraftRef.current.html ?? displayHtml; node.dataset.editingField = expectedName; }
                        }}
                        style={{
                          fontSize: fittedPx,
                          fontFamily: previewFontCss.family || previewFontToken,
                          color: colorArrayToCss(previewColor),
                          fontWeight: field.bold ? 'bold' : (previewFontCss.weight || 'normal'),
                          fontStyle: field.italic ? 'italic' : (previewFontCss.style || 'normal'),
                          whiteSpace: field.wrapText ? 'pre-wrap' : 'pre',
                          overflowWrap: field.wrapText ? 'break-word' : 'normal',
                          wordWrap: field.wrapText ? 'break-word' : 'normal',
                          cursor: isCsvMappedField ? 'default' : (isInlineEditing ? 'text' : 'move'),
                        }}
                        onInput={(event) => {
                          if (isInlineEditing) {
                            const nextText = event.currentTarget.innerText;
                            const nextHtml = sanitizeHtml(event.currentTarget.innerHTML);
                            editingDraftRef.current = { name: field.name, html: nextHtml, text: nextText };
                            setSampleValues((prev) => ({ ...prev, [field.name]: nextText }));
                            setSampleHtmlValues((prev) => ({ ...prev, [field.name]: nextHtml }));
                          }
                        }}
                        onMouseDown={(event) => { if (isActive && isEditingText) event.stopPropagation(); }}
                        onMouseUp={(event) => {
                          if (!(isActive && isEditingText)) return;
                          const selection = window.getSelection();
                          if (selection && !selection.isCollapsed && selection.rangeCount > 0 && selectionInsideEditor(event.currentTarget, selection)) {
                            lastSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
                          }
                        }}
                        onKeyUp={(event) => {
                          if (!(isActive && isEditingText)) return;
                          const selection = window.getSelection();
                          if (selection && !selection.isCollapsed && selection.rangeCount > 0 && selectionInsideEditor(event.currentTarget, selection)) {
                            lastSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
                          }
                        }}
                        onBlur={(event) => {
                          const nextTarget = event.relatedTarget;
                          const activeElement = document.activeElement;
                          const keepEditingByToolbarFocus = nextTarget instanceof HTMLElement && !!nextTarget.closest('.toolbar');
                          const keepEditingByActiveElement = activeElement instanceof HTMLElement && !!activeElement.closest('.toolbar');
                          const keepEditing = toolbarInteractionRef.current || keepEditingByToolbarFocus || keepEditingByActiveElement;
                          if (keepEditing) return;
                          commitFieldDraft(field.name);
                          lastSelectionRangeRef.current = null;
                          setIsEditingText(false);
                        }}
                        dangerouslySetInnerHTML={isInlineEditing ? undefined : { __html: displayHtml }}
                      >
                        {null}
                      </div>
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

                {imageItems.map((image) => {
                  const isActiveImage = activeImageId === image.id;
                  return (
                    <div
                      key={image.id}
                      className={`field-box image-box ${isActiveImage ? 'active' : ''}`}
                      style={{ left: image.x, top: image.y, width: image.w, height: image.h }}
                      onMouseDown={(event) => {
                        const target = event.target;
                        if (!(target instanceof HTMLElement)) return;
                        if (target.closest('.resize-handle')) return;
                        beginMove(event, image.id, 'image');
                      }}
                      onClick={(event) => { event.stopPropagation(); commitActiveEditingDraft(); setActiveImageId(image.id); setActiveFieldId(null); setIsEditingText(false); }}
                    >
                      <img src={image.src} alt={image.name || 'Layout image'} className="image-preview" draggable={false} />
                      <span className="resize-handle resize-handle-nw" onMouseDown={(event) => beginResize(event, image.id, 'nw', 'image')} />
                      <span className="resize-handle resize-handle-n" onMouseDown={(event) => beginResize(event, image.id, 'n', 'image')} />
                      <span className="resize-handle resize-handle-ne" onMouseDown={(event) => beginResize(event, image.id, 'ne', 'image')} />
                      <span className="resize-handle resize-handle-e" onMouseDown={(event) => beginResize(event, image.id, 'e', 'image')} />
                      <span className="resize-handle resize-handle-se" onMouseDown={(event) => beginResize(event, image.id, 'se', 'image')} />
                      <span className="resize-handle resize-handle-s" onMouseDown={(event) => beginResize(event, image.id, 's', 'image')} />
                      <span className="resize-handle resize-handle-sw" onMouseDown={(event) => beginResize(event, image.id, 'sw', 'image')} />
                      <span className="resize-handle resize-handle-w" onMouseDown={(event) => beginResize(event, image.id, 'w', 'image')} />
                    </div>
                  );
                })}

                {draftBox && (
                  <div className="draft-box" style={{ left: draftBox.x, top: draftBox.y, width: draftBox.w, height: draftBox.h }} />
                )}

                {alignmentGuides.map((guide, idx) => (
                  guide.type === 'vertical' ? (
                    <div key={`guide-v-${idx}`} className="alignment-guide-vertical" style={{ position: 'absolute', left: guide.x, top: 0, width: 1, height: '100%', backgroundColor: '#00ff00', pointerEvents: 'none', zIndex: 1000 }} />
                  ) : (
                    <div key={`guide-h-${idx}`} className="alignment-guide-horizontal" style={{ position: 'absolute', left: 0, top: guide.y, width: '100%', height: 1, backgroundColor: '#00ff00', pointerEvents: 'none', zIndex: 1000 }} />
                  )
                ))}
              </div>
            </div>
          )}
          </div>{/* end canvas-scroll-body */}

          <div className="canvas-controls">
            <button type="button" className="canvas-ctrl-btn" data-tip="Fit to screen" onClick={() => {
              const canvasEl = document.getElementById('canvasArea');
              if (canvasEl && template) {
                const availW = canvasEl.clientWidth - 96;
                const availH = canvasEl.clientHeight - 96;
                if (availW > 0 && availH > 0) {
                  const fitZoom = Math.min(availW / template.displayWidth, availH / template.displayHeight, 1);
                  setZoom(Math.max(0.25, parseFloat(fitZoom.toFixed(2))));
                }
              }
            }}>⤢</button>
            <button type="button" className="canvas-ctrl-btn" data-tip="Actual size" onClick={() => setZoom(1)}>1:1</button>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="sidebar-right">
          <div className="props-header">
            <div>
              <div className="props-title">Properties</div>
              <div className="props-field-name">
                {activeField?.name || activeImage?.name || 'No selection'}
              </div>
            </div>
            {useCsv && csvFile && (
              <span className="batch-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                CSV
              </span>
            )}
          </div>

          <div className="props-body">
            {activeField && template && scales ? (
              <>
                {/* Position & Size */}
                <div className="prop-section">
                  <div className="prop-section-label">Position & Size</div>
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">X (pt)</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeField.x * scales.x)} onChange={(event) => updateField(activeField.id, { x: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Y (pt)</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeField.y * scales.y)} onChange={(event) => updateField(activeField.id, { y: Number(event.target.value) / scales.y })} />
                    </div>
                  </div>
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">Width</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeField.w * scales.x)} onChange={(event) => updateField(activeField.id, { w: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Height</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeField.h * scales.y)} onChange={(event) => updateField(activeField.id, { h: Number(event.target.value) / scales.y })} />
                    </div>
                  </div>
                </div>

                {/* Typography */}
                <div className="prop-section">
                  <div className="prop-section-label">Typography</div>
                  <div className="prop-row">
                    <div className="prop-label">Font</div>
                    <select className="prop-input" style={{ flex: 1 }} value={activeField.font || 'Helvetica'} onChange={(event) => updateField(activeField.id, { font: event.target.value })}>
                      {fontPickerGroups.builtIn.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      {fontPickerGroups.custom.length > 0 && fontPickerGroups.custom.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="prop-row">
                    <div className="prop-label">Size</div>
                    <input className="prop-input mono" type="number" value={activeField.size || 12} style={{ flex: '0 0 60px' }} onChange={(event) => updateField(activeField.id, { size: Number(event.target.value) })} />
                    <div className="toggle-group" style={{ marginLeft: 4 }}>
                      <button type="button" className={`toggle-btn ${activeField.bold ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('bold', 'bold')}>B</button>
                      <button type="button" className={`toggle-btn ${activeField.italic ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('italic', 'italic')} style={{ fontStyle: 'italic' }}>I</button>
                    </div>
                  </div>
                  <div className="prop-row">
                    <div className="prop-label">Align</div>
                    <div className="align-group">
                      <button type="button" className={`align-btn ${activeField.align === 'left' || !activeField.align ? 'active' : ''}`} data-tip="Left" onClick={() => updateField(activeField.id, { align: 'left' })}>L</button>
                      <button type="button" className={`align-btn ${activeField.align === 'center' ? 'active' : ''}`} data-tip="Center" onClick={() => updateField(activeField.id, { align: 'center' })}>C</button>
                      <button type="button" className={`align-btn ${activeField.align === 'right' ? 'active' : ''}`} data-tip="Right" onClick={() => updateField(activeField.id, { align: 'right' })}>R</button>
                    </div>
                  </div>
                </div>

                {/* Color */}
                <div className="prop-section">
                  <div className="prop-section-label">Color</div>
                  <div className="prop-row">
                    <div className="prop-label">Text</div>
                    <div className="color-row">
                      <div className="color-preview-swatch" style={{ background: colorArrayToHex(activeField.color) }} />
                      <input
                        className="color-hex"
                        type="color"
                        value={colorArrayToHex(activeField.color)}
                        onChange={(event) => applyInlineCommandOrFieldUpdate({ command: 'foreColor', value: event.target.value, fieldPatch: { color: hexToColorArray(event.target.value) }, requireSelection: true, selectionMessage: 'Select text to apply color.' })}
                      />
                    </div>
                  </div>
                </div>

                {/* Behavior */}
                <div className="prop-section">
                  <div className="prop-section-label">Behavior</div>
                  <label className="checkbox-row" onClick={() => updateField(activeField.id, { maxWidth: !activeField.maxWidth })}>
                    <div className={`custom-check ${activeField.maxWidth ? 'checked' : ''}`}>
                      {activeField.maxWidth && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span className="check-label">Fit to width</span>
                  </label>
                  <label className="checkbox-row" onClick={() => updateField(activeField.id, { wrapText: !activeField.wrapText })}>
                    <div className={`custom-check ${activeField.wrapText ? 'checked' : ''}`}>
                      {activeField.wrapText && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span className="check-label">Wrap text</span>
                  </label>
                </div>

                {/* Sample Content */}
                <div className="prop-section">
                  <div className="prop-section-label">Sample Content</div>
                  <textarea
                    className="prop-textarea"
                    value={sampleValues[activeField.name] ?? ''}
                    disabled={activeFieldIsCsvMapped}
                    onChange={(event) => {
                      if (activeFieldIsCsvMapped) return;
                      const nextValue = event.target.value;
                      setSampleValues((prev) => ({ ...prev, [activeField.name]: nextValue }));
                      setSampleHtmlValues((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(prev, activeField.name)) return prev;
                        const next = { ...prev }; delete next[activeField.name]; return next;
                      });
                      if (editingDraftRef.current.name === activeField.name) {
                        editingDraftRef.current = { name: activeField.name, text: nextValue, html: plainTextToHtml(nextValue) };
                      }
                    }}
                    rows={3}
                    placeholder={activeFieldIsCsvMapped ? 'Mapped to CSV — read-only' : 'Preview text…'}
                  />
                  {activeFieldIsCsvMapped && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Mapped to: {fieldMappings[activeField.name]}</p>
                  )}
                  {useCsv && csvHeaders.length > 0 && (
                    <div className="prop-row" style={{ marginTop: 10 }}>
                      <div className="prop-label" style={{ fontSize: 10 }}>CSV col</div>
                      <select className="prop-input" style={{ flex: 1, fontSize: 11 }} value={fieldMappings[activeField.name] || ''} onChange={(event) => updateFieldMapping(activeField.name, event.target.value)}>
                        <option value="">— use preview value —</option>
                        {csvHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <button type="button" className="danger-btn" onClick={() => deleteField(activeField.id)}>Delete field</button>
              </>
            ) : activeImage && template && scales ? (
              <>
                {/* Image Position & Size */}
                <div className="prop-section">
                  <div className="prop-section-label">Position & Size</div>
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">X (pt)</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeImage.x * scales.x)} onChange={(event) => updateImage(activeImage.id, { x: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Y (pt)</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeImage.y * scales.y)} onChange={(event) => updateImage(activeImage.id, { y: Number(event.target.value) / scales.y })} />
                    </div>
                  </div>
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">Width</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeImage.w * scales.x)} onChange={(event) => updateImage(activeImage.id, { w: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Height</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeImage.h * scales.y)} onChange={(event) => updateImage(activeImage.id, { h: Number(event.target.value) / scales.y })} />
                    </div>
                  </div>
                </div>
                <div className="prop-section">
                  <div className="prop-section-label">Name</div>
                  <div className="prop-row">
                    <input className="prop-input" value={activeImage.name || ''} onChange={(event) => updateImage(activeImage.id, { name: event.target.value })} placeholder="Image name" />
                  </div>
                </div>
                <button type="button" className="danger-btn" onClick={() => deleteImage(activeImage.id)}>Delete image</button>
              </>
            ) : (
              <div className="props-empty">
                <p>Select a field or image on the canvas to edit its properties.</p>
              </div>
            )}
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="preview-panel">
              <div className="preview-panel-header">
                Latest Preview
                <button type="button" className="preview-open-link" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>Open ↗</button>
              </div>
              <iframe title="Certificate preview" src={previewUrl} className="preview-frame" />
            </div>
          )}

          {/* Data Source */}
          <div className="data-section">
            <div className="data-header">
              <div className="data-title">Data Source</div>
            </div>
            <div className="data-csv-toggle" onClick={() => setUseCsv(!useCsv)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.4)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
              <span className="csv-toggle-label">Use CSV data</span>
              <div className={`toggle-switch ${useCsv ? 'on' : ''}`} />
            </div>

            {useCsv ? (
              <>
                <label className="upload-csv-btn">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {csvFile ? csvFile.name : 'Upload CSV file'}
                  <input type="file" accept=".csv" onChange={handleCsvFileChange} />
                </label>
                {csvFile && csvHeaders.length > 0 && (
                  <div className="csv-headers-section">
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>CSV Columns</div>
                    <div className="csv-headers-list">
                      {csvHeaders.map((header, idx) => <span key={idx} className="csv-header-chip">{header}</span>)}
                    </div>
                    {fields.length > 0 && (
                      <>
                        <div className="section-divider" />
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Field Mappings</div>
                        <div className="field-mappings">
                          {fields.map((field) => (
                            <label key={field.id} className="mapping-row">
                              <span className="mapping-field-name">{field.name}</span>
                              <select value={fieldMappings[field.name] || ''} onChange={(event) => updateFieldMapping(field.name, event.target.value)}>
                                <option value="">— preview —</option>
                                {csvHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {csvFile && csvHeaders.length === 0 && (
                  <p className="csv-hint">No headers found in CSV file.</p>
                )}
                {!csvFile && (
                  <p className="csv-hint">Upload a CSV to generate a certificate per row.</p>
                )}
              </>
            ) : (
              <p className="csv-hint">Enable to generate certificates from CSV data.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div className="statusbar">
        <div className="status-item">
          <div className={`status-dot ${statusInfo.type === 'error' ? 'error' : statusInfo.type === 'warning' ? 'warning' : ''}`} />
          {statusInfo.text || 'Ready'}
        </div>
        {template && <div className="status-item">{Math.round(template.pageWidthPt)} × {Math.round(template.pageHeightPt)} pt</div>}
        <div className="status-item">{fields.length} field{fields.length !== 1 ? 's' : ''} · {imageItems.length} image{imageItems.length !== 1 ? 's' : ''}</div>
        <div style={{ flex: 1 }} />
        {activeField && scales && <div className="status-item">x: {Math.round(activeField.x * scales.x)}  y: {Math.round(activeField.y * scales.y)}</div>}
        <div className="status-item">zoom: {Math.round(zoom * 100)}%</div>
      </div>

      {/* ── SETTINGS DOCK ── */}
      <div className="settings-dock">
        <button
          type="button"
          className={`settings-trigger ${settingsMenuOpen ? 'open' : ''}`}
          onClick={() => { const next = !settingsMenuOpen; setSettingsMenuOpen(next); if (!next) setSettingsTab(null); setInsertMenuOpen(false); setLayoutsMenuOpen(false); setGenerateMenuOpen(false); }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6.7 1.2h2.6l.5 1.8a5.6 5.6 0 011.3.8l1.8-.5 1.3 2.2-1.4 1.3c.1.3.1.7.1 1s0 .7-.1 1l1.4 1.3-1.3 2.2-1.8-.5a5.6 5.6 0 01-1.3.8l-.5 1.8H6.7l-.5-1.8a5.6 5.6 0 01-1.3-.8l-1.8.5-1.3-2.2L3.2 10a6.6 6.6 0 010-2L1.8 6.7l1.3-2.2 1.8.5c.4-.3.8-.5 1.3-.8l.5-1.8z"/>
            <circle cx="8" cy="8" r="2.2"/>
          </svg>
          Settings
        </button>
        {settingsMenuOpen && (
          <div className="settings-panel">
            {/* ── Sidebar: submenu categories ── */}
            <div className="settings-panel-sidebar">
              <div className="settings-panel-sidebar-title">Settings</div>
              <button
                type="button"
                className={`settings-panel-item ${settingsTab === 'fonts' ? 'active' : ''}`}
                onClick={() => setSettingsTab(settingsTab === 'fonts' ? null : 'fonts')}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 13V5l5-4 5 4v8"/><path d="M6 13V9h4v4"/></svg>
                Fonts
                {customFonts.length > 0 && <span className="nav-badge" style={{ marginLeft: 'auto' }}>{customFonts.length}</span>}
              </button>
            </div>

            {/* ── Content panel — only rendered when a tab is active ── */}
            {settingsTab === 'fonts' && (
              <div className="settings-panel-content">
                <div className="settings-panel-content-header">
                  <div className="settings-panel-content-title">Fonts</div>
                </div>
                <div className="settings-panel-content-body">
                  <label className="nav-dropdown-item nav-dropdown-item--file">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 10V2M4 6l4-4 4 4"/><path d="M2 13v1a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Install custom font…</span>
                      <span className="nav-item-hint">Upload .ttf or .otf for PDF output</span>
                    </span>
                    <input type="file" accept=".ttf,.otf" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { await uploadFont(file); event.target.value = ''; } }} />
                  </label>
                  <a href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer" className="nav-dropdown-item nav-dropdown-item--link">
                    <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 2v6l3 3"/></svg></span>
                    <span className="nav-item-text">
                      <span className="nav-item-label">Browse Google Fonts ↗</span>
                      <span className="nav-item-hint">Download, then install here</span>
                    </span>
                  </a>
                  {customFonts.length > 0 ? (
                    <>
                      <div className="nav-dropdown-section-title" style={{ padding: '12px 16px 6px' }}>Installed ({customFonts.length})</div>
                      <div className="nav-font-list">
                        {customFonts.map((font) => (
                          <div key={font.file} className="nav-font-row">
                            <div className="nav-font-info">
                              <span className="nav-font-name" style={{ fontFamily: resolveFontTokenToCss(font.name).family || font.name }}>{font.name}</span>
                              <span className="nav-font-meta">{font.file} · {font.size_kb} KB</span>
                            </div>
                            <button type="button" className="nav-font-delete" onClick={() => deleteFont(font.file)} data-tip={`Remove ${font.name}`}>
                              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l12 12M13 1L1 13"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="nav-empty-hint">No custom fonts installed yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ZIP DOWNLOAD NAME MODAL ── */}
      {zipNameModal.open && (
        <ZipNameModal
          suggestedName={zipNameModal.suggestedName}
          onConfirm={confirmZipDownload}
          onCancel={() => setZipNameModal((prev) => ({ ...prev, open: false }))}
        />
      )}
    </div>
  );
}
