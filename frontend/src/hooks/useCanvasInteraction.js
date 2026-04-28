import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { clampBox, uniqueFieldName } from '../lib/geometryUtils';
import { uid } from '../lib/historyUtils';
import { getOrderedCanvasItems, getNextLayerZ } from '../lib/canvasItems';
import { MAX_HISTORY_STEPS } from '../constants/editorConstants';

/**
 * Manages all canvas pointer interactions: drawing new fields, moving items,
 * resizing items, alignment snapping, and the global mouse event listeners.
 *
 * Owns local state: isDrawing, draftBox, interaction, alignmentGuides.
 *
 * @param {{
 *   layerRef: React.RefObject,
 *   commitActiveEditingDraft: Function,
 *   updateField: Function,
 *   updateImage: Function,
 *   clearSelection: Function,
 *   buildHistorySnapshot: Function,
 *   undoStackRef: React.MutableRefObject,
 *   redoStackRef: React.MutableRefObject,
 *   isApplyingHistoryRef: React.MutableRefObject,
 *   preDragSnapshotRef: React.MutableRefObject,
 * }} deps
 */
export function useCanvasInteraction({
  layerRef,
  commitActiveEditingDraft,
  updateField,
  updateImage,
  clearSelection,
  buildHistorySnapshot,
  undoStackRef,
  redoStackRef,
  isApplyingHistoryRef,
  preDragSnapshotRef,
}) {
  const {
    template, fields, imageItems, zoom, toolMode,
    selectedFieldIds, setSelectedFieldIds,
    selectedImageIds, setSelectedImageIds,
    setActiveFieldId, setActiveImageId,
    setFields, setImageItems,
    setIsEditingText,
  } = useEditorStore();

  const [isDrawing, setIsDrawing] = useState(false);
  const [draftBox, setDraftBox] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);

  const moveDrawRef = useRef(null);
  const endDrawRef = useRef(null);

  // -- Coordinate conversion --------------------------------------------------

  const getPointFromEvent = (event) => {
    const rect = layerRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };

  // -- Begin interactions -----------------------------------------------------

  const beginDraw = (event) => {
    if (!template || interaction || event.button !== 0) return;

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
    if (!target) return;

    const targetAlreadySelected = targetType === 'image'
      ? selectedImageIds.includes(targetId)
      : selectedFieldIds.includes(targetId);
    const selectedCount = selectedFieldIds.length + selectedImageIds.length;
    const shouldMoveWholeSelection = targetAlreadySelected && selectedCount > 1;
    const moveFieldIds = shouldMoveWholeSelection
      ? selectedFieldIds
      : targetType === 'field' ? [targetId] : [];
    const moveImageIds = shouldMoveWholeSelection
      ? selectedImageIds
      : targetType === 'image' ? [targetId] : [];

    commitActiveEditingDraft();
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
    if (!target) return;
    commitActiveEditingDraft();
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

  // -- Move / draw (called on every mousemove) --------------------------------

  const moveDraw = (event) => {
    if (!template) return;

    if (interaction) {
      const point = getPointFromEvent(event);
      let dx = point.x - interaction.startX;
      let dy = point.y - interaction.startY;

      if (interaction.mode === 'move') {
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

        if (interaction.targets?.length > 1) {
          const fieldTargets = new Map(
            interaction.targets.filter((item) => item.kind === 'field').map((item) => [item.id, item.initial])
          );
          const imageTargets = new Map(
            interaction.targets.filter((item) => item.kind === 'image').map((item) => [item.id, item.initial])
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
          updateImage(interaction.targetId, { x: newX, y: newY });
          setAlignmentGuides([]);
          return;
        }

        // Alignment guide snapping
        const guides = [];
        const threshold = 6;
        const movingField = fields.find((f) => f.id === interaction.targetId);

        if (movingField) {
          let snapX = null;
          let snapY = null;
          const movingCenterX = newX + movingField.w / 2;
          const movingCenterY = newY + movingField.h / 2;
          const movingLeft = newX;
          const movingRight = newX + movingField.w;
          const movingTop = newY;
          const movingBottom = newY + movingField.h;

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

            // Vertical alignment
            if (snapX === null) {
              if (Math.abs(movingLeft - left) < threshold) { snapX = left; guides.push({ type: 'vertical', x: left }); }
              else if (Math.abs(movingRight - right) < threshold) { snapX = right - movingField.w; guides.push({ type: 'vertical', x: right }); }
              else if (Math.abs(movingCenterX - centerX) < threshold) { snapX = centerX - movingField.w / 2; guides.push({ type: 'vertical', x: centerX }); }
              else if (Math.abs(movingRight - left) < threshold) { snapX = left - movingField.w; guides.push({ type: 'vertical', x: left }); }
              else if (Math.abs(movingLeft - right) < threshold) { snapX = right; guides.push({ type: 'vertical', x: right }); }
            } else {
              if (Math.abs(snapX - left) < 1) guides.push({ type: 'vertical', x: left });
              else if (Math.abs(snapX + movingField.w - right) < 1) guides.push({ type: 'vertical', x: right });
              else if (Math.abs(snapX + movingField.w / 2 - centerX) < 1) guides.push({ type: 'vertical', x: centerX });
            }

            // Horizontal alignment
            if (snapY === null) {
              if (Math.abs(movingTop - top) < threshold) { snapY = top; guides.push({ type: 'horizontal', y: top }); }
              else if (Math.abs(movingBottom - bottom) < threshold) { snapY = bottom - movingField.h; guides.push({ type: 'horizontal', y: bottom }); }
              else if (Math.abs(movingCenterY - centerY) < threshold) { snapY = centerY - movingField.h / 2; guides.push({ type: 'horizontal', y: centerY }); }
              else if (Math.abs(movingBottom - top) < threshold) { snapY = top - movingField.h; guides.push({ type: 'horizontal', y: top }); }
              else if (Math.abs(movingTop - bottom) < threshold) { snapY = bottom; guides.push({ type: 'horizontal', y: bottom }); }
            } else {
              if (Math.abs(snapY - top) < 1) guides.push({ type: 'horizontal', y: top });
              else if (Math.abs(snapY + movingField.h - bottom) < 1) guides.push({ type: 'horizontal', y: bottom });
              else if (Math.abs(snapY + movingField.h / 2 - centerY) < 1) guides.push({ type: 'horizontal', y: centerY });
            }
          });

          if (snapX !== null && !event.altKey) newX = snapX;
          if (snapY !== null && !event.altKey) newY = snapY;
        }

        updateField(interaction.targetId, { x: newX, y: newY });
        setAlignmentGuides(guides);
      } else if (interaction.mode === 'resize') {
        const dir = interaction.direction;
        const newBox = { ...interaction.initial };

        if (dir.includes('e')) newBox.w = interaction.initial.w + dx;
        else if (dir.includes('w')) { newBox.x = interaction.initial.x + dx; newBox.w = interaction.initial.w - dx; }

        if (dir.includes('s')) newBox.h = interaction.initial.h + dy;
        else if (dir.includes('n')) { newBox.y = interaction.initial.y + dy; newBox.h = interaction.initial.h - dy; }

        if (newBox.w < 0) { newBox.x += newBox.w; newBox.w = Math.abs(newBox.w); }
        if (newBox.h < 0) { newBox.y += newBox.h; newBox.h = Math.abs(newBox.h); }

        if (interaction.targetType === 'image') {
          updateImage(interaction.targetId, newBox);
        } else {
          updateField(interaction.targetId, newBox);
        }
      }
      return;
    }

    if (!isDrawing || !draftBox) return;
    const point = getPointFromEvent(event);
    const x = Math.min(draftBox.startX, point.x);
    const y = Math.min(draftBox.startY, point.y);
    const w = Math.abs(point.x - draftBox.startX);
    const h = Math.abs(point.y - draftBox.startY);
    setDraftBox({ ...draftBox, x, y, w, h });
  };

  // -- End interaction --------------------------------------------------------

  const endDraw = () => {
    if (interaction) {
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
      setTimeout(() => { isApplyingHistoryRef.current = false; }, 0);
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
          return right >= selectionRect.left && field.x <= selectionRect.right &&
            bottom >= selectionRect.top && field.y <= selectionRect.bottom;
        })
        .map((field) => field.id);
      const nextSelectedImageIds = imageItems
        .filter((image) => {
          const right = image.x + image.w;
          const bottom = image.y + image.h;
          return right >= selectionRect.left && image.x <= selectionRect.right &&
            bottom >= selectionRect.top && image.y <= selectionRect.bottom;
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
      align: 'center',
      font: 'Helvetica',
      size: 36,
      color: [0, 0, 0],
      maxWidth: false,
      wrapText: false,
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

  // Keep refs pointing at latest handlers to avoid effect churn.
  moveDrawRef.current = moveDraw;
  endDrawRef.current = endDraw;

  // -- Global mouse listeners (active during drag/draw) -----------------------

  useEffect(() => {
    if (!interaction && !isDrawing) return;

    const handleGlobalMove = (event) => {
      if (!layerRef.current) return;
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

  return {
    isDrawing,
    draftBox,
    interaction,
    alignmentGuides,
    beginDraw,
    beginMove,
    beginResize,
    moveDraw,
    endDraw,
  };
}
