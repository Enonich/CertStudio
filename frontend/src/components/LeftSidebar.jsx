export default function LeftSidebar({
  sidebarSections,
  orderedCanvasItems,
  fields,
  imageItems,
  activeFieldId,
  activeImageId,
  selectedFieldIds,
  selectedImageIds,
  useCsv,
  fieldMappings,
  toggleSidebarSection,
  commitActiveEditingDraft,
  setIsEditingText,
  setActiveImageId,
  setActiveFieldId,
  selectSingleField,
  selectSingleImage,
  getMappedColumnForField,
  getFieldDisplayName,
  importImageElement,
  addTextField,
}) {
  return (
    <div className="sidebar-left">
      <div className="sidebar-sections">
        <div className={`sidebar-section ${sidebarSections.fields ? 'expanded' : 'collapsed'}`}>
          <button
            type="button"
            className="sidebar-section-header"
            onClick={() => toggleSidebarSection('fields')}
            aria-expanded={sidebarSections.fields}
          >
            <div className="sidebar-section-header-main">
              <svg className={`sidebar-section-caret ${sidebarSections.fields ? 'expanded' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              <span>Text Fields</span>
            </div>
            <span className="tab-count">{fields.length}</span>
          </button>
          {sidebarSections.fields && (
            <div className="sidebar-content">
              {fields.map((field) => {
                const mappedColumn = getMappedColumnForField(field);
                const isCsvMapped = Boolean(mappedColumn);
                return (
                  <div
                    key={field.id}
                    role="option"
                    aria-selected={activeFieldId === field.id}
                    tabIndex={0}
                    className={`field-item ${selectedFieldIds.includes(field.id) ? 'selected' : ''}`}
                    onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); selectSingleField(field.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commitActiveEditingDraft(); setIsEditingText(false); selectSingleField(field.id); } }}
                  >
                    <div className="field-icon text-icon">T</div>
                    <div className="field-info">
                      <div className="field-name-row">
                        <div className="field-name">{getFieldDisplayName(field)}</div>
                        {isCsvMapped && <span className="field-source-chip csv">CSV</span>}
                        {!isCsvMapped && useCsv && <span className="field-source-chip manual">Manual</span>}
                      </div>
                      <div className="field-meta">{field.font.replace(/^Helvetica$/, 'Sans-serif').replace(/^Times-Roman$/, 'Serif').replace(/^Courier$/, 'Monospace')} / {field.size}pt</div>
                    </div>
                  </div>
                );
              })}
              {fields.length === 0 && (
                <div className="fields-empty">
                  <p>Click and drag on your certificate to add a text area.</p>
                </div>
              )}
              <button
                type="button"
                className="add-field-btn"
                onClick={addTextField}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Text Field
              </button>
            </div>
          )}
        </div>

        <div className={`sidebar-section ${sidebarSections.images ? 'expanded' : 'collapsed'}`}>
          <button
            type="button"
            className="sidebar-section-header"
            onClick={() => toggleSidebarSection('images')}
            aria-expanded={sidebarSections.images}
          >
            <div className="sidebar-section-header-main">
              <svg className={`sidebar-section-caret ${sidebarSections.images ? 'expanded' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Images</span>
            </div>
            <span className="tab-count">{imageItems.length}</span>
          </button>
          {sidebarSections.images && (
            <div className="sidebar-content">
              {imageItems.map((image) => (
                <div
                  key={image.id}
                  role="option"
                    aria-selected={activeImageId === image.id}
                    tabIndex={0}
                    className={`field-item ${selectedImageIds.includes(image.id) ? 'selected' : ''}`}
                    onClick={() => { commitActiveEditingDraft(); setIsEditingText(false); selectSingleImage(image.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commitActiveEditingDraft(); setIsEditingText(false); selectSingleImage(image.id); } }}
                >
                  <div className="field-icon img-icon">IMG</div>
                  <div className="field-info">
                    <div className="field-name">{image.name || 'Image'}</div>
                    <div className="field-meta">{Math.round(image.w)} x {Math.round(image.h)} px</div>
                  </div>
                </div>
              ))}
              {imageItems.length === 0 && (
                <div className="fields-empty">
                  <p>No images added yet.<br/>You can add logos, signatures, or decorative elements.</p>
                  <p className="hint">Use File &gt; Place image or signature</p>
                </div>
              )}
              <label
                className="add-image-btn"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.currentTarget.querySelector('input[type="file"]')?.click();
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Place image…
                <input type="file" accept="image/*" tabIndex={-1} onChange={(event) => { importImageElement(event); }} />
              </label>
            </div>
          )}
        </div>

        <div className={`sidebar-section ${sidebarSections.layers ? 'expanded' : 'collapsed'}`}>
          <button
            type="button"
            className="sidebar-section-header"
            onClick={() => toggleSidebarSection('layers')}
            aria-expanded={sidebarSections.layers}
          >
            <div className="sidebar-section-header-main">
              <svg className={`sidebar-section-caret ${sidebarSections.layers ? 'expanded' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <span>Layers</span>
            </div>
            <span className="tab-count">{fields.length + imageItems.length}</span>
          </button>
          {sidebarSections.layers && (
            <div className="sidebar-content">
              {[...orderedCanvasItems].reverse().map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  role="option"
                  aria-selected={item.kind === 'field' ? selectedFieldIds.includes(item.id) : selectedImageIds.includes(item.id)}
                  tabIndex={0}
                  className={`field-item ${(item.kind === 'field' ? selectedFieldIds.includes(item.id) : selectedImageIds.includes(item.id)) ? 'selected' : ''}`}
                  onClick={() => {
                    commitActiveEditingDraft();
                    setIsEditingText(false);
                    if (item.kind === 'field') {
                      selectSingleField(item.id);
                    } else {
                      selectSingleImage(item.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      commitActiveEditingDraft();
                      setIsEditingText(false);
                      if (item.kind === 'field') {
                        selectSingleField(item.id);
                      } else {
                        selectSingleImage(item.id);
                      }
                    }
                  }}
                >
                  <div className={`field-icon ${item.kind === 'field' ? 'text-icon' : 'img-icon'}`}>{item.kind === 'field' ? 'T' : 'IMG'}</div>
                  <div className="field-info">
                    <div className="field-name">{item.kind === 'field' ? getFieldDisplayName(item) : (item.name || 'Image')}</div>
                    <div className="field-meta">{item.kind === 'field' ? 'text field' : 'image'} / layer {item.z + 1}</div>
                  </div>
                </div>
              ))}
              {fields.length === 0 && imageItems.length === 0 && (
                <div className="fields-empty">
                  <p>No layers yet. Add text fields or images to your certificate to see them here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
