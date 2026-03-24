import { useEffect, useRef, useState } from 'react';

function CertPreviewModal({
  isOpen,
  certificates,
  onClose,
  onPrint,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCerts, setSelectedCerts] = useState(new Set());
  const [deletedCerts, setDeletedCerts] = useState(new Set());
  const modalRef = useRef(null);

  useEffect(() => {
    if (certificates && certificates.length > 0) {
      const allIndices = new Set(certificates.map((_, i) => i));
      setSelectedCerts(allIndices);
    } else {
      setSelectedCerts(new Set());
    }
  }, [certificates]);

  useEffect(() => {
    if (!certificates || certificates.length === 0) {
      if (currentIndex !== 0) {
        setCurrentIndex(0);
      }
      return;
    }
    if (currentIndex >= certificates.length) {
      setCurrentIndex(certificates.length - 1);
    }
  }, [certificates, currentIndex]);

  useEffect(() => {
    if (!isOpen || !certificates || certificates.length === 0) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentIndex((prev) => (prev === 0 ? certificates.length - 1 : prev - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentIndex((prev) => (prev === certificates.length - 1 ? 0 : prev + 1));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, certificates, onClose]);

  // Focus the modal when it opens so keyboard navigation starts inside the dialog
  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen || !certificates || certificates.length === 0) {
    return null;
  }

  const currentCert = certificates[currentIndex] ?? null;
  const currentPdfUrl = currentCert?.url ?? '';
  const currentPdfSrc = currentPdfUrl
    ? `${currentPdfUrl}#page=1&view=FitH&zoom=page-fit&pagemode=none`
    : '';
  const isCertDeleted = deletedCerts.has(currentIndex);
  const isCertSelected = selectedCerts.has(currentIndex);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? certificates.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === certificates.length - 1 ? 0 : prev + 1));
  };

  const toggleSelection = () => {
    setSelectedCerts((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      return next;
    });
  };

  const toggleDelete = () => {
    setDeletedCerts((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      return next;
    });
  };

  const handlePrint = () => {
    const certsToPrint = certificates
      .map((cert, idx) => ({ cert, idx }))
      .filter(({ idx }) => selectedCerts.has(idx) && !deletedCerts.has(idx))
      .map(({ cert }) => cert);

    if (certsToPrint.length === 0) {
      return;
    }

    onPrint(certsToPrint);
  };

  const selectAllNotDeleted = () => {
    const notDeleted = new Set();
    certificates.forEach((_, idx) => {
      if (!deletedCerts.has(idx)) {
        notDeleted.add(idx);
      }
    });
    setSelectedCerts(notDeleted);
  };

  const deselectAll = () => {
    setSelectedCerts(new Set());
  };

  const restoreAll = () => {
    setDeletedCerts(new Set());
  };

  const selectedCount = Array.from(selectedCerts).filter((idx) => !deletedCerts.has(idx)).length;
  const deletedCount = deletedCerts.size;

  return (
    <div className="cert-preview-overlay" onClick={onClose}>
      <div
        className="cert-preview-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Preview Certificates"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cert-preview-header">
          <div className="cert-preview-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="13" x2="12" y2="17" />
              <polyline points="9 16 12 13 15 16" />
            </svg>
            <span>
              Preview Certificates
              <span className="cert-preview-count">
                {certificates.length} total
                {deletedCount > 0 && `, ${deletedCount} marked for deletion`}
                {selectedCount > 0 && `, ${selectedCount} selected`}
              </span>
            </span>
          </div>
          <button
            type="button"
            className="cert-preview-close-btn"
            onClick={onClose}
            aria-label="Close preview"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="cert-preview-content">
          <div className="cert-preview-viewer">
            {currentPdfSrc ? (
              <div className="cert-preview-pdf-container">
                <iframe
                  src={currentPdfSrc}
                  title={currentCert?.name || 'Certificate'}
                  className={`cert-preview-pdf-iframe ${isCertDeleted ? 'deleted' : ''}`}
                />
                {isCertDeleted && (
                  <div className="pdf-deleted-overlay">
                    <div className="pdf-deleted-label">Marked for deletion</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="cert-preview-pdf-loading">
                <div className="loading-spinner" />
                <p>Loading certificate...</p>
              </div>
            )}
          </div>

          <div className="cert-preview-sidebar">
            <div className="cert-info-block">
              <div className="cert-info-header">Certificate {currentIndex + 1} of {certificates.length}</div>
              {currentCert?.recipient && (
                <div className="cert-info-recipient">{currentCert.recipient}</div>
              )}
              {currentCert?.details && (
                <div className="cert-info-details">
                  {Object.entries(currentCert.details).map(([key, value]) => (
                    <div key={key} className="cert-detail-row">
                      <span className="detail-key">{key}:</span>
                      <span className="detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="cert-controls-block">
              <div className="cert-nav-buttons">
                <button
                  type="button"
                  className="cert-nav-btn prev-btn"
                  onClick={handlePrevious}
                  disabled={certificates.length <= 1}
                  title="Previous (Left Arrow key)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  className="cert-nav-btn next-btn"
                  onClick={handleNext}
                  disabled={certificates.length <= 1}
                  title="Next (Right Arrow key)"
                >
                  <span>Next</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="cert-selection-block">
                <label className="cert-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isCertSelected}
                    onChange={toggleSelection}
                    disabled={isCertDeleted}
                  />
                  <span>Include in print job</span>
                </label>
                <div className="cert-selection-actions">
                  <button
                    type="button"
                    className="cert-action-link"
                    onClick={selectAllNotDeleted}
                  >
                    Select all
                  </button>
                  <span className="cert-action-sep">|</span>
                  <button
                    type="button"
                    className="cert-action-link"
                    onClick={deselectAll}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <div className="cert-deletion-block">
                <label className="cert-checkbox-label deletion">
                  <input
                    type="checkbox"
                    checked={isCertDeleted}
                    onChange={toggleDelete}
                  />
                  <span>Mark for deletion</span>
                </label>
                {deletedCount > 0 && (
                  <button
                    type="button"
                    className="cert-action-link danger"
                    onClick={restoreAll}
                  >
                    Restore all
                  </button>
                )}
              </div>
            </div>

            <div className="cert-action-buttons">
              <button
                type="button"
                className="cert-print-btn"
                onClick={handlePrint}
                disabled={selectedCount === 0}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print Selected</span>
                {selectedCount > 0 && <span className="cert-count-badge">{selectedCount}</span>}
              </button>
              <button
                type="button"
                className="cert-close-btn"
                onClick={onClose}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CertPreviewModal;
