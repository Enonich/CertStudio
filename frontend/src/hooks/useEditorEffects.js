import { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';

const COMPACT_SHELL_BREAKPOINT = 1120;
const isCompactViewport = () => typeof window !== 'undefined' && window.innerWidth <= COMPACT_SHELL_BREAKPOINT;

/**
 * Bundles all global side-effects that don't belong to a specific feature hook:
 * compact shell layout, resize, beforeunload, click-outside menus, theme, session init.
 *
 * @param {{
 *   session: object | null,
 *   isDirty: boolean,
 *   fontPickerRef: React.RefObject,
 *   sizePickerRef: React.RefObject,
 *   refreshFieldsList: Function,
 *   fetchCustomFonts: Function,
 *   zipNameModal: { open: boolean },
 *   previewModalOpen: boolean,
 * }} deps
 */
export function useEditorEffects({ session, isDirty, fontPickerRef, sizePickerRef, refreshFieldsList, fetchCustomFonts, zipNameModal, previewModalOpen }) {
  const {
    theme,
    isCompactShell, setIsCompactShell,
    leftSidebarOpen, setLeftSidebarOpen,
    rightSidebarOpen, setRightSidebarOpen,
    bulkDrawerOpen,
    insertMenuOpen, setInsertMenuOpen,
    layoutsMenuOpen, setLayoutsMenuOpen,
    settingsMenuOpen, setSettingsMenuOpen,
    settingsTab, setSettingsTab,
    generateMenuOpen, setGenerateMenuOpen,
    printMenuOpen, setPrintMenuOpen,
    replaceTemplateModal,
    fieldValueModal,
    fontPickerOpen, setFontPickerOpen,
    setFontHoverFamily,
    sizePickerOpen, setSizePickerOpen,
    setSizeHoverValue,
    colorPickerOpen, setColorPickerOpen,
    setColorHoverValue,
  } = useEditorStore();

  // Compact shell: auto-close sidebars when overlays open
  useEffect(() => {
    if (!isCompactShell) return;
    if (
      bulkDrawerOpen || insertMenuOpen || layoutsMenuOpen || settingsMenuOpen ||
      generateMenuOpen || printMenuOpen || replaceTemplateModal.open ||
      fieldValueModal.open || zipNameModal.open || previewModalOpen
    ) {
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    }
  }, [
    bulkDrawerOpen, fieldValueModal.open, generateMenuOpen, insertMenuOpen,
    isCompactShell, layoutsMenuOpen, previewModalOpen, printMenuOpen,
    replaceTemplateModal.open, settingsMenuOpen, zipNameModal.open,
  ]);

  // Responsive breakpoint
  useEffect(() => {
    const handleResize = () => setIsCompactShell(isCompactViewport());
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dirty-state: warn before closing with unsaved changes
  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Reset sidebars when switching out of compact mode
  useEffect(() => {
    if (!isCompactShell) {
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    }
  }, [isCompactShell]);

  // Escape to close mobile sidebars
  useEffect(() => {
    if (!isCompactShell) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isCompactShell]);

  // Click-outside to close menus & pickers
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

  // Theme class on <html>
  useEffect(() => {
    const classList = document.documentElement.classList;
    if (theme === 'dark') {
      classList.add('theme-dark');
    } else {
      classList.remove('theme-dark');
    }
  }, [theme]);

  // Session init: fetch fonts + saved layouts
  useEffect(() => {
    if (!session) return;
    refreshFieldsList();
    fetchCustomFonts();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
}
