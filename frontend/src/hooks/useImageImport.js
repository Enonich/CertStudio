import { useEditorStore } from '../store/useEditorStore';
import { clampBox } from '../lib/geometryUtils';
import { uid } from '../lib/historyUtils';
import { getNextLayerZ } from '../lib/canvasItems';

/**
 * Handles importing image elements onto the canvas.
 *
 * @param {{ commitActiveEditingDraft: Function, setStatus: Function }} deps
 */
export function useImageImport({ commitActiveEditingDraft, setStatus }) {
  const {
    template, fields, imageItems,
    setImageItems,
    setSelectedFieldIds, setSelectedImageIds,
    setActiveImageId, setActiveFieldId,
    setIsEditingText,
  } = useEditorStore();

  const readImageAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });

  const getImageNaturalSize = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Failed to load image.'));
      image.src = src;
    });

  const importImageElement = async (event) => {
    if (!template) {
      setStatus('Please open a certificate template before adding images.');
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const src = await readImageAsDataUrl(file);
      const natural = await getImageNaturalSize(src);
      const maxPreviewWidth = Math.min(260, template.displayWidth * 0.4);
      const maxPreviewHeight = Math.min(120, template.displayHeight * 0.25);
      const scale = Math.min(
        1,
        maxPreviewWidth / Math.max(1, natural.width),
        maxPreviewHeight / Math.max(1, natural.height)
      );

      const nextImage = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '') || `image_${imageItems.length + 1}`,
        x: 24,
        y: 24,
        w: Math.max(16, natural.width * scale),
        h: Math.max(16, natural.height * scale),
        src,
        z: getNextLayerZ(fields, imageItems),
      };

      setImageItems((prev) => [
        ...prev,
        clampBox(nextImage, template.displayWidth, template.displayHeight),
      ]);
      commitActiveEditingDraft();
      setSelectedFieldIds([]);
      setSelectedImageIds([nextImage.id]);
      setActiveImageId(nextImage.id);
      setActiveFieldId(null);
      setIsEditingText(false);
      setStatus(`Image added: ${file.name}`);
    } catch (error) {
      setStatus('Could not add the image — please try again.');
    } finally {
      event.target.value = '';
    }
  };

  return { importImageElement };
}
