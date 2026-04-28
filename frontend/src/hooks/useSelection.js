import { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';

/**
 * Manages canvas item selection: single, multi, toggle, clear, and sync effects.
 * Reads selection state from the Zustand store.
 *
 * @param {{ commitActiveEditingDraft: () => void }} deps
 */
export function useSelection({ commitActiveEditingDraft }) {
  const {
    fields, imageItems,
    activeFieldId, activeImageId,
    selectedFieldIds, selectedImageIds,
    setSelectedFieldIds, setSelectedImageIds,
    setActiveFieldId, setActiveImageId,
    setIsEditingText,
  } = useEditorStore();

  const clearSelection = () => {
    setSelectedFieldIds([]);
    setSelectedImageIds([]);
    setActiveFieldId(null);
    setActiveImageId(null);
  };

  const applySelection = ({
    fieldIds = [],
    imageIds = [],
    activeFieldId: nextActiveFieldId = null,
    activeImageId: nextActiveImageId = null,
    preserveEditing = false,
  }) => {
    if (!preserveEditing) {
      commitActiveEditingDraft();
      setIsEditingText(false);
    }
    setSelectedFieldIds(fieldIds);
    setSelectedImageIds(imageIds);
    setActiveFieldId(nextActiveFieldId);
    setActiveImageId(nextActiveImageId);
  };

  const selectSingleField = (id, options = {}) => {
    applySelection({ fieldIds: id ? [id] : [], activeFieldId: id, activeImageId: null, ...options });
  };

  const selectSingleImage = (id, options = {}) => {
    applySelection({ imageIds: id ? [id] : [], activeFieldId: null, activeImageId: id, ...options });
  };

  const toggleItemSelection = (id, kind) => {
    commitActiveEditingDraft();
    setIsEditingText(false);
    if (kind === 'field') {
      setSelectedFieldIds((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((itemId) => itemId !== id) : [...prev, id];
        setActiveFieldId(exists ? next[next.length - 1] ?? null : id);
        if (!exists || next.length > 0) {
          setActiveImageId(null);
        }
        return next;
      });
      return;
    }
    setSelectedImageIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      setActiveImageId(exists ? next[next.length - 1] ?? null : id);
      if (!exists || next.length > 0) {
        setActiveFieldId(null);
      }
      return next;
    });
  };

  // -- Selection sync effects -------------------------------------------------

  // Prune stale field IDs when fields change
  useEffect(() => {
    setSelectedFieldIds((prev) => prev.filter((id) => fields.some((field) => field.id === id)));
  }, [fields]);

  // Prune stale image IDs when images change
  useEffect(() => {
    setSelectedImageIds((prev) => prev.filter((id) => imageItems.some((image) => image.id === id)));
  }, [imageItems]);

  // Ensure active item is included in selection
  useEffect(() => {
    const selectedCount = selectedFieldIds.length + selectedImageIds.length;
    if (activeFieldId && selectedCount <= 1 && !selectedFieldIds.includes(activeFieldId)) {
      setSelectedFieldIds([activeFieldId]);
      setSelectedImageIds([]);
      return;
    }
    if (activeImageId && selectedCount <= 1 && !selectedImageIds.includes(activeImageId)) {
      setSelectedImageIds([activeImageId]);
      setSelectedFieldIds([]);
    }
  }, [activeFieldId, activeImageId, selectedFieldIds, selectedImageIds]);

  return { clearSelection, applySelection, selectSingleField, selectSingleImage, toggleItemSelection };
}
