import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PAGE_PRESETS } from '../constants/editorConstants';
import { readFileAsDataUrl } from './fileUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function loadTemplate(file, preset) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const pointsViewport = page.getViewport({ scale: 1.0 });
    const renderScale = 1.5;
    const renderViewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    return {
      src: canvas.toDataURL('image/png'),
      displayWidth: canvas.width,
      displayHeight: canvas.height,
      pageWidthPt: pointsViewport.width,
      pageHeightPt: pointsViewport.height,
      name: file.name,
    };
  }

  const imageUrl = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageUrl;
  });

  const presetInfo = PAGE_PRESETS[preset] || PAGE_PRESETS.letter;

  return {
    src: imageUrl,
    displayWidth: image.naturalWidth,
    displayHeight: image.naturalHeight,
    pageWidthPt: presetInfo.width,
    pageHeightPt: presetInfo.height,
    name: file.name,
  };
}
