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

export default function ZipNameModal({ suggestedName, onConfirm, onCancel }) {
  const [name, setName] = useState(suggestedName ?? 'certificates');
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') trapFocus(modalRef.current, e);
    if (e.key === 'Enter') onConfirm(name);
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="zip-modal-backdrop" onClick={onCancel}>
      <div className="zip-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="zip-modal-title" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="zip-modal-header" id="zip-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>Download certificates</span>
        </div>
        <div className="zip-modal-body">
          <label className="zip-modal-label">ZIP file name</label>
          <div className="zip-modal-input-row">
            <input
              ref={inputRef}
              className="zip-modal-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="certificates"
            />
            <span className="zip-modal-ext">.zip</span>
          </div>
          <p className="zip-modal-hint">
            {typeof window.showSaveFilePicker === 'function'
              ? 'A save dialog will open so you can choose the location.'
              : 'The file will be saved to your default downloads folder.'}
          </p>
        </div>
        <div className="zip-modal-footer">
          <button type="button" className="zip-modal-btn zip-modal-btn--cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="zip-modal-btn zip-modal-btn--confirm" onClick={() => onConfirm(name)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Save ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
