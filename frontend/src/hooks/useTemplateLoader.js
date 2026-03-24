import { useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { dataUrlToFile, readFileAsDataUrl } from "../lib/fileUtils";
import { loadTemplate } from "../lib/templateLoader";

/**
 * Manages template file state: loading, replacing, and restoring from saved layouts.
 */
export function useTemplateLoader({
  pageSize,
  fields,
  imageItems,
  setFields,
  setImageItems,
  setActiveFieldId,
  setActiveImageId,
  setSampleValues,
  setSampleHtmlValues,
  setStatus,
  setInsertMenuOpen,
  fitTemplateToCanvas,
}) {
  const [template, setTemplate] = useState(null);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateFileDataUrl, setTemplateFileDataUrl] = useState('');
  const [replaceTemplateModal, setReplaceTemplateModal] = useState({ open: false, file: null });

  const loadTemplateFile = async (file) => {
    const loaded = await loadTemplate(file, pageSize);
    const fileDataUrl = await readFileAsDataUrl(file);
    setTemplate(loaded);
    setTemplateFile(file);
    setTemplateFileDataUrl(fileDataUrl);
    setFields([]);
    setImageItems([]);
    setActiveFieldId(null);
    setActiveImageId(null);
    setSampleValues({});
    setSampleHtmlValues({});
    setStatus(`Template loaded: ${loaded.name}`);
    fitTemplateToCanvas(loaded);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const formData = new FormData();
        formData.append('template', file);
        const response = await apiFetch('/api/extract-fonts', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          setStatus(
            `Template loaded: ${loaded.name} (${data.fonts?.length || 0} embedded font${data.fonts?.length === 1 ? '' : 's'} detected)`
          );
        }
      } catch (error) {
        console.error('Failed to extract fonts:', error);
      }
    }
  };

  const handleTemplatePickerChange = async (event) => {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    if (!file) return;

    if (fields.length > 0 || imageItems.length > 0) {
      setInsertMenuOpen(false);
      setReplaceTemplateModal({ open: true, file });
      return;
    }

    try {
      await loadTemplateFile(file);
      setInsertMenuOpen(false);
    } catch (error) {
      setStatus(`Could not open the template file: ${error?.message || error}`);
    }
  };

  const cancelTemplateReplace = () => {
    setReplaceTemplateModal({ open: false, file: null });
  };

  const confirmTemplateReplace = async () => {
    const pendingFile = replaceTemplateModal.file;
    setReplaceTemplateModal({ open: false, file: null });
    if (!pendingFile) return;
    try {
      await loadTemplateFile(pendingFile);
      setInsertMenuOpen(false);
    } catch (error) {
      setStatus(`Could not open the template file: ${error?.message || error}`);
    }
  };

  const restoreTemplateFromLayoutState = async (layoutState) => {
    const asset = layoutState && typeof layoutState === 'object' ? layoutState.template_asset : null;
    if (!asset || typeof asset !== 'object' || !asset.data_url) return null;

    const restoredFile = dataUrlToFile(
      asset.data_url,
      asset.file_name || 'template.bin',
      asset.file_type || 'application/octet-stream'
    );
    const restoredTemplate = await loadTemplate(restoredFile, pageSize);
    setTemplate(restoredTemplate);
    setTemplateFile(restoredFile);
    setTemplateFileDataUrl(asset.data_url);
    fitTemplateToCanvas(restoredTemplate);
    return restoredTemplate;
  };

  return {
    template,
    setTemplate,
    templateFile,
    setTemplateFile,
    templateFileDataUrl,
    setTemplateFileDataUrl,
    replaceTemplateModal,
    setReplaceTemplateModal,
    loadTemplateFile,
    handleTemplatePickerChange,
    cancelTemplateReplace,
    confirmTemplateReplace,
    restoreTemplateFromLayoutState,
  };
}
