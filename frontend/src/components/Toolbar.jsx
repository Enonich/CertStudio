import { COMMON_FONT_SIZES, PAGE_PRESETS, QUICK_COLOR_SWATCHES } from '../constants/editorConstants';
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
  /* Panel toggle props */
  leftSidebarOpen,
  rightSidebarOpen,
  toggleLeftSidebar,
  toggleRightSidebar,
  totalLayerCount,
  selectedCount,
}) {
  const hasField = Boolean(activeField);

  return (
    <div className={`toolbar ${hasField ? '' : 'toolbar--collapsed'}`} role="toolbar" aria-label="Field editing toolbar">
      {/* ── Mode buttons (always visible) ── */}
      <div className="tool-group tool-group--mode">
        <button
          type="button"
          className={`tool-btn ${toolMode === 'select' ? 'active' : ''}`}
          onClick={() => setToolMode('select')}
          title="Selection tool (V)"
          aria-pressed={toolMode === 'select'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3l14 9-7 1-4 7L5 3z"/></svg>
          Select
        </button>
        <button
          type="button"
          className={`tool-btn ${toolMode === 'text' ? 'active' : ''}`}
          onClick={() => setToolMode('text')}
          title="Text box tool (T)"
          aria-pressed={toolMode === 'text'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
          Text
        </button>
      </div>

      {/* ── Formatting controls (only when a field is selected) ── */}
      {hasField && (
        <>
          <div className="tool-sep" />

          {/* Font picker */}
          <div className="tool-group tool-group--font" ref={fontPickerRef}>
            <button
              type="button"
              className="font-picker-trigger"
              onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
              onClick={() => { setFontPickerOpen((prev) => !prev); setFontHoverFamily(''); }}
              style={{ fontFamily: resolveFontTokenToCss(displayedFontValue).family || displayedFontValue }}
              title={displayedFontValue}
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
          <div className="tool-group tool-group--size" ref={sizePickerRef}>
            <input
              className="size-input"
              type="number"
              value={displayedSizeValue}
              aria-label="Font size"
              onChange={(event) => updateField(activeField.id, { size: Number(event.target.value) })}
            />
            <button
              type="button"
              className="font-picker-trigger size-trigger"
              onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }}
              onClick={() => { setSizePickerOpen((prev) => !prev); setSizeHoverValue(null); }}
              aria-label="Size presets"
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
                    onClick={() => { setSizeHoverValue(null); setSizePickerOpen(false); updateField(activeField.id, { size }); }}
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
            className="tool-group tool-group--style"
            onMouseDownCapture={() => { cacheSelectionRangeFromEditor(); toolbarInteractionRef.current = true; window.setTimeout(() => { toolbarInteractionRef.current = false; }, 0); }}
          >
            <button title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={!!activeField?.bold} type="button" className={`tool-btn ${activeField?.bold ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('bold', 'bold')} style={{ fontWeight: 700 }}>B</button>
            <button title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={!!activeField?.italic} type="button" className={`tool-btn ${activeField?.italic ? 'active' : ''}`} onMouseDown={(event) => { const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]'); if (editorEl) event.preventDefault(); }} onClick={() => handleInlineStyleClick('italic', 'italic')} style={{ fontStyle: 'italic' }}>I</button>
          </div>

          <div className="tool-sep" />

          {/* Alignment */}
          <div className="tool-group tool-group--align">
            <button type="button" title="Align left" aria-label="Align left" className={`tool-btn ${activeField?.align === 'left' || !activeField?.align ? 'active' : ''}`} onClick={() => updateField(activeField.id, { align: 'left' })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button type="button" title="Center" aria-label="Align center" className={`tool-btn ${activeField?.align === 'center' ? 'active' : ''}`} onClick={() => updateField(activeField.id, { align: 'center' })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
            </button>
            <button type="button" title="Align right" aria-label="Align right" className={`tool-btn ${activeField?.align === 'right' ? 'active' : ''}`} onClick={() => updateField(activeField.id, { align: 'right' })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
            </button>
          </div>

          <div className="tool-sep" />

          {/* Color */}
          <div className="tool-group tool-group--color" style={{ position: 'relative' }}>
            <div
              className="toolbar-color-swatch"
              role="button"
              tabIndex={0}
              aria-label={`Text color: ${displayedColorValue}`}
              aria-haspopup="true"
              aria-expanded={colorPickerOpen}
              title="Text color"
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
          <div className="tool-group tool-group--fit">
            <button title="Auto-shrink to fit" aria-label="Auto-shrink to fit" aria-pressed={!!activeField?.maxWidth} type="button" className={`tool-btn ${activeField?.maxWidth ? 'active' : ''}`} onClick={() => updateField(activeField.id, { maxWidth: !activeField.maxWidth })}>Auto Fit</button>
            <button title="Word wrap" aria-label="Word wrap" aria-pressed={!!activeField?.wrapText} type="button" className={`tool-btn ${activeField?.wrapText ? 'active' : ''}`} onClick={() => updateField(activeField.id, { wrapText: !activeField.wrapText })}>Wrap</button>
          </div>
        </>
      )}

      <div className="toolbar-spacer" />

      {/* ── Zoom (always visible) ── */}
      <div className="zoom-group toolbar-zoom-group">
        <button title="Zoom out" aria-label="Zoom out" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.max(0.25, parseFloat((z - 0.1).toFixed(2))))}>-</button>
        <input type="range" min="0.25" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom level" />
        <button title="Zoom in" aria-label="Zoom in" type="button" className="tool-btn" onClick={() => setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(2))))}>+</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      </div>

      {/* ── Panel toggles (always visible) ── */}
      <div className="tool-sep" />
      <div className="tool-group tool-group--panels">
        <button
          type="button"
          className={`tool-btn tool-btn--panel ${leftSidebarOpen ? 'active' : ''}`}
          onClick={toggleLeftSidebar}
          title="Contents panel"
          aria-pressed={leftSidebarOpen}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
          {totalLayerCount > 0 && <span className="tool-btn-badge">{totalLayerCount}</span>}
        </button>
        <button
          type="button"
          className={`tool-btn tool-btn--panel ${rightSidebarOpen ? 'active' : ''}`}
          onClick={toggleRightSidebar}
          title="Properties panel"
          aria-pressed={rightSidebarOpen}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 9h6M9 13h6M9 17h4"/>
          </svg>
          {selectedCount > 0 && <span className="tool-btn-badge">{selectedCount}</span>}
        </button>
      </div>
    </div>
  );
}
