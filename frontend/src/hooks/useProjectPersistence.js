import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import {
  canUseSavePicker,
  clearStoredProjectFileHandle,
  getStoredProjectFileHandle,
  normalizeProjectFilename,
  setStoredProjectFileHandle,
} from "../lib/projectFileHandle";
import { useEditorStore } from "../store/useEditorStore";

/**
 * Manages project persistence: save/load to file system and backend API.
 * Reads editor state from the Zustand store.
 */
export function useProjectPersistence({
  buildPayload,
  payloadToLayout,
  restoreTemplateFromLayoutState,
  loadTemplateFile,
  fitTemplateToCanvas,
  setStatus,
  markClean,
}) {
  const {
    template, csvFile,
    setFields, setImageItems, setActiveFieldId, setActiveImageId,
    setSampleValues, setSampleHtmlValues,
    setFieldMappings, setUseCsv, setGenerateOptions,
  } = useEditorStore();
  const [projectFileHandle, setProjectFileHandle] = useState(null);
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldsName, setSelectedFieldsName] = useState('');
  const [saveFieldsName, setSaveFieldsName] = useState('certificate-project');

  // Restore persisted project file handle on mount.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!canUseSavePicker()) return;
      try {
        const storedHandle = await getStoredProjectFileHandle();
        if (!cancelled && storedHandle) setProjectFileHandle(storedHandle);
      } catch (error) {
        console.warn('Failed to restore project file handle:', error);
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  // ---- Backend layout list --------------------------------------------------

  const refreshFieldsList = async () => {
    try {
      const response = await apiFetch('/api/fields/list');
      if (!response.ok) { setStatus('Could not load saved layouts.'); return; }
      const data = await response.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      setFieldsList(files);
      if (selectedFieldsName && !files.includes(selectedFieldsName)) setSelectedFieldsName('');
      if (files.length > 0 && (!saveFieldsName || !saveFieldsName.trim())) setSaveFieldsName(files[0]);
    } catch (error) {
      setStatus(`Could not load saved layouts: ${error}`);
    }
  };

  // ---- Layout apply helper (shared by load functions) ----------------------

  const applyLoadedLayout = (next, loadedTemplateForLayout, fileLabelForStatus) => {
    setFields(next.fields);
    setImageItems(next.images);
    setActiveFieldId(next.fields[0]?.id ?? null);
    setActiveImageId(null);

    if (next.layoutState) {
      setSampleValues(
        next.layoutState.sample_values && typeof next.layoutState.sample_values === 'object'
          ? next.layoutState.sample_values : {}
      );
      setSampleHtmlValues(
        next.layoutState.sample_html_values && typeof next.layoutState.sample_html_values === 'object'
          ? next.layoutState.sample_html_values : {}
      );
      setFieldMappings(
        next.layoutState.field_mappings && typeof next.layoutState.field_mappings === 'object'
          ? next.layoutState.field_mappings : {}
      );
      setUseCsv(Boolean(next.layoutState.use_csv));
      if (next.layoutState.generate_options && typeof next.layoutState.generate_options === 'object') {
        setGenerateOptions((prev) => ({ ...prev, ...next.layoutState.generate_options }));
      }
    } else {
      setSampleValues({});
      setSampleHtmlValues({});
      setFieldMappings({});
      setUseCsv(false);
    }

    const loadedWithCsvMode = Boolean(next.layoutState?.use_csv);
    if (loadedWithCsvMode && !csvFile) {
      setStatus(`${fileLabelForStatus} This layout is set up for batch generation — upload a spreadsheet in Bulk Generation, or turn off "Generate from a list".`);
    } else {
      setStatus(fileLabelForStatus);
    }

    fitTemplateToCanvas(loadedTemplateForLayout);
  };

  // ---- Backend save/load ---------------------------------------------------

  const saveToBackend = async (includeTemplateAsset) => {
    const payload = buildPayload(includeTemplateAsset);
    if (!payload) {
      setStatus('Please open a certificate template and add at least one text field first.');
      return;
    }
    const targetName = saveFieldsName?.trim() || 'fields.json';
    const response = await apiFetch(`/api/fields?name=${encodeURIComponent(targetName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { setStatus(`Could not save the layout — please try again.`); return; }
    setStatus(
      includeTemplateAsset
        ? `Layout "${targetName}" saved successfully (includes certificate background).`
        : `Layout "${targetName}" saved (text fields only — no background included).`
    );
    if (markClean) markClean();
    refreshFieldsList();
  };

  const loadFromBackend = async () => {
    const targetName = selectedFieldsName?.trim() || 'fields.json';
    if (!selectedFieldsName?.trim()) { setStatus('Please select a saved layout first.'); return; }

    const response = await apiFetch(`/api/fields?name=${encodeURIComponent(targetName)}`);
    if (!response.ok) { setStatus(`Could not load the selected layout — please try again.`); return; }

    const payload = await response.json();
    let templateForLayout = template;
    try {
      const restoredTemplate = await restoreTemplateFromLayoutState(payload.layout_state);
      if (restoredTemplate) templateForLayout = restoredTemplate;
    } catch (error) {
      setStatus(`Failed to restore template from ${targetName}: ${error?.message || error}`);
      return;
    }

    if (!templateForLayout) {
      setStatus(`No certificate template is loaded, and this layout file doesn't include one.`);
      return;
    }

    const next = payloadToLayout(payload, templateForLayout);
    applyLoadedLayout(next, templateForLayout, `Layout "${targetName}" loaded successfully.`);
  };

  // ---- File-based load -----------------------------------------------------

  const loadProjectFile = async (file) => {
    try {
      const text = await file.text();
      const raw = String(text ?? '');
      const trimmed = raw.trim();
      if (!trimmed) {
        setStatus(`Failed to load ${file.name}: file is empty. Save the project again, then re-import.`);
        return;
      }
      if (trimmed === 'undefined') {
        setStatus(
          `Failed to load ${file.name}: file contains "undefined" (invalid JSON). Save again using Project -> Save Project As..., then import that file.`
        );
        return;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch (parseError) {
        setStatus(`Failed to load ${file.name}: invalid JSON (${parseError?.message || parseError}).`);
        return;
      }

      let templateForLayout = template;
      try {
        const restoredTemplate = await restoreTemplateFromLayoutState(payload.layout_state);
        if (restoredTemplate) templateForLayout = restoredTemplate;
      } catch (error) {
        setStatus(`Failed to restore template from ${file.name}: ${error?.message || error}`);
        return;
      }

      if (!templateForLayout) {
        setStatus(`No certificate template is loaded, and this layout file doesn't include one.`);
        return;
      }

      const next = payloadToLayout(payload, templateForLayout);
      applyLoadedLayout(next, templateForLayout, `Loaded ${file.name} from disk.`);
    } catch (error) {
      setStatus(`Failed to load file: ${error}`);
    }
  };

  const loadFromFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;
    try {
      await loadProjectFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const handleWorkspaceBrowseFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isProjectFile = extension === 'json' || extension === 'certproj';
    try {
      if (isProjectFile) {
        await loadProjectFile(file);
      } else {
        await loadTemplateFile(file);
      }
    } catch (error) {
      setStatus(`Failed to load ${file.name}: ${error?.message || error}`);
    } finally {
      event.target.value = '';
    }
  };

  // ---- File-based save -----------------------------------------------------

  const exportJson = () => {
    const payload = buildPayload(false);
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFieldsName?.trim() || 'fields.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildProjectSaveBundle = () => {
    const payload = buildPayload(true);
    if (!payload) {
      setStatus('Please open a certificate template and add at least one text field first.');
      return null;
    }
    return { filename: normalizeProjectFilename(saveFieldsName), serialized: JSON.stringify(payload, null, 2) };
  };

  const downloadProjectFallback = (serialized, filename, statusMessage = 'Saved project file to Downloads (browser fallback).') => {
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(statusMessage);
    if (markClean) markClean();
  };

  const persistProjectFileHandle = async (fileHandle) => {
    setProjectFileHandle(fileHandle);
    try {
      await setStoredProjectFileHandle(fileHandle);
    } catch (error) {
      console.warn('Unable to persist project file handle:', error);
    }
  };

  const clearPersistedProjectFileHandle = async () => {
    setProjectFileHandle(null);
    try {
      await clearStoredProjectFileHandle();
    } catch (error) {
      console.warn('Unable to clear stored project file handle:', error);
    }
  };

  const writeProjectToHandle = async (fileHandle, serialized, fallbackFilename) => {
    try {
      if (!fileHandle) {
        setStatus('No save location selected yet. Use "Save Project As…" first.');
        return false;
      }
      const writable = await fileHandle.createWritable();
      await writable.write(serialized);
      await writable.close();

      if (typeof fileHandle.getFile === 'function' && serialized.length > 0) {
        const savedFile = await fileHandle.getFile();
        if (savedFile && savedFile.size === 0) {
          setStatus('Project save produced an empty file. A download fallback will be used.');
          return false;
        }
      }

      await persistProjectFileHandle(fileHandle);
      setStatus(`Saved project to ${fileHandle.name || fallbackFilename}.`);
      if (markClean) markClean();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') { setStatus('Save cancelled.'); return false; }
      if (error?.name === 'NotFoundError') {
        await clearPersistedProjectFileHandle();
        setStatus('The previous project file is no longer available. Choose Save Project As... to pick a new location.');
        return false;
      }
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        setStatus('Write access was denied. Try Save Project As... and choose a writable location.');
        return false;
      }
      throw error;
    }
  };

  const saveProjectAsToFile = async (bundleOverride = null) => {
    const isBundleObject =
      bundleOverride &&
      typeof bundleOverride === 'object' &&
      typeof bundleOverride.filename === 'string' &&
      typeof bundleOverride.serialized === 'string';
    const bundle = isBundleObject ? bundleOverride : buildProjectSaveBundle();
    if (!bundle) return;
    const { filename, serialized } = bundle;

    try {
      if (canUseSavePicker()) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON project file', accept: { 'application/json': ['.json'] } }],
        });
        const didSave = await writeProjectToHandle(fileHandle, serialized, filename);
        if (!didSave) {
          downloadProjectFallback(serialized, filename, 'Direct file save failed. Downloaded a project file fallback.');
        }
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') { setStatus('Save cancelled.'); return; }
      setStatus(`Save dialog failed — the file was downloaded instead. (${error?.message || error})`);
    }

    downloadProjectFallback(serialized, filename);
  };

  const saveProjectToFile = async () => {
    const bundle = buildProjectSaveBundle();
    if (!bundle) return;
    const { filename, serialized } = bundle;

    if (!canUseSavePicker()) {
      downloadProjectFallback(serialized, filename, 'Browser does not support direct file save. Downloaded project file instead.');
      return;
    }

    if (!projectFileHandle) {
      await saveProjectAsToFile(bundle);
      return;
    }

    try {
      const didSave = await writeProjectToHandle(projectFileHandle, serialized, filename);
      if (!didSave) {
        downloadProjectFallback(
          serialized,
          filename,
          'Direct save failed. Downloaded a project file fallback. Use Save Project As... to re-link the target file.'
        );
      }
    } catch (error) {
      setStatus(`Failed to save project (${error?.message || error}).`);
    }
  };

  return {
    projectFileHandle,
    setProjectFileHandle,
    fieldsList,
    setFieldsList,
    selectedFieldsName,
    setSelectedFieldsName,
    saveFieldsName,
    setSaveFieldsName,
    refreshFieldsList,
    exportJson,
    buildProjectSaveBundle,
    saveProjectAsToFile,
    saveProjectToFile,
    saveToBackend,
    loadFromBackend,
    loadProjectFile,
    loadFromFile,
    handleWorkspaceBrowseFile,
  };
}
