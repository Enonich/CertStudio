import { useEditorStore } from '../store/useEditorStore';
import { clampBox, uniqueFieldName } from '../lib/geometryUtils';
import { uid } from '../lib/historyUtils';
import { getNextLayerZ } from '../lib/canvasItems';

/**
 * Clipboard and bulk-selection operations: delete, nudge, duplicate, paste.
 *
 * @param {{
 *   pushSnapshot: Function,
 *   clearSelection: Function,
 *   applySelection: Function,
 *   clipboardRef: React.MutableRefObject,
 * }} deps
 */
export function useClipboard({ pushSnapshot, clearSelection, applySelection, clipboardRef }) {
  const {
    template, fields, imageItems,
    selectedFieldIds, selectedImageIds,
    fieldMappings,
    setFields, setImageItems, setFieldMappings,
  } = useEditorStore();

  const selectedCount = selectedFieldIds.length + selectedImageIds.length;

  const getSelectedCanvasItems = () => [
    ...fields.filter((f) => selectedFieldIds.includes(f.id)).map((f) => ({ kind: 'field', ...f })),
    ...imageItems.filter((i) => selectedImageIds.includes(i.id)).map((i) => ({ kind: 'image', ...i })),
  ];

  const deleteSelection = () => {
    if (selectedCount === 0) return;
    pushSnapshot();
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
    const selectedCanvasItems = getSelectedCanvasItems();
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

    if (nextFields.length > 0) setFields((prev) => [...prev, ...nextFields]);
    if (nextImages.length > 0) setImageItems((prev) => [...prev, ...nextImages]);
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

  return { deleteSelection, nudgeSelection, duplicateSelection, pasteClipboardSelection };
}
