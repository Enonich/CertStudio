import { useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { MAX_PREVIEW_CERTIFICATES } from '../constants/editorConstants';

const normalizeMatchingKey = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Manages CSV data source: parsing, field mapping, preview rows, and auto-map.
 * Reads CSV/field state from the Zustand store.
 *
 * @param {{ setStatus: Function, commitActiveEditingDraft: Function }} deps
 */
export function useCsvData({ setStatus, commitActiveEditingDraft }) {
  const {
    fields, activeFieldId,
    csvFile, setCsvFile,
    csvHeaders, setCsvHeaders,
    csvFirstRow, setCsvFirstRow,
    csvAllRows, setCsvAllRows,
    csvRowCount, setCsvRowCount,
    fieldMappings, setFieldMappings,
    setSpreadsheetMappingOpen,
    useCsv, setUseCsv,
    generateOptions, setGenerateOptions,
    sampleValues, setSampleValues,
    sampleHtmlValues, setSampleHtmlValues,
    setIsEditingText,
  } = useEditorStore();

  const activeField = fields.find((f) => f.id === activeFieldId) ?? null;

  const previewRowData = useMemo(
    () => csvAllRows[generateOptions.row] || csvFirstRow,
    [csvAllRows, csvFirstRow, generateOptions.row]
  );

  const canPrintFromCsv = useCsv && Boolean(csvFile) && csvRowCount > 0;

  const mappedFieldCount = useMemo(
    () => fields.reduce((count, field) => count + (fieldMappings[field.name] ? 1 : 0), 0),
    [fields, fieldMappings]
  );

  const applyPreviewValuesForMappings = (mappings, rowData = previewRowData) => {
    if (!rowData || typeof rowData !== 'object') return;

    setSampleValues((prev) => {
      const next = { ...prev };
      Object.entries(mappings).forEach(([fieldName, csvColumn]) => {
        if (csvColumn && Object.prototype.hasOwnProperty.call(rowData, csvColumn)) {
          next[fieldName] = rowData[csvColumn] ?? '';
        }
      });
      return next;
    });

    setSampleHtmlValues((prev) => {
      const next = { ...prev };
      Object.entries(mappings).forEach(([fieldName, csvColumn]) => {
        if (csvColumn && Object.prototype.hasOwnProperty.call(next, fieldName)) {
          delete next[fieldName];
        }
      });
      return next;
    });
  };

  const updatePreviewRow = (rowIndex) => {
    const nextRow = Math.min(Math.max(rowIndex, 0), Math.max(0, csvRowCount - 1));
    setGenerateOptions((prev) => ({ ...prev, row: nextRow }));
    applyPreviewValuesForMappings(fieldMappings, csvAllRows[nextRow] || csvFirstRow);
  };

  // -- CSV parsing ------------------------------------------------------------

  const parseCsvHeaders = async (file) => {
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setCsvRowCount(0);
      return;
    }
    try {
      const text = await file.text();

      // RFC 4180-compliant CSV parser: handles quoted fields, embedded commas,
      // embedded newlines, and escaped quotes ("").
      const parseRfc4180 = (str) => {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (inQuotes) {
            if (ch === '"' && i + 1 < str.length && str[i + 1] === '"') {
              field += '"';
              i++;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              field += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            row.push(field);
            field = '';
          } else if (ch === '\r') {
            // skip bare CR; CRLF handled by skipping \r before \n
          } else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
          } else {
            field += ch;
          }
        }
        // Trailing field/row (no final newline)
        if (field || row.length > 0) {
          row.push(field);
          rows.push(row);
        }
        return rows;
      };

      const allParsedRows = parseRfc4180(text);
      if (allParsedRows.length === 0) {
        setCsvHeaders([]);
        setCsvFirstRow({});
        setCsvAllRows([]);
        setCsvRowCount(0);
        return;
      }

      const headers = allParsedRows[0].map((h, idx) => {
        const trimmed = h.trim();
        return idx === 0 ? trimmed.replace(/^\uFEFF/, '') : trimmed;
      });
      setCsvHeaders(headers);

      // Data rows: skip rows that are entirely empty
      const dataRows = allParsedRows.slice(1).filter((r) => r.some((v) => v.trim()));
      setCsvRowCount(dataRows.length);

      const allRowObjects = dataRows.map((values) => {
        const rowObj = {};
        headers.forEach((header, idx) => { rowObj[header] = values[idx] ?? ''; });
        return rowObj;
      });
      // Store only a limited number of rows for preview to keep memory bounded.
      setCsvAllRows(allRowObjects.slice(0, MAX_PREVIEW_CERTIFICATES));

      if (allRowObjects.length > 0) {
        setCsvFirstRow(allRowObjects[0]);
      } else {
        setCsvFirstRow({});
      }
    } catch (error) {
      setStatus(`Could not read the spreadsheet: ${error.message}. Please check the file and try again.`);
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setCsvRowCount(0);
    }
  };

  const handleCsvFileChange = async (event) => {
    const file = event.target.files?.[0] ?? null;
    setCsvFile(file);
    setSpreadsheetMappingOpen(false);
    if (!file) {
      setCsvHeaders([]);
      setCsvFirstRow({});
      setCsvAllRows([]);
      setFieldMappings({});
      setCsvRowCount(0);
      setGenerateOptions((prev) => ({
        ...prev,
        row: 0,
        generate_all: false,
      }));
    } else {
      setUseCsv(true);
      await parseCsvHeaders(file);
      // Auto-map fields whose names match CSV column headers on fresh upload.
      autoMapFieldsSilent();
    }
  };

  const updateFieldMapping = (fieldName, csvColumn) => {
    const nextMappings = {
      ...fieldMappings,
      [fieldName]: csvColumn,
    };

    setFieldMappings(nextMappings);

    if (csvColumn && activeField?.name === fieldName) {
      commitActiveEditingDraft();
      setIsEditingText(false);
    }

    if (csvColumn) {
      applyPreviewValuesForMappings({ [fieldName]: csvColumn });
    }
  };

  /** Core auto-map logic: matches field names to CSV headers. Returns { mappings, matchedCount }. */
  const computeAutoMap = () => {
    if (!fields.length || !csvHeaders.length) return null;

    const headerLookup = new Map();
    csvHeaders.forEach((header) => {
      const key = normalizeMatchingKey(header);
      if (key && !headerLookup.has(key)) {
        headerLookup.set(key, header);
      }
    });

    const nextMappings = { ...fieldMappings };
    let matchedCount = 0;

    fields.forEach((field) => {
      const match = headerLookup.get(normalizeMatchingKey(field.name));
      if (!match) return;
      nextMappings[field.name] = match;
      matchedCount += 1;
    });

    return { mappings: nextMappings, matchedCount };
  };

  /** Silent auto-map — called automatically on CSV upload. No toast if nothing matches. */
  const autoMapFieldsSilent = () => {
    const result = computeAutoMap();
    if (!result || result.matchedCount === 0) return;
    setFieldMappings(result.mappings);
    applyPreviewValuesForMappings(result.mappings);
  };

  /** User-triggered auto-map — shows status feedback. */
  const autoMapFields = () => {
    if (!fields.length || !csvHeaders.length) {
      setStatus('Add fields and upload a spreadsheet before auto-mapping columns.');
      return;
    }

    const result = computeAutoMap();
    if (!result) return;

    setFieldMappings(result.mappings);
    applyPreviewValuesForMappings(result.mappings);
    setStatus(
      result.matchedCount > 0
        ? `Auto-mapped ${result.matchedCount} field${result.matchedCount === 1 ? '' : 's'}. Review the matches before generating.`
        : 'No field names matched the spreadsheet columns automatically.'
    );
  };

  const getMappedColumnForField = (field) => {
    if (!field || !useCsv) return '';
    const mappedColumn = fieldMappings[field.name];
    return typeof mappedColumn === 'string' ? mappedColumn : '';
  };

  const getFieldDisplayName = (field) => {
    if (!field) return '';
    const csvColumn = getMappedColumnForField(field);
    if (csvColumn) return csvColumn;
    const preview = sampleValues[field.name] || sampleHtmlValues[field.name];
    if (preview) {
      const text = String(preview).substring(0, 35);
      return text.length < String(preview).length ? text + '…' : text;
    }
    return field.name ?? '';
  };

  return {
    previewRowData,
    canPrintFromCsv,
    mappedFieldCount,
    applyPreviewValuesForMappings,
    updatePreviewRow,
    parseCsvHeaders,
    handleCsvFileChange,
    updateFieldMapping,
    autoMapFields,
    getMappedColumnForField,
    getFieldDisplayName,
  };
}
