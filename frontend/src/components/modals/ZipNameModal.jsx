import { useEffect, useRef, useState } from 'react';
import ModalFrame from './ModalFrame';

export default function ZipNameModal({ suggestedName, onConfirm, onCancel }) {
  const [name, setName] = useState(suggestedName ?? 'certificates');
  const inputRef = useRef(null);
  const saveButtonRef = useRef(null);

  useEffect(() => {
    setName(suggestedName ?? 'certificates');
  }, [suggestedName]);

  const confirmDownload = () => onConfirm(name.trim() || 'certificates');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmDownload();
    }
  };

  const footer = (
    <>
      <button type="button" className="editor-modal-btn editor-modal-btn--ghost" onClick={onCancel}>Cancel</button>
      <button ref={saveButtonRef} type="button" className="editor-modal-btn editor-modal-btn--accent" onClick={confirmDownload}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Save ZIP
      </button>
    </>
  );

  return (
    <ModalFrame
      eyebrow="Download"
      title="Download certificates"
      subtitle="Choose a ZIP file name before saving the generated batch."
      onClose={onCancel}
      initialFocusRef={inputRef}
      footer={footer}
      headerIcon={(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      )}
    >
      <label className="editor-modal-stack">
        <span className="editor-modal-label">ZIP file name</span>
        <div className="editor-modal-input-row">
          <input
            ref={inputRef}
            className="editor-modal-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="certificates"
          />
          <span className="editor-modal-suffix">.zip</span>
        </div>
      </label>

      <p className="editor-modal-note">
        {typeof window.showSaveFilePicker === 'function'
          ? 'A save dialog will open so you can choose where the ZIP is stored.'
          : 'The ZIP will be downloaded to your default downloads folder.'}
      </p>
    </ModalFrame>
  );
}
