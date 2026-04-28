import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore';

/**
 * Registers global keyboard shortcuts as a single keydown effect.
 *
 * @param {{
 *   commitActiveEditingDraft: Function,
 *   performUndo: Function,
 *   performRedo: Function,
 *   handleInlineStyleClick: Function,
 *   applyInlineCommandOrFieldUpdate: Function,
 *   getActiveEditorEl: Function,
 *   saveProjectToFile: Function,
 *   saveProjectAsToFile: Function,
 *   pasteClipboardSelection: Function,
 *   duplicateSelection: Function,
 *   deleteSelection: Function,
 *   nudgeSelection: Function,
 *   clipboardRef: React.MutableRefObject,
 *   lastSelectionRangeRef: React.MutableRefObject,
 *   setStatus: Function,
 * }} deps
 */
export function useKeyboardShortcuts({
  commitActiveEditingDraft,
  performUndo,
  performRedo,
  handleInlineStyleClick,
  applyInlineCommandOrFieldUpdate,
  getActiveEditorEl,
  saveProjectToFile,
  saveProjectAsToFile,
  pasteClipboardSelection,
  duplicateSelection,
  deleteSelection,
  nudgeSelection,
  clipboardRef,
  lastSelectionRangeRef,
  setStatus,
}) {
  const {
    isEditingText, setIsEditingText,
    toolMode, setToolMode,
    fields, imageItems, template,
    activeFieldId, activeImageId,
    selectedFieldIds, selectedImageIds,
  } = useEditorStore();

  const activeField = useMemo(() => fields.find((f) => f.id === activeFieldId) ?? null, [fields, activeFieldId]);
  const activeImage = useMemo(() => imageItems.find((i) => i.id === activeImageId) ?? null, [imageItems, activeImageId]);
  const selectedCanvasItems = useMemo(() => {
    const selectedFields = fields.filter((f) => selectedFieldIds.includes(f.id)).map((f) => ({ kind: 'field', ...f }));
    const selectedImages = imageItems.filter((i) => selectedImageIds.includes(i.id)).map((i) => ({ kind: 'image', ...i }));
    return [...selectedFields, ...selectedImages];
  }, [fields, imageItems, selectedFieldIds, selectedImageIds]);
  const selectedCount = selectedFieldIds.length + selectedImageIds.length;

  useEffect(() => {
    const isTypingSurface = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

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
          if (typingSurface) return;
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

      if (typingSurface) return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingText) {
        if (selectedCount > 0) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }

      if (isEditingText) return;

      const keyStep = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case 'ArrowLeft': dx = -keyStep; break;
        case 'ArrowRight': dx = keyStep; break;
        case 'ArrowUp': dy = -keyStep; break;
        case 'ArrowDown': dy = keyStep; break;
        default: return;
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
}
