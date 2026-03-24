import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ConfirmActionModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Tab') {
        const nodes = Array.from(modalRef.current?.querySelectorAll(FOCUSABLE) ?? []);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) { event.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="zip-modal-backdrop" onClick={onCancel}>
      <div className="zip-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" onClick={(e) => e.stopPropagation()}>
        <div className="zip-modal-header" id="confirm-action-title">{title}</div>
        <div className="zip-modal-body">
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="zip-modal-footer">
          <button type="button" className="zip-modal-btn zip-modal-btn--cancel" onClick={onCancel}>Cancel</button>
          <button ref={confirmBtnRef} type="button" className="zip-modal-btn zip-modal-btn--confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
