import { create } from 'zustand';

const COMPACT_BREAKPOINT = 1120;

/**
 * Creates a setter that accepts a value OR an updater function,
 * matching React's useState API so existing code works unchanged.
 */
const makeSetter = (set, get, key) => (value) =>
  set({ [key]: typeof value === 'function' ? value(get()[key]) : value });

// ---------------------------------------------------------------------------
// Slice: Editor core (fields, images, selection, samples, template)
// ---------------------------------------------------------------------------
const createEditorSlice = (set, get) => ({
  fields: [],
  imageItems: [],
  activeFieldId: null,
  selectedFieldIds: [],
  activeImageId: null,
  selectedImageIds: [],
  sampleValues: {},
  sampleHtmlValues: {},
  isEditingText: false,
  template: null,
  templateFile: null,
  templateFileDataUrl: '',
  replaceTemplateModal: { open: false, file: null },
  isLoadingTemplate: false,

  setFields: makeSetter(set, get, 'fields'),
  setImageItems: makeSetter(set, get, 'imageItems'),
  setActiveFieldId: makeSetter(set, get, 'activeFieldId'),
  setSelectedFieldIds: makeSetter(set, get, 'selectedFieldIds'),
  setActiveImageId: makeSetter(set, get, 'activeImageId'),
  setSelectedImageIds: makeSetter(set, get, 'selectedImageIds'),
  setSampleValues: makeSetter(set, get, 'sampleValues'),
  setSampleHtmlValues: makeSetter(set, get, 'sampleHtmlValues'),
  setIsEditingText: makeSetter(set, get, 'isEditingText'),
  setTemplate: makeSetter(set, get, 'template'),
  setTemplateFile: makeSetter(set, get, 'templateFile'),
  setTemplateFileDataUrl: makeSetter(set, get, 'templateFileDataUrl'),
  setReplaceTemplateModal: makeSetter(set, get, 'replaceTemplateModal'),
  setIsLoadingTemplate: makeSetter(set, get, 'isLoadingTemplate'),
});

// ---------------------------------------------------------------------------
// Slice: CSV / Data source
// ---------------------------------------------------------------------------
const createCsvSlice = (set, get) => ({
  csvFile: null,
  csvHeaders: [],
  csvFirstRow: {},
  csvAllRows: [],
  csvRowCount: 0,
  fieldMappings: {},
  spreadsheetMappingOpen: false,
  useCsv: false,
  generateOptions: { row: 0, output_mode: 'full_pdf', page_size: 'letter', generate_all: false },

  setCsvFile: makeSetter(set, get, 'csvFile'),
  setCsvHeaders: makeSetter(set, get, 'csvHeaders'),
  setCsvFirstRow: makeSetter(set, get, 'csvFirstRow'),
  setCsvAllRows: makeSetter(set, get, 'csvAllRows'),
  setCsvRowCount: makeSetter(set, get, 'csvRowCount'),
  setFieldMappings: makeSetter(set, get, 'fieldMappings'),
  setSpreadsheetMappingOpen: makeSetter(set, get, 'spreadsheetMappingOpen'),
  setUseCsv: makeSetter(set, get, 'useCsv'),
  setGenerateOptions: makeSetter(set, get, 'generateOptions'),
});

// ---------------------------------------------------------------------------
// Slice: UI chrome (menus, panels, layout, modals)
// ---------------------------------------------------------------------------
const createUISlice = (set, get) => ({
  theme: 'dark',
  zoom: 1,
  toolMode: 'select',
  preset: 'letter',
  customSize: { width: 612, height: 792 },
  insertMenuOpen: false,
  layoutsMenuOpen: false,
  settingsMenuOpen: false,
  settingsTab: null,
  generateMenuOpen: false,
  printMenuOpen: false,
  panelState: { fieldLayouts: true, dataSource: true, fontManager: true, generate: true, fields: true, selectedField: true, preview: true },
  expandedSections: { box: true, text: true, content: true, layout: false, name: true },
  sidebarSections: { layers: true },
  bulkDrawerOpen: false,
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  isCompactShell: typeof window !== 'undefined' && window.innerWidth <= COMPACT_BREAKPOINT,
  signOutModal: false,
  fieldValueModal: { open: false, fieldId: null, requireName: false, initialName: '', initialValue: '' },
  isGenerating: false,

  setTheme: makeSetter(set, get, 'theme'),
  setZoom: makeSetter(set, get, 'zoom'),
  setToolMode: makeSetter(set, get, 'toolMode'),
  setPreset: makeSetter(set, get, 'preset'),
  setCustomSize: makeSetter(set, get, 'customSize'),
  setInsertMenuOpen: makeSetter(set, get, 'insertMenuOpen'),
  setLayoutsMenuOpen: makeSetter(set, get, 'layoutsMenuOpen'),
  setSettingsMenuOpen: makeSetter(set, get, 'settingsMenuOpen'),
  setSettingsTab: makeSetter(set, get, 'settingsTab'),
  setGenerateMenuOpen: makeSetter(set, get, 'generateMenuOpen'),
  setPrintMenuOpen: makeSetter(set, get, 'printMenuOpen'),
  setPanelState: makeSetter(set, get, 'panelState'),
  setExpandedSections: makeSetter(set, get, 'expandedSections'),
  setSidebarSections: makeSetter(set, get, 'sidebarSections'),
  setBulkDrawerOpen: makeSetter(set, get, 'bulkDrawerOpen'),
  setLeftSidebarOpen: makeSetter(set, get, 'leftSidebarOpen'),
  setRightSidebarOpen: makeSetter(set, get, 'rightSidebarOpen'),
  setIsCompactShell: makeSetter(set, get, 'isCompactShell'),
  setSignOutModal: makeSetter(set, get, 'signOutModal'),
  setFieldValueModal: makeSetter(set, get, 'fieldValueModal'),
  setIsGenerating: makeSetter(set, get, 'isGenerating'),

  /** Close all navigation menus at once. */
  closeAllMenus: () => set({
    insertMenuOpen: false,
    layoutsMenuOpen: false,
    settingsMenuOpen: false,
    settingsTab: null,
    generateMenuOpen: false,
    printMenuOpen: false,
  }),
});

// ---------------------------------------------------------------------------
// Slice: Field editor picker state (font/size/color pickers, hover previews)
// ---------------------------------------------------------------------------
const createFieldEditorSlice = (set, get) => ({
  fontPickerOpen: false,
  fontHoverFamily: '',
  sizePickerOpen: false,
  sizeHoverValue: null,
  colorPickerOpen: false,
  colorHoverValue: '',
  activeEditorFont: '',

  setFontPickerOpen: makeSetter(set, get, 'fontPickerOpen'),
  setFontHoverFamily: makeSetter(set, get, 'fontHoverFamily'),
  setSizePickerOpen: makeSetter(set, get, 'sizePickerOpen'),
  setSizeHoverValue: makeSetter(set, get, 'sizeHoverValue'),
  setColorPickerOpen: makeSetter(set, get, 'colorPickerOpen'),
  setColorHoverValue: makeSetter(set, get, 'colorHoverValue'),
  setActiveEditorFont: makeSetter(set, get, 'activeEditorFont'),
});

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------
export const useEditorStore = create((set, get) => ({
  ...createEditorSlice(set, get),
  ...createCsvSlice(set, get),
  ...createUISlice(set, get),
  ...createFieldEditorSlice(set, get),
}));
