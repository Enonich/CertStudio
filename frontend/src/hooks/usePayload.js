import { plainTextToHtml, sanitizeHtml } from "../lib/htmlUtils";
import { clampBox } from "../lib/geometryUtils";
import { uid } from "../lib/historyUtils";
import { useEditorStore } from "../store/useEditorStore";

/**
 * Provides payload construction utilities for communicating with the backend.
 * Reads editor state from the Zustand store.
 */
export function usePayload({
  scales,
  editingDraftRef,
  availableFontValues,
}) {
  const {
    template, fields, imageItems,
    sampleValues, sampleHtmlValues,
    fieldMappings, useCsv, generateOptions,
    templateFile, templateFileDataUrl,
    isEditingText,
  } = useEditorStore();
  const getFieldValuePayload = (fieldName) => {
    if (isEditingText && editingDraftRef.current.name === fieldName) {
      const draftText = editingDraftRef.current.text ?? '';
      const draftHtml = sanitizeHtml(editingDraftRef.current.html ?? plainTextToHtml(draftText));
      return { text: draftText, html: draftHtml };
    }
    const text = sampleValues[fieldName] ?? '';
    const html = sanitizeHtml(sampleHtmlValues[fieldName] ?? plainTextToHtml(text));
    return { text, html };
  };

  const buildDataPayload = () => {
    const payload = {};
    fields.forEach((field) => {
      if (!field.name) return;
      payload[field.name] = getFieldValuePayload(field.name);
    });
    return payload;
  };

  const buildPayload = (includeTemplateAsset = true) => {
    if (!template || !scales) return null;

    return {
      page: 0,
      default_font: 'Helvetica',
      default_size: 18,
      fields: fields.map((field) => {
        const leftPt = field.x * scales.x;
        const rightPt = (field.x + field.w) * scales.x;
        const topPt = (template.displayHeight - field.y) * scales.y;
        const maxWidthPt = field.w * scales.x;
        const fieldSizePt = Number(field.size);
        const baselineY = topPt - fieldSizePt;

        let fontName = field.font || 'Helvetica';
        if (field.bold || field.italic) {
          const baseFont = fontName.replace(/-Bold|-Italic|-Oblique|-BoldOblique|-BoldItalic/g, '');
          if (baseFont === 'Helvetica') {
            fontName =
              field.bold && field.italic ? 'Helvetica-BoldOblique' :
              field.bold ? 'Helvetica-Bold' :
              field.italic ? 'Helvetica-Oblique' : 'Helvetica';
          } else if (baseFont === 'Times' || baseFont === 'Times-Roman') {
            fontName =
              field.bold && field.italic ? 'Times-BoldItalic' :
              field.bold ? 'Times-Bold' :
              field.italic ? 'Times-Italic' : 'Times-Roman';
          } else if (baseFont === 'Courier') {
            fontName =
              field.bold && field.italic ? 'Courier-BoldOblique' :
              field.bold ? 'Courier-Bold' :
              field.italic ? 'Courier-Oblique' : 'Courier';
          }
        }

        const mapped = {
          name: field.name,
          z: Number.isFinite(field.z) ? Number(field.z) : undefined,
          x: field.align === 'center' ? (leftPt + rightPt) / 2 : field.align === 'right' ? rightPt : leftPt,
          y: baselineY,
          font: fontName,
          bold: Boolean(field.bold),
          italic: Boolean(field.italic),
          size: fieldSizePt,
          align: field.align,
          color: field.color,
        };

        if (field.maxWidth) {
          mapped.max_width = maxWidthPt;
        }

        mapped.wrap_start_y = topPt;
        mapped.box_width = maxWidthPt;
        mapped.box_height = field.h * scales.y;

        if (field.wrapText) {
          mapped.wrap_text = true;
          mapped.wrap_width = maxWidthPt;
        }

        return mapped;
      }),
      images: imageItems.map((image) => {
        const imageWidthPt = image.w * scales.x;
        const imageHeightPt = image.h * scales.y;
        const imageTopPt = (template.displayHeight - image.y) * scales.y;
        const imageBottomPt = imageTopPt - imageHeightPt;
        return {
          id: image.id,
          name: image.name,
          z: Number.isFinite(image.z) ? Number(image.z) : undefined,
          x: image.x * scales.x,
          y: imageBottomPt,
          w: imageWidthPt,
          h: imageHeightPt,
          src: image.src,
        };
      }),
      layout_state: {
        sample_values: sampleValues,
        sample_html_values: sampleHtmlValues,
        field_mappings: fieldMappings,
        use_csv: useCsv,
        generate_options: generateOptions,
        template_asset:
          includeTemplateAsset && templateFileDataUrl && templateFile
            ? {
                file_name: templateFile.name,
                file_type: templateFile.type || '',
                data_url: templateFileDataUrl,
              }
            : null,
      },
    };
  };

  const payloadToLayout = (payload, templateOverride = null) => {
    const templateForLayout = templateOverride ?? template;
    if (!templateForLayout || !payload || !Array.isArray(payload.fields)) {
      return { fields: [], images: [], layoutState: null };
    }

    const localScales = {
      x: templateForLayout.pageWidthPt / templateForLayout.displayWidth,
      y: templateForLayout.pageHeightPt / templateForLayout.displayHeight,
    };

    const mappedFields = payload.fields.map((field, idx) => {
      const align = field.align ?? 'left';
      const widthPt = Number(field.box_width ?? field.max_width ?? 150);
      const widthPx = widthPt / localScales.x;
      const sizePt = Number(field.size ?? payload.default_size ?? 18);
      const estimatedHeightPt = Math.max(
        24,
        ((sizePt * 1.6) / templateForLayout.pageHeightPt) * templateForLayout.displayHeight * localScales.y
      );
      const heightPt = Number(field.box_height ?? estimatedHeightPt);
      const heightPx = Math.max(8, heightPt / localScales.y);
      const anchorX = Number(field.x) / localScales.x;
      const wrapTopPt = Number(field.wrap_start_y);
      const legacyY = Number(field.y);
      const topPt = Number.isFinite(wrapTopPt)
        ? wrapTopPt
        : Number.isFinite(legacyY)
          ? legacyY + sizePt
          : templateForLayout.pageHeightPt;

      let leftX = anchorX;
      if (align === 'center') {
        leftX = anchorX - widthPx / 2;
      } else if (align === 'right') {
        leftX = anchorX - widthPx;
      }

      const y = templateForLayout.displayHeight - (topPt / localScales.y);

      const fontName = field.font ?? payload.default_font ?? 'Helvetica';
      let baseFont = fontName;
      let bold = false;
      let italic = false;

      if (fontName.includes('Bold')) bold = true;
      if (fontName.includes('Oblique') || fontName.includes('Italic')) italic = true;
      if (typeof field.bold === 'boolean') bold = field.bold;
      if (typeof field.italic === 'boolean') italic = field.italic;

      if (fontName.startsWith('Helvetica')) {
        baseFont = 'Helvetica';
      } else if (fontName.startsWith('Times')) {
        baseFont = 'Times-Roman';
      } else if (fontName.startsWith('Courier')) {
        baseFont = 'Courier';
      }

      const resolvedFont = availableFontValues.has(fontName)
        ? fontName
        : availableFontValues.has(baseFont)
          ? baseFont
          : 'Helvetica';

      return clampBox(
        {
          id: uid(),
          name: field.name ?? `field_${idx + 1}`,
          x: leftX,
          y,
          w: widthPx,
          h: heightPx,
          align,
          z: Number.isFinite(field.z) ? Number(field.z) : idx,
          font: resolvedFont,
          size: sizePt,
          color: Array.isArray(field.color) ? field.color : [0, 0, 0],
          maxWidth: field.max_width !== undefined,
          wrapText: field.wrap_text !== false,
          bold,
          italic,
        },
        templateForLayout.displayWidth,
        templateForLayout.displayHeight
      );
    });

    const mappedImages = Array.isArray(payload.images)
      ? payload.images
          .map((image, idx) => {
            const wPt = Number(image.w ?? 0);
            const hPt = Number(image.h ?? 0);
            const xPt = Number(image.x ?? 0);
            const yPt = Number(image.y ?? 0);
            const src = typeof image.src === 'string' ? image.src : '';
            if (!src || !Number.isFinite(wPt) || !Number.isFinite(hPt) || wPt <= 0 || hPt <= 0) {
              return null;
            }
            const widthPx = Math.max(8, wPt / localScales.x);
            const heightPx = Math.max(8, hPt / localScales.y);
            const xPx = xPt / localScales.x;
            const topPt = yPt + hPt;
            const yPx = templateForLayout.displayHeight - (topPt / localScales.y);

            return clampBox(
              {
                id: image.id ?? uid(),
                name: image.name ?? `image_${idx + 1}`,
                z: Number.isFinite(image.z) ? Number(image.z) : mappedFields.length + idx,
                x: xPx,
                y: yPx,
                w: widthPx,
                h: heightPx,
                src,
              },
              templateForLayout.displayWidth,
              templateForLayout.displayHeight
            );
          })
          .filter(Boolean)
      : [];

    const layoutState =
      payload.layout_state && typeof payload.layout_state === 'object'
        ? payload.layout_state
        : null;

    return { fields: mappedFields, images: mappedImages, layoutState };
  };

  return { getFieldValuePayload, buildDataPayload, buildPayload, payloadToLayout };
}
