import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(el, event) {
  const nodes = Array.from(el.querySelectorAll(FOCUSABLE));
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function BulkDrawer({
  open,
  onClose,
  useCsv,
  setUseCsv,
  csvFile,
  csvHeaders,
  csvFirstRow,
  csvRowCount,
  generateOptions,
  handleCsvFileChange,
  updateFieldMapping,
  updatePreviewRow,
  fieldMappings,
  mappedFieldCount,
  fields,
  getFieldDisplayName,
  autoMapFields,
}) {
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const unmappedCount = Math.max(0, fields.length - mappedFieldCount);

  useEffect(() => {
    if (!open) return undefined;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && drawerRef.current) {
        trapFocus(drawerRef.current, event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bulk-drawer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk Generation"
    >
      <div className="bulk-drawer" ref={drawerRef} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bulk-drawer-header">
          <div className="bulk-drawer-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
            <div>
              <div className="bulk-drawer-title">Bulk Generate</div>
              <div className="bulk-drawer-subtitle">Generate one personalised certificate per row from a spreadsheet</div>
            </div>
          </div>
          <div className="bulk-drawer-header-right">
            {useCsv && fields.length > 0 && (
              <div className="bulk-drawer-status">
                <span className="bulk-file-badge">Mapped {mappedFieldCount}/{fields.length}</span>
                {unmappedCount > 0 && <span className="bulk-warning-badge">{unmappedCount} need attention</span>}
              </div>
            )}
            <button ref={closeButtonRef} type="button" className="bulk-drawer-close" onClick={onClose} aria-label="Close bulk drawer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="bulk-drawer-body">
          {/* Toggle + upload inline when active */}
          <div className="bulk-drawer-section bulk-drawer-toprow">
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
              <p className="csv-hint" style={{ marginTop: 6 }}>
                Upload a spreadsheet and CertStudio will create one personalised certificate per row — download them all as a ZIP.
              </p>
            )}
          </div>

          {useCsv && (
            <div className="bulk-drawer-section bulk-drawer-upload-strip">
              <label
                className="upload-csv-btn upload-csv-btn--compact"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.currentTarget.querySelector('input[type="file"]')?.click();
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {csvFile ? csvFile.name : 'Upload .csv'}
                <input type="file" accept=".csv" tabIndex={-1} onChange={handleCsvFileChange} />
              </label>
              {csvFile && csvRowCount > 0 && (
                <div className="bulk-drawer-file-meta">
                  <span className="bulk-file-badge">{csvRowCount} rows</span>
                  <span className="bulk-file-badge">{csvHeaders.length} cols</span>
                </div>
              )}
              {!csvFile && <span className="csv-hint-inline">Upload a CSV to map fields</span>}
            </div>
          )}

          {useCsv && csvFile && csvHeaders.length > 0 && (
            <>
              {/* Compact preview row nav */}
              {csvRowCount > 0 && (
                <div className="bulk-drawer-section bulk-row-compact">
                  <button
                    type="button"
                    className="bulk-row-nav"
                    disabled={generateOptions.row <= 0}
                    onClick={() => updatePreviewRow(generateOptions.row - 1)}
                    aria-label="Preview previous row"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span className="bulk-row-label">
                    Row <strong>{Number(generateOptions.row) + 1}</strong> of {csvRowCount}
                  </span>
                  <button
                    type="button"
                    className="bulk-row-nav"
                    disabled={generateOptions.row >= csvRowCount - 1}
                    onClick={() => updatePreviewRow(generateOptions.row + 1)}
                    aria-label="Preview next row"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              )}

              {/* Field mapping — single column, inline preview values */}
              <div className="bulk-drawer-section">
                <div className="bulk-drawer-mapping-header">
                  <div>
                    <div className="data-subtitle">Column Mapping</div>
                    <span className="bulk-drawer-mapping-hint">Connect each text field to a spreadsheet column</span>
                  </div>
                  {fields.length > 0 && (
                    <button type="button" className="bulk-autofill-btn" onClick={autoMapFields}>
                      Auto-map
                    </button>
                  )}
                </div>

                {fields.length > 0 ? (
                  <div className="field-mappings">
                    {fields.map((field) => {
                      const mappedColumn = fieldMappings[field.name] || '';
                      const isMapped = Boolean(mappedColumn);
                      const previewValue = isMapped && csvFirstRow ? (csvFirstRow[mappedColumn] ?? '') : '';

                      return (
                        <div key={field.id} className={`mapping-row-v2 ${isMapped ? 'mapped' : 'unmapped'}`}>
                          <div className="mapping-row-v2-top">
                            <span className="mapping-field-name">{getFieldDisplayName(field)}</span>
                            <select
                              value={mappedColumn}
                              onChange={(event) => updateFieldMapping(field.name, event.target.value)}
                            >
                              <option value="">— not mapped —</option>
                              {csvHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                            </select>
                          </div>
                          {isMapped && previewValue && (
                            <div className="mapping-row-v2-preview" title={`${mappedColumn}: ${previewValue}`}>
                              {previewValue}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="csv-hint">Add text fields to your certificate first, then map them here.</p>
                )}
              </div>
            </>
          )}

          {useCsv && csvFile && csvHeaders.length === 0 && (
            <p className="csv-hint">No columns found — the spreadsheet may be empty.</p>
          )}
          {useCsv && !csvFile && (
            <p className="csv-hint">Upload a CSV file to create one certificate per person.</p>
          )}
        </div>
      </div>
    </div>
  );
}
