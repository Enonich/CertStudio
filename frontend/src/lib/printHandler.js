/**
 * Open only the generated PDF document in a new tab/window and trigger print.
 * No custom wrapper UI is used, so browser printing targets the document alone.
 */
export function openPdfForPrinting(pdfBlob, printDocumentTitle = 'Certificate', setStatus) {
  if (!(pdfBlob instanceof Blob)) {
    if (setStatus) {
      setStatus('Unable to print: invalid PDF data.');
    }
    return false;
  }

  const pdfUrl = URL.createObjectURL(pdfBlob);
  const width = Math.max(960, Math.floor((window.screen?.availWidth || 1200) * 0.94));
  const height = Math.max(700, Math.floor((window.screen?.availHeight || 900) * 0.94));
  const printWindow = window.open(
    pdfUrl,
    '_blank',
    `width=${width},height=${height},left=20,top=20,resizable=yes,scrollbars=yes`
  );

  if (!printWindow) {
    URL.revokeObjectURL(pdfUrl);
    if (setStatus) {
      setStatus('Popup blocked. Please allow popups in your browser to print.');
    }
    return false;
  }

  let printTriggered = false;
  const triggerPrint = () => {
    if (printTriggered) {
      return;
    }
    printTriggered = true;
    try {
      if (printDocumentTitle && printWindow.document) {
        printWindow.document.title = printDocumentTitle;
      }
    } catch {
      // Ignore cross-context title update issues.
    }
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Best effort only; user can still print manually from the opened PDF tab.
    }
  };

  const existingOnLoad = printWindow.onload;
  printWindow.onload = () => {
    if (typeof existingOnLoad === 'function') {
      existingOnLoad();
    }
    setTimeout(triggerPrint, 250);
  };

  // Fallback in case onload is not fired by the browser's PDF viewer.
  setTimeout(triggerPrint, 1200);
  setTimeout(triggerPrint, 2500);

  // Keep URL alive long enough for print/render, then release memory.
  setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
  }, 10 * 60 * 1000);

  return true;
}
