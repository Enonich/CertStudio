import { COMMON_FONT_SIZES, PAGE_PRESETS, QUICK_COLOR_SWATCHES } from '../lib/constants';
import { resolveFontTokenToCss, hexToColorArray } from '../lib/colorUtils';

export default function Toolbar({
  activeField,
  activeFieldIsCsvMapped,
  toolMode,
  displayedFontValue,
  displayedSizeValue,
  displayedColorValue,
  fontPickerOpen,
  sizePickerOpen,
  colorPickerOpen,
  fontHoverFamily,
  sizeHoverValue,
  colorHoverValue,
  preset,
  zoom,
  fontPickerGroups,
  fontPickerRef,
  sizePickerRef,
  setFontPickerOpen,
  setFontHoverFamily,
  setSizePickerOpen,
  setSizeHoverValue,
  setColorPickerOpen,
  setColorHoverValue,
  setPreset,
  setToolMode,
  setZoom,
  updateField,
  clearFontHoverPreview,
  previewFontHoverOnSelection,
  applyInlineCommandOrFieldUpdate,
  setActiveEditorFont,
  handleInlineStyleClick,
  getFieldDisplayName,
  cacheSelectionRangeFromEditor,
  toolbarInteractionRef,
}) {
  return (
    <div className="toolbar">
      <div className="tool-group">
        <button
          type="button"
          className={`tool-btn ${toolMode === 'select' ? 'active' : ''}`}
          onClick={() => setToolMode('select')}
          data-tip="Selection tool (V)"
          aria-pressed={toolMode === 'select'}
        >
          Select
        </button>
        <button
          type="button"
          className={`tool-btn ${toolMode === 'text' ? 'active' : ''}`}
          onClick={() => setToolMode('text')}
          data-tip="Text box tool (T)"
          aria-pressed={toolMode === 'text'}
        >
          Text
        </button>
      </div>

      <div className="tool-sep" />

      {/* Field name */}
      <div className="tool-group" style={{ alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>Name</span>
        <input
          className="font-picker-trigger"
          style={{ minWidth: 120 }}
          value={activeField?.name ?? ''}
          onChange={(event) => activeField && updateField(activeField.id, { name: event.target.value })}
          placeholder="field_name"
          disabled={!activeField || activeFieldIsCsvMapped}
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
          <div className="font-picker-menu" onMouseLeave={() => { setFontHoverFamily(''); clearFontHoverPreview(); }}>
            <div className="font-picker-group-title">Standard Fonts</div>
            {fontPickerGroups.builtIn.map((family) => {
              const cssFont = resolveFontTokenToCss(family.value);
              return (
                <button
                  key={family.value}
                  type="button"
                  className={`font-picker-option ${displayedFontValue === family.value ? 'active' : ''}`}
                  onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
                  onMouseEnter={() => { setFontHoverFamily(family.value); previewFontHoverOnSelection(family.value); }}
                  onClick={() => { clearFontHoverPreview(); setFontHoverFamily(''); setFontPickerOpen(false); applyInlineCommandOrFieldUpdate({ command: 'fontName', value: family.value, fieldPatch: { font: family.value }, requireSelection: false }); setActiveEditorFont(family.value); }}
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
                    onMouseEnter={() => { setFontHoverFamily(font.name); previewFontHoverOnSelection(font.name); }}
                    onClick={() => { clearFontHoverPreview(); setFontHoverFamily(''); setFontPickerOpen(false); applyInlineCommandOrFieldUpdate({ command: 'fontName', value: font.name, fieldPatch: { font: font.name }, requireSelection: false }); setActiveEditorFont(font.name); }}
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
          aria-label="Size presets"
          disabled={!activeField}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
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
      <div
        className="tool-group"
        onMouseDownCapture={() => { cacheSelectionRangeFromEditor(); toolbarInteractionRef.current = true; window.setTimeout(() => { toolbarInteractionRef.current = false; }, 0); }}
      >
        <button data-tip="Bold" aria-label="Bold" aria-pressed={!!activeField?.bold} type="button" className={`tool-btn ${activeField?.bold ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('bold', 'bold')} style={{ fontWeight: 700 }}>B</button>
        <button data-tip="Italic" aria-label="Italic" aria-pressed={!!activeField?.italic} type="button" className={`tool-btn ${activeField?.italic ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('italic', 'italic')} style={{ fontStyle: 'italic' }}>I</button>
      </div>

      <div className="tool-sep" />

      {/* Alignment */}
      <div className="tool-group">
        <button type="button" data-tip="Align left" aria-label="Align left" className={`tool-btn ${activeField?.align === 'left' || !activeField?.align ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'left' })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
        </button>
        <button type="button" data-tip="Center" aria-label="Align center" className={`tool-btn ${activeField?.align === 'center' ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'center' })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
        </button>
        <button type="button" data-tip="Align right" aria-label="Align right" className={`tool-btn ${activeField?.align === 'right' ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { align: 'right' })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
        </button>
      </div>

      <div className="tool-sep" />

      {/* Color */}
      <div className="tool-group" style={{ position: 'relative' }}>
        <div
          className="toolbar-color-swatch"
          role="button"
          tabIndex={activeField ? 0 : -1}
          aria-label={`Text color: ${displayedColorValue}`}
          aria-haspopup="true"
          aria-expanded={colorPickerOpen}
          data-tip="Text color"
          onClick={() => { setColorPickerOpen((prev) => !prev); setColorHoverValue(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setColorPickerOpen((prev) => !prev); setColorHoverValue(''); } }}
          style={{ background: displayedColorValue }}
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
        <button data-tip="Auto-shrink to fit" aria-label="Auto-shrink to fit" aria-pressed={!!activeField?.maxWidth} type="button" className={`tool-btn ${activeField?.maxWidth ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { maxWidth: !activeField.maxWidth })}>Fit</button>
        <button data-tip="Word wrap" aria-label="Word wrap" aria-pressed={!!activeField?.wrapText} type="button" className={`tool-btn ${activeField?.wrapText ? 'active' : ''}`} onClick={() => activeField && updateField(activeField.id, { wrapText: !activeField.wrapText })}>Wrap</button>
      </div>

      <div className="tool-sep" />

      {/* Page size */}
      <select className="page-select" value={preset} onChange={(event) => setPreset(event.target.value)} aria-label="Page size">
        {Object.entries(PAGE_PRESETS).map(([value, item]) => (
          <option key={value} value={value}>{item.label}</option>
        ))}
      </select>

      <div className="toolbar-spacer" />

      {/* Zoom */}
      <div className="zoom-group">
        <button data-tip="Zoom out" aria-label="Zoom out" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.max(0.25, parseFloat((z - 0.1).toFixed(2))))}>-</button>
        <input type="range" min="0.25" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom level" />
        <button data-tip="Zoom in" aria-label="Zoom in" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(2))))}>+</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
