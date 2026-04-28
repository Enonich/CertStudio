import { useEditorStore } from '../store/useEditorStore';

/**
 * Manages the field-value modal: open, close, and confirm actions.
 *
 * @param {{ updateField: Function }} deps
 */
export function useFieldValueModal({ updateField }) {
  const {
    fields,
    sampleValues, setSampleValues,
    sampleHtmlValues, setSampleHtmlValues,
    fieldValueModal, setFieldValueModal,
  } = useEditorStore();

  const handleFieldDoubleClick = (field) => {
    const resolvedName = typeof field.name === 'string' ? field.name.trim() : '';
    setFieldValueModal({
      open: true,
      fieldId: field.id,
      requireName: !resolvedName,
      initialName: resolvedName,
      initialValue: resolvedName ? (sampleValues[resolvedName] ?? '') : '',
    });
  };

  const closeFieldValueModal = () => {
    setFieldValueModal({
      open: false,
      fieldId: null,
      requireName: false,
      initialName: '',
      initialValue: '',
    });
  };

  const confirmFieldValueModal = ({ name, value }) => {
    const targetField = fields.find((item) => item.id === fieldValueModal.fieldId);
    if (!targetField) {
      closeFieldValueModal();
      return;
    }

    const previousName = typeof targetField.name === 'string' ? targetField.name : '';
    const nextName = String(name || '').trim();
    if (!nextName) return;

    if (previousName !== nextName) {
      updateField(targetField.id, { name: nextName });
    }

    setSampleValues((prev) => {
      const next = { ...prev };
      if (previousName && previousName !== nextName) {
        delete next[previousName];
      }
      next[nextName] = value;
      return next;
    });

    setSampleHtmlValues((prev) => {
      const next = { ...prev };
      if (previousName && previousName !== nextName) {
        delete next[previousName];
      }
      if (Object.prototype.hasOwnProperty.call(next, nextName)) {
        delete next[nextName];
      }
      return next;
    });

    closeFieldValueModal();
  };

  return { handleFieldDoubleClick, closeFieldValueModal, confirmFieldValueModal };
}
