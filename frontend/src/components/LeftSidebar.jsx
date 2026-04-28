import { useState } from 'react';

export default function LeftSidebar({
  orderedCanvasItems,
  fields,
  imageItems,
  activeFieldId,
  activeImageId,
  selectedFieldIds,
  selectedImageIds,
  useCsv,
  commitActiveEditingDraft,
  setIsEditingText,
  selectSingleField,
  selectSingleImage,
  getMappedColumnForField,
  getFieldDisplayName,
  importImageElement,
  addTextField,
  reorderLayerByDrag,
}) {
  const [layersOpen, setLayersOpen] = useState(true);
  const [dragFromIndex, setDragFromIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Display order: top layer first (reversed z-order)
  const displayItems = [...orderedCanvasItems].reverse();
  const totalItems = displayItems.length;

  const handleDragStart = (e, index) => {
    setDragFromIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragFromIndex) setDragOverIndex(index);
  };

  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    if (dragFromIndex !== null && dragFromIndex !== toIndex) {
      reorderLayerByDrag(dragFromIndex, toIndex);
    }
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="sidebar-left">
      <div className="sidebar-sections">
        <div className="sidebar-section">
          {/* Collapsible header */}
          <button
            type="button"
            className="sidebar-section-header"
            onClick={() => setLayersOpen((o) => !o)}
            aria-expanded={layersOpen}
          >
            <div className="sidebar-section-header-main">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <span>Layers</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tab-count">{totalItems}</span>
              <svg
                className={`sidebar-section-caret${layersOpen ? ' expanded' : ''}`}
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </button>

          {layersOpen && (
          <div className="sidebar-content">
            <div
              className="layer-list"
              role="listbox"
              aria-label="Layers (drag to reorder)"
              onDragLeave={(e) => {
                // Only clear dragOver when leaving the whole list
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDragOverIndex(null);
                }
              }}
            >
              {displayItems.map((item, displayIndex) => {
                const isField = item.kind === 'field';
                const field = isField ? fields.find((f) => f.id === item.id) : null;
                const image = !isField ? imageItems.find((i) => i.id === item.id) : null;
                const isSelected = isField
                  ? selectedFieldIds.includes(item.id)
                  : selectedImageIds.includes(item.id);
                const mappedColumn = isField && field ? getMappedColumnForField(field) : null;
                const isCsvMapped = Boolean(mappedColumn);
                const isDragging = dragFromIndex === displayIndex;
                const isDragOver = dragOverIndex === displayIndex;

                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    draggable
                    className={`layer-item${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
                    onDragStart={(e) => handleDragStart(e, displayIndex)}
                    onDragOver={(e) => handleDragOver(e, displayIndex)}
                    onDrop={(e) => handleDrop(e, displayIndex)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      commitActiveEditingDraft();
                      setIsEditingText(false);
                      if (isField) selectSingleField(item.id);
                      else selectSingleImage(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        commitActiveEditingDraft();
                        setIsEditingText(false);
                        if (isField) selectSingleField(item.id);
                        else selectSingleImage(item.id);
                      }
                    }}
                  >
                    {/* Drag grip */}
                    <div className="layer-drag-handle" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 10 16" fill="currentColor">
                        <circle cx="3" cy="2"  r="1.5"/>
                        <circle cx="7" cy="2"  r="1.5"/>
                        <circle cx="3" cy="8"  r="1.5"/>
                        <circle cx="7" cy="8"  r="1.5"/>
                        <circle cx="3" cy="14" r="1.5"/>
                        <circle cx="7" cy="14" r="1.5"/>
                      </svg>
                    </div>

                    {/* Type icon */}
                    <div className={`field-icon ${isField ? 'text-icon' : 'img-icon'}`} aria-hidden="true">
                      {isField ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                    </div>

                    {/* Name + meta */}
                    <div className="field-info">
                      <div className="field-name-row">
                        <div className="field-name">
                          {isField ? getFieldDisplayName(item) : (item.name || 'Image')}
                        </div>
                        {isField && isCsvMapped && <span className="field-source-chip csv">CSV</span>}
                        {isField && !isCsvMapped && useCsv && <span className="field-source-chip manual">Manual</span>}
                      </div>
                      <div className="field-meta">
                        {isField && field
                          ? `${field.font.replace(/^Helvetica$/, 'Sans-serif').replace(/^Times-Roman$/, 'Serif').replace(/^Courier$/, 'Monospace')} / ${field.size}pt`
                          : image
                            ? `${Math.round(image.w)} × ${Math.round(image.h)} px`
                            : 'image'}
                      </div>
                    </div>
                  </div>
                );
              })}

              {totalItems === 0 && (
                <div className="fields-empty">
                  <p>No layers yet. Load a certificate template, then add text fields or images.</p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Add buttons — always visible */}
          <div className="layer-add-row">
              <button type="button" className="add-field-btn layer-add-btn" onClick={addTextField}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
                </svg>
                Text
              </button>
              <label
                className="add-image-btn layer-add-btn"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.currentTarget.querySelector('input[type="file"]')?.click();
                  }
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Image
                <input type="file" accept="image/*" tabIndex={-1} onChange={(event) => { importImageElement(event); }} />
              </label>
            </div>
        </div>
      </div>
    </div>
  );
}
