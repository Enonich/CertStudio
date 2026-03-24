import { useCallback, useEffect, useRef, useState } from "react";
import { createRangeFromOffset, getCaretOffset } from "../lib/caretUtils";
import { resolveFontTokenToCss } from "../lib/fontUtils";
import { normalizeEditorHtml, plainTextToHtml, sanitizeHtml, stripInlineFontFamily } from "../lib/htmlUtils";

/**
 * Manages all rich-text editing state and operations: font/size/color pickers,
 * inline formatting, font-hover preview, draft commits, and selection caching.
 */
export function useFieldEditor({
  activeField,
  activeFieldId,
  isEditingText,
  setIsEditingText,
  editingDraftRef,
  lastSelectionRangeRef,
  fontHoverPreviewRef,
  sampleValues,
  sampleHtmlValues,
  setSampleValues,
  setSampleHtmlValues,
  availableFontValues,
  updateField,
  setStatus,
}) {
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontHoverFamily, setFontHoverFamily] = useState('');
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const [sizeHoverValue, setSizeHoverValue] = useState(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorHoverValue, setColorHoverValue] = useState('');
  const [activeEditorFont, setActiveEditorFont] = useState('');

  // ---- Effects ---------------------------------------------------------------

  // Initialise the editing draft when text editing starts on a field.
  useEffect(() => {
    if (!isEditingText || !activeField?.name) {
      editingDraftRef.current = { name: null, html: '', text: '' };
      lastSelectionRangeRef.current = null;
      return;
    }
    const name = activeField.name;
    const text = sampleValues[name] ?? `{${name}}`;
    const html = sampleHtmlValues[name] ?? plainTextToHtml(text);
    editingDraftRef.current = { name, html, text };
    lastSelectionRangeRef.current = null;
  }, [isEditingText, activeFieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset picker UI state when no field is selected.
  useEffect(() => {
    if (!activeFieldId) {
      setFontHoverFamily('');
      setActiveEditorFont('');
      setFontPickerOpen(false);
      setSizeHoverValue(null);
      setSizePickerOpen(false);
      setColorHoverValue('');
      setColorPickerOpen(false);
    }
  }, [activeFieldId]);

  // Keep lastSelectionRangeRef up to date while the user changes selection
  // inside the active contenteditable editor.
  useEffect(() => {
    if (!isEditingText || !activeField?.id) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
      if (!editorEl) return;
      const range = selection.getRangeAt(0);
      if (
        range &&
        !range.collapsed &&
        editorEl.contains(range.startContainer) &&
        editorEl.contains(range.endContainer)
      ) {
        lastSelectionRangeRef.current = range.cloneRange();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isEditingText, activeFieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- DOM helpers -----------------------------------------------------------

  const getActiveEditorEl = () => document.querySelector('.field-box.active .field-preview');

  const selectionInsideEditor = (editorEl, selection) => {
    if (!editorEl || !selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    return editorEl.contains(range.startContainer) && editorEl.contains(range.endContainer);
  };

  const cacheSelectionRangeFromEditor = () => {
    const editorEl = getActiveEditorEl();
    const selection = window.getSelection();
    if (!editorEl || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    if (!selectionInsideEditor(editorEl, selection)) return;
    lastSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  // ---- Font application helpers ----------------------------------------------

  const applyFontFamilyToSelection = (editorEl, range, fontToken) => {
    if (!editorEl || !range || range.collapsed) return false;
    const token = String(fontToken ?? '').trim();
    if (!token) return false;

    const cssFont = resolveFontTokenToCss(token);
    const wrapper = document.createElement('span');
    wrapper.style.fontFamily = cssFont.family || token;
    if (cssFont.weight) wrapper.style.fontWeight = cssFont.weight;
    if (cssFont.style) wrapper.style.fontStyle = cssFont.style;

    try {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      const selection = window.getSelection();
      if (selection) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(wrapper);
        selection.removeAllRanges();
        selection.addRange(nextRange);
        lastSelectionRangeRef.current = nextRange.cloneRange();
      }
      return true;
    } catch {
      return false;
    }
  };

  // ---- Font hover preview ----------------------------------------------------

  const clearFontHoverPreview = useCallback(() => {
    const preview = fontHoverPreviewRef.current;
    if (!preview.active) return false;

    const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
    if (editorEl && preview.fieldId === activeFieldId) {
      editorEl.innerHTML = preview.html;
      if (preview.fieldName && editingDraftRef.current.name === preview.fieldName) {
        editingDraftRef.current = {
          name: preview.fieldName,
          html: preview.html,
          text: preview.text ?? editorEl.innerText,
        };
      }
      if (Number.isFinite(preview.selStart) && Number.isFinite(preview.selEnd)) {
        const restoredRange = createRangeFromOffset(editorEl, preview.selStart, preview.selEnd);
        if (restoredRange) {
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(restoredRange);
            lastSelectionRangeRef.current = restoredRange.cloneRange();
          }
        }
      }
    }

    fontHoverPreviewRef.current = {
      active: false,
      fieldId: null,
      fieldName: null,
      html: '',
      text: '',
      selStart: null,
      selEnd: null,
    };
    return true;
  }, [activeFieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewFontHoverOnSelection = useCallback(
    (fontToken) => {
      const token = String(fontToken ?? '').trim();
      if (!token || !activeField || !isEditingText) return false;

      const editorEl = document.querySelector('.field-box.active .field-preview[contenteditable="true"]');
      if (!editorEl || !editorEl.isContentEditable) return false;

      let selection = window.getSelection();
      const hasLiveSelection =
        !!selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        selectionInsideEditor(editorEl, selection);

      if (!hasLiveSelection) {
        if (!lastSelectionRangeRef.current || lastSelectionRangeRef.current.collapsed) {
          clearFontHoverPreview();
          return false;
        }
        editorEl.focus();
        selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        try {
          selection.addRange(lastSelectionRangeRef.current);
        } catch {
          return false;
        }
      }

      if (
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        !selectionInsideEditor(editorEl, selection)
      ) {
        clearFontHoverPreview();
        return false;
      }

      const liveRange = selection.getRangeAt(0);
      const selStart = getCaretOffset(editorEl, liveRange.startContainer, liveRange.startOffset);
      const selEnd = getCaretOffset(editorEl, liveRange.endContainer, liveRange.endOffset);
      if (selEnd <= selStart) {
        clearFontHoverPreview();
        return false;
      }

      const existingPreview = fontHoverPreviewRef.current;
      if (!existingPreview.active || existingPreview.fieldId !== activeField.id) {
        fontHoverPreviewRef.current = {
          active: true,
          fieldId: activeField.id,
          fieldName: activeField.name,
          html: editorEl.innerHTML,
          text: editorEl.innerText,
          selStart,
          selEnd,
        };
      } else {
        editorEl.innerHTML = existingPreview.html;
        fontHoverPreviewRef.current = { ...existingPreview, selStart, selEnd };
      }

      const range = createRangeFromOffset(editorEl, selStart, selEnd);
      if (!range) {
        clearFontHoverPreview();
        return false;
      }

      const sel = window.getSelection();
      if (!sel) {
        clearFontHoverPreview();
        return false;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return applyFontFamilyToSelection(editorEl, range, token);
    },
    [activeField, isEditingText, clearFontHoverPreview] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Clear hover preview when font picker closes or editing stops.
  useEffect(() => {
    if (!fontPickerOpen) clearFontHoverPreview();
  }, [fontPickerOpen, clearFontHoverPreview]);

  useEffect(() => {
    if (!isEditingText || !activeFieldId) clearFontHoverPreview();
  }, [isEditingText, activeFieldId, clearFontHoverPreview]);

  // ---- Draft commit ----------------------------------------------------------

  const commitFieldDraft = (fieldName) => {
    const resolvedName = String(fieldName ?? '').trim();
    if (!resolvedName) return;

    const hasDraft = editingDraftRef.current.name === resolvedName;
    const textValue = hasDraft ? editingDraftRef.current.text ?? '' : sampleValues[resolvedName] ?? '';
    const htmlValue = sanitizeHtml(
      normalizeEditorHtml(
        hasDraft
          ? editingDraftRef.current.html ?? plainTextToHtml(textValue)
          : sampleHtmlValues[resolvedName] ?? plainTextToHtml(textValue)
      )
    );

    setSampleValues((prev) => {
      if (prev[resolvedName] === textValue) return prev;
      return { ...prev, [resolvedName]: textValue };
    });
    setSampleHtmlValues((prev) => {
      if (prev[resolvedName] === htmlValue) return prev;
      return { ...prev, [resolvedName]: htmlValue };
    });

    if (hasDraft) {
      editingDraftRef.current = { name: resolvedName, html: htmlValue, text: textValue };
    }
  };

  const commitActiveEditingDraft = () => {
    if (!isEditingText) return;
    const draftName = editingDraftRef.current.name;
    if (draftName) {
      commitFieldDraft(draftName);
      return;
    }
    if (activeField?.name) {
      commitFieldDraft(activeField.name);
    }
  };

  // ---- Inline formatting -----------------------------------------------------

  const applyFormatting = (command, value = null) => {
    const editorEl = getActiveEditorEl();
    if (!editorEl || !activeField?.name || !editorEl.isContentEditable) return false;

    const selectionBefore = window.getSelection();
    const hasLiveSelection =
      !!selectionBefore &&
      !selectionBefore.isCollapsed &&
      selectionInsideEditor(editorEl, selectionBefore);
    const hasSavedSelection = !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);

    if (!hasLiveSelection && !hasSavedSelection) return false;

    if (!hasLiveSelection && hasSavedSelection) {
      editorEl.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        try {
          sel.addRange(lastSelectionRangeRef.current);
        } catch {
          return false;
        }
      }
    }

    const selectionAfterRestore = window.getSelection();
    if (
      !selectionAfterRestore ||
      selectionAfterRestore.isCollapsed ||
      !selectionInsideEditor(editorEl, selectionAfterRestore)
    ) {
      return false;
    }

    const htmlBeforeCommand = editorEl.innerHTML;
    let didApply = false;

    if (command === 'fontName' && typeof value === 'string' && value.trim()) {
      didApply = applyFontFamilyToSelection(editorEl, selectionAfterRestore.getRangeAt(0), value);
    } else {
      try {
        document.execCommand('styleWithCSS', false, true);
      } catch { /* no-op */ }
      didApply = document.execCommand(command, false, value);
      if (!didApply && editorEl.innerHTML !== htmlBeforeCommand) didApply = true;
    }

    if (!didApply) return false;

    const normalizedHtml = normalizeEditorHtml(editorEl.innerHTML);
    if (normalizedHtml !== editorEl.innerHTML) {
      const sel = window.getSelection();
      const rangeToRestore = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
      editorEl.innerHTML = normalizedHtml;
      if (rangeToRestore) {
        try {
          const newSel = window.getSelection();
          if (newSel) { newSel.removeAllRanges(); newSel.addRange(rangeToRestore); }
        } catch { /* best-effort */ }
      }
    }

    editingDraftRef.current = { name: activeField.name, html: normalizedHtml, text: editorEl.innerText };
    const selectionAfterCommand = window.getSelection();
    if (selectionAfterCommand && selectionAfterCommand.rangeCount > 0) {
      lastSelectionRangeRef.current = selectionAfterCommand.getRangeAt(0).cloneRange();
    }

    return true;
  };

  const applyWholeFieldStyle = (fieldPatch) => {
    if (!activeField) return;
    updateField(activeField.id, fieldPatch);

    const isFontChange = 'font' in fieldPatch;

    setSampleHtmlValues((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, activeField.name)) return prev;
      if (isFontChange) {
        const stripped = stripInlineFontFamily(prev[activeField.name]);
        if (stripped === prev[activeField.name]) return prev;
        return { ...prev, [activeField.name]: stripped };
      }
      const next = { ...prev };
      delete next[activeField.name];
      return next;
    });

    if (editingDraftRef.current.name === activeField.name) {
      const nextText = editingDraftRef.current.text ?? '';
      const currentDraftHtml = editingDraftRef.current.html ?? plainTextToHtml(nextText);
      const nextHtml = isFontChange ? stripInlineFontFamily(currentDraftHtml) : plainTextToHtml(nextText);
      editingDraftRef.current = { name: activeField.name, text: nextText, html: nextHtml };
      const editorEl = getActiveEditorEl();
      if (editorEl && editorEl.isContentEditable) editorEl.innerHTML = nextHtml;
    }
  };

  const handleInlineStyleClick = (command, fieldPatchKey) => {
    if (!activeField) return;
    const editorEl = getActiveEditorEl();
    const inEditorContext = !!editorEl && (isEditingText || editorEl.isContentEditable);
    if (inEditorContext) {
      const didApply = applyFormatting(command);
      if (!didApply) applyWholeFieldStyle({ [fieldPatchKey]: !activeField[fieldPatchKey] });
      return;
    }
    applyWholeFieldStyle({ [fieldPatchKey]: !activeField[fieldPatchKey] });
  };

  const applyInlineCommandOrFieldUpdate = ({
    command,
    value = null,
    fieldPatch,
    requireSelection = false,
    selectionMessage = null,
  }) => {
    if (!activeField) return;

    const editorEl = getActiveEditorEl();
    const inEditorContext = !!editorEl && (isEditingText || editorEl.isContentEditable);

    if (inEditorContext) {
      const selection = window.getSelection();
      const hasSelection = !!selection && !selection.isCollapsed && selectionInsideEditor(editorEl, selection);
      const hasSavedSelection = !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);
      const hasExplicitSelection = hasSelection || hasSavedSelection;

      if (hasExplicitSelection || !requireSelection) {
        const didApply = applyFormatting(command, value);
        if (didApply) return;
      }

      if (requireSelection && selectionMessage) {
        setStatus(selectionMessage);
        return;
      }

      applyWholeFieldStyle(fieldPatch);
      return;
    }

    applyWholeFieldStyle(fieldPatch);
  };

  // ---- Active editor font display -------------------------------------------

  const normalizeFontMatch = (fontName) => {
    if (!fontName) return '';
    const cleaned = String(fontName).split(',')[0].replace(/^['"]+|['"]+$/g, '').trim();
    if (!cleaned) return '';
    const directMatch = [...availableFontValues].find((v) => v === cleaned);
    if (directMatch) return directMatch;
    return [...availableFontValues].find((v) => v.toLowerCase() === cleaned.toLowerCase()) || '';
  };

  const updateActiveEditorFont = () => {
    if (!isEditingText || !activeField) { setActiveEditorFont(''); return; }
    const editorEl = getActiveEditorEl();
    if (!editorEl || !editorEl.isContentEditable) { setActiveEditorFont(''); return; }
    const selection = window.getSelection();
    const inEditor = !!selection && selection.rangeCount > 0 && selectionInsideEditor(editorEl, selection);
    if (!inEditor) { setActiveEditorFont(''); return; }
    setActiveEditorFont(normalizeFontMatch(document.queryCommandValue('fontName')) || '');
  };

  useEffect(() => {
    if (!isEditingText || !activeField) { setActiveEditorFont(''); return; }
    const handler = () => updateActiveEditorFont();
    document.addEventListener('selectionchange', handler);
    document.addEventListener('keyup', handler);
    setTimeout(updateActiveEditorFont, 0);
    return () => {
      document.removeEventListener('selectionchange', handler);
      document.removeEventListener('keyup', handler);
    };
  }, [isEditingText, activeFieldId, availableFontValues]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Picker state
    fontPickerOpen, setFontPickerOpen,
    fontHoverFamily, setFontHoverFamily,
    sizePickerOpen, setSizePickerOpen,
    sizeHoverValue, setSizeHoverValue,
    colorPickerOpen, setColorPickerOpen,
    colorHoverValue, setColorHoverValue,
    activeEditorFont, setActiveEditorFont,
    // DOM helpers
    getActiveEditorEl,
    selectionInsideEditor,
    cacheSelectionRangeFromEditor,
    // Formatting
    clearFontHoverPreview,
    previewFontHoverOnSelection,
    applyFormatting,
    applyWholeFieldStyle,
    handleInlineStyleClick,
    applyInlineCommandOrFieldUpdate,
    // Draft management
    commitFieldDraft,
    commitActiveEditingDraft,
  };
}
