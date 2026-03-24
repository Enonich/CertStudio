import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import { PAGE_PRESETS, MAX_HISTORY_STEPS, MAX_PREVIEW_CERTIFICATES } from "./constants/editorConstants";
import { colorArrayToHex } from "./lib/colorUtils";
import { clampBox, uniqueFieldName } from "./lib/geometryUtils";
import { uid } from "./lib/historyUtils";
import { useStatus } from "./hooks/useStatus";
import { useCustomFonts } from "./hooks/useCustomFonts";
import { useHistory } from "./hooks/useHistory";
import { usePayload } from "./hooks/usePayload";
import { useTemplateLoader } from "./hooks/useTemplateLoader";
import { useFieldEditor } from "./hooks/useFieldEditor";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useGenerate } from "./hooks/useGenerate";
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

const getCanvasItemKey = (kind, id) => `${kind}:${id}`;

const getOrderedCanvasItems = (fields, imageItems) => {
  const fieldCount = Array.isArray(fields) ? fields.length : 0;
  const imageCount = Array.isArray(imageItems) ? imageItems.length : 0;
  return [
    ...(Array.isArray(fields)
      ? fields.map((field, index) => ({
          kind: 'field',
          ...field,
          z: Number.isFinite(field.z) ? Number(field.z) : index,
        }))
      : []),
    ...(Array.isArray(imageItems)
      ? imageItems.map((image, index) => ({
          kind: 'image',
          ...image,
          z: Number.isFinite(image.z) ? Number(image.z) : fieldCount + index,
        }))
      : []),
  ]
    .sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, z: index }));
};

const getNextLayerZ = (fields, imageItems) => getOrderedCanvasItems(fields, imageItems).length;

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
  const moveDrawRef = useRef(null);
  const endDrawRef = useRef(null);
  const clipboardRef = useRef(null);

  // ------ Core state ----------------------------------------------------------
  const [theme, setTheme] = useState('dark');
  const [zoom, setZoom] = useState(1);
  const [toolMode, setToolMode] = useState('select');
  const [preset, setPreset] = useState('letter');
  const [customSize, setCustomSize] = useState({ width: 612, height: 792 });
  const [fields, setFields] = useState([]);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState([]);
  const [imageItems, setImageItems] = useState([]);
  const [activeImageId, setActiveImageId] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftBox, setDraftBox] = useState(null);
  const [sampleValues, setSampleValues] = useState({});
  const [sampleHtmlValues, setSampleHtmlValues] = useState({});
  const [interaction, setInteraction] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvFirstRow, setCsvFirstRow] = useState({});
  const [csvAllRows, setCsvAllRows] = useState([]);
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [fieldMappings, setFieldMappings] = useState({});
  const [spreadsheetMappingOpen, setSpreadsheetMappingOpen] = useState(false);
  const [useCsv, setUseCsv] = useState(false);
  const [generateOptions, setGenerateOptions] = useState({ row: 0, output_mode: 'full_pdf', page_size: 'letter', generate_all: false });
  const [isGenerating, setIsGenerating] = useState(false);

  const updatePreviewRow = (rowIndex) => {
    setGenerateOptions(prev => ({ ...prev, row: rowIndex }));
    const rowData = csvAllRows[rowIndex] || csvFirstRow;
    
    // Update sample values dynamically for all mapped fields
    setSampleValues(prev => {
      const next = { ...prev };
      Object.entries(fieldMappings).forEach(([fieldName, csvColumn]) => {
        if (csvColumn && typeof rowData[csvColumn] !== 'undefined') {
          next[fieldName] = rowData[csvColumn];
        }
      });
      return next;
    });

    setSampleHtmlValues(prev => {
      const next = { ...prev };
      Object.entries(fieldMappings).forEach(([fieldName]) => {
        delete next[fieldName];
      });
      return next;
    });
  };
  const [panelState, setPanelState] = useState({ fieldLayouts: true, dataSource: true, fontManager: true, generate: true, fields: true, selectedField: true, preview: true });
  const [expandedSections, setExpandedSections] = useState({ box: true, text: true, content: true, layout: false, name: true });
  const [sidebarSections, setSidebarSections] = useState({ fields: true, images: false, layers: false });
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [layoutsMenuOpen, setLayoutsMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [fieldValueModal, setFieldValueModal] = useState({ open: false, fieldId: null, requireName: false, initialName: '', initialValue: '' });

  // ------ Status & custom fonts -----------------------------------------------
  const { statusInfo, setStatus } = useStatus(isGenerating);
  const { customFonts, availableFontValues, fontPickerGroups, fetchCustomFonts, uploadFont, deleteFont } = useCustomFonts(setStatus);

  // ------ History hook --------------------------------------------------------
  const {
    undoStackRef,
    redoStackRef,
    isApplyingHistoryRef,
    preDragSnapshotRef,
    buildHistorySnapshot,
    performUndo,
    performRedo,
    canUndo,
    canRedo,
  } = useHistory({
    fields, imageItems, sampleValues, sampleHtmlValues, fieldMappings, useCsv, generateOptions,
    setFields, setImageItems, setSampleValues, setSampleHtmlValues, setFieldMappings, setUseCsv, setGenerateOptions,
  });

  // ------ Page size & canvas fit ----------------------------------------------
  const pageSize = useMemo(() => {
    if (preset === 'custom') return { width: Number(customSize.width) || 612, height: Number(customSize.height) || 792 };
    return { width: PAGE_PRESETS[preset].width, height: PAGE_PRESETS[preset].height };
  }, [preset, customSize]);

  const fitTemplateToCanvas = (templateToFit) => {
    if (!templateToFit) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvasEl = document.getElementById('canvasArea');
        if (!canvasEl || !templateToFit.displayWidth || !templateToFit.displayHeight) return;
        const availW = canvasEl.clientWidth - 96;
        const availH = canvasEl.clientHeight - 96;
        if (availW <= 0 || availH <= 0) return;
        const fitZoom = Math.min(availW / templateToFit.displayWidth, availH / templateToFit.displayHeight);
        setZoom(parseFloat(Math.min(2, Math.max(0.25, fitZoom)).toFixed(2)));
      });
    });
  };

  // ------ Template hook -------------------------------------------------------
  const {
    template, setTemplate,
    templateFile, setTemplateFile,
    templateFileDataUrl, setTemplateFileDataUrl,
    replaceTemplateModal,
    loadTemplateFile,
    handleTemplatePickerChange,
    cancelTemplateReplace,
    confirmTemplateReplace,
    restoreTemplateFromLayoutState,
  } = useTemplateLoader({
    pageSize, fields, imageItems,
    setFields, setImageItems, setActiveFieldId, setActiveImageId,
    setSampleValues, setSampleHtmlValues, setStatus, setInsertMenuOpen, fitTemplateToCanvas,
  });

  const scales = useMemo(() => {
    if (!template) return null;
    return { x: template.pageWidthPt / template.displayWidth, y: template.pageHeightPt / template.displayHeight };
  }, [template]);

  const orderedCanvasItems = useMemo(() => getOrderedCanvasItems(fields, imageItems), [fields, imageItems]);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? null;
  const activeImage = imageItems.find((i) => i.id === activeImageId) ?? null;
  const selectedFields = useMemo(
    () => orderedCanvasItems.filter((item) => item.kind === 'field' && selectedFieldIds.includes(item.id)),
    [orderedCanvasItems, selectedFieldIds]
  );
  const selectedImages = useMemo(
    () => orderedCanvasItems.filter((item) => item.kind === 'image' && selectedImageIds.includes(item.id)),
    [orderedCanvasItems, selectedImageIds]
  );
  const selectedCanvasItems = useMemo(
    () => orderedCanvasItems.filter((item) => selectedFieldIds.includes(item.id) || selectedImageIds.includes(item.id)),
    [orderedCanvasItems, selectedFieldIds, selectedImageIds]
  );
  const selectedCount = selectedCanvasItems.length;
  const hasMultiSelection = selectedCount > 1;
  const selectionBounds = useMemo(() => {
    if (selectedCanvasItems.length === 0) return null;
    const left = Math.min(...selectedCanvasItems.map((item) => item.x));
    const top = Math.min(...selectedCanvasItems.map((item) => item.y));
    const right = Math.max(...selectedCanvasItems.map((item) => item.x + item.w));
    const bottom = Math.max(...selectedCanvasItems.map((item) => item.y + item.h));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }, [selectedCanvasItems]);

  const clearSelection = () => {
    setSelectedFieldIds([]);
    setSelectedImageIds([]);
    setActiveFieldId(null);
    setActiveImageId(null);
  };

  const applySelection = ({
    fieldIds = [],
    imageIds = [],
    activeFieldId: nextActiveFieldId = null,
    activeImageId: nextActiveImageId = null,
    preserveEditing = false,
  }) => {
    if (!preserveEditing) {
      commitActiveEditingDraft();
      setIsEditingText(false);
    }
    setSelectedFieldIds(fieldIds);
    setSelectedImageIds(imageIds);
    setActiveFieldId(nextActiveFieldId);
    setActiveImageId(nextActiveImageId);
  };

  const selectSingleField = (id, options = {}) => {
    applySelection({ fieldIds: id ? [id] : [], activeFieldId: id, activeImageId: null, ...options });
  };

  const selectSingleImage = (id, options = {}) => {
    applySelection({ imageIds: id ? [id] : [], activeFieldId: null, activeImageId: id, ...options });
  };

  const toggleItemSelection = (id, kind) => {
    commitActiveEditingDraft();
    setIsEditingText(false);
    if (kind === 'field') {
      setSelectedFieldIds((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((itemId) => itemId !== id) : [...prev, id];
        setActiveFieldId(exists ? next[next.length - 1] ?? null : id);
        if (!exists || next.length > 0) {
          setActiveImageId(null);
        }
        return next;
      });
      return;
    }
    setSelectedImageIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      setActiveImageId(exists ? next[next.length - 1] ?? null : id);
      if (!exists || next.length > 0) {
        setActiveFieldId(null);
      }
      return next;
    });
  };

  const syncLayerOrder = (nextOrderedItems) => {
    const zByKey = new Map(nextOrderedItems.map((item, index) => [getCanvasItemKey(item.kind, item.id), index]));
    setFields((prev) => prev.map((field) => ({ ...field, z: zByKey.get(getCanvasItemKey('field', field.id)) ?? field.z ?? 0 })));
    setImageItems((prev) => prev.map((image) => ({ ...image, z: zByKey.get(getCanvasItemKey('image', image.id)) ?? image.z ?? 0 })));
  };

  const reorderSelectionLayers = (direction) => {
    if (selectedCanvasItems.length === 0) return;
    const selectedKeys = new Set(selectedCanvasItems.map((item) => getCanvasItemKey(item.kind, item.id)));
    const nextOrder = [...orderedCanvasItems];

    if (direction === 'front') {
      const selected = nextOrder.filter((item) => selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      const unselected = nextOrder.filter((item) => !selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      syncLayerOrder([...unselected, ...selected]);
      return;
    }

    if (direction === 'back') {
      const selected = nextOrder.filter((item) => selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      const unselected = nextOrder.filter((item) => !selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      syncLayerOrder([...selected, ...unselected]);
      return;
    }

    if (direction === 'forward') {
      for (let index = nextOrder.length - 2; index >= 0; index -= 1) {
        const currentKey = getCanvasItemKey(nextOrder[index].kind, nextOrder[index].id);
        const nextKey = getCanvasItemKey(nextOrder[index + 1].kind, nextOrder[index + 1].id);
        if (selectedKeys.has(currentKey) && !selectedKeys.has(nextKey)) {
          [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
        }
      }
      syncLayerOrder(nextOrder);
      return;
    }

    if (direction === 'backward') {
      for (let index = 1; index < nextOrder.length; index += 1) {
        const currentKey = getCanvasItemKey(nextOrder[index].kind, nextOrder[index].id);
        const prevKey = getCanvasItemKey(nextOrder[index - 1].kind, nextOrder[index - 1].id);
        if (selectedKeys.has(currentKey) && !selectedKeys.has(prevKey)) {
          [nextOrder[index], nextOrder[index - 1]] = [nextOrder[index - 1], nextOrder[index]];
        }
      }
      syncLayerOrder(nextOrder);
    }
  };

  const deleteSelection = () => {
    if (selectedCount === 0) return;
    const selectedFieldIdSet = new Set(selectedFieldIds);
    const selectedImageIdSet = new Set(selectedImageIds);
    const removedFieldNames = fields.filter((field) => selectedFieldIdSet.has(field.id)).map((field) => field.name);
    setFields((prev) => prev.filter((field) => !selectedFieldIdSet.has(field.id)));
    setImageItems((prev) => prev.filter((image) => !selectedImageIdSet.has(image.id)));
    if (removedFieldNames.length > 0) {
      setFieldMappings((prev) => {
        const next = { ...prev };
        removedFieldNames.forEach((name) => { delete next[name]; });
        return next;
      });
    }
    clearSelection();
  };

  const nudgeSelection = (dx, dy) => {
    if (!template || selectedCount === 0) return;
    const selectedFieldIdSet = new Set(selectedFieldIds);
    const selectedImageIdSet = new Set(selectedImageIds);
    setFields((prev) =>
      prev.map((field) => (
        selectedFieldIdSet.has(field.id)
          ? clampBox({ ...field, x: field.x + dx, y: field.y + dy }, template.displayWidth, template.displayHeight)
          : field
      ))
    );
    setImageItems((prev) =>
      prev.map((image) => (
        selectedImageIdSet.has(image.id)
          ? clampBox({ ...image, x: image.x + dx, y: image.y + dy }, template.displayWidth, template.displayHeight)
          : image
      ))
    );
  };

  const duplicateSelection = () => {
    if (!template || selectedCanvasItems.length === 0) return;
    const nextFieldIds = [];
    const nextImageIds = [];
    const nextFields = [];
    const nextImages = [];
    let nextZ = getNextLayerZ(fields, imageItems);

    selectedCanvasItems.forEach((item) => {
      if (item.kind === 'field') {
        const duplicate = clampBox(
          {
            ...item,
            id: uid(),
            name: uniqueFieldName(item.name, [...fields, ...nextFields]),
            x: item.x + 15,
            y: item.y + 15,
            z: nextZ,
          },
          template.displayWidth,
          template.displayHeight
        );
        nextZ += 1;
        nextFields.push(duplicate);
        nextFieldIds.push(duplicate.id);
      } else {
        const duplicate = clampBox(
          {
            ...item,
            id: uid(),
            x: item.x + 15,
            y: item.y + 15,
            z: nextZ,
          },
          template.displayWidth,
          template.displayHeight
        );
        nextZ += 1;
        nextImages.push(duplicate);
        nextImageIds.push(duplicate.id);
      }
    });

    if (nextFields.length > 0) {
      setFields((prev) => [...prev, ...nextFields]);
    }
    if (nextImages.length > 0) {
      setImageItems((prev) => [...prev, ...nextImages]);
    }
    applySelection({
      fieldIds: nextFieldIds,
      imageIds: nextImageIds,
      activeFieldId: nextFieldIds[0] ?? null,
      activeImageId: nextFieldIds.length === 0 ? nextImageIds[0] ?? null : null,
    });
  };

  const pasteClipboardSelection = () => {
    if (!template || !clipboardRef.current) return;
    const sourceItems = Array.isArray(clipboardRef.current.items)
      ? clipboardRef.current.items
      : clipboardRef.current.data
        ? [{ kind: clipboardRef.current.type, ...clipboardRef.current.data }]
        : [];
    if (sourceItems.length === 0) return;

    const nextFieldIds = [];
    const nextImageIds = [];
    const nextFields = [];
    const nextImages = [];
    let nextZ = getNextLayerZ(fields, imageItems);

    sourceItems.forEach((item) => {
      if (item.kind === 'field') {
        const duplicate = clampBox(
          {
            ...item,
            id: uid(),
            name: uniqueFieldName(item.name, [...fields, ...nextFields]),
            x: item.x + 15,
            y: item.y + 15,
            z: nextZ,
          },
          template.displayWidth,
          template.displayHeight
        );
        nextZ += 1;
        nextFields.push(duplicate);
        nextFieldIds.push(duplicate.id);
      } else if (item.kind === 'image') {
        const duplicate = clampBox(
          {
            ...item,
            id: uid(),
            x: item.x + 15,
            y: item.y + 15,
            z: nextZ,
          },
          template.displayWidth,
          template.displayHeight
        );
        nextZ += 1;
        nextImages.push(duplicate);
        nextImageIds.push(duplicate.id);
      }
    });

    if (nextFields.length > 0) setFields((prev) => [...prev, ...nextFields]);
    if (nextImages.length > 0) setImageItems((prev) => [...prev, ...nextImages]);
    applySelection({
      fieldIds: nextFieldIds,
      imageIds: nextImageIds,
      activeFieldId: nextFieldIds[0] ?? null,
      activeImageId: nextFieldIds.length === 0 ? nextImageIds[0] ?? null : null,
    });
  };

  useEffect(() => {
    setSelectedFieldIds((prev) => prev.filter((id) => fields.some((field) => field.id === id)));
  }, [fields]);

  useEffect(() => {
    setSelectedImageIds((prev) => prev.filter((id) => imageItems.some((image) => image.id === id)));
  }, [imageItems]);

  useEffect(() => {
    if (activeFieldId && selectedCount <= 1 && !selectedFieldIds.includes(activeFieldId)) {
      setSelectedFieldIds([activeFieldId]);
      setSelectedImageIds([]);
      return;
    }
    if (activeImageId && selectedCount <= 1 && !selectedImageIds.includes(activeImageId)) {
      setSelectedImageIds([activeImageId]);
      setSelectedFieldIds([]);
    }
  }, [activeFieldId, activeImageId, selectedCount, selectedFieldIds, selectedImageIds]);

  // ------ Field & image CRUD (defined before useFieldEditor) ------------------
  const updateField = (id, patch) => {
    if (!template) return;
    if (patch.name !== undefined) {
      const oldField = fields.find((f) => f.id === id);
      if (oldField) patch = { ...patch, name: uniqueFieldName(patch.name, fields, id) };
      if (oldField && oldField.name !== patch.name && fieldMappings[oldField.name]) {
        setFieldMappings((prev) => { const next = { ...prev }; next[patch.name] = next[oldField.name]; delete next[oldField.name]; return next; });
      }
      if (oldField && oldField.name !== patch.name) {
        setSampleValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) return prev;
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) next[patch.name] = next[oldField.name];
          delete next[oldField.name];
          return next;
        });
        setSampleHtmlValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) return prev;
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) next[patch.name] = next[oldField.name];
          delete next[oldField.name];
          return next;
        });
      }
    }
    setFields((prev) => prev.map((f) => f.id !== id ? f : clampBox({ ...f, ...patch }, template.displayWidth, template.displayHeight)));
  };

  const updateImage = (id, patch) => {
    if (!template) return;
    setImageItems((prev) => prev.map((img) => img.id !== id ? img : clampBox({ ...img, ...patch }, template.displayWidth, template.displayHeight)));
  };

  const deleteField = (id) => {
    const fieldToDelete = fields.find((f) => f.id === id);
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldIds((prev) => prev.filter((fieldId) => fieldId !== id));
    if (activeFieldId === id) setActiveFieldId(null);
    if (fieldToDelete && fieldMappings[fieldToDelete.name]) {
      setFieldMappings((prev) => { const next = { ...prev }; delete next[fieldToDelete.name]; return next; });
    }
  };

  const deleteImage = (id) => {
    setImageItems((prev) => prev.filter((img) => img.id !== id));
    setSelectedImageIds((prev) => prev.filter((imageId) => imageId !== id));
    if (activeImageId === id) setActiveImageId(null);
  };

  // ------ Global Keyboard Shortcuts -------------------------------------------
  // We handle shortcuts inside the large useEffect below

  // ------ Field editor hook ---------------------------------------------------
  const {
    fontPickerOpen, setFontPickerOpen,
    fontHoverFamily, setFontHoverFamily,
    sizePickerOpen, setSizePickerOpen,
    sizeHoverValue, setSizeHoverValue,
    colorPickerOpen, setColorPickerOpen,
    colorHoverValue, setColorHoverValue,
    activeEditorFont, setActiveEditorFont,
    getActiveEditorEl,
    selectionInsideEditor,
    cacheSelectionRangeFromEditor,
    clearFontHoverPreview,
    previewFontHoverOnSelection,
    applyFormatting,
    applyWholeFieldStyle,
    handleInlineStyleClick,
    applyInlineCommandOrFieldUpdate,
    commitFieldDraft,
    commitActiveEditingDraft,
  } = useFieldEditor({
    activeField, activeFieldId, isEditingText, setIsEditingText,
    editingDraftRef, lastSelectionRangeRef, fontHoverPreviewRef,
    sampleValues, sampleHtmlValues, setSampleValues, setSampleHtmlValues,
    availableFontValues, updateField, setStatus,
  });

  const addTextField = () => {
    commitActiveEditingDraft();
    setIsEditingText(false);
    setActiveImageId(null);
    if (!template) {
      setStatus('Open a certificate template before adding a text field.');
      return;
    }
    const newField = {
      id: uid(),
      name: uniqueFieldName(`field_${fields.length + 1}`, fields),
      x: 24,
      y: 24,
      w: 160,
      h: 40,
      align: 'left',
      font: 'Helvetica',
      size: 18,
      color: [0, 0, 0],
      maxWidth: false,
      wrapText: true,
      bold: false,
      italic: false,
      z: getNextLayerZ(fields, imageItems),
    };
    setFields((prev) => [...prev, clampBox(newField, template.displayWidth, template.displayHeight)]);
    setSelectedFieldIds([newField.id]);
    setSelectedImageIds([]);
    setActiveFieldId(newField.id);
  };

  // ------ Payload hook --------------------------------------------------------
  const { getFieldValuePayload, buildDataPayload, buildPayload, payloadToLayout } = usePayload({
    template, scales, fields, imageItems, sampleValues, sampleHtmlValues,
    fieldMappings, useCsv, generateOptions, templateFile, templateFileDataUrl,
    isEditingText, editingDraftRef, availableFontValues,
  });

  // ------ Project persistence hook --------------------------------------------
  const {
    projectFileHandle,
    fieldsList,
    selectedFieldsName, setSelectedFieldsName,
    saveFieldsName, setSaveFieldsName,
    refreshFieldsList,
    exportJson,
    saveProjectAsToFile,
    saveProjectToFile,
    saveToBackend,
    loadFromBackend,
    loadProjectFile,
    loadFromFile,
    handleWorkspaceBrowseFile,
  } = useProjectPersistence({
    buildPayload, payloadToLayout, restoreTemplateFromLayoutState, loadTemplateFile,
    template, csvFile, fitTemplateToCanvas,
    setFields, setImageItems, setActiveFieldId, setActiveImageId,
    setSampleValues, setSampleHtmlValues, setFieldMappings, setUseCsv, setGenerateOptions, setStatus,
  });

  const canPrintFromCsv = useCsv && Boolean(csvFile) && csvRowCount > 0;
  const isGenerateActionDisabled = !template || fields.length === 0;
  const generateDisabledTooltip = 'Open a certificate template before generating';

  // ------ Generate hook -------------------------------------------------------
  const {
    isPreviewingAll,
    generatedCertificates,
    previewModalOpen, setPreviewModalOpen,
    previewUrl,
    latestDownload,
    zipNameModal, setZipNameModal,
    closePreview,
    generatePdf,
    printCurrentCertificate,
    previewAllCertificates,
    handlePrintFromModal,
    downloadLatestFile,
    confirmZipDownload,
  } = useGenerate({
    templateFile, fields, fieldMappings, csvFile, useCsv, csvRowCount, csvFirstRow, csvAllRows,
    generateOptions, buildPayload, buildDataPayload, getFieldValuePayload,
    setStatus, setPanelState, canPrintFromCsv, isGenerating, setIsGenerating,
  });

  // ------ Toolbar display values ----------------------------------------------
  const displayedFontValue = fontHoverFamily || (isEditingText && activeEditorFont ? activeEditorFont : activeField?.font || 'Helvetica');
  const displayedSizeValue = sizeHoverValue ?? Number(activeField?.size ?? 18);
  const displayedColorValue = colorHoverValue || (activeField ? colorArrayToHex(activeField.color) : '#000000');
  const activeFieldIsCsvMapped = !!activeField && useCsv && Boolean(fieldMappings[activeField.name]);

  const parseCsvHeaders = async (file) => {
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setCsvRowCount(0);
      return;
    }
    try {
      const text = await file.text();

      // RFC 4180-compliant CSV parser: handles quoted fields, embedded commas,
      // embedded newlines, and escaped quotes ("").
      const parseRfc4180 = (str) => {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (inQuotes) {
            if (ch === '"' && i + 1 < str.length && str[i + 1] === '"') {
              field += '"';
              i++;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              field += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            row.push(field);
            field = '';
          } else if (ch === '\r') {
            // skip bare CR; CRLF handled by skipping \r before \n
          } else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
          } else {
            field += ch;
          }
        }
        // Trailing field/row (no final newline)
        if (field || row.length > 0) {
          row.push(field);
          rows.push(row);
        }
        return rows;
      };

      const allParsedRows = parseRfc4180(text);
      if (allParsedRows.length === 0) {
        setCsvHeaders([]);
        setCsvFirstRow({});
        setCsvAllRows([]);
        setCsvRowCount(0);
        return;
      }

      const headers = allParsedRows[0].map((h, idx) => {
        const trimmed = h.trim();
        return idx === 0 ? trimmed.replace(/^\uFEFF/, '') : trimmed;
      });
      setCsvHeaders(headers);

      // Data rows: skip rows that are entirely empty
      const dataRows = allParsedRows.slice(1).filter((r) => r.some((v) => v.trim()));
      setCsvRowCount(dataRows.length);

      const allRowObjects = dataRows.map((values) => {
        const rowObj = {};
        headers.forEach((header, idx) => { rowObj[header] = values[idx] ?? ''; });
        return rowObj;
      });
      // Store only a limited number of rows for preview to keep memory bounded.
      setCsvAllRows(allRowObjects.slice(0, MAX_PREVIEW_CERTIFICATES));

      if (allRowObjects.length > 0) {
        setCsvFirstRow(allRowObjects[0]);
      } else {
        setCsvFirstRow({});
      }
    } catch (error) {
      setStatus(`Could not read the spreadsheet: ${error.message}. Please check the file and try again.`);
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setCsvRowCount(0);
    }
  };

  const handleCsvFileChange = async (event) => {
    const file = event.target.files?.[0] ?? null;
    setCsvFile(file);
    setSpreadsheetMappingOpen(false);
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setFieldMappings({});
      setCsvRowCount(0);
      setGenerateOptions((prev) => ({
        ...prev,
        row: 0,
        generate_all: false,
      }));
    } else {
      await parseCsvHeaders(file);
    }
  };

  const updateFieldMapping = (fieldName, csvColumn) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldName]: csvColumn
    }));

    if (csvColumn && activeField?.name === fieldName) {
      commitActiveEditingDraft();
      setIsEditingText(false);
    }
    
    // Update sample value from CSV first row if mapped
    if (csvColumn && csvFirstRow[csvColumn]) {
      setSampleValues(prev => ({
        ...prev,
        [fieldName]: csvFirstRow[csvColumn]
      }));

      setSampleHtmlValues((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, fieldName)) {
          return prev;
        }
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const togglePanel = (key) => {
    setPanelState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const stopPanelToggle = (event) => {
    event.stopPropagation();
  };

  const toggleSection = (section) => setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  const toggleSidebarSection = (section) => setSidebarSections((prev) => ({ ...prev, [section]: !prev[section] }));

  useEffect(() => {
    if (!session) return;
    refreshFieldsList();
    fetchCustomFonts();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedNavItem = event.target.closest('.nav-menu-item');
      const clickedGenerateGroup = event.target.closest('.topbar-generate');
      const clickedPrintGroup = event.target.closest('.topbar-print');
      const clickedSettingsDock = event.target.closest('.settings-dock');
      const insideFontPicker = fontPickerRef.current && fontPickerRef.current.contains(event.target);
      const insideSizePicker = sizePickerRef.current && sizePickerRef.current.contains(event.target);
      const clickedColorPicker = event.target.closest('.color-picker');

      if (insertMenuOpen && !clickedNavItem) setInsertMenuOpen(false);
      if (layoutsMenuOpen && !clickedNavItem) setLayoutsMenuOpen(false);
      if (generateMenuOpen && !clickedGenerateGroup) setGenerateMenuOpen(false);
      if (printMenuOpen && !clickedPrintGroup) setPrintMenuOpen(false);
      if (settingsMenuOpen && !clickedSettingsDock) { setSettingsMenuOpen(false); setSettingsTab(null); }
      if (fontPickerOpen && !insideFontPicker) {
        setFontPickerOpen(false);
        setFontHoverFamily('');
      }
      if (sizePickerOpen && !insideSizePicker) {
        setSizePickerOpen(false);
        setSizeHoverValue(null);
      }
      if (colorPickerOpen && !clickedColorPicker) {
        setColorPickerOpen(false);
        setColorHoverValue('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [insertMenuOpen, layoutsMenuOpen, settingsMenuOpen, generateMenuOpen, printMenuOpen, fontPickerOpen, sizePickerOpen, colorPickerOpen]);

  useEffect(() => {
    const classList = document.documentElement.classList;
    if (theme === 'dark') {
      classList.add('theme-dark');
    } else {
      classList.remove('theme-dark');
    }
  }, [theme]);

  const readImageAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });

  const getImageNaturalSize = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Failed to load image.'));
      image.src = src;
    });

  const importImageElement = async (event) => {
    if (!template) {
      setStatus('Please open a certificate template before adding images.');
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const src = await readImageAsDataUrl(file);
      const natural = await getImageNaturalSize(src);
      const maxPreviewWidth = Math.min(260, template.displayWidth * 0.4);
      const maxPreviewHeight = Math.min(120, template.displayHeight * 0.25);
      const scale = Math.min(
        1,
        maxPreviewWidth / Math.max(1, natural.width),
        maxPreviewHeight / Math.max(1, natural.height)
      );

      const nextImage = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '') || `image_${imageItems.length + 1}`,
        x: 24,
        y: 24,
        w: Math.max(16, natural.width * scale),
        h: Math.max(16, natural.height * scale),
        src,
        z: getNextLayerZ(fields, imageItems),
      };

      setImageItems((prev) => [
        ...prev,
        clampBox(nextImage, template.displayWidth, template.displayHeight),
      ]);
      commitActiveEditingDraft();
      setSelectedFieldIds([]);
      setSelectedImageIds([nextImage.id]);
      setActiveImageId(nextImage.id);
      setActiveFieldId(null);
      setIsEditingText(false);
      setStatus(`Image added: ${file.name}`);
    } catch (error) {
      setStatus('Could not add the image — please try again.');
    } finally {
      event.target.value = '';
    }
  };

  const getPointFromEvent = (event) => {
    const rect = layerRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };

  const beginDraw = (event) => {
    if (!template || interaction || event.button !== 0) {
      return;
    }

    const isCanvasObject = event.target.closest('.field-box');
    if (isCanvasObject) return;

    commitActiveEditingDraft();
    setIsEditingText(false);
    clearSelection();

    const point = getPointFromEvent(event);
    setIsDrawing(true);
    setDraftBox({
      kind: toolMode === 'text' ? 'create' : 'select',
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      w: 1,
      h: 1,
    });
  };

  const beginMove = (event, targetId, targetType = 'field') => {
    event.preventDefault();
    event.stopPropagation();

    const point = getPointFromEvent(event);
    const target = targetType === 'image'
      ? imageItems.find((item) => item.id === targetId)
      : fields.find((item) => item.id === targetId);
    if (!target) {
      return;
    }

    const targetAlreadySelected = targetType === 'image'
      ? selectedImageIds.includes(targetId)
      : selectedFieldIds.includes(targetId);
    const shouldMoveWholeSelection = targetAlreadySelected && selectedCount > 1;
    const moveFieldIds = shouldMoveWholeSelection
      ? selectedFieldIds
      : targetType === 'field'
        ? [targetId]
        : [];
    const moveImageIds = shouldMoveWholeSelection
      ? selectedImageIds
      : targetType === 'image'
        ? [targetId]
        : [];

    commitActiveEditingDraft();
    // Capture state before the drag so we can push a single undo entry on drop.
    preDragSnapshotRef.current = buildHistorySnapshot();
    isApplyingHistoryRef.current = true;
    setSelectedFieldIds(moveFieldIds);
    setSelectedImageIds(moveImageIds);
    if (targetType === 'image') {
      setActiveImageId(targetId);
      if (!shouldMoveWholeSelection) setActiveFieldId(null);
    } else {
      setActiveFieldId(targetId);
      if (!shouldMoveWholeSelection) setActiveImageId(null);
    }
    setIsEditingText(false);
    setInteraction({
      mode: 'move',
      targetType,
      targetId,
      startX: point.x,
      startY: point.y,
      initial: target,
      targets: getOrderedCanvasItems(fields, imageItems)
        .filter((item) => moveFieldIds.includes(item.id) || moveImageIds.includes(item.id))
        .map((item) => ({
          kind: item.kind,
          id: item.id,
          initial: { x: item.x, y: item.y, w: item.w, h: item.h },
        })),
    });
  };

  const beginResize = (event, targetId, direction, targetType = 'field') => {
    event.preventDefault();
    event.stopPropagation();
    const point = getPointFromEvent(event);
    const target = targetType === 'image'
      ? imageItems.find((item) => item.id === targetId)
      : fields.find((item) => item.id === targetId);
    if (!target) {
      return;
    }
    commitActiveEditingDraft();
    // Capture state before the resize so we can push a single undo entry on release.
    preDragSnapshotRef.current = buildHistorySnapshot();
    isApplyingHistoryRef.current = true;
    setIsEditingText(false);
    if (targetType === 'image') {
      setSelectedFieldIds([]);
      setSelectedImageIds([targetId]);
      setActiveImageId(targetId);
      setActiveFieldId(null);
    } else {
      setSelectedFieldIds([targetId]);
      setSelectedImageIds([]);
      setActiveFieldId(targetId);
      setActiveImageId(null);
    }
    setInteraction({ mode: 'resize', targetType, targetId, startX: point.x, startY: point.y, initial: target, direction });
  };

  const isTypingSurface = (target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
      return true;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const typingSurface = isTypingSurface(target);
      const modKey = event.ctrlKey || event.metaKey;
      const selectionItems = selectedCanvasItems.length > 0
        ? selectedCanvasItems
        : activeField
          ? [{ kind: 'field', ...activeField }]
          : activeImage
            ? [{ kind: 'image', ...activeImage }]
            : [];

      if (event.key === 'Escape' && isEditingText) {
        event.preventDefault();
        commitActiveEditingDraft();
        lastSelectionRangeRef.current = null;
        setIsEditingText(false);
        return;
      }

      if (!typingSurface && !modKey && !event.altKey) {
        const lowerKey = event.key.toLowerCase();
        if (lowerKey === 'v') {
          event.preventDefault();
          setToolMode('select');
          setStatus('Selection tool active.');
          return;
        }
        if (lowerKey === 't') {
          event.preventDefault();
          setToolMode('text');
          setStatus('Text box tool active. Drag on the canvas to draw a field.');
          return;
        }
      }

      if (modKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const wantsUndo = key === 'z' && !event.shiftKey;
        const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey);
        if (key === 's') {
          event.preventDefault();
          if (event.shiftKey) {
            saveProjectAsToFile();
          } else {
            saveProjectToFile();
          }
          return;
        }
        if (wantsUndo || wantsRedo) {
          if (typingSurface) {
            return;
          }
          event.preventDefault();
          const didApply = wantsUndo ? performUndo() : performRedo();
          if (!didApply) {
            setStatus(wantsUndo ? 'Nothing to undo.' : 'Nothing to redo.');
          }
          return;
        }
        if (key === 'b') {
          if (activeField) {
            event.preventDefault();
            handleInlineStyleClick('bold', 'bold');
          }
          return;
        }
        if (key === 'i') {
          if (activeField) {
            event.preventDefault();
            handleInlineStyleClick('italic', 'italic');
          }
          return;
        }
        if (key === 'u') {
          const editorEl = getActiveEditorEl();
          if (activeField && editorEl && (isEditingText || editorEl.isContentEditable)) {
            event.preventDefault();
            applyInlineCommandOrFieldUpdate({
              command: 'underline',
              fieldPatch: {},
              requireSelection: true,
              selectionMessage: 'Select text in the field to underline.',
            });
          }
          return;
        }
        
        // Copy / Duplicate / Paste
        if (!typingSurface && !isEditingText) {
          if (key === 'c') {
            event.preventDefault();
            if (selectionItems.length > 0) {
              clipboardRef.current = {
                items: selectionItems.map((item) => ({ ...item })),
              };
            }
            return;
          }
          if (key === 'v') {
            event.preventDefault();
            pasteClipboardSelection();
            return;
          }
          if (key === 'd') {
            event.preventDefault();
            duplicateSelection();
            return;
          }
        }
      }

      if (typingSurface) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingText) {
        if (selectedCount > 0) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }

      if (isEditingText) {
        return;
      }

      const keyStep = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case 'ArrowLeft':
          dx = -keyStep;
          break;
        case 'ArrowRight':
          dx = keyStep;
          break;
        case 'ArrowUp':
          dy = -keyStep;
          break;
        case 'ArrowDown':
          dy = keyStep;
          break;
        default:
          return;
      }

      if (selectedCount > 0) {
        event.preventDefault();
        nudgeSelection(dx, dy);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isEditingText,
    activeField,
    activeImage,
    activeFieldId,
    activeImageId,
    fields,
    imageItems,
    template,
    selectedCanvasItems,
    selectedCount,
    performUndo,
    performRedo,
    applyInlineCommandOrFieldUpdate,
    handleInlineStyleClick,
    saveProjectAsToFile,
    saveProjectToFile,
    pasteClipboardSelection,
    duplicateSelection,
    deleteSelection,
    nudgeSelection,
  ]);

  const getMappedColumnForField = (field) => {
    if (!field || !useCsv) {
      return '';
    }
    const mappedColumn = fieldMappings[field.name];
    return typeof mappedColumn === 'string' ? mappedColumn : '';
  };
  const getFieldDisplayName = (field) => {
    if (!field) return '';
    
    // If CSV is mapped, use the column name
    const csvColumn = getMappedColumnForField(field);
    if (csvColumn) {
      return csvColumn;
    }
    
    // Otherwise, try to show content preview (only if CSV is NOT active, or CSV is active but field isn't mapped)
    const preview = sampleValues[field.name] || sampleHtmlValues[field.name];
    if (preview) {
      const text = String(preview).substring(0, 35);
      return text.length < String(preview).length ? text + '…' : text;
    }
    
    // If CSV not active and no preview, show field name
    // If CSV is active and field unmapped with no preview, show field name with note
    if (!useCsv) {
      return field.name ?? '';
    }
    
    return field.name ?? '';
  };

  const moveDraw = (event) => {
    if (!template) {
      return;
    }

    if (interaction) {
      const point = getPointFromEvent(event);
      let dx = point.x - interaction.startX;
      let dy = point.y - interaction.startY;
      if (interaction.mode === 'move') {
        // Ignore micro-movements so a plain click doesn't accidentally nudge the field
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        if (interaction.targets?.length > 1) {
          const fieldTargets = new Map(
            interaction.targets
              .filter((item) => item.kind === 'field')
              .map((item) => [item.id, item.initial])
          );
          const imageTargets = new Map(
            interaction.targets
              .filter((item) => item.kind === 'image')
              .map((item) => [item.id, item.initial])
          );
          setFields((prev) => prev.map((field) => {
            const initial = fieldTargets.get(field.id);
            return initial
              ? clampBox({ ...field, x: initial.x + dx, y: initial.y + dy }, template.displayWidth, template.displayHeight)
              : field;
          }));
          setImageItems((prev) => prev.map((image) => {
            const initial = imageTargets.get(image.id);
            return initial
              ? clampBox({ ...image, x: initial.x + dx, y: initial.y + dy }, template.displayWidth, template.displayHeight)
              : image;
          }));
          setAlignmentGuides([]);
          return;
        }

        let newX = interaction.initial.x + dx;
        let newY = interaction.initial.y + dy;

        if (interaction.targetType === 'image') {
          updateImage(interaction.targetId, {
            x: newX,
            y: newY,
          });
          setAlignmentGuides([]);
          return;
        }
        
        // Calculate alignment guides & apply snapping
        const guides = [];
        const threshold = 6; // pixels for snapping
        const movingField = fields.find(f => f.id === interaction.targetId);
        
        if (movingField) {
          let snapX = null;
          let snapY = null;
          
          let movingCenterX = newX + movingField.w / 2;
          let movingCenterY = newY + movingField.h / 2;
          let movingLeft = newX;
          let movingRight = newX + movingField.w;
          let movingTop = newY;
          let movingBottom = newY + movingField.h;
          
          // Canvas center snapping
          const canvasCenterX = template.displayWidth / 2;
          const canvasCenterY = template.displayHeight / 2;

          if (Math.abs(movingCenterX - canvasCenterX) < threshold) {
            snapX = canvasCenterX - movingField.w / 2;
            guides.push({ type: 'vertical', x: canvasCenterX });
          }
          if (Math.abs(movingCenterY - canvasCenterY) < threshold) {
            snapY = canvasCenterY - movingField.h / 2;
            guides.push({ type: 'horizontal', y: canvasCenterY });
          }

          fields.forEach((field) => {
            if (field.id === interaction.targetId) return;
            
            const centerX = field.x + field.w / 2;
            const centerY = field.y + field.h / 2;
            const left = field.x;
            const right = field.x + field.w;
            const top = field.y;
            const bottom = field.y + field.h;
            
            // Vertical alignment guides (X axis)
            if (snapX === null) {
              if (Math.abs(movingLeft - left) < threshold) { snapX = left; guides.push({ type: 'vertical', x: left }); }
              else if (Math.abs(movingRight - right) < threshold) { snapX = right - movingField.w; guides.push({ type: 'vertical', x: right }); }
              else if (Math.abs(movingCenterX - centerX) < threshold) { snapX = centerX - movingField.w / 2; guides.push({ type: 'vertical', x: centerX }); }
              else if (Math.abs(movingRight - left) < threshold) { snapX = left - movingField.w; guides.push({ type: 'vertical', x: left }); }
              else if (Math.abs(movingLeft - right) < threshold) { snapX = right; guides.push({ type: 'vertical', x: right }); }
            } else {
              // Even if we snapped locally, show guides for matches
              if (Math.abs((snapX) - left) < 1) guides.push({ type: 'vertical', x: left });
              else if (Math.abs((snapX + movingField.w) - right) < 1) guides.push({ type: 'vertical', x: right });
              else if (Math.abs((snapX + movingField.w / 2) - centerX) < 1) guides.push({ type: 'vertical', x: centerX });
            }
            
            // Horizontal alignment guides (Y axis)
            if (snapY === null) {
              if (Math.abs(movingTop - top) < threshold) { snapY = top; guides.push({ type: 'horizontal', y: top }); }
              else if (Math.abs(movingBottom - bottom) < threshold) { snapY = bottom - movingField.h; guides.push({ type: 'horizontal', y: bottom }); }
              else if (Math.abs(movingCenterY - centerY) < threshold) { snapY = centerY - movingField.h / 2; guides.push({ type: 'horizontal', y: centerY }); }
              else if (Math.abs(movingBottom - top) < threshold) { snapY = top - movingField.h; guides.push({ type: 'horizontal', y: top }); }
              else if (Math.abs(movingTop - bottom) < threshold) { snapY = bottom; guides.push({ type: 'horizontal', y: bottom }); }
            } else {
              if (Math.abs((snapY) - top) < 1) guides.push({ type: 'horizontal', y: top });
              else if (Math.abs((snapY + movingField.h) - bottom) < 1) guides.push({ type: 'horizontal', y: bottom });
              else if (Math.abs((snapY + movingField.h / 2) - centerY) < 1) guides.push({ type: 'horizontal', y: centerY });
            }
          });
          
          if (snapX !== null && !event.altKey) newX = snapX;
          if (snapY !== null && !event.altKey) newY = snapY;
        }

        updateField(interaction.targetId, {
          x: newX,
          y: newY,
        });
        
        setAlignmentGuides(guides);
      } else if (interaction.mode === 'resize') {
        const dir = interaction.direction;
        const newBox = { ...interaction.initial };
        
        // Handle horizontal resizing
        if (dir.includes('e')) {
          // Resize from right edge
          newBox.w = interaction.initial.w + dx;
        } else if (dir.includes('w')) {
          // Resize from left edge
          newBox.x = interaction.initial.x + dx;
          newBox.w = interaction.initial.w - dx;
        }
        
        // Handle vertical resizing
        if (dir.includes('s')) {
          // Resize from bottom edge
          newBox.h = interaction.initial.h + dy;
        } else if (dir.includes('n')) {
          // Resize from top edge
          newBox.y = interaction.initial.y + dy;
          newBox.h = interaction.initial.h - dy;
        }

        if (newBox.w < 0) {
          newBox.x += newBox.w;
          newBox.w = Math.abs(newBox.w);
        }
        if (newBox.h < 0) {
          newBox.y += newBox.h;
          newBox.h = Math.abs(newBox.h);
        }
        
        if (interaction.targetType === 'image') {
          updateImage(interaction.targetId, newBox);
        } else {
          updateField(interaction.targetId, newBox);
        }
      }
      return;
    }

    if (!isDrawing || !draftBox) {
      return;
    }
    const point = getPointFromEvent(event);
    const x = Math.min(draftBox.startX, point.x);
    const y = Math.min(draftBox.startY, point.y);
    const w = Math.abs(point.x - draftBox.startX);
    const h = Math.abs(point.y - draftBox.startY);
    setDraftBox({ ...draftBox, x, y, w, h });
  };

  const endDraw = () => {
    if (interaction) {
      // Commit the move/resize as a single undo entry.
      const preDrag = preDragSnapshotRef.current;
      if (preDrag) {
        const postDragSig = JSON.stringify(buildHistorySnapshot());
        if (JSON.stringify(preDrag) !== postDragSig) {
          undoStackRef.current.push(preDrag);
          if (undoStackRef.current.length > MAX_HISTORY_STEPS) undoStackRef.current.shift();
          redoStackRef.current = [];
        }
        preDragSnapshotRef.current = null;
      }
      // Resume normal history tracking after React has flushed the final state.
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
      setInteraction(null);
      setAlignmentGuides([]);
      return;
    }

    if (!template || !draftBox) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);

    if (draftBox.w < 8 || draftBox.h < 8) {
      setDraftBox(null);
      return;
    }

    if (draftBox.kind === 'select') {
      const selectionRect = {
        left: draftBox.x,
        top: draftBox.y,
        right: draftBox.x + draftBox.w,
        bottom: draftBox.y + draftBox.h,
      };
      const nextSelectedFieldIds = fields
        .filter((field) => {
          const right = field.x + field.w;
          const bottom = field.y + field.h;
          return right >= selectionRect.left &&
            field.x <= selectionRect.right &&
            bottom >= selectionRect.top &&
            field.y <= selectionRect.bottom;
        })
        .map((field) => field.id);
      const nextSelectedImageIds = imageItems
        .filter((image) => {
          const right = image.x + image.w;
          const bottom = image.y + image.h;
          return right >= selectionRect.left &&
            image.x <= selectionRect.right &&
            bottom >= selectionRect.top &&
            image.y <= selectionRect.bottom;
        })
        .map((image) => image.id);
      setSelectedFieldIds(nextSelectedFieldIds);
      setSelectedImageIds(nextSelectedImageIds);
      setActiveFieldId(nextSelectedFieldIds[0] ?? null);
      setActiveImageId(nextSelectedFieldIds.length === 0 ? nextSelectedImageIds[0] ?? null : null);
      setDraftBox(null);
      return;
    }

    const newField = {
      id: uid(),
      name: uniqueFieldName(`field_${fields.length + 1}`, fields),
      x: draftBox.x,
      y: draftBox.y,
      w: draftBox.w,
      h: draftBox.h,
      align: 'left',
      font: 'Helvetica',
      size: 18,
      color: [0, 0, 0],
      maxWidth: false,
      wrapText: true,
      bold: false,
      italic: false,
      z: getNextLayerZ(fields, imageItems),
    };

    setFields((prev) => [...prev, clampBox(newField, template.displayWidth, template.displayHeight)]);
    setSelectedFieldIds([newField.id]);
    setSelectedImageIds([]);
    setActiveFieldId(newField.id);
    setDraftBox(null);
  };

  // Always keep the refs pointing at the latest version of the drag handlers.
  // This lets the effect below avoid listing them as dependencies, preventing
  // the global event listeners from being torn down and re-added on every frame.
  moveDrawRef.current = moveDraw;
  endDrawRef.current = endDraw;

  useEffect(() => {
    if (!interaction && !isDrawing) {
      return;
    }

    const handleGlobalMove = (event) => {
      if (!layerRef.current) {
        return;
      }
      moveDrawRef.current(event);
    };

    const handleGlobalUp = () => {
      endDrawRef.current();
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, isDrawing]);
  const handleFieldDoubleClick = (field) => {
    const resolvedName = typeof field.name === 'string' ? field.name.trim() : '';
    setFieldValueModal({
      open: true,
      fieldId: field.id,
      requireName: !resolvedName,
      initialName: resolvedName,
      initialValue: resolvedName ? (sampleValues[resolvedName] ?? '') : '',
    });
  };

  const closeFieldValueModal = () => {
    setFieldValueModal({
      open: false,
      fieldId: null,
      requireName: false,
      initialName: '',
      initialValue: '',
    });
  };

  const confirmFieldValueModal = ({ name, value }) => {
    const targetField = fields.find((item) => item.id === fieldValueModal.fieldId);
    if (!targetField) {
      closeFieldValueModal();
      return;
    }

    const previousName = typeof targetField.name === 'string' ? targetField.name : '';
    const nextName = String(name || '').trim();
    if (!nextName) {
      return;
    }

    if (previousName !== nextName) {
      updateField(targetField.id, { name: nextName });
    }

    setSampleValues((prev) => {
      const next = { ...prev };
      if (previousName && previousName !== nextName) {
        delete next[previousName];
      }
      next[nextName] = value;
      return next;
    });

    setSampleHtmlValues((prev) => {
      const next = { ...prev };
      if (previousName && previousName !== nextName) {
        delete next[previousName];
      }
      if (Object.prototype.hasOwnProperty.call(next, nextName)) {
        delete next[nextName];
      }
      return next;
    });

    closeFieldValueModal();
  };

  // -- Auth gate ------------------------------------------------------------
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f0e0d', color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
        Loading…
      </div>
    );
  }
  if (!session) return <Auth />;

  return (
    <div className="app-shell">
      <TopBar
        insertMenuOpen={insertMenuOpen}
        layoutsMenuOpen={layoutsMenuOpen}
        settingsMenuOpen={settingsMenuOpen}
        generateMenuOpen={generateMenuOpen}
        printMenuOpen={printMenuOpen}
        template={template}
        fields={fields}
        imageItems={imageItems}
        csvFile={csvFile}
        csvRowCount={csvRowCount}
        generateOptions={generateOptions}
        updatePreviewRow={updatePreviewRow}
        canPrintFromCsv={canPrintFromCsv}
        useCsv={useCsv}
        previewUrl={previewUrl}
        latestDownload={latestDownload}
        isGenerating={isGenerating}
        isPreviewingAll={isPreviewingAll}
        isGenerateActionDisabled={isGenerateActionDisabled}
        generateDisabledTooltip={generateDisabledTooltip}
        projectFileHandle={projectFileHandle}
        selectedFieldsName={selectedFieldsName}
        saveFieldsName={saveFieldsName}
        fieldsList={fieldsList}
        session={session}
        setInsertMenuOpen={setInsertMenuOpen}
        setLayoutsMenuOpen={setLayoutsMenuOpen}
        setSettingsMenuOpen={setSettingsMenuOpen}
        setGenerateMenuOpen={setGenerateMenuOpen}
        setPrintMenuOpen={setPrintMenuOpen}
        setSelectedFieldsName={setSelectedFieldsName}
        setSaveFieldsName={setSaveFieldsName}
        setGenerateOptions={setGenerateOptions}
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
        canUndo={canUndo}
        canRedo={canRedo}
        performUndo={performUndo}
        performRedo={performRedo}
        generatePdf={generatePdf}
        printCurrentCertificate={printCurrentCertificate}
        previewAllCertificates={previewAllCertificates}
        downloadLatestFile={downloadLatestFile}
        signOut={signOut}
        bulkDrawerOpen={bulkDrawerOpen}
        setBulkDrawerOpen={setBulkDrawerOpen}
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
        preset={preset}
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
        setPreset={setPreset}
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
      />

      {/* -- STATUS NOTIFICATION -- */}
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

      {/* -- APP BODY -- */}
      <div className="app-body">

        <LeftSidebar
          sidebarSections={sidebarSections}
          orderedCanvasItems={orderedCanvasItems}
          fields={fields}
          imageItems={imageItems}
          activeFieldId={activeFieldId}
          activeImageId={activeImageId}
          selectedFieldIds={selectedFieldIds}
          selectedImageIds={selectedImageIds}
          useCsv={useCsv}
          fieldMappings={fieldMappings}
          toggleSidebarSection={toggleSidebarSection}
          commitActiveEditingDraft={commitActiveEditingDraft}
          setIsEditingText={setIsEditingText}
          setActiveImageId={setActiveImageId}
          setActiveFieldId={setActiveFieldId}
          selectSingleField={selectSingleField}
          selectSingleImage={selectSingleImage}
        getMappedColumnForField={getMappedColumnForField}
        getFieldDisplayName={getFieldDisplayName}
        importImageElement={importImageElement}
        addTextField={addTextField}
      />

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
          applyInlineCommandOrFieldUpdate={applyInlineCommandOrFieldUpdate}
          handleInlineStyleClick={handleInlineStyleClick}
          deleteSelection={deleteSelection}
          duplicateSelection={duplicateSelection}
          reorderSelectionLayers={reorderSelectionLayers}
          fontPickerGroups={fontPickerGroups}
          cacheSelectionRangeFromEditor={cacheSelectionRangeFromEditor}
        />

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
        />
      </div>

      {/* -- STATUS BAR -- */}
      <div className="statusbar">
        <div className="status-item">
          <div className={`status-dot ${statusInfo.type === 'error' ? 'error' : statusInfo.type === 'warning' ? 'warning' : ''}`} />
          {statusInfo.text || 'Ready'}
        </div>
        {template && <div className="status-item">Page: {Math.round(template.pageWidthPt)} × {Math.round(template.pageHeightPt)}</div>}
        <div className="status-item">{fields.length} text field{fields.length !== 1 ? 's' : ''} / {imageItems.length} image{imageItems.length !== 1 ? 's' : ''}</div>
        <div style={{ flex: 1 }} />
        {activeField && scales && <div className="status-item">Position: {Math.round(activeField.x * scales.x)}, {Math.round(activeField.y * scales.y)}</div>}
        <div className="status-item">tool: {toolMode}</div>
        {selectedCount > 1 && <div className="status-item">selection: {selectedCount} items</div>}
        <div className="status-item">zoom: {Math.round(zoom * 100)}%</div>
      </div>

      {/* -- BULK DRAWER -- */}
      <BulkDrawer
        open={bulkDrawerOpen}
        onClose={() => setBulkDrawerOpen(false)}
        useCsv={useCsv}
        setUseCsv={setUseCsv}
        csvFile={csvFile}
        csvHeaders={csvHeaders}
        csvFirstRow={csvFirstRow}
        csvRowCount={csvRowCount}
        spreadsheetMappingOpen={spreadsheetMappingOpen}
        setSpreadsheetMappingOpen={setSpreadsheetMappingOpen}
        handleCsvFileChange={handleCsvFileChange}
        updateFieldMapping={updateFieldMapping}
        fieldMappings={fieldMappings}
        fields={fields}
        getFieldDisplayName={getFieldDisplayName}
      />

      {/* -- SETTINGS DOCK -- */}
      <SettingsDock
        settingsMenuOpen={settingsMenuOpen}
        setSettingsMenuOpen={setSettingsMenuOpen}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        setInsertMenuOpen={setInsertMenuOpen}
        setLayoutsMenuOpen={setLayoutsMenuOpen}
        setGenerateMenuOpen={setGenerateMenuOpen}
        setPrintMenuOpen={setPrintMenuOpen}
        customFonts={customFonts}
        uploadFont={uploadFont}
        deleteFont={deleteFont}
      />

      {replaceTemplateModal.open && (
        <ConfirmActionModal
          title="Replace current template?"
          message="Opening a new template will clear the current text fields and images."
          confirmLabel="Replace template"
          onConfirm={confirmTemplateReplace}
          onCancel={cancelTemplateReplace}
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

      {/* -- ZIP DOWNLOAD NAME MODAL -- */}
      {zipNameModal.open && (
        <ZipNameModal
          suggestedName={zipNameModal.suggestedName}
          onConfirm={confirmZipDownload}
          onCancel={() => setZipNameModal((prev) => ({ ...prev, open: false }))}
        />
      )}

      {/* -- CERTIFICATE PREVIEW MODAL -- */}
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
