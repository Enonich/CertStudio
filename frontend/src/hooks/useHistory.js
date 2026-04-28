import { useRef, useEffect, useState, useCallback } from 'react';
import { cloneHistoryValue } from '../lib/historyUtils';
import { MAX_HISTORY_STEPS } from '../constants/editorConstants';
import { useEditorStore } from '../store/useEditorStore';

/**
 * Manages the undo/redo history stack for the certificate editor.
 *
 * Reads all tracked state slices directly from the Zustand store,
 * eliminating the need to pass state and setters as parameters.
 */
export function useHistory() {
  const {
    fields, imageItems, sampleValues, sampleHtmlValues,
    fieldMappings, useCsv, generateOptions,
    activeFieldId, activeImageId,
    setFields, setImageItems, setSampleValues, setSampleHtmlValues,
    setFieldMappings, setUseCsv, setGenerateOptions,
    setActiveFieldId, setActiveImageId,
  } = useEditorStore();
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const historyCurrentRef = useRef(null);
  const historySignatureRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const preDragSnapshotRef = useRef(null);
  const savedSignatureRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const buildHistorySnapshot = () => ({
    fields: cloneHistoryValue(fields),
    imageItems: cloneHistoryValue(imageItems),
    sampleValues: cloneHistoryValue(sampleValues),
    sampleHtmlValues: cloneHistoryValue(sampleHtmlValues),
    fieldMappings: cloneHistoryValue(fieldMappings),
    useCsv,
    generateOptions: cloneHistoryValue(generateOptions),
    activeFieldId,
    activeImageId,
  });

  /** Mark the current state as the "saved" baseline for dirty tracking. */
  const markClean = useCallback(() => {
    savedSignatureRef.current = historySignatureRef.current;
    setIsDirty(false);
  }, []);

  const applyHistorySnapshot = (snapshot) => {
    const safeSnapshot = cloneHistoryValue(snapshot);
    isApplyingHistoryRef.current = true;
    historyCurrentRef.current = safeSnapshot;
    historySignatureRef.current = JSON.stringify(safeSnapshot);

    setFields(safeSnapshot.fields ?? []);
    setImageItems(safeSnapshot.imageItems ?? []);
    setSampleValues(safeSnapshot.sampleValues ?? {});
    setSampleHtmlValues(safeSnapshot.sampleHtmlValues ?? {});
    setFieldMappings(safeSnapshot.fieldMappings ?? {});
    setUseCsv(Boolean(safeSnapshot.useCsv));
    setGenerateOptions((prev) => ({ ...prev, ...(safeSnapshot.generateOptions ?? {}) }));

    // Restore selection so undo/redo feels natural (like Figma/Photoshop).
    if (safeSnapshot.activeFieldId !== undefined) setActiveFieldId(safeSnapshot.activeFieldId);
    if (safeSnapshot.activeImageId !== undefined) setActiveImageId(safeSnapshot.activeImageId);

    setIsDirty(historySignatureRef.current !== savedSignatureRef.current);

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  };

  /**
   * Explicitly push the current document state onto the undo stack.
   * Call this BEFORE a destructive operation (e.g. template replacement,
   * bulk deletion) so the user can undo back to the pre-destruction state.
   */
  const pushSnapshot = useCallback(() => {
    const snapshot = buildHistorySnapshot();
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_HISTORY_STEPS) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    historyCurrentRef.current = snapshot;
    historySignatureRef.current = JSON.stringify(snapshot);
  }, [fields, imageItems, sampleValues, sampleHtmlValues, fieldMappings, useCsv, generateOptions, activeFieldId, activeImageId]);

  const performUndo = () => {
    if (undoStackRef.current.length === 0) {
      return false;
    }

    const previousSnapshot = undoStackRef.current.pop();
    const currentSnapshot = buildHistorySnapshot();
    redoStackRef.current.push(currentSnapshot);
    if (redoStackRef.current.length > MAX_HISTORY_STEPS) {
      redoStackRef.current.shift();
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);

    applyHistorySnapshot(previousSnapshot);
    return true;
  };

  const performRedo = () => {
    if (redoStackRef.current.length === 0) {
      return false;
    }

    const nextSnapshot = redoStackRef.current.pop();
    const currentSnapshot = buildHistorySnapshot();
    undoStackRef.current.push(currentSnapshot);
    if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
      undoStackRef.current.shift();
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);

    applyHistorySnapshot(nextSnapshot);
    return true;
  };

  useEffect(() => {
    const snapshot = buildHistorySnapshot();
    const signature = JSON.stringify(snapshot);

    if (historySignatureRef.current === null) {
      historyCurrentRef.current = snapshot;
      historySignatureRef.current = signature;
      return;
    }

    if (signature === historySignatureRef.current) {
      return;
    }

    if (isApplyingHistoryRef.current) {
      historyCurrentRef.current = snapshot;
      historySignatureRef.current = signature;
      return;
    }

    if (historyCurrentRef.current) {
      undoStackRef.current.push(historyCurrentRef.current);
      if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
        undoStackRef.current.shift();
      }
      setCanUndo(undoStackRef.current.length > 0);
    }
    redoStackRef.current = [];
    setCanRedo(false);
    historyCurrentRef.current = snapshot;
    historySignatureRef.current = signature;
    setIsDirty(signature !== savedSignatureRef.current);
  }, [
    fields,
    imageItems,
    sampleValues,
    sampleHtmlValues,
    fieldMappings,
    useCsv,
    generateOptions,
    activeFieldId,
    activeImageId,
  ]);

  return {
    undoStackRef,
    redoStackRef,
    isApplyingHistoryRef,
    preDragSnapshotRef,
    buildHistorySnapshot,
    applyHistorySnapshot,
    pushSnapshot,
    performUndo,
    performRedo,
    canUndo,
    canRedo,
    isDirty,
    markClean,
  };
}
