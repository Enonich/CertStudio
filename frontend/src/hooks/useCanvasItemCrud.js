import { useEditorStore } from '../store/useEditorStore';
import { clampBox, uniqueFieldName } from '../lib/geometryUtils';

/**
 * CRUD operations for canvas fields and images.
 * Reads all needed state from the Zustand store.
 */
export function useCanvasItemCrud() {
  const {
    template, fields,
    activeFieldId, activeImageId,
    fieldMappings,
    setFields, setImageItems,
    setSelectedFieldIds, setSelectedImageIds,
    setActiveFieldId, setActiveImageId,
    setFieldMappings,
    setSampleValues, setSampleHtmlValues,
  } = useEditorStore();

  const updateField = (id, patch) => {
    if (!template) return;
    if (patch.name !== undefined) {
      const oldField = fields.find((f) => f.id === id);
      if (oldField) patch = { ...patch, name: uniqueFieldName(patch.name, fields, id) };
      if (oldField && oldField.name !== patch.name && fieldMappings[oldField.name]) {
        setFieldMappings((prev) => { const next = { ...prev }; next[patch.name] = next[oldField.name]; delete next[oldField.name]; return next; });
      }
      if (oldField && oldField.name !== patch.name) {
        setSampleValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) return prev;
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) next[patch.name] = next[oldField.name];
          delete next[oldField.name];
          return next;
        });
        setSampleHtmlValues((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, oldField.name)) return prev;
          const next = { ...prev };
          if (!Object.prototype.hasOwnProperty.call(next, patch.name)) next[patch.name] = next[oldField.name];
          delete next[oldField.name];
          return next;
        });
      }
    }
    setFields((prev) => prev.map((f) => f.id !== id ? f : clampBox({ ...f, ...patch }, template.displayWidth, template.displayHeight)));
  };

  const updateImage = (id, patch) => {
    if (!template) return;
    setImageItems((prev) => prev.map((img) => img.id !== id ? img : clampBox({ ...img, ...patch }, template.displayWidth, template.displayHeight)));
  };

  const deleteField = (id) => {
    const fieldToDelete = fields.find((f) => f.id === id);
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldIds((prev) => prev.filter((fieldId) => fieldId !== id));
    if (activeFieldId === id) setActiveFieldId(null);
    if (fieldToDelete && fieldMappings[fieldToDelete.name]) {
      setFieldMappings((prev) => { const next = { ...prev }; delete next[fieldToDelete.name]; return next; });
    }
  };

  const deleteImage = (id) => {
    setImageItems((prev) => prev.filter((img) => img.id !== id));
    setSelectedImageIds((prev) => prev.filter((imageId) => imageId !== id));
    if (activeImageId === id) setActiveImageId(null);
  };

  return { updateField, updateImage, deleteField, deleteImage };
}
