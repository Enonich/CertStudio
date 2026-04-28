import { useRef, useState } from 'react';
import {
  resolveFontTokenToCss,
  colorArrayToCss,
  hexToColorArray,
  plainTextToHtml,
  sanitizeHtml,
  getCaretOffset,
  createRangeFromOffset,
} from '../lib/colorUtils';
import { fitSizeForPreview } from '../lib/canvasUtils';
import FloatingToolbar from './FloatingToolbar';

export default function CanvasArea({
  template,
  fields,
  imageItems,
  orderedCanvasItems,
  sampleValues,
  sampleHtmlValues,
  fieldMappings,
  useCsv,
  zoom,
  toolMode,
  activeFieldId,
  isEditingText,
  activeImageId,
  selectedFieldIds,
  selectedImageIds,
  selectedCount,
  selectionBounds,
  draftBox,
  alignmentGuides,
  fontHoverFamily,
  colorHoverValue,
  sizeHoverValue,
  templateInputRef,
  layerRef,
  editingDraftRef,
  lastSelectionRangeRef,
  toolbarInteractionRef,
  beginDraw,
  moveDraw,
  endDraw,
  beginMove,
  beginResize,
  selectSingleField,
  selectSingleImage,
  toggleItemSelection,
  setActiveFieldId,
  setActiveImageId,
  setIsEditingText,
  setSampleValues,
  setSampleHtmlValues,
  commitActiveEditingDraft,
  commitFieldDraft,
  selectionInsideEditor,
  updateField,
  fitTemplateToCanvas,
  setZoom,
  handleFieldDoubleClick,
  handleWorkspaceBrowseFile,
  openWorkspaceFile,
  applyInlineCommandOrFieldUpdate,
  handleInlineStyleClick,
  deleteSelection,
  duplicateSelection,
  reorderSelectionLayers,
  fontPickerGroups,
  cacheSelectionRangeFromEditor,
  requestFont,
}) {
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const renderFieldItem = (field) => {
    const sampleText = sampleValues[field.name] ?? `{${field.name}}`;
    const committedHtml = sampleHtmlValues[field.name];
    const fallbackHtml = plainTextToHtml(sampleText);
    const displayHtml = committedHtml ?? fallbackHtml;
    const isCsvMappedField = useCsv && Boolean(fieldMappings[field.name]);
    const hoveredColorArray = colorHoverValue ? hexToColorArray(colorHoverValue) : field.color;
    const isActive = activeFieldId === field.id;
    const isSelected = selectedFieldIds.includes(field.id);
    const previewSizePt = isActive && sizeHoverValue ? Number(sizeHoverValue) : Number(field.size);
    const previewFontPx = (previewSizePt / template.pageHeightPt) * template.displayHeight;
    const fittedPx = field.maxWidth ? fitSizeForPreview(sampleText, field.w, previewFontPx) : previewFontPx;
    const isInlineEditing = isActive && selectedCount === 1 && isEditingText && !isCsvMappedField;
    const hasSelectionPreview =
      isActive &&
      isInlineEditing &&
      !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);
    const previewFontToken =
      isActive && fontHoverFamily && !hasSelectionPreview ? fontHoverFamily : field.font;
    const previewFontCss = resolveFontTokenToCss(previewFontToken);
    const previewColor = isActive ? hoveredColorArray : field.color;

    return (
      <div
        key={field.id}
        className={`field-box ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
        style={{ left: field.x, top: field.y, width: field.w, height: field.h }}
        onMouseDown={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.closest('.resize-handle')) return;
          if (event.shiftKey) {
            event.stopPropagation();
            toggleItemSelection(field.id, 'field');
            return;
          }
          const previewEl = target.closest('.field-preview');
          if (previewEl) {
            event.stopPropagation();
            if (selectedCount > 1 && isSelected) {
              beginMove(event, field.id);
              return;
            }
            if (!isActive || !isSelected) {
              selectSingleField(field.id);
              beginMove(event, field.id);
              return;
            }
            setActiveFieldId(field.id);
            setActiveImageId(null);
            if (isCsvMappedField) {
              setIsEditingText(false);
              beginMove(event, field.id);
              return;
            }
            const isSameEditingField = isEditingText && editingDraftRef.current.name === field.name;
            if (!isSameEditingField) {
              editingDraftRef.current = { name: field.name, html: displayHtml, text: sampleText };
              lastSelectionRangeRef.current = null;
            }
            setIsEditingText(true);
            setTimeout(() => { if (previewEl instanceof HTMLElement) previewEl.focus(); }, 0);
            return;
          }
          selectSingleField(field.id);
          beginMove(event, field.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          const target = event.target;
          if (!(target instanceof HTMLElement) || event.shiftKey) return;
          if (!target.closest('.field-preview') && !target.closest('.resize-handle')) {
            selectSingleField(field.id);
          }
        }}
        onDoubleClick={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.closest('.field-preview') && !isCsvMappedField) {
            const previewEl = target.closest('.field-preview');
            const isSameEditingField = isEditingText && editingDraftRef.current.name === field.name;
            if (!isSameEditingField) {
              editingDraftRef.current = { name: field.name, html: displayHtml, text: sampleText };
              lastSelectionRangeRef.current = null;
            }
            selectSingleField(field.id, { preserveEditing: true });
            setIsEditingText(true);
            setTimeout(() => { if (previewEl instanceof HTMLElement) previewEl.focus(); }, 0);
            return;
          }
          if (!target.closest('.field-preview') && !target.closest('.resize-handle')) {
            handleFieldDoubleClick(field);
          }
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
            if (shouldSeed) {
              node.innerHTML = editingDraftRef.current.html ?? displayHtml;
              node.dataset.editingField = expectedName;
            }
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
            cursor: isInlineEditing ? 'text' : 'move',
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
            const selection = window.getSelection();
            const hasTextSelected =
              !!selection &&
              !selection.isCollapsed &&
              selection.rangeCount > 0 &&
              selectionInsideEditor(event.currentTarget, selection);

            if (isActive && isEditingText) {
              if (hasTextSelected) {
                lastSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
              }
              return;
            }

            if (isActive && !isEditingText && hasTextSelected && !isCsvMappedField) {
              const previewEl = event.currentTarget;
              const range = selection.getRangeAt(0);
              const selStart = getCaretOffset(previewEl, range.startContainer, range.startOffset);
              const selEnd = getCaretOffset(previewEl, range.endContainer, range.endOffset);

              editingDraftRef.current = { name: field.name, html: displayHtml, text: sampleText };
              lastSelectionRangeRef.current = null;
              setIsEditingText(true);

              setTimeout(() => {
                if (!(previewEl instanceof HTMLElement) || !previewEl.isContentEditable) return;
                previewEl.focus();
                try {
                  const newRange = createRangeFromOffset(previewEl, selStart, selEnd);
                  if (newRange) {
                    const sel = window.getSelection();
                    if (sel) {
                      sel.removeAllRanges();
                      sel.addRange(newRange);
                      lastSelectionRangeRef.current = newRange.cloneRange();
                    }
                  }
                } catch (_) { /* best-effort */ }
              }, 0);
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
            const keepEditingSelector = '.toolbar, .floating-toolbar';
            const keepEditingByToolbarFocus = nextTarget instanceof HTMLElement && !!nextTarget.closest(keepEditingSelector);
            const keepEditingByActiveElement = activeElement instanceof HTMLElement && !!activeElement.closest(keepEditingSelector);
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
  };

  const renderImageItem = (image) => {
    const isActiveImage = activeImageId === image.id;
    const isSelectedImage = selectedImageIds.includes(image.id);
    return (
      <div
        key={image.id}
        className={`field-box image-box ${isSelectedImage ? 'selected' : ''} ${isActiveImage ? 'active' : ''}`}
        style={{ left: image.x, top: image.y, width: image.w, height: image.h }}
        onMouseDown={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.closest('.resize-handle')) return;
          if (event.shiftKey) {
            event.stopPropagation();
            toggleItemSelection(image.id, 'image');
            return;
          }
          if (selectedCount > 1 && isSelectedImage) {
            beginMove(event, image.id, 'image');
            return;
          }
          selectSingleImage(image.id);
          beginMove(event, image.id, 'image');
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.shiftKey) return;
          selectSingleImage(image.id);
        }}
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
  };

  const getDraggedFile = (event) => event.dataTransfer?.files?.[0] ?? null;

  const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const supportsWorkspaceFile = (file) => {
    if (!file) return false;
    return /\.(pdf|png|jpe?g|json|certproj)$/i.test(file.name || '');
  };

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
  };

  const handleDragEnter = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (event) => {
    const file = getDraggedFile(event);
    event.preventDefault();
    resetDragState();
    if (!supportsWorkspaceFile(file)) return;
    await openWorkspaceFile(file);
  };

  return (
    <div
      className={`canvas-area ${isDragActive ? 'canvas-area--drag-active' : ''}`}
      id="canvasArea"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={templateInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.json,.certproj"
        className="hidden-file-input"
        onChange={handleWorkspaceBrowseFile}
      />

      {isDragActive && (
        <div className="workspace-drop-overlay" aria-hidden="true">
          <div className="workspace-drop-card">Drop a template or saved project to open it</div>
        </div>
      )}

      {/* Scrollable body — centred when small, scrollable when large */}
      <div className="canvas-scroll-body">
        {!template && (
          <div className="drop-overlay">
            <div className={`drop-zone ${isDragActive ? 'drop-zone--drag-active' : ''}`} onClick={() => templateInputRef.current?.click()}>
              <div className="drop-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div className="drop-title">Open a Certificate Template or Saved Project</div>
              <div className="drop-sub">Drag in a PDF, JPG, PNG, or saved project file, or browse to start editing.</div>
              <button className="btn-browse" type="button">Browse Files</button>
              <div className="drop-formats">PDF / PNG / JPG / Saved Project / Drag and Drop</div>
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
            <div className="canvas-document-frame">
              <div
                className={`template-layer ${toolMode === 'text' ? 'template-layer--text' : 'template-layer--select'}`}
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

                {orderedCanvasItems.map((item) => (
                  item.kind === 'field' ? renderFieldItem(item) : renderImageItem(item)
                ))}
                {draftBox && (
                  <div
                    className={`draft-box ${draftBox.kind === 'select' ? 'draft-box--selection' : 'draft-box--create'}`}
                    style={{ left: draftBox.x, top: draftBox.y, width: draftBox.w, height: draftBox.h }}
                  />
                )}
                {alignmentGuides.map((guide, idx) => (
                  guide.type === 'vertical' ? (
                    <div key={`guide-v-${idx}`} className="alignment-guide-vertical" style={{ position: 'absolute', left: guide.x, top: 0, width: 1, height: '100%', backgroundColor: 'rgba(79,127,255,0.7)', pointerEvents: 'none', zIndex: 1000 }} />
                  ) : (
                    <div key={`guide-h-${idx}`} className="alignment-guide-horizontal" style={{ position: 'absolute', left: 0, top: guide.y, width: '100%', height: 1, backgroundColor: 'rgba(79,127,255,0.7)', pointerEvents: 'none', zIndex: 1000 }} />
                  )
                ))}
              </div>
            </div>
            {/* Floating Toolbar — outside scale layer so zoom doesn't affect its size */}
            <FloatingToolbar
              activeField={selectedCount === 1 ? fields.find((f) => f.id === activeFieldId) : null}
              isEditingText={isEditingText}
              fontPickerGroups={fontPickerGroups}
              updateField={updateField}
              cacheSelectionRangeFromEditor={cacheSelectionRangeFromEditor}
              toolbarInteractionRef={toolbarInteractionRef}
              zoom={zoom}
              canvasWidth={template.displayWidth * zoom}
              applyInlineCommandOrFieldUpdate={applyInlineCommandOrFieldUpdate}
              handleInlineStyleClick={handleInlineStyleClick}
              requestFont={requestFont}
            />
          </div>
        )}
      </div>{/* end canvas-scroll-body */}

      <div className="canvas-controls">
        <button type="button" aria-label="Fit to screen" className="canvas-ctrl-btn" data-tip="Fit to screen" onClick={() => fitTemplateToCanvas(template)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
        </button>
        <button type="button" aria-label="Reset zoom to 100 percent" className="canvas-ctrl-btn" data-tip="Zoom to 100%" onClick={() => setZoom(1)}>100%</button>
      </div>
    </div>
  );
}
