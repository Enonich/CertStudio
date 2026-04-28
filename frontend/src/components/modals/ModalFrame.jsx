import { useId } from 'react';
import { useModalA11y } from './modalUtils';

export default function ModalFrame({
  eyebrow,
  title,
  subtitle,
  headerIcon,
  onClose,
  initialFocusRef,
  footer,
  size = 'sm',
  tone = 'default',
  className = '',
  children,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useModalA11y({ onClose, initialFocusRef });

  return (
    <div className="editor-modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={`editor-modal editor-modal--${size} editor-modal--${tone} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="editor-modal-header">
          <div className="editor-modal-header-copy">
            {eyebrow ? <div className="editor-modal-eyebrow">{eyebrow}</div> : null}
            <div className="editor-modal-title-row">
              {headerIcon ? <div className="editor-modal-title-icon">{headerIcon}</div> : null}
              <div className="editor-modal-title-copy">
                <div className="editor-modal-title" id={titleId}>{title}</div>
                {subtitle ? <p className="editor-modal-subtitle" id={descriptionId}>{subtitle}</p> : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="editor-modal-close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="editor-modal-body">
          {children}
        </div>

        {footer ? <div className="editor-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}