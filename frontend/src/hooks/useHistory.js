import { useRef, useEffect, useState } from 'react';
import { cloneHistoryValue } from '../lib/historyUtils';
import { MAX_HISTORY_STEPS } from '../constants/editorConstants';

/**
 * Manages the undo/redo history stack for the certificate editor.
 *
 * The hook watches the provided state slices and automatically pushes an entry
 * onto the undo stack whenever they change (excluding changes that are
 * themselves caused by undo/redo playback).
 *
 * @returns {{
 *   undoStackRef: React.MutableRefObject,
 *   redoStackRef: React.MutableRefObject,
 *   isApplyingHistoryRef: React.MutableRefObject,
 *   preDragSnapshotRef: React.MutableRefObject,
 *   buildHistorySnapshot: () => object,
 *   applyHistorySnapshot: (snapshot: object) => void,
 *   performUndo: () => boolean,
 *   performRedo: () => boolean,
 * }}
 */
export function useHistory({
  fields,
  imageItems,
  sampleValues,
  sampleHtmlValues,
  fieldMappings,
  useCsv,
  generateOptions,
  setFields,
  setImageItems,
  setSampleValues,
  setSampleHtmlValues,
  setFieldMappings,
  setUseCsv,
  setGenerateOptions,
}) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const historyCurrentRef = useRef(null);
  const historySignatureRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const preDragSnapshotRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const buildHistorySnapshot = () => ({
    fields: cloneHistoryValue(fields),
    imageItems: cloneHistoryValue(imageItems),
    sampleValues: cloneHistoryValue(sampleValues),
    sampleHtmlValues: cloneHistoryValue(sampleHtmlValues),
    fieldMappings: cloneHistoryValue(fieldMappings),
    useCsv,
    generateOptions: cloneHistoryValue(generateOptions),
  });

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
    // Selection state (activeFieldId, activeImageId, isEditingText) is intentionally
    // NOT restored — undo/redo only affects document content, not UI selection.

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  };

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
  }, [
    fields,
    imageItems,
    sampleValues,
    sampleHtmlValues,
    fieldMappings,
    useCsv,
    generateOptions,
    // activeFieldId, activeImageId, isEditingText are excluded: selection changes
    // are not undoable document operations.
  ]);

  return {
    undoStackRef,
    redoStackRef,
    isApplyingHistoryRef,
    preDragSnapshotRef,
    buildHistorySnapshot,
    applyHistorySnapshot,
    performUndo,
    performRedo,
    canUndo,
    canRedo,
  };
}
