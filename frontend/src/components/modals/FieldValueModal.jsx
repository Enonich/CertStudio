import { useEffect, useRef, useState } from 'react';

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(el, event) {
  const nodes = Array.from(el.querySelectorAll(FOCUSABLE));
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) { event.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}

export default function FieldValueModal({ initialName, initialValue, requireName, onConfirm, onCancel }) {
  const [name, setName] = useState(initialName || '');
  const [value, setValue] = useState(initialValue || '');
  const [error, setError] = useState('');
  const firstInputRef = useRef(null);
  const valueInputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Field name is required.');
      return;
    }
    onConfirm({ name: trimmedName, value });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Tab') trapFocus(modalRef.current, event);
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') onCancel();
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Tab') trapFocus(modalRef.current, event);
    if (event.key === 'Enter') { event.preventDefault(); valueInputRef.current?.focus(); }
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="zip-modal-backdrop" onClick={onCancel}>
      <div className="zip-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="field-value-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="zip-modal-header" id="field-value-modal-title">
          {requireName ? 'Name this field' : 'Edit field value'}
        </div>
        <div className="zip-modal-body">
          <label className="zip-modal-label">Field name</label>
          <div className="zip-modal-input-row">
            <input
              ref={firstInputRef}
              className="zip-modal-input"
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
          <label className="zip-modal-label">Sample value</label>
          <div className="zip-modal-input-row">
            <input
              ref={valueInputRef}
              className="zip-modal-input"
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a sample value"
            />
          </div>
          {error ? <p className="zip-modal-error">{error}</p> : null}
        </div>
        <div className="zip-modal-footer">
          <button type="button" className="zip-modal-btn zip-modal-btn--cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="zip-modal-btn zip-modal-btn--confirm" onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}
