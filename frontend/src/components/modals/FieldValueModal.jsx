import { useEffect, useRef, useState } from 'react';
import ModalFrame from './ModalFrame';
import { sanitizeFieldName } from '../../lib/geometryUtils';

export default function FieldValueModal({ initialName, initialValue, requireName, onConfirm, onCancel }) {
  const [name, setName] = useState(initialName || '');
  const [value, setValue] = useState(initialValue || '');
  const [error, setError] = useState('');
  const firstInputRef = useRef(null);
  const valueInputRef = useRef(null);
  const saveButtonRef = useRef(null);

  useEffect(() => {
    setName(initialName || '');
    setValue(initialValue || '');
    setError('');
  }, [initialName, initialValue]);

  const submit = () => {
    const sanitized = sanitizeFieldName(name);
    if (!sanitized) {
      setError('Field name is required.');
      return;
    }
    if (sanitized !== name.trim()) {
      // Auto-correct and show what was cleaned
      setName(sanitized);
      setError(`Name cleaned to "${sanitized}". Click Save again to confirm.`);
      return;
    }
    onConfirm({ name: sanitized, value });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      valueInputRef.current?.focus();
    }
  };

  const footer = (
    <>
      <button type="button" className="editor-modal-btn editor-modal-btn--ghost" onClick={onCancel}>Cancel</button>
      <button ref={saveButtonRef} type="button" className="editor-modal-btn editor-modal-btn--accent" onClick={submit}>Save field</button>
    </>
  );

  return (
    <ModalFrame
      eyebrow={requireName ? 'New Field' : 'Field'}
      title={requireName ? 'Name this text field' : 'Edit field sample'}
      subtitle={requireName
        ? 'Give this field a clear label so it is easy to find and map later.'
        : 'Update the field label and the sample content shown on the canvas.'}
      onClose={onCancel}
      initialFocusRef={firstInputRef}
      footer={footer}
      headerIcon={(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )}
    >
      <label className="editor-modal-stack">
        <span className="editor-modal-label">Field name</span>
        <div className="editor-modal-input-row">
          <input
            ref={firstInputRef}
            className="editor-modal-input"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError('');
            }}
            onKeyDown={handleNameKeyDown}
            placeholder="Recipient Name"
          />
        </div>
      </label>

      <label className="editor-modal-stack">
        <span className="editor-modal-label">Sample value</span>
        <div className="editor-modal-input-row">
          <input
            ref={valueInputRef}
            className="editor-modal-input"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a sample value"
          />
        </div>
      </label>

      {error ? <p className="editor-modal-error">{error}</p> : null}
    </ModalFrame>
  );
}
