import { useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useEditorStore } from "./store/useEditorStore";
import { colorArrayToHex } from "./lib/colorUtils";
import { clampBox, uniqueFieldName } from "./lib/geometryUtils";
import { uid } from "./lib/historyUtils";
import { getNextLayerZ } from "./lib/canvasItems";
import { PAGE_PRESETS } from "./constants/editorConstants";
import { useStatus } from "./hooks/useStatus";
import { useCustomFonts } from "./hooks/useCustomFonts";
import { useHistory } from "./hooks/useHistory";
import { useDerivedCanvasState } from "./hooks/useDerivedCanvasState";
import { useCanvasItemCrud } from "./hooks/useCanvasItemCrud";
import { useFieldEditor } from "./hooks/useFieldEditor";
import { useSelection } from "./hooks/useSelection";
import { useLayerOrder } from "./hooks/useLayerOrder";
import { useCsvData } from "./hooks/useCsvData";
import { useClipboard } from "./hooks/useClipboard";
import { usePayload } from "./hooks/usePayload";
import { useTemplateLoader } from "./hooks/useTemplateLoader";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useGenerate } from "./hooks/useGenerate";
import { useImageImport } from "./hooks/useImageImport";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useEditorEffects } from "./hooks/useEditorEffects";
import { useFieldValueModal } from "./hooks/useFieldValueModal";
import Auth from "./components/Auth";
import CertPreviewModal from "./components/CertPreviewModal";
import ZipNameModal from "./components/modals/ZipNameModal";
import ConfirmActionModal from "./components/modals/ConfirmActionModal";
import FieldValueModal from "./components/modals/FieldValueModal";
import TopBar from "./components/TopBar";
import Toolbar from "./components/Toolbar";
import LeftSidebar from "./components/LeftSidebar";
import CanvasArea from "./components/CanvasArea";
import RightSidebar from "./components/RightSidebar";
import SettingsDock from "./components/SettingsDock";
import BulkDrawer from "./components/BulkDrawer";

export default function App() {
  const { session, signOut } = useAuth();

  // ------ Refs ----------------------------------------------------------------
  const layerRef = useRef(null);
  const fontPickerRef = useRef(null);
  const sizePickerRef = useRef(null);
  const templateInputRef = useRef(null);
  const editingDraftRef = useRef({ name: null, html: '', text: '' });
  const lastSelectionRangeRef = useRef(null);
  const toolbarInteractionRef = useRef(false);
  const fontHoverPreviewRef = useRef({ active: false, fieldId: null, fieldName: null, html: '', text: '', selStart: null, selEnd: null });
  const clipboardRef = useRef(null);

  // ------ Store (only values needed by JSX prop-passing) ----------------------
  const {
    zoom, setZoom, toolMode, setToolMode,
    preset, setPreset,
    fields, imageItems,
    activeFieldId, setActiveFieldId,
    selectedFieldIds,
    activeImageId, setActiveImageId,
    selectedImageIds,
    isEditingText, setIsEditingText,
    sampleValues, setSampleValues, sampleHtmlValues, setSampleHtmlValues,
    csvFile, csvHeaders, csvRowCount,
    fieldMappings,
    useCsv, setUseCsv,
    generateOptions,
    isGenerating,
    isCompactShell,
    leftSidebarOpen, setLeftSidebarOpen,
    rightSidebarOpen, setRightSidebarOpen,
    signOutModal, setSignOutModal,
    expandedSections, setExpandedSections,
    bulkDrawerOpen, setBulkDrawerOpen,
    setInsertMenuOpen,
    template,
    replaceTemplateModal,
    isLoadingTemplate,
    fontPickerOpen, setFontPickerOpen,
    fontHoverFamily, setFontHoverFamily,
    sizePickerOpen, setSizePickerOpen,
    sizeHoverValue, setSizeHoverValue,
    colorPickerOpen, setColorPickerOpen,
    colorHoverValue, setColorHoverValue,
    activeEditorFont, setActiveEditorFont,
    fieldValueModal,
    setFields, setSelectedFieldIds, setSelectedImageIds,
    setReplaceTemplateModal,
  } = useEditorStore();

  // ------ Core hooks ----------------------------------------------------------
  const { statusInfo, setStatus } = useStatus();
  const { availableFontValues, fontPickerGroups, fetchCustomFonts, requestFont } = useCustomFonts(setStatus);

  const {
    undoStackRef, redoStackRef, isApplyingHistoryRef, preDragSnapshotRef,
    buildHistorySnapshot, pushSnapshot, performUndo, performRedo,
    canUndo, canRedo, isDirty, markClean,
  } = useHistory();

  const {
    pageSize, fitTemplateToCanvas, scales,
    orderedCanvasItems, activeField, activeImage,
    selectedCanvasItems, selectedCount, selectionBounds,
  } = useDerivedCanvasState();

  const {
    loadTemplateFile, handleTemplatePickerChange,
    cancelTemplateReplace, confirmTemplateReplace,
    restoreTemplateFromLayoutState,
  } = useTemplateLoader({ pageSize, setStatus, fitTemplateToCanvas, pushSnapshot });

  const { updateField, updateImage, deleteField, deleteImage } = useCanvasItemCrud();

  const {
    getActiveEditorEl, selectionInsideEditor, cacheSelectionRangeFromEditor,
    clearFontHoverPreview, previewFontHoverOnSelection,
    handleInlineStyleClick, applyInlineCommandOrFieldUpdate,
    commitFieldDraft, commitActiveEditingDraft,
  } = useFieldEditor({
    editingDraftRef, lastSelectionRangeRef, fontHoverPreviewRef,
    availableFontValues, updateField, setStatus,
  });

  const { clearSelection, applySelection, selectSingleField, selectSingleImage, toggleItemSelection } = useSelection({ commitActiveEditingDraft });
  const { reorderLayerByDrag, reorderSelectionLayers } = useLayerOrder({ orderedCanvasItems, selectedCanvasItems });

  const {
    previewRowData, canPrintFromCsv, mappedFieldCount,
    updatePreviewRow, handleCsvFileChange, updateFieldMapping,
    autoMapFields, getMappedColumnForField, getFieldDisplayName,
  } = useCsvData({ setStatus, commitActiveEditingDraft });

  const { deleteSelection, nudgeSelection, duplicateSelection, pasteClipboardSelection } = useClipboard({
    pushSnapshot, clearSelection, applySelection, clipboardRef,
  });

  // ------ Add text field (depends on commitActiveEditingDraft) ----------------
  const addTextField = () => {
    commitActiveEditingDraft();
    setIsEditingText(false);
    setActiveImageId(null);
    if (!template) {
      setStatus('Open a certificate template before adding a text field.');
      return;
    }
    const ptToPx = template.displayHeight / template.pageHeightPt;
    const marginPt = 60;
    const fieldWidthPt = template.pageWidthPt - marginPt * 2;
    const fieldHeightPt = 64;
    const verticalOffsetPt = 80 + fields.length * (fieldHeightPt + 12);
    const newField = {
      id: uid(),
      name: uniqueFieldName(`field_${fields.length + 1}`, fields),
      x: Math.round(marginPt * ptToPx),
      y: Math.round(verticalOffsetPt * ptToPx),
      w: Math.round(fieldWidthPt * ptToPx),
      h: Math.round(fieldHeightPt * ptToPx),
      align: 'center', font: 'Helvetica', size: 36, color: [0, 0, 0],
      maxWidth: false, wrapText: false, bold: false, italic: false,
      z: getNextLayerZ(fields, imageItems),
    };
    setFields((prev) => [...prev, clampBox(newField, template.displayWidth, template.displayHeight)]);
    setSelectedFieldIds([newField.id]);
    setSelectedImageIds([]);
    setActiveFieldId(newField.id);
  };

  // ------ Payload & persistence -----------------------------------------------
  const { getFieldValuePayload, buildDataPayload, buildPayload, payloadToLayout } = usePayload({
    scales, editingDraftRef, availableFontValues,
  });

  const {
    projectFileHandle, fieldsList,
    selectedFieldsName, setSelectedFieldsName,
    saveFieldsName, setSaveFieldsName,
    refreshFieldsList, exportJson,
    saveProjectAsToFile, saveProjectToFile,
    saveToBackend, loadFromBackend,
    loadProjectFile, loadFromFile,
  } = useProjectPersistence({
    buildPayload, payloadToLayout, restoreTemplateFromLayoutState, loadTemplateFile,
    fitTemplateToCanvas, setStatus, markClean,
  });

  // ------ File opening --------------------------------------------------------
  const openWorkspaceFile = async (file) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isProjectFile = extension === 'json' || extension === 'certproj';
    try {
      if (isProjectFile) { await loadProjectFile(file); return; }
      if (fields.length > 0 || imageItems.length > 0) {
        setInsertMenuOpen(false);
        setReplaceTemplateModal({ open: true, file });
        return;
      }
      await loadTemplateFile(file);
    } catch (error) {
      setStatus(`Failed to load ${file.name}: ${error?.message || error}`);
    }
  };

  const handleWorkspaceBrowseFile = async (event) => {
    const [file] = event.target.files ?? [];
    try { await openWorkspaceFile(file); } finally { event.target.value = ''; }
  };

  // ------ Generate ------------------------------------------------------------
  const {
    isPreviewingAll, generatedCertificates,
    previewModalOpen, setPreviewModalOpen,
    previewUrl, latestDownload,
    zipNameModal, setZipNameModal,
    closePreview, generatePdf,
    printCurrentCertificate, previewAllCertificates,
    handlePrintFromModal, downloadLatestFile, confirmZipDownload,
  } = useGenerate({
    buildPayload, buildDataPayload, getFieldValuePayload,
    setStatus, canPrintFromCsv,
  });

  // ------ Image import --------------------------------------------------------
  const { importImageElement } = useImageImport({ commitActiveEditingDraft, setStatus });

  // ------ Canvas interaction --------------------------------------------------
  const {
    draftBox, alignmentGuides,
    beginDraw, beginMove, beginResize, moveDraw, endDraw,
  } = useCanvasInteraction({
    layerRef, commitActiveEditingDraft, updateField, updateImage, clearSelection,
    buildHistorySnapshot, undoStackRef, redoStackRef, isApplyingHistoryRef, preDragSnapshotRef,
  });

  // ------ Keyboard shortcuts --------------------------------------------------
  useKeyboardShortcuts({
    commitActiveEditingDraft, performUndo, performRedo,
    handleInlineStyleClick, applyInlineCommandOrFieldUpdate, getActiveEditorEl,
    saveProjectToFile, saveProjectAsToFile,
    pasteClipboardSelection, duplicateSelection, deleteSelection, nudgeSelection,
    clipboardRef, lastSelectionRangeRef, setStatus,
  });

  // ------ Global effects ------------------------------------------------------
  useEditorEffects({ session, isDirty, fontPickerRef, sizePickerRef, refreshFieldsList, fetchCustomFonts, zipNameModal, previewModalOpen });

  // ------ Field value modal ---------------------------------------------------
  const { handleFieldDoubleClick, closeFieldValueModal, confirmFieldValueModal } = useFieldValueModal({ updateField });

  // ------ Display values (tiny computed) --------------------------------------
  const displayedFontValue = fontHoverFamily || (isEditingText && activeEditorFont ? activeEditorFont : activeField?.font || 'Helvetica');
  const displayedSizeValue = sizeHoverValue ?? Number(activeField?.size ?? 18);
  const displayedColorValue = colorHoverValue || (activeField ? colorArrayToHex(activeField.color) : '#000000');
  const activeFieldIsCsvMapped = !!activeField && useCsv && Boolean(fieldMappings[activeField.name]);
  const toggleSection = (section) => setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  // -- Auth gate ---------------------------------------------------------------
  if (session === undefined) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite" aria-busy="true">
        <div className="auth-loading-card">
          <div className="auth-loading-mark">CS</div>
          <div className="auth-loading-brand">Cert<span>Studio</span></div>
          <div className="auth-loading-title">Preparing your workspace</div>
          <div className="auth-loading-copy">Checking your session and loading the editor.</div>
          <div className="auth-loading-progress" aria-hidden="true">
            <span className="auth-loading-progress-bar" />
          </div>
          <div className="auth-loading-hint">This usually takes a second.</div>
        </div>
      </div>
    );
  }
  if (!session) return <Auth />;

  // -- Render ------------------------------------------------------------------
  return (
    <div className="app-shell">
      <TopBar
        previewUrl={previewUrl}
        latestDownload={latestDownload}
        isPreviewingAll={isPreviewingAll}
        projectFileHandle={projectFileHandle}
        selectedFieldsName={selectedFieldsName}
        saveFieldsName={saveFieldsName}
        fieldsList={fieldsList}
        session={session}
        canUndo={canUndo}
        canRedo={canRedo}
        setSelectedFieldsName={setSelectedFieldsName}
        setSaveFieldsName={setSaveFieldsName}
        handleTemplatePickerChange={handleTemplatePickerChange}
        loadFromFile={loadFromFile}
        saveProjectToFile={saveProjectToFile}
        saveProjectAsToFile={saveProjectAsToFile}
        exportJson={exportJson}
        loadFromBackend={loadFromBackend}
        saveToBackend={saveToBackend}
        refreshFieldsList={refreshFieldsList}
        importImageElement={importImageElement}
        closePreview={closePreview}
        performUndo={performUndo}
        performRedo={performRedo}
        generatePdf={generatePdf}
        printCurrentCertificate={printCurrentCertificate}
        previewAllCertificates={previewAllCertificates}
        downloadLatestFile={downloadLatestFile}
        signOut={() => setSignOutModal(true)}
        updatePreviewRow={updatePreviewRow}
        canPrintFromCsv={canPrintFromCsv}
      />

      <Toolbar
        activeField={selectedCount === 1 ? activeField : null}
        activeFieldIsCsvMapped={activeFieldIsCsvMapped}
        toolMode={toolMode}
        displayedFontValue={displayedFontValue}
        displayedSizeValue={displayedSizeValue}
        displayedColorValue={displayedColorValue}
        fontPickerOpen={fontPickerOpen}
        sizePickerOpen={sizePickerOpen}
        colorPickerOpen={colorPickerOpen}
        fontHoverFamily={fontHoverFamily}
        sizeHoverValue={sizeHoverValue}
        colorHoverValue={colorHoverValue}
        zoom={zoom}
        fontPickerGroups={fontPickerGroups}
        fontPickerRef={fontPickerRef}
        sizePickerRef={sizePickerRef}
        setFontPickerOpen={setFontPickerOpen}
        setFontHoverFamily={setFontHoverFamily}
        setSizePickerOpen={setSizePickerOpen}
        setSizeHoverValue={setSizeHoverValue}
        setColorPickerOpen={setColorPickerOpen}
        setColorHoverValue={setColorHoverValue}
        setToolMode={setToolMode}
        setZoom={setZoom}
        updateField={updateField}
        clearFontHoverPreview={clearFontHoverPreview}
        previewFontHoverOnSelection={previewFontHoverOnSelection}
        applyInlineCommandOrFieldUpdate={applyInlineCommandOrFieldUpdate}
        setActiveEditorFont={setActiveEditorFont}
        handleInlineStyleClick={handleInlineStyleClick}
        getFieldDisplayName={getFieldDisplayName}
        cacheSelectionRangeFromEditor={cacheSelectionRangeFromEditor}
        toolbarInteractionRef={toolbarInteractionRef}
        leftSidebarOpen={leftSidebarOpen}
        rightSidebarOpen={rightSidebarOpen}
        toggleLeftSidebar={() => { setLeftSidebarOpen((prev) => !prev); if (!leftSidebarOpen) setRightSidebarOpen(false); }}
        toggleRightSidebar={() => { setRightSidebarOpen((prev) => !prev); if (!rightSidebarOpen) setLeftSidebarOpen(false); }}
        totalLayerCount={fields.length + imageItems.length}
        selectedCount={selectedCount}
      />

      {statusInfo.text && (
        <div
          role="alert"
          aria-live={statusInfo.type === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
          className={`status-notification status-notification--${statusInfo.type}`}
        >
          {statusInfo.type === 'success' && '✓ '}
          {statusInfo.type === 'error' && '✕ '}
          {statusInfo.type === 'warning' && '⚠ '}
          {statusInfo.text}
        </div>
      )}

      <div className={`app-body ${isCompactShell ? 'app-body--compact' : ''}`}>
        {isCompactShell && (leftSidebarOpen || rightSidebarOpen) && (
          <button
            type="button"
            className="editor-sidebar-backdrop"
            aria-label="Close editor side panels"
            onClick={() => { setLeftSidebarOpen(false); setRightSidebarOpen(false); }}
          />
        )}

        <div
          className={`editor-sidebar-shell editor-sidebar-shell--left ${isCompactShell ? 'editor-sidebar-shell--compact' : ''} ${leftSidebarOpen ? 'open' : ''}`}
          aria-hidden={isCompactShell && !leftSidebarOpen ? 'true' : undefined}
        >
          {isCompactShell && (
            <div className="editor-sidebar-drawer-header">
              <span>Canvas Contents</span>
              <button type="button" className="editor-sidebar-close" onClick={() => setLeftSidebarOpen(false)} aria-label="Close contents panel">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <LeftSidebar
            orderedCanvasItems={orderedCanvasItems}
            fields={fields}
            imageItems={imageItems}
            activeFieldId={activeFieldId}
            activeImageId={activeImageId}
            selectedFieldIds={selectedFieldIds}
            selectedImageIds={selectedImageIds}
            useCsv={useCsv}
            commitActiveEditingDraft={commitActiveEditingDraft}
            setIsEditingText={setIsEditingText}
            selectSingleField={selectSingleField}
            selectSingleImage={selectSingleImage}
            getMappedColumnForField={getMappedColumnForField}
            getFieldDisplayName={getFieldDisplayName}
            importImageElement={importImageElement}
            addTextField={addTextField}
            reorderLayerByDrag={reorderLayerByDrag}
          />
        </div>

        <CanvasArea
          template={template}
          fields={fields}
          imageItems={imageItems}
          orderedCanvasItems={orderedCanvasItems}
          sampleValues={sampleValues}
          sampleHtmlValues={sampleHtmlValues}
          fieldMappings={fieldMappings}
          useCsv={useCsv}
          zoom={zoom}
          toolMode={toolMode}
          activeFieldId={activeFieldId}
          isEditingText={isEditingText}
          activeImageId={activeImageId}
          selectedFieldIds={selectedFieldIds}
          selectedImageIds={selectedImageIds}
          selectedCount={selectedCount}
          selectionBounds={selectionBounds}
          draftBox={draftBox}
          alignmentGuides={alignmentGuides}
          fontHoverFamily={fontHoverFamily}
          colorHoverValue={colorHoverValue}
          sizeHoverValue={sizeHoverValue}
          templateInputRef={templateInputRef}
          layerRef={layerRef}
          editingDraftRef={editingDraftRef}
          lastSelectionRangeRef={lastSelectionRangeRef}
          toolbarInteractionRef={toolbarInteractionRef}
          beginDraw={beginDraw}
          moveDraw={moveDraw}
          endDraw={endDraw}
          beginMove={beginMove}
          beginResize={beginResize}
          selectSingleField={selectSingleField}
          selectSingleImage={selectSingleImage}
          toggleItemSelection={toggleItemSelection}
          setActiveFieldId={setActiveFieldId}
          setActiveImageId={setActiveImageId}
          setIsEditingText={setIsEditingText}
          setSampleValues={setSampleValues}
          setSampleHtmlValues={setSampleHtmlValues}
          commitActiveEditingDraft={commitActiveEditingDraft}
          commitFieldDraft={commitFieldDraft}
          selectionInsideEditor={selectionInsideEditor}
          updateField={updateField}
          fitTemplateToCanvas={fitTemplateToCanvas}
          setZoom={setZoom}
          handleFieldDoubleClick={handleFieldDoubleClick}
          handleWorkspaceBrowseFile={handleWorkspaceBrowseFile}
          openWorkspaceFile={openWorkspaceFile}
          applyInlineCommandOrFieldUpdate={applyInlineCommandOrFieldUpdate}
          handleInlineStyleClick={handleInlineStyleClick}
          deleteSelection={deleteSelection}
          duplicateSelection={duplicateSelection}
          reorderSelectionLayers={reorderSelectionLayers}
          fontPickerGroups={fontPickerGroups}
          cacheSelectionRangeFromEditor={cacheSelectionRangeFromEditor}
          requestFont={requestFont}
        />

        <div
          className={`editor-sidebar-shell editor-sidebar-shell--right ${isCompactShell ? 'editor-sidebar-shell--compact' : ''} ${rightSidebarOpen ? 'open' : ''}`}
          aria-hidden={isCompactShell && !rightSidebarOpen ? 'true' : undefined}
        >
          {isCompactShell && (
            <div className="editor-sidebar-drawer-header">
              <span>Properties</span>
              <button type="button" className="editor-sidebar-close" onClick={() => setRightSidebarOpen(false)} aria-label="Close properties panel">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <RightSidebar
            activeField={selectedCount === 1 ? activeField : null}
            activeImage={selectedCount === 1 ? activeImage : null}
            selectionCount={selectedCount}
            selectedCanvasItems={selectedCanvasItems}
            template={template}
            scales={scales}
            expandedSections={expandedSections}
            sampleValues={sampleValues}
            fieldMappings={fieldMappings}
            useCsv={useCsv}
            csvFile={csvFile}
            previewUrl={previewUrl}
            fields={fields}
            activeFieldIsCsvMapped={activeFieldIsCsvMapped}
            fontPickerGroups={fontPickerGroups}
            toggleSection={toggleSection}
            closePreview={closePreview}
            updateField={updateField}
            updateImage={updateImage}
            deleteField={deleteField}
            deleteImage={deleteImage}
            duplicateSelection={duplicateSelection}
            deleteSelection={deleteSelection}
            reorderSelectionLayers={reorderSelectionLayers}
            cacheSelectionRangeFromEditor={cacheSelectionRangeFromEditor}
            toolbarInteractionRef={toolbarInteractionRef}
            editingDraftRef={editingDraftRef}
            setSampleValues={setSampleValues}
            setSampleHtmlValues={setSampleHtmlValues}
            applyInlineCommandOrFieldUpdate={applyInlineCommandOrFieldUpdate}
            setActiveEditorFont={setActiveEditorFont}
            handleInlineStyleClick={handleInlineStyleClick}
            getFieldDisplayName={getFieldDisplayName}
            downloadLatestFile={downloadLatestFile}
          />
        </div>
      </div>

      {/* -- STATUS BAR -- */}
      <div className="statusbar">
        <div className="status-item">
          <div className={`status-dot ${statusInfo.type === 'error' ? 'error' : statusInfo.type === 'warning' ? 'warning' : ''}`} />
          {statusInfo.text || 'Ready'}
        </div>
        {isDirty && <div className="status-item status-item--dirty" title="Unsaved changes">●</div>}
        {(isLoadingTemplate || isGenerating || isPreviewingAll) && (
          <div className="status-item status-item--busy">
            <span className="status-spinner" />
            {isLoadingTemplate ? 'Loading template…' : isPreviewingAll ? 'Previewing…' : 'Generating…'}
          </div>
        )}
        <div className="status-item">{fields.length} field{fields.length !== 1 ? 's' : ''}, {imageItems.length} image{imageItems.length !== 1 ? 's' : ''}</div>
        <div style={{ flex: 1 }} />
        {selectedCount > 1 && <div className="status-item">{selectedCount} selected</div>}
        <div className="status-item status-item--canvas-size">
          <select className="status-page-select" value={preset} onChange={(event) => setPreset(event.target.value)} aria-label="Canvas size">
            {Object.entries(PAGE_PRESETS).map(([value, item]) => (
              <option key={value} value={value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="status-item">{Math.round(zoom * 100)}%</div>
      </div>

      {/* -- OVERLAYS & MODALS -- */}
      <BulkDrawer
        open={bulkDrawerOpen}
        onClose={() => setBulkDrawerOpen(false)}
        useCsv={useCsv}
        setUseCsv={setUseCsv}
        csvFile={csvFile}
        csvHeaders={csvHeaders}
        csvFirstRow={previewRowData}
        csvRowCount={csvRowCount}
        generateOptions={generateOptions}
        handleCsvFileChange={handleCsvFileChange}
        updateFieldMapping={updateFieldMapping}
        updatePreviewRow={updatePreviewRow}
        fieldMappings={fieldMappings}
        mappedFieldCount={mappedFieldCount}
        fields={fields}
        getFieldDisplayName={getFieldDisplayName}
        autoMapFields={autoMapFields}
      />

      <SettingsDock session={session} signOut={() => setSignOutModal(true)} />

      {replaceTemplateModal.open && (
        <ConfirmActionModal
          title="Replace current template?"
          message="Opening a new template will clear the current text fields and images."
          confirmLabel="Replace template"
          onConfirm={confirmTemplateReplace}
          onCancel={cancelTemplateReplace}
        />
      )}

      {signOutModal && (
        <ConfirmActionModal
          eyebrow="Account"
          title="Sign out?"
          message="Any unsaved changes will be lost. Save your project before signing out."
          confirmLabel="Sign out"
          confirmTone="accent"
          tone="default"
          callout={null}
          headerIcon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          }
          onConfirm={() => { setSignOutModal(false); signOut(); }}
          onCancel={() => setSignOutModal(false)}
        />
      )}

      {fieldValueModal.open && (
        <FieldValueModal
          initialName={fieldValueModal.initialName}
          initialValue={fieldValueModal.initialValue}
          requireName={fieldValueModal.requireName}
          onConfirm={confirmFieldValueModal}
          onCancel={closeFieldValueModal}
        />
      )}

      {zipNameModal.open && (
        <ZipNameModal
          suggestedName={zipNameModal.suggestedName}
          onConfirm={confirmZipDownload}
          onCancel={() => setZipNameModal((prev) => ({ ...prev, open: false }))}
        />
      )}

      {previewModalOpen && (
        <CertPreviewModal
          isOpen={previewModalOpen}
          certificates={generatedCertificates}
          onClose={() => setPreviewModalOpen(false)}
          onPrint={handlePrintFromModal}
        />
      )}
    </div>
  );
}
