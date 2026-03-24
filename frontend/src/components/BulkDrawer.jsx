export default function BulkDrawer({
  open,
  onClose,
  useCsv,
  setUseCsv,
  csvFile,
  csvHeaders,
  csvFirstRow,
  csvRowCount,
  spreadsheetMappingOpen,
  setSpreadsheetMappingOpen,
  handleCsvFileChange,
  updateFieldMapping,
  fieldMappings,
  fields,
  getFieldDisplayName,
}) {
  if (!open) return null;

  return (
    <div
      className="bulk-drawer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk Generation"
    >
      <div className="bulk-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bulk-drawer-header">
          <div className="bulk-drawer-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
            <div>
              <div className="bulk-drawer-title">Bulk Generation</div>
              <div className="bulk-drawer-subtitle">Generate one personalised certificate per row from a spreadsheet</div>
            </div>
          </div>
          <button type="button" className="bulk-drawer-close" onClick={onClose} aria-label="Close bulk drawer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="bulk-drawer-body">
          {/* Toggle */}
          <div className="bulk-drawer-section">
            <div
              className="data-csv-toggle"
              role="switch"
              aria-checked={useCsv}
              tabIndex={0}
              onClick={() => setUseCsv(!useCsv)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUseCsv(!useCsv); } }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
              <span className="csv-toggle-label">Generate from a list</span>
              <div className={`toggle-switch ${useCsv ? 'on' : ''}`} aria-hidden="true" />
            </div>
            {!useCsv && (
              <p className="csv-hint" style={{ marginTop: 10 }}>
                Upload a spreadsheet and CertStudio will create one personalised certificate per row — download them all as a ZIP.
              </p>
            )}
          </div>

          {useCsv && (
            <>
              {/* CSV upload + file meta */}
              <div className="bulk-drawer-section">
                <div className="bulk-drawer-upload-row">
                  <label
                    className="upload-csv-btn"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.currentTarget.querySelector('input[type="file"]')?.click();
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {csvFile ? csvFile.name : 'Upload spreadsheet (.csv)'}
                    <input type="file" accept=".csv" tabIndex={-1} onChange={handleCsvFileChange} />
                  </label>
                  {csvFile && csvRowCount > 0 && (
                    <div className="bulk-drawer-file-meta">
                      <span className="bulk-file-badge">{csvRowCount} rows</span>
                      <span className="bulk-file-badge">{csvHeaders.length} columns</span>
                    </div>
                  )}
                </div>
                {csvFile && csvHeaders.length === 0 && (
                  <p className="csv-hint">No columns found — the spreadsheet may be empty.</p>
                )}
                {!csvFile && (
                  <p className="csv-hint">Upload a CSV file to create one certificate per person.</p>
                )}
              </div>

              {/* Mapping */}
              {csvFile && csvHeaders.length > 0 && (
                <div className="bulk-drawer-section">
                  <div className="bulk-drawer-mapping-header">
                    <div className="data-subtitle">Column Mapping</div>
                    <span className="bulk-drawer-mapping-hint">Connect each text field to a spreadsheet column</span>
                  </div>
                  <div className="bulk-drawer-columns-row">
                    <div className="bulk-drawer-cols-detected">
                      <div className="data-subtitle" style={{ marginBottom: 6, fontSize: 10 }}>Detected columns</div>
                      <div className="csv-headers-list">
                        {csvHeaders.map((header, idx) => <span key={idx} className="csv-header-chip">{header}</span>)}
                      </div>
                    </div>
                    {fields.length > 0 && (
                      <div className="bulk-drawer-field-map">
                        <div className="data-subtitle" style={{ marginBottom: 6, fontSize: 10 }}>Field → Column</div>
                        <div className="field-mappings">
                          {fields.map((field) => (
                            <label key={field.id} className="mapping-row">
                              <span className="mapping-field-name">{getFieldDisplayName(field)}</span>
                              <select
                                value={fieldMappings[field.name] || ''}
                                onChange={(event) => updateFieldMapping(field.name, event.target.value)}
                              >
                                <option value="">— preview only —</option>
                                {csvHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.length === 0 && (
                      <p className="csv-hint">Add text fields to your certificate first, then map them to columns here.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
