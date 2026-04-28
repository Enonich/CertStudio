import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { resolveFontTokenToCss } from '../lib/fontUtils';
import { colorArrayToHex, hexToColorArray } from '../lib/colorUtils';
import { COMMON_FONT_SIZES } from '../constants/editorConstants';

/* ─── Custom Font Picker ─────────────────────────────────── */
function FontPickerDropdown({ value, fontPickerGroups, onSelect, requestFont }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [requesting, setRequesting] = useState(false);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  // Build a flat list of { value, label } from both groups
  const allFonts = [
    ...(fontPickerGroups?.builtIn ?? []),
    ...(fontPickerGroups?.custom ?? []).map((f) => ({ value: f.name, label: f.name })),
  ];

  const filtered = query.trim()
    ? allFonts.filter((f) => f.label.toLowerCase().includes(query.toLowerCase()))
    : allFonts;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
    else setQuery('');
  }, [open]);

  const currentCss = resolveFontTokenToCss(value);

  return (
    <div className="font-picker-float-root" ref={rootRef}>
      {/* Trigger button — shows selected font in its own typeface */}
      <button
        type="button"
        className="font-picker-float-trigger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Font family"
      >
        <span
          style={{
            fontFamily: currentCss.family || value,
            fontWeight: currentCss.weight || 'normal',
            fontStyle: currentCss.style || 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {value || 'Font'}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginLeft: 6, opacity: 0.6 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="font-picker-float-dropdown">
          {/* Search box */}
          <div className="font-picker-float-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.45, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={searchRef}
              className="font-picker-float-search"
              type="text"
              placeholder="Search fonts…"
              value={query}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Font list — each name rendered in its own font */}
          <div className="font-picker-float-list">
            {filtered.length === 0 && (
              <div className="font-picker-float-empty">No fonts found</div>
            )}
            {filtered.map((f) => {
              const css = resolveFontTokenToCss(f.value);
              const isActive = f.value === value;
              return (
                <button
                  key={f.value}
                  type="button"
                  className={`font-picker-float-item ${isActive ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(f.value);
                    setOpen(false);
                  }}
                  style={{
                    fontFamily: css.family || f.value,
                    fontWeight: css.weight || 'normal',
                    fontStyle: css.style || 'normal',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Request a font */}
          {requestFont && (
            <form
              className="font-picker-float-request"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = query.trim();
                if (!name || requesting) return;
                setRequesting(true);
                await requestFont(name);
                setQuery('');
                setRequesting(false);
              }}
            >
              <span className="font-picker-float-request-hint">
                Don't see yours?
              </span>
              <button
                type="submit"
                className="font-picker-float-request-btn"
                disabled={!query.trim() || requesting}
                title={query.trim() ? `Request "${query.trim()}"` : 'Type a font name above to request it'}
              >
                {requesting ? 'Sending…' : `Request${query.trim() ? ` "${query.trim()}"` : ''}`}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Custom Size Picker ─────────────────────────────────── */
function SizePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(String(value));
  const rootRef = useRef(null);

  useEffect(() => { setRaw(String(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (val) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) onChange(n);
  };

  return (
    <div className="size-picker-float-root" ref={rootRef}>
      <div className="size-picker-float-input-row">
        <input
          className="size-float-input"
          type="number"
          min={1}
          max={999}
          value={raw}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => commit(raw)}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit(raw); setOpen(false); } }}
        />
        <button
          type="button"
          className="size-picker-float-arrow"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          title="Common sizes"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      {open && (
        <div className="size-picker-float-dropdown">
          {COMMON_FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`size-picker-float-item ${s === value ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setRaw(String(s)); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Toolbar Sep ────────────────────────────────────────── */
const Sep = () => <div className="tool-sep-float" />;

/* ─── Icon SVGs ──────────────────────────────────────────── */
const SZ = 11; // icon size

const IcoAlignLeft = () => (
  <svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
  </svg>
);
const IcoAlignCenter = () => (
  <svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
  </svg>
);
const IcoAlignRight = () => (
  <svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
  </svg>
);
const IcoAlignJustify = () => (
  <svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IcoBullet = () => (
  <svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
    <circle cx="4.5" cy="6" r="2" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="12" r="2" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="18" r="2" fill="currentColor" stroke="none"/>
  </svg>
);

/* ─── Main FloatingToolbar ───────────────────────────────── */
export default function FloatingToolbar({
  activeField,
  isEditingText,
  fontPickerGroups,
  updateField,
  cacheSelectionRangeFromEditor,
  toolbarInteractionRef,
  applyInlineCommandOrFieldUpdate,
  handleInlineStyleClick,
  zoom,
  canvasWidth,
  requestFont,
}) {
  const [fmtState, setFmtState] = useState({
    bold: false, italic: false, underline: false,
    strikeThrough: false, insertUnorderedList: false,
  });
  const toolbarRef = useRef(null);
  const interactionTimeoutRef = useRef(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 0, height: 36 });

  const markToolbarInteraction = () => {
    if (!toolbarInteractionRef) return;

    toolbarInteractionRef.current = true;

    if (interactionTimeoutRef.current) {
      window.clearTimeout(interactionTimeoutRef.current);
    }

    interactionTimeoutRef.current = window.setTimeout(() => {
      toolbarInteractionRef.current = false;
      interactionTimeoutRef.current = null;
    }, 180);
  };

  useEffect(() => {
    if (!isEditingText) return;
    const update = () => {
      try {
        setFmtState({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
          insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        });
      } catch { /* no-op */ }
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('keyup', update);
    update();
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('keyup', update);
    };
  }, [isEditingText]);

  useLayoutEffect(() => {
    if (!isEditingText || !activeField || !toolbarRef.current) return undefined;

    const node = toolbarRef.current;
    const updateSize = () => {
      setToolbarSize({
        width: node.offsetWidth || 0,
        height: node.offsetHeight || 36,
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeField, canvasWidth, isEditingText]);

  useEffect(() => () => {
    if (interactionTimeoutRef.current) {
      window.clearTimeout(interactionTimeoutRef.current);
    }
    if (toolbarInteractionRef) {
      toolbarInteractionRef.current = false;
    }
  }, [toolbarInteractionRef]);

  if (!isEditingText || !activeField) return null;

  const TOOLBAR_MARGIN = 8;
  const maxToolbarWidth = canvasWidth ? Math.max(220, canvasWidth - (TOOLBAR_MARGIN * 2)) : undefined;
  const preferredLeft = activeField.x * zoom;
  const preferredTop = activeField.y * zoom - toolbarSize.height - 10;
  const maxLeft = canvasWidth
    ? Math.max(TOOLBAR_MARGIN, canvasWidth - toolbarSize.width - TOOLBAR_MARGIN)
    : preferredLeft;
  const leftPos = canvasWidth
    ? Math.min(Math.max(preferredLeft, TOOLBAR_MARGIN), maxLeft)
    : preferredLeft;
  const topPos = Math.max(TOOLBAR_MARGIN, preferredTop);
  const align = activeField.align || 'left';
  const isCompact = Boolean(maxToolbarWidth) && toolbarSize.width >= maxToolbarWidth;

  return (
    <div
      ref={toolbarRef}
      className={`floating-toolbar ${isCompact ? 'floating-toolbar--compact' : ''}`}
      style={{
        position: 'absolute',
        top: `${topPos}px`,
        left: `${leftPos}px`,
        maxWidth: maxToolbarWidth ? `${maxToolbarWidth}px` : undefined,
        zIndex: 1000,
      }}
      onMouseDownCapture={() => {
        cacheSelectionRangeFromEditor?.();
        markToolbarInteraction();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Font Family custom picker ── */}
      <FontPickerDropdown
        value={activeField.font || 'Helvetica'}
        fontPickerGroups={fontPickerGroups}
        requestFont={requestFont}
        onSelect={(nextFont) =>
          applyInlineCommandOrFieldUpdate({
            command: 'fontName', value: nextFont,
            fieldPatch: { font: nextFont }, requireSelection: false,
          })
        }
      />

      {/* ── Font Size ── */}
      <SizePicker
        value={activeField.size || 12}
        onChange={(s) => updateField(activeField.id, { size: s })}
      />

      <Sep />

      {/* ── Bold ── */}
      <button type="button" className={`tool-btn-float ${fmtState.bold ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInlineStyleClick('bold', 'bold')} title="Bold (Ctrl+B)">
        <b style={{ fontSize: '11px', fontFamily: 'Georgia, serif' }}>B</b>
      </button>

      {/* ── Italic ── */}
      <button type="button" className={`tool-btn-float ${fmtState.italic ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInlineStyleClick('italic', 'italic')} title="Italic (Ctrl+I)">
        <em style={{ fontSize: '11px', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>I</em>
      </button>

      {/* ── Underline ── */}
      <button type="button" className={`tool-btn-float ${fmtState.underline ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyInlineCommandOrFieldUpdate({ command: 'underline', fieldPatch: {} })} title="Underline (Ctrl+U)">
        <span style={{ fontSize: '11px', textDecoration: 'underline', fontFamily: 'Georgia, serif' }}>U</span>
      </button>

      {/* ── Strikethrough ── */}
      <button type="button" className={`tool-btn-float ${fmtState.strikeThrough ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyInlineCommandOrFieldUpdate({ command: 'strikeThrough', fieldPatch: {} })} title="Strikethrough">
        <span style={{ fontSize: '11px', textDecoration: 'line-through', fontFamily: 'Georgia, serif' }}>S</span>
      </button>

      {/* ── Color ── */}
      <label
        className="tool-btn-float"
        title="Text color"
        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, position: 'relative' }}
      >
        <span style={{ fontSize: '11px', fontFamily: 'Georgia, serif', lineHeight: 1, fontWeight: 'bold' }}>A</span>
        <span style={{ width: 11, height: 2, borderRadius: 1, background: colorArrayToHex(activeField.color) }} />
        <input
          type="color"
          value={colorArrayToHex(activeField.color)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', border: 'none', padding: 0 }}
          onChange={(e) => applyInlineCommandOrFieldUpdate({
            command: 'foreColor',
            value: e.target.value,
            fieldPatch: { color: hexToColorArray(e.target.value) },
            requireSelection: true,
            selectionMessage: 'Select text to apply color.',
          })}
        />
      </label>

      <Sep />

      {/* ── Alignment ── */}
      <button type="button" className={`tool-btn-float ${align === 'left' ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateField(activeField.id, { align: 'left' })} title="Align Left">
        <IcoAlignLeft />
      </button>
      <button type="button" className={`tool-btn-float ${align === 'center' ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateField(activeField.id, { align: 'center' })} title="Align Center">
        <IcoAlignCenter />
      </button>
      <button type="button" className={`tool-btn-float ${align === 'right' ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateField(activeField.id, { align: 'right' })} title="Align Right">
        <IcoAlignRight />
      </button>
      <button type="button" className={`tool-btn-float ${align === 'justify' ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateField(activeField.id, { align: 'justify' })} title="Justify">
        <IcoAlignJustify />
      </button>

      <Sep />

      {/* ── Bullet List ── */}
      <button type="button" className={`tool-btn-float ${fmtState.insertUnorderedList ? 'active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyInlineCommandOrFieldUpdate({ command: 'insertUnorderedList', fieldPatch: {} })} title="Bullet list">
        <IcoBullet />
      </button>
    </div>
  );
}
