import { useEditorStore } from '../store/useEditorStore';

export default function TopBar({
  // Derived / non-store values
  previewUrl,
  latestDownload,
  isPreviewingAll,
  projectFileHandle,
  selectedFieldsName,
  saveFieldsName,
  fieldsList,
  session,
  canUndo,
  canRedo,
  // Setters for non-store state
  setSelectedFieldsName,
  setSaveFieldsName,
  // Handlers
  handleTemplatePickerChange,
  loadFromFile,
  saveProjectToFile,
  saveProjectAsToFile,
  exportJson,
  loadFromBackend,
  saveToBackend,
  refreshFieldsList,
  importImageElement,
  closePreview,
  performUndo,
  performRedo,
  generatePdf,
  printCurrentCertificate,
  previewAllCertificates,
  downloadLatestFile,
  signOut,
  updatePreviewRow,
  canPrintFromCsv,
}) {
  const {
    insertMenuOpen, setInsertMenuOpen,
    layoutsMenuOpen, setLayoutsMenuOpen,
    settingsMenuOpen, setSettingsMenuOpen,
    generateMenuOpen, setGenerateMenuOpen,
    printMenuOpen, setPrintMenuOpen,
    template, fields, imageItems,
    csvFile, csvRowCount, generateOptions, setGenerateOptions,
    useCsv, isGenerating,
    bulkDrawerOpen, setBulkDrawerOpen,
  } = useEditorStore();

  const isGenerateActionDisabled = !template || fields.length === 0;
  const generateDisabledTooltip = 'Open a certificate template before generating';
  const handleFileLabelKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.querySelector('input[type="file"]')?.click();
    }
  };

  return (
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
            onClick={() => { setInsertMenuOpen(!insertMenuOpen); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); setPrintMenuOpen(false); }}
            aria-haspopup="true"
            aria-expanded={insertMenuOpen}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/></svg>
            File
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {insertMenuOpen && (
            <div className="nav-dropdown nav-dropdown--wide">
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">Open</div>
                <label className="nav-dropdown-item nav-dropdown-item--file" role="button" tabIndex={0} onKeyDown={handleFileLabelKeyDown}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="3" width="14" height="11" rx="1.5"/><path d="M1 6h14M5 1l-2 2M11 1l2 2"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Open certificate template…</span>
                    <span className="nav-item-hint">Choose a PDF, JPG, or PNG as your certificate background</span>
                  </span>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" tabIndex={-1} onChange={handleTemplatePickerChange} />
                </label>
                <label className="nav-dropdown-item nav-dropdown-item--file" role="button" tabIndex={0} onKeyDown={handleFileLabelKeyDown}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 1v9M4 6l4 4 4-4"/><path d="M1 12v2a1 1 0 001 1h12a1 1 0 001-1v-2"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Open project…</span>
                    <span className="nav-item-hint">Continue from a saved project file</span>
                  </span>
                  <input type="file" accept=".json,.certproj" tabIndex={-1} onChange={(event) => { loadFromFile(event); setInsertMenuOpen(false); }} />
                </label>
              </div>
              <div className="nav-dropdown-divider" />
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">Save</div>
                <button type="button" className="nav-dropdown-item" onClick={() => { saveProjectToFile(); setInsertMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 14H3a1 1 0 01-1-1V3a1 1 0 011-1h7.5L14 5.5V13a1 1 0 01-1 1z"/><rect x="5" y="9" width="6" height="5"/><rect x="4" y="1" width="6" height="4"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Save project</span>
                    <span className="nav-item-hint">{projectFileHandle?.name ? `Overwrite ${projectFileHandle.name}` : 'Save your template and all text fields'}</span>
                  </span>
                  <span className="nav-item-shortcut">Ctrl+S</span>
                </button>
                <button type="button" className="nav-dropdown-item" onClick={() => { saveProjectAsToFile(); setInsertMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 14H3a1 1 0 01-1-1V3a1 1 0 011-1h7.5L14 5.5V13a1 1 0 01-1 1z"/><path d="M9 1v4M11 3H7"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Save project as…</span>
                    <span className="nav-item-hint">Save a copy to a different location</span>
                  </span>
                  <span className="nav-item-shortcut">Ctrl+Shift+S</span>
                </button>
              </div>
              <div className="nav-dropdown-divider" />
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">Insert</div>
                <label className="nav-dropdown-item nav-dropdown-item--file" role="button" tabIndex={0} onKeyDown={handleFileLabelKeyDown}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M2 10.5l3.5-3.5 3 3 2-2 3.5 3.5"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Place image or signature…</span>
                    <span className="nav-item-hint">Add a logo, seal, or signature that you can move and resize</span>
                  </span>
                  <input type="file" accept="image/*" tabIndex={-1} onChange={(event) => { importImageElement(event); setInsertMenuOpen(false); }} />
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
            onClick={() => { setLayoutsMenuOpen(!layoutsMenuOpen); setInsertMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); setPrintMenuOpen(false); }}
            aria-haspopup="true"
            aria-expanded={layoutsMenuOpen}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Layouts
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {layoutsMenuOpen && (
            <div className="nav-dropdown nav-dropdown--wide">
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">Saved Layouts</div>
                <div className="nav-dropdown-inline-row">
                  <select value={selectedFieldsName} onChange={(event) => setSelectedFieldsName(event.target.value)} className="nav-dropdown-select">
                    <option value="">Select saved layout…</option>
                    {fieldsList.map((name) => (<option key={name} value={name}>{name}</option>))}
                  </select>
                  <button type="button" className="nav-inline-btn" onClick={loadFromBackend} disabled={!selectedFieldsName}>Load</button>
                  <button type="button" className="nav-inline-btn" onClick={() => saveToBackend(false)} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>Save</button>
                  <button type="button" className="nav-inline-btn nav-inline-btn--icon" onClick={refreshFieldsList} data-tip="Refresh" aria-label="Refresh layouts">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.7 8A5.7 5.7 0 112.3 5.3"/><path d="M2 2v3.3h3.3"/></svg>
                  </button>
                </div>
              </div>
              <div className="nav-dropdown-divider" />
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">My Computer</div>
                <label className="nav-dropdown-item nav-dropdown-item--file" role="button" tabIndex={0} onKeyDown={handleFileLabelKeyDown}>
                  <span className="nav-item-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 1v9M4 6l4 4 4-4"/><path d="M1 12v2a1 1 0 001 1h12a1 1 0 001-1v-2"/></svg></span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Open layout file…</span>
                    <span className="nav-item-hint">Open a layout you saved earlier</span>
                  </span>
                  <input type="file" accept=".json,.certproj" tabIndex={-1} onChange={(event) => { loadFromFile(event); setLayoutsMenuOpen(false); }} />
                </label>
                <div className="nav-dropdown-inline-row">
                  <input className="nav-dropdown-input" value={saveFieldsName} onChange={(event) => setSaveFieldsName(event.target.value)} placeholder="my-certificate-layout" />
                  <button type="button" className="nav-inline-btn" onClick={() => { exportJson(); setLayoutsMenuOpen(false); }} disabled={!template || (fields.length === 0 && imageItems.length === 0)}>Save to File</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PRINT menu */}
        <div className="nav-menu-item topbar-print">
          <button
            type="button"
            className={`menu-btn ${printMenuOpen ? 'open' : ''}`}
            onClick={() => { setPrintMenuOpen(!printMenuOpen); setInsertMenuOpen(false); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); }}
            aria-haspopup="true"
            aria-expanded={printMenuOpen}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V3h12v6M6 19h12v-6H6z"/><path d="M6 14H4a2 2 0 01-2-2v-1a2 2 0 012-2h1"/></svg>
            Print
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {printMenuOpen && (
            <div className="nav-dropdown nav-dropdown--wide">
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">Print Current Certificate</div>
                {canPrintFromCsv && (
                  <div className="nav-form-row">
                    <label className="nav-form-label">Row</label>
                    <input
                      className="nav-dropdown-input"
                      type="number"
                      min={1}
                      max={csvRowCount}
                      value={Number(generateOptions.row) + 1}
                      onChange={(event) => {
                        const raw = Number(event.target.value) || 1;
                        const clamped = Math.min(Math.max(raw, 1), csvRowCount);
                        updatePreviewRow(clamped - 1);
                      }}
                    />
                  </div>
                )}
                {!canPrintFromCsv && useCsv && csvFile && (
                  <p className="nav-dropdown-note">No rows found in this spreadsheet. Printing will use your current field values.</p>
                )}
                {!canPrintFromCsv && useCsv && !csvFile && (
                  <p className="nav-dropdown-note">No spreadsheet uploaded. Printing will use your current field values.</p>
                )}
                <div className="nav-dropdown-inline-row">
                  <button
                    type="button"
                    className="nav-inline-btn"
                    onClick={() => { printCurrentCertificate(); setPrintMenuOpen(false); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9V3h12v6M6 19h12v-6H6z"/>
                      <path d="M6 14H4a2 2 0 01-2-2v-1a2 2 0 012-2h1"/>
                    </svg>
                    {canPrintFromCsv ? 'Print this certificate' : 'Print current certificate'}
                  </button>
                  {canPrintFromCsv && (
                    <span className="nav-item-hint">Row {Number(generateOptions.row) + 1} of {csvRowCount}</span>
                  )}
                </div>
              </div>
              {canPrintFromCsv && (
                <>
                  <div className="nav-dropdown-divider" />
                  <div className="nav-dropdown-section">
                    <div className="nav-dropdown-section-title">Preview &amp; Print All</div>
                    <button
                      type="button"
                      className="nav-dropdown-item"
                      onClick={() => { previewAllCertificates(); setPrintMenuOpen(false); }}
                      disabled={isPreviewingAll}
                    >
                      <span className="nav-item-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </span>
                      <span className="nav-item-text">
                        <span className="nav-item-label">Preview All Certificates</span>
                        <span className="nav-item-hint">{csvRowCount} total - navigate and select for printing</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* BULK GENERATION button */}
        <div className="topbar-divider" style={{ margin: '0 6px' }} />
        <button
          type="button"
          className={`bulk-menu-btn ${useCsv ? 'active' : ''}`}
          onClick={() => { setBulkDrawerOpen(!bulkDrawerOpen); setInsertMenuOpen(false); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); setGenerateMenuOpen(false); setPrintMenuOpen(false); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
          Bulk Generate
          {useCsv && csvRowCount > 0 && <span className="bulk-menu-btn-indicator">{csvRowCount}</span>}
        </button>
      </div>
      <div className="topbar-spacer" />

      <div className="template-status" title={template?.name ?? ''}>
        <div className="template-dot" />
        {template?.name?.replace(/\.[^.]+$/, '') ?? 'No certificate template'}
      </div>

      <div className="topbar-actions">
        <button type="button" aria-label="Undo" className="btn-icon" data-tip="Undo (Ctrl+Z)" onClick={performUndo} disabled={!canUndo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v6h6M20.5 6.5c-1.5-1-3.5-1.5-5.5-1.5-5 0-9 4-9 9"/></svg>
        </button>
        <button type="button" aria-label="Redo" className="btn-icon" data-tip="Redo (Ctrl+Y)" onClick={performRedo} disabled={!canRedo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9v6h-6M3.5 6.5c1.5-1 3.5-1.5 5.5-1.5 5 0 9 4 9 9"/></svg>
        </button>
        {previewUrl && (
          <>
            <button type="button" aria-label="Open PDF preview in new tab" className="btn-icon" data-tip="Open preview" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" aria-label="Close preview" className="btn-icon" data-tip="Close preview" onClick={closePreview}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </>
        )}
        <div style={{ width: 8 }} />
        <div className="topbar-generate" title={isGenerateActionDisabled ? generateDisabledTooltip : ''}>
          <div className="generate-btn-group">
            <button type="button" className="btn-generate" disabled={isGenerateActionDisabled || isGenerating} onClick={generatePdf}>
              {isGenerating ? (<><span className="generate-spinner" />Generating…</>) : useCsv && csvFile && generateOptions.generate_all ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Generate All ({csvRowCount})</>) : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Generate PDF</>)}
            </button>
            <button type="button" className="btn-generate-arrow" disabled={isGenerateActionDisabled} onClick={() => { setGenerateMenuOpen(!generateMenuOpen); setInsertMenuOpen(false); setLayoutsMenuOpen(false); setSettingsMenuOpen(false); setPrintMenuOpen(false); }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          {generateMenuOpen && (
            <div className="nav-dropdown nav-dropdown--right nav-dropdown--wide">
              <div className="nav-dropdown-section">
                <div className="nav-dropdown-section-title">PDF Options</div>
                <div className="nav-form-row">
                  <label className="nav-form-label">Include background</label>
                  <select className="nav-dropdown-select" value={generateOptions.output_mode} onChange={(event) => setGenerateOptions((prev) => ({ ...prev, output_mode: event.target.value }))}>
                    <option value="full_pdf">Yes — include certificate background</option>
                    <option value="overlay_only">No — text and images only</option>
                  </select>
                </div>
                <div className="nav-form-row">
                  <label className="nav-form-label">Export size</label>
                  <select className="nav-dropdown-select" value={generateOptions.page_size} onChange={(event) => setGenerateOptions((prev) => ({ ...prev, page_size: event.target.value }))}>
                    <option value="letter">Letter (8.5 x 11 in)</option>
                    <option value="a4">A4 (210 x 297 mm)</option>
                    <option value="legal">Legal (8.5 x 14 in)</option>
                  </select>
                </div>
              </div>
              {useCsv && csvFile && (
                <>
                  <div className="nav-dropdown-divider" />
                  <div className="nav-dropdown-section">
                    <div className="nav-dropdown-section-title">Bulk Generation</div>
                    <label className="nav-dropdown-item nav-dropdown-item--check">
                      <input
                        type="checkbox"
                        checked={generateOptions.generate_all}
                        onChange={(event) => setGenerateOptions((prev) => ({ ...prev, generate_all: event.target.checked }))}
                      />
                      <span className="nav-item-text">
                        <span className="nav-item-label">Generate one per row</span>
                        <span className="nav-item-hint">
                          {csvRowCount > 0
                            ? `Creates ${csvRowCount} certificates (one per data row), downloads as a ZIP file`
                            : 'Creates one certificate per person, downloads as a ZIP file'}
                        </span>
                      </span>
                    </label>
                    {csvRowCount > 0 && (
                      <>
                        <div className="nav-form-row" style={{ marginTop: 6 }}>
                          <label className="nav-form-label">Preview row</label>
                          <input
                            className="nav-dropdown-input"
                            type="number"
                            min={1}
                            max={csvRowCount}
                            value={Number(generateOptions.row) + 1}
                            onChange={(event) => {
                              const raw = Number(event.target.value) || 1;
                              const clamped = Math.min(Math.max(raw, 1), csvRowCount);
                              updatePreviewRow(clamped - 1);
                            }}
                          />
                        </div>
                        <div className="nav-form-row">
                          <span className="nav-item-hint">Row {Number(generateOptions.row) + 1} selected for single-certificate generation.</span>
                        </div>
                      </>
                    )}
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
                        <span className="nav-item-label">{latestDownload.kind === 'zip' ? 'Download All Certificates (ZIP)' : 'Download Certificate (PDF)'}</span>
                        <span className="nav-item-hint">Your most recently generated file</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* USER AVATAR / SIGN OUT */}
      <div className="topbar-divider" />
      <button
        type="button"
        className="topbar-avatar-btn"
        aria-label={`Sign out (${session?.user?.email ?? ''})`}
        title={session?.user?.email ?? 'Account'}
        onClick={signOut}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </button>
    </div>
  );
}
