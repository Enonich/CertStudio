import { useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { PAGE_PRESETS } from '../constants/editorConstants';
import { getOrderedCanvasItems } from '../lib/canvasItems';

/**
 * Computes all derived canvas state from the Zustand store.
 * Centralises pageSize, scales, ordered/selected items, and selection bounds.
 */
export function useDerivedCanvasState() {
  const {
    preset, customSize,
    template,
    fields, imageItems,
    activeFieldId, activeImageId,
    selectedFieldIds, selectedImageIds,
    setZoom,
  } = useEditorStore();

  const pageSize = useMemo(() => {
    if (preset === 'custom') return { width: Number(customSize.width) || 612, height: Number(customSize.height) || 792 };
    const presetInfo = PAGE_PRESETS[preset] || PAGE_PRESETS.letter;
    return { width: presetInfo.width, height: presetInfo.height };
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

  const scales = useMemo(() => {
    if (!template) return null;
    return { x: template.pageWidthPt / template.displayWidth, y: template.pageHeightPt / template.displayHeight };
  }, [template]);

  const orderedCanvasItems = useMemo(() => getOrderedCanvasItems(fields, imageItems), [fields, imageItems]);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? null;
  const activeImage = imageItems.find((i) => i.id === activeImageId) ?? null;

  const selectedCanvasItems = useMemo(
    () => orderedCanvasItems.filter((item) => selectedFieldIds.includes(item.id) || selectedImageIds.includes(item.id)),
    [orderedCanvasItems, selectedFieldIds, selectedImageIds]
  );
  const selectedCount = selectedCanvasItems.length;

  const selectionBounds = useMemo(() => {
    if (selectedCanvasItems.length === 0) return null;
    const left = Math.min(...selectedCanvasItems.map((item) => item.x));
    const top = Math.min(...selectedCanvasItems.map((item) => item.y));
    const right = Math.max(...selectedCanvasItems.map((item) => item.x + item.w));
    const bottom = Math.max(...selectedCanvasItems.map((item) => item.y + item.h));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }, [selectedCanvasItems]);

  return {
    pageSize,
    fitTemplateToCanvas,
    scales,
    orderedCanvasItems,
    activeField,
    activeImage,
    selectedCanvasItems,
    selectedCount,
    selectionBounds,
  };
}
