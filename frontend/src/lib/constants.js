export const PAGE_PRESETS = {
  letter: { label: 'Letter (612 x 792)', width: 612, height: 792 },
  a4: { label: 'A4 (210 x 297 mm)', width: 595.2756, height: 841.8898 },
  legal: { label: 'Legal (612 x 1008)', width: 612, height: 1008 },
  custom: { label: 'Custom', width: 612, height: 792 },
};

// ReportLab Base-14 fonts (always available without custom registration)
export const REPORTLAB_BASE14_FONTS = [
  { value: 'Helvetica', label: 'Helvetica (Sans-serif)' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Helvetica-Oblique', label: 'Helvetica Oblique' },
  { value: 'Helvetica-BoldOblique', label: 'Helvetica Bold Oblique' },
  { value: 'Times-Roman', label: 'Times Roman (Serif)' },
  { value: 'Times-Bold', label: 'Times Bold' },
  { value: 'Times-Italic', label: 'Times Italic' },
  { value: 'Times-BoldItalic', label: 'Times Bold Italic' },
  { value: 'Courier', label: 'Courier (Monospace)' },
  { value: 'Courier-Bold', label: 'Courier Bold' },
  { value: 'Courier-Oblique', label: 'Courier Oblique' },
  { value: 'Courier-BoldOblique', label: 'Courier Bold Oblique' },
  { value: 'Symbol', label: 'Symbol' },
  { value: 'ZapfDingbats', label: 'Zapf Dingbats' },
];

export const COMMON_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72];

export const QUICK_COLOR_SWATCHES = [
  '#000000', '#1f1f1f', '#444444', '#666666', '#888888', '#aaaaaa', '#ffffff',
  '#d9534f', '#f0ad4e', '#ffd166', '#5cb85c', '#28a745', '#20c997', '#17a2b8',
  '#1f9fff', '#0d6efd', '#6f42c1', '#e83e8c', '#ff6b6b', '#ffa94d', '#74c0fc',
];

export const MAX_HISTORY_STEPS = 100;
export const PROJECT_HANDLE_DB_NAME = 'template-mapper-project-db';
export const PROJECT_HANDLE_STORE_NAME = 'project-handles';
export const PROJECT_HANDLE_KEY = 'current-project-file';
