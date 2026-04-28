import { useRef } from 'react';
import ModalFrame from './ModalFrame';

export default function ConfirmActionModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmTone = 'danger',
  eyebrow = 'Template',
  tone = 'warning',
  callout,
  headerIcon: customHeaderIcon,
}) {
  const confirmBtnRef = useRef(null);

  const footer = (
    <>
      <button type="button" className="editor-modal-btn editor-modal-btn--ghost" onClick={onCancel}>Cancel</button>
      <button ref={confirmBtnRef} type="button" className={`editor-modal-btn editor-modal-btn--${confirmTone}`} onClick={onConfirm}>{confirmLabel}</button>
    </>
  );

  const defaultCallout = (
    <div className="editor-modal-callout editor-modal-callout--warning">
      <div className="editor-modal-callout-title">Current fields and images will be removed.</div>
      <p className="editor-modal-callout-copy">Save the project first if you may want to return to this layout later.</p>
    </div>
  );

  const defaultHeaderIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );

  return (
    <ModalFrame
      eyebrow={eyebrow}
      title={title}
      subtitle={message}
      onClose={onCancel}
      initialFocusRef={confirmBtnRef}
      tone={tone}
      footer={footer}
      headerIcon={customHeaderIcon ?? defaultHeaderIcon}
    >
      {callout !== null ? (callout ?? defaultCallout) : null}
    </ModalFrame>
  );
}
