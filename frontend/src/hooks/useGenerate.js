import { useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { openPdfForPrinting } from "../lib/printHandler";
import { formatErrorDetail } from "../lib/errorUtils";
import { getFilenameFromContentDisposition } from "../lib/fileUtils";
import { MAX_PREVIEW_CERTIFICATES } from "../constants/editorConstants";

/**
 * Manages PDF generation, printing, preview, and download state and operations.
 */
export function useGenerate({
  templateFile,
  fields,
  fieldMappings,
  csvFile,
  useCsv,
  csvRowCount,
  csvFirstRow,
  csvAllRows,
  generateOptions,
  buildPayload,
  buildDataPayload,
  getFieldValuePayload,
  setStatus,
  setPanelState,
  canPrintFromCsv,
  isGenerating,
  setIsGenerating,
}) {
  const [isPreviewingAll, setIsPreviewingAll] = useState(false);
  const [generatedCertificates, setGeneratedCertificates] = useState([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latestDownload, setLatestDownload] = useState(null);
  const [zipNameModal, setZipNameModal] = useState({ open: false, suggestedName: 'certificates' });

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    // Revoke any blob URLs stored from batch preview to avoid memory leaks
    setGeneratedCertificates((prev) => {
      prev.forEach((cert) => { if (cert.url) URL.revokeObjectURL(cert.url); });
      return [];
    });
    setPreviewModalOpen(false);
  };

  const openPdfForPrintingWithStatus = (pdfBlob, printDocumentTitle = 'Certificates') =>
    openPdfForPrinting(pdfBlob, printDocumentTitle, setStatus);

  // ---- Shared FormData builder for generate-file-upload --------------------

  const buildGenerateFormData = ({ row, overlayOnly, batch = false }) => {
    const fieldsPayload = buildPayload(false);
    if (!fieldsPayload) return null;

    const formData = new FormData();
    formData.append('template', templateFile);
    formData.append('fields_json', JSON.stringify(fieldsPayload));
    formData.append('row', String(row));
    formData.append('page_size', generateOptions.page_size);
    formData.append('dx', '0');
    formData.append('dy', '0');
    formData.append('grid_step', '0');
    formData.append('placeholder_mode', 'false');
    formData.append('overlay_only', String(overlayOnly));

    if (useCsv) {
      formData.append('csv_file', csvFile);
      const cleanedMappings = {};
      Object.entries(fieldMappings).forEach(([fieldName, csvColumn]) => {
        if (csvColumn) cleanedMappings[fieldName] = csvColumn;
      });
      formData.append('field_mappings_json', JSON.stringify(cleanedMappings));

      const fixedValues = {};
      fields.forEach((field) => {
        if (!fieldMappings[field.name]) {
          const { text, html } = getFieldValuePayload(field.name);
          if (text) fixedValues[field.name] = { text, html };
        }
      });
      formData.append('fixed_values_json', JSON.stringify(fixedValues));
      formData.append('batch', String(batch));
    } else {
      formData.append('data_json', JSON.stringify(buildDataPayload()));
    }

    return formData;
  };

  // ---- generatePdf ---------------------------------------------------------

  const generatePdf = async () => {
    if (isGenerating) return;
    try {
      setIsGenerating(true);

      if (!templateFile) { setStatus('Please open a certificate template first.'); return; }

      const recipientCount = useCsv && generateOptions.generate_all ? csvRowCount : 1;
      setStatus(`Rendering ${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}…`);

      const fieldsPayload = buildPayload(false);
      if (!fieldsPayload) { setStatus('Add text fields to your certificate before generating.'); return; }

      if (useCsv && !csvFile) {
        setPanelState((prev) => ({ ...prev, dataSource: true }));
        setStatus('This layout uses batch mode. Upload a spreadsheet in "Bulk Generation", or turn off "Generate from a list", then try again.');
        return;
      }

      const overlayOnly = generateOptions.output_mode === 'overlay_only';
      const formData = buildGenerateFormData({
        row: Number(generateOptions.row) || 0,
        overlayOnly,
        batch: generateOptions.generate_all,
      });
      if (!formData) { setStatus('Add text fields to your certificate before generating.'); return; }

      let response;
      try {
        response = await apiFetch('/api/generate-file-upload', { method: 'POST', body: formData });
      } catch (error) {
        setStatus(`Failed to reach server: ${error}`);
        return;
      }

      if (!response.ok) {
        let detail = '';
        const ct = response.headers.get('content-type') || '';
        try {
          detail = ct.includes('application/json')
            ? formatErrorDetail((await response.json())?.detail)
            : await response.text();
        } catch { detail = `HTTP ${response.status}`; }
        setStatus(`Failed to generate PDF. HTTP ${response.status}.${detail ? ` ${detail}` : ''}`);
        return;
      }

      const responseForText = response.clone();
      const contentType = response.headers.get('content-type') || 'n/a';
      const contentDisposition = response.headers.get('content-disposition') || '';
      const buffer = await response.arrayBuffer();

      if (!buffer || buffer.byteLength === 0) {
        let detail = '';
        try { detail = await responseForText.text(); } catch { detail = ''; }
        setStatus(
          `Generated file is empty. HTTP ${response.status} content-length=${response.headers.get('content-length') || 'n/a'} content-type=${contentType}.${detail ? ` ${detail}` : ''}`
        );
        return;
      }

      const isZipResponse =
        contentType.includes('application/zip') ||
        contentType.includes('application/x-zip-compressed') ||
        /\.zip/i.test(contentDisposition);

      if (useCsv && generateOptions.generate_all && isZipResponse) {
        const zipBlob = new Blob([buffer], { type: 'application/zip' });
        const zipUrl = URL.createObjectURL(zipBlob);
        const filename = getFilenameFromContentDisposition(contentDisposition, 'certificates.zip');
        if (latestDownload?.url) URL.revokeObjectURL(latestDownload.url);
        setLatestDownload({ url: zipUrl, filename, kind: 'zip' });
        setStatus(`Successfully generated ${recipientCount} certificates. Click Download to save the ZIP file.`);
        return;
      }

      if (!contentType.includes('application/pdf')) {
        let detail = '';
        try { detail = await responseForText.text(); } catch { detail = ''; }
        setStatus(`Unexpected response type: ${contentType}.${detail ? ` ${detail}` : ''}`);
        return;
      }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      if (latestDownload?.url) URL.revokeObjectURL(latestDownload.url);
      setLatestDownload({ url: downloadUrl, filename: 'certificate.pdf', kind: 'pdf' });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPanelState((prev) => ({ ...prev, preview: true }));
      setStatus('Certificate generated successfully. Use Download to save it.');
    } catch (error) {
      setStatus(`Generation failed unexpectedly: ${error?.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- printCurrentCertificate ---------------------------------------------

  const printCurrentCertificate = async () => {
    if (isGenerating) return;
    if (!templateFile) { setStatus('Please open a certificate template first.'); return; }

    const rowIndex = Number(generateOptions.row) || 0;
    if (canPrintFromCsv && (rowIndex < 0 || rowIndex >= csvRowCount)) {
      setStatus(`Row ${rowIndex + 1} is out of range. This spreadsheet has ${csvRowCount} data row${csvRowCount === 1 ? '' : 's'}.`);
      return;
    }

    try {
      setIsGenerating(true);
      setStatus(canPrintFromCsv ? `Generating certificate for row ${rowIndex + 1}…` : 'Generating certificate for print…');

      const fieldsPayload = buildPayload(false);
      if (!fieldsPayload) { setStatus('Add text fields to your certificate before generating.'); return; }

      const overlayOnly = generateOptions.output_mode === 'overlay_only';
      const formData = buildGenerateFormData({ row: rowIndex, overlayOnly, batch: false });
      if (!formData) { setStatus('Add text fields to your certificate before generating.'); return; }

      let response;
      try {
        response = await apiFetch('/api/generate-file-upload', { method: 'POST', body: formData });
      } catch (error) {
        setStatus(`Failed to reach server: ${error}`);
        return;
      }

      if (!response.ok) {
        let detail = '';
        const ct = response.headers.get('content-type') || '';
        try {
          detail = ct.includes('application/json')
            ? formatErrorDetail((await response.json())?.detail)
            : await response.clone().text();
        } catch { detail = `HTTP ${response.status}`; }
        setStatus(`Failed to generate PDF for printing. HTTP ${response.status}.${detail ? ` ${detail}` : ''}`);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) {
        setStatus(`Unexpected response type for print: ${contentType}.`);
        return;
      }

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) { setStatus('Generated print file is empty.'); return; }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const printTitle = canPrintFromCsv ? `Certificate Row ${rowIndex + 1}` : 'Certificate';
      if (openPdfForPrintingWithStatus(blob, printTitle)) {
        setStatus(canPrintFromCsv ? `Opened print dialog for row ${rowIndex + 1}.` : 'Opened print dialog for the current certificate.');
      }
    } catch (error) {
      setStatus(`Printing failed unexpectedly: ${error?.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- previewAllCertificates ----------------------------------------------

  const previewAllCertificates = async () => {
    if (isPreviewingAll) return;
    if (!templateFile) { setStatus('Please open a certificate template first.'); return; }
    if (!useCsv || !csvFile) {
      setStatus('Turn on "Generate from a list" and upload a spreadsheet first.');
      return;
    }
    if (csvRowCount > MAX_PREVIEW_CERTIFICATES) {
      setStatus(`Preview is limited to ${MAX_PREVIEW_CERTIFICATES} certificates. Use Generate to download a ZIP for larger lists.`);
      return;
    }

    try {
      setIsPreviewingAll(true);
      setStatus('Generating certificates for preview…');

      const fieldsPayload = buildPayload(false);
      if (!fieldsPayload) { setStatus('Add text fields to your certificate before generating.'); return; }

      const overlayOnly = generateOptions.output_mode === 'overlay_only';
      const certs = [];

      for (let rowIndex = 0; rowIndex < csvRowCount; rowIndex++) {
        const formData = buildGenerateFormData({ row: rowIndex, overlayOnly, batch: false });
        if (!formData) continue;

        try {
          const response = await apiFetch('/api/generate-file-upload', { method: 'POST', body: formData });
          if (!response.ok) { console.warn(`Failed to generate certificate for row ${rowIndex + 1}`); continue; }
          const ct = response.headers.get('content-type') || '';
          if (!ct.includes('application/pdf')) { console.warn(`Unexpected type for row ${rowIndex + 1}: ${ct}`); continue; }
          const buffer = await response.arrayBuffer();
          if (!buffer || buffer.byteLength === 0) { console.warn(`Empty PDF for row ${rowIndex + 1}`); continue; }

          const blob = new Blob([buffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);

          let recipientName = `Recipient ${rowIndex + 1}`;
          const mappedFields = Object.entries(fieldMappings);
          if (mappedFields.length > 0) {
            const firstMappedColumn = mappedFields[0][1];
            const rowData = (csvAllRows && csvAllRows[rowIndex]) ? csvAllRows[rowIndex] : csvFirstRow;
            recipientName = rowData[firstMappedColumn] || recipientName;
          }

          certs.push({
            url,
            blob,
            recipient: recipientName,
            rowIndex,
            name: `Certificate_${rowIndex + 1}.pdf`,
            details: { Row: rowIndex + 1, Total: csvRowCount },
          });
        } catch (error) {
          console.warn(`Error generating certificate for row ${rowIndex + 1}:`, error);
        }
      }

      if (certs.length === 0) { setStatus('Failed to generate any certificates.'); return; }
      // Revoke any URLs from a previous preview run before storing new ones
      generatedCertificates.forEach((cert) => { if (cert.url) URL.revokeObjectURL(cert.url); });
      setGeneratedCertificates(certs);
      setPreviewModalOpen(true);
      setStatus(`Generated ${certs.length} certificates. Click below to preview and print.`);
    } catch (error) {
      setStatus(`Failed to generate certificates: ${error?.message || error}`);
    } finally {
      setIsPreviewingAll(false);
    }
  };

  // ---- handlePrintFromModal (merge + print) ---------------------------------

  const handlePrintFromModal = async (certsToPrint) => {
    if (!certsToPrint || certsToPrint.length === 0) {
      setStatus('No certificates selected for printing.');
      return;
    }
    try {
      setIsGenerating(true);
      setStatus(`Preparing ${certsToPrint.length} certificate${certsToPrint.length === 1 ? '' : 's'} for printing…`);

      const pdfBlobs = await Promise.all(
        certsToPrint.map(async (cert) => {
          const response = await fetch(cert.url);
          if (!response.ok) throw new Error(`Failed to fetch certificate: ${response.statusText}`);
          return response.blob();
        })
      );

      const formData = new FormData();
      pdfBlobs.forEach((blob, idx) => formData.append('pdf_files', blob, `certificate_${idx + 1}.pdf`));

      let mergeResponse;
      try {
        mergeResponse = await apiFetch('/api/merge-pdfs-for-print', { method: 'POST', body: formData });
      } catch (error) {
        setStatus(`Failed to reach server: ${error}`);
        return;
      }

      if (!mergeResponse.ok) {
        let detail = '';
        const ct = mergeResponse.headers.get('content-type') || '';
        try {
          detail = ct.includes('application/json')
            ? formatErrorDetail((await mergeResponse.json())?.detail)
            : await mergeResponse.text();
        } catch { detail = `HTTP ${mergeResponse.status}`; }
        setStatus(`Failed to merge certificates for printing. HTTP ${mergeResponse.status}.${detail ? ` ${detail}` : ''}`);
        return;
      }

      const ct = mergeResponse.headers.get('content-type') || '';
      if (!ct.includes('application/pdf')) { setStatus(`Unexpected response type: ${ct}.`); return; }

      const buffer = await mergeResponse.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) { setStatus('Merged PDF file is empty.'); return; }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const printTitle = `Certificates (${certsToPrint.length})`;
      if (openPdfForPrintingWithStatus(blob, printTitle)) {
        setStatus(`Merged and opened print dialog for ${certsToPrint.length} certificate${certsToPrint.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      setStatus(`Printing failed unexpectedly: ${error?.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- Download helpers ----------------------------------------------------

  const downloadLatestFile = () => {
    if (!latestDownload?.url) {
      setStatus('Please generate a certificate first, then you can download it.');
      return;
    }
    if (latestDownload.kind === 'zip') {
      const suggested = (latestDownload.filename || 'certificates.zip').replace(/\.zip$/i, '');
      setZipNameModal({ open: true, suggestedName: suggested });
      return;
    }
    const a = document.createElement('a');
    a.href = latestDownload.url;
    a.download = latestDownload.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Downloaded the latest generated certificate.');
  };

  const confirmZipDownload = async (chosenName) => {
    setZipNameModal({ open: false, suggestedName: chosenName });
    if (!latestDownload?.url) return;

    const finalName = `${chosenName.trim() || 'certificates'}.zip`;

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: finalName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
        const response = await fetch(latestDownload.url);
        const blob = await response.blob();
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(`ZIP saved as "${fileHandle.name}".`);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('showSaveFilePicker failed, falling back:', err);
      }
    }

    const a = document.createElement('a');
    a.href = latestDownload.url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(`Downloaded ZIP as "${finalName}".`);
  };

  return {
    isPreviewingAll,
    generatedCertificates,
    previewModalOpen,
    setPreviewModalOpen,
    previewUrl,
    setPreviewUrl,
    latestDownload,
    setLatestDownload,
    zipNameModal,
    setZipNameModal,
    closePreview,
    generatePdf,
    printCurrentCertificate,
    previewAllCertificates,
    handlePrintFromModal,
    downloadLatestFile,
    confirmZipDownload,
  };
}
