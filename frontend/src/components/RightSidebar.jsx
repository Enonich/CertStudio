import { resolveFontTokenToCss, colorArrayToHex, hexToColorArray, plainTextToHtml } from '../lib/colorUtils';

export default function RightSidebar({
  activeField,
  activeImage,
  selectionCount,
  selectedCanvasItems,
  template,
  scales,
  expandedSections,
  sampleValues,
  fieldMappings,
  useCsv,
  previewUrl,
  fields,
  activeFieldIsCsvMapped,
  fontPickerGroups,
  toggleSection,
  closePreview,
  updateField,
  updateImage,
  deleteField,
  deleteImage,
  duplicateSelection,
  deleteSelection,
  reorderSelectionLayers,
  cacheSelectionRangeFromEditor,
  toolbarInteractionRef,
  editingDraftRef,
  setSampleValues,
  setSampleHtmlValues,
  applyInlineCommandOrFieldUpdate,
  setActiveEditorFont,
  handleInlineStyleClick,
  getFieldDisplayName,
}) {
  const hasMultiSelection = selectionCount > 1;

  return (
    <div className="sidebar-right">
      <div className="props-header">
        <div>
          <div className="props-title">Properties</div>
          <div className="props-field-name">
            {hasMultiSelection
              ? `${selectionCount} items selected`
              : activeField
                ? getFieldDisplayName(activeField)
                : (activeImage?.name || 'No selection')}
          </div>
        </div>
        {useCsv && (
          <span className="batch-badge">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
            Batch
          </span>
        )}
      </div>

      <div className="props-body">
        {hasMultiSelection ? (
          <>
            <div className="props-empty" style={{ marginTop: 0, paddingTop: 8 }}>
              <p>Move, duplicate, delete, or reorder the current selection here. Select a single item to edit its detailed properties.</p>
            </div>
            <div className="prop-section-content">
              <div className="selection-summary-list">
                {selectedCanvasItems.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="selection-summary-row">
                    <span>{item.kind === 'field' ? getFieldDisplayName(item) : (item.name || 'Image')}</span>
                    <span className="selection-summary-meta">{item.kind}</span>
                  </div>
                ))}
              </div>
              <div className="arrange-grid">
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('front')}>Bring to front</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('back')}>Send to back</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('forward')}>Bring forward</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('backward')}>Send backward</button>
              </div>
              <div className="arrange-actions">
                <button type="button" className="secondary-btn" onClick={duplicateSelection}>Duplicate selection</button>
                <button type="button" className="danger-btn" onClick={deleteSelection}>Delete selection</button>
              </div>
            </div>
          </>
        ) : activeField && template && scales ? (
          <>
            {/* ── BOX SECTION (Position & Size) ── */}
            <div className={`prop-section-collapsible ${expandedSections.box ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('box')}
                aria-expanded={expandedSections.box}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Position &amp; Size</span>
              </button>
              {expandedSections.box && (
                <div className="prop-section-content">
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">Left</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeField.x * scales.x)} onChange={(event) => updateField(activeField.id, { x: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Top</div>
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
              )}
            </div>

            {/* ── TEXT SECTION (Font, Color, Alignment) ── */}
            <div className={`prop-section-collapsible ${expandedSections.text ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('text')}
                aria-expanded={expandedSections.text}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Text</span>
              </button>
              {expandedSections.text && (
                <div
                  className="prop-section-content"
                  onMouseDownCapture={() => {
                    cacheSelectionRangeFromEditor();
                    toolbarInteractionRef.current = true;
                    window.setTimeout(() => { toolbarInteractionRef.current = false; }, 0);
                  }}
                >
                  <div className="prop-row">
                    <div className="prop-label">Font</div>
                    <select
                      className="prop-input"
                      style={{ flex: 1 }}
                      value={activeField.font || 'Helvetica'}
                      onChange={(event) => {
                        const nextFont = event.target.value;
                        applyInlineCommandOrFieldUpdate({
                          command: 'fontName',
                          value: nextFont,
                          fieldPatch: { font: nextFont },
                          requireSelection: false,
                        });
                        setActiveEditorFont(nextFont);
                      }}
                    >
                      {fontPickerGroups.builtIn.map((f) => {
                        const cssFont = resolveFontTokenToCss(f.value);
                        return (
                          <option
                            key={f.value}
                            value={f.value}
                            style={{
                              fontFamily: cssFont.family || f.value,
                              fontWeight: cssFont.weight || 'normal',
                              fontStyle: cssFont.style || 'normal',
                            }}
                          >
                            {f.label}
                          </option>
                        );
                      })}
                      {fontPickerGroups.custom.length > 0 && fontPickerGroups.custom.map((f) => (
                        <option key={f.name} value={f.name} style={{ fontFamily: resolveFontTokenToCss(f.name).family || f.name }}>
                          {f.name}
                        </option>
                      ))}
                      {activeField.font &&
                        !fontPickerGroups.builtIn.some((f) => f.value === activeField.font) &&
                        !fontPickerGroups.custom.some((f) => f.name === activeField.font) && (
                        <option
                          value={activeField.font}
                          style={{ fontFamily: resolveFontTokenToCss(activeField.font).family || activeField.font }}
                        >
                          {activeField.font}
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="prop-row">
                    <div className="prop-label">Size</div>
                    <input
                      className="prop-input mono"
                      type="number"
                      value={activeField.size || 12}
                      style={{ flex: '0 0 64px', width: 64, minWidth: 64, maxWidth: 64 }}
                      onChange={(event) => updateField(activeField.id, { size: Number(event.target.value) })}
                    />
                    <div className="toggle-group" style={{ marginLeft: 4, flexShrink: 0 }}>
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
                  <div className="prop-row">
                    <div className="prop-label">Color</div>
                    <div className="color-row">
                      <label className="color-preview-swatch" style={{ background: colorArrayToHex(activeField.color), cursor: 'pointer' }}>
                        <input
                          className="color-hex"
                          type="color"
                          value={colorArrayToHex(activeField.color)}
                          onChange={(event) => applyInlineCommandOrFieldUpdate({ command: 'foreColor', value: event.target.value, fieldPatch: { color: hexToColorArray(event.target.value) }, requireSelection: true, selectionMessage: 'Select text to apply color.' })}
                          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                        />
                      </label>
                      <input
                        className="color-hex"
                        type="color"
                        value={colorArrayToHex(activeField.color)}
                        onChange={(event) => applyInlineCommandOrFieldUpdate({ command: 'foreColor', value: event.target.value, fieldPatch: { color: hexToColorArray(event.target.value) }, requireSelection: true, selectionMessage: 'Select text to apply color.' })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── CONTENT SECTION (Sample Text & CSV Mapping) ── */}
            <div className={`prop-section-collapsible ${expandedSections.content ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('content')}
                aria-expanded={expandedSections.content}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Content</span>
                {activeFieldIsCsvMapped && <span className="source-chip csv-chip">CSV</span>}
              </button>
              {expandedSections.content && (
                <div className="prop-section-content">
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
                    placeholder={activeFieldIsCsvMapped ? 'Pulled from your spreadsheet' : 'Preview text…'}
                  />
                  {activeFieldIsCsvMapped && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Column: {fieldMappings[activeField.name]}</p>
                  )}
                  {useCsv && !activeFieldIsCsvMapped && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Map columns in the Bulk Generation panel on the left.</p>
                  )}
                </div>
              )}
            </div>

            {/* ── LAYOUT OPTIONS SECTION (Collapsed by default) ── */}
            <div className={`prop-section-collapsible ${expandedSections.layout ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('layout')}
                aria-expanded={expandedSections.layout}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Layout Options</span>
              </button>
              {expandedSections.layout && (
                <div className="prop-section-content">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(activeField.maxWidth)}
                      onChange={() => updateField(activeField.id, { maxWidth: !activeField.maxWidth })}
                    />
                    <div className={`custom-check ${activeField.maxWidth ? 'checked' : ''}`} aria-hidden="true">
                      {activeField.maxWidth && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span className="check-label">Auto-shrink to fit width</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(activeField.wrapText)}
                      onChange={() => updateField(activeField.id, { wrapText: !activeField.wrapText })}
                    />
                    <div className={`custom-check ${activeField.wrapText ? 'checked' : ''}`} aria-hidden="true">
                      {activeField.wrapText && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span className="check-label">Wrap long text</span>
                  </label>
                </div>
              )}
            </div>

            <div className="prop-section-content">
              <div className="arrange-grid">
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('front')}>Bring to front</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('back')}>Send to back</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('forward')}>Bring forward</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('backward')}>Send backward</button>
              </div>
              <button type="button" className="secondary-btn" onClick={duplicateSelection}>Duplicate</button>
            </div>
            <button type="button" className="danger-btn" onClick={() => deleteField(activeField.id)}>Remove this field</button>
          </>
        ) : activeImage && template && scales ? (
          <>
            {/* ── BOX SECTION (Image Position & Size) ── */}
            <div className={`prop-section-collapsible ${expandedSections.box ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('box')}
                aria-expanded={expandedSections.box}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Position &amp; Size</span>
              </button>
              {expandedSections.box && (
                <div className="prop-section-content">
                  <div className="prop-row-2col">
                    <div className="prop-col">
                      <div className="prop-col-label">Left</div>
                      <input className="prop-input mono" type="number" value={Math.round(activeImage.x * scales.x)} onChange={(event) => updateImage(activeImage.id, { x: Number(event.target.value) / scales.x })} />
                    </div>
                    <div className="prop-col">
                      <div className="prop-col-label">Top</div>
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
              )}
            </div>
            <div className={`prop-section-collapsible ${expandedSections.name ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="prop-section-header"
                onClick={() => toggleSection('name')}
                aria-expanded={expandedSections.name}
              >
                <svg className="section-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span className="section-title">Name</span>
              </button>
              {expandedSections.name && (
                <div className="prop-section-content">
                  <div className="prop-row">
                    <input className="prop-input" value={activeImage.name || ''} onChange={(event) => updateImage(activeImage.id, { name: event.target.value })} placeholder="Image name" />
                  </div>
                </div>
              )}
            </div>
            <div className="prop-section-content">
              <div className="arrange-grid">
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('front')}>Bring to front</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('back')}>Send to back</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('forward')}>Bring forward</button>
                <button type="button" className="arrange-btn" onClick={() => reorderSelectionLayers('backward')}>Send backward</button>
              </div>
              <button type="button" className="secondary-btn" onClick={duplicateSelection}>Duplicate</button>
            </div>
            <button type="button" className="danger-btn" onClick={() => deleteImage(activeImage.id)}>Remove this image</button>
          </>
        ) : (
          <div className="props-empty">
            <div className="props-empty-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 9h6M9 13h6M9 17h4"/>
              </svg>
            </div>
            <p>Click on a text field or image on the canvas to see its settings here.</p>
            {!template && <p style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>Open a certificate template first using the File menu above.</p>}
          </div>
        )}
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="preview-panel">
          <div className="preview-panel-header">
            Latest Preview
            <div className="preview-panel-actions">
              <button type="button" className="preview-open-link" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>Open ↗</button>
              <button type="button" className="preview-close-link" onClick={closePreview}>Close</button>
            </div>
          </div>
          <iframe title="Certificate preview" src={previewUrl} className="preview-frame" />
        </div>
      )}


    </div>
  );
}
