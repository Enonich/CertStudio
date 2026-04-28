/**
 * Shared canvas item utilities used by App.jsx and extracted hooks.
 */

export const getCanvasItemKey = (kind, id) => `${kind}:${id}`;

export const getOrderedCanvasItems = (fields, imageItems) => {
  const fieldCount = Array.isArray(fields) ? fields.length : 0;
  return [
    ...(Array.isArray(fields)
      ? fields.map((field, index) => ({
          kind: 'field',
          ...field,
          z: Number.isFinite(field.z) ? Number(field.z) : index,
        }))
      : []),
    ...(Array.isArray(imageItems)
      ? imageItems.map((image, index) => ({
          kind: 'image',
          ...image,
          z: Number.isFinite(image.z) ? Number(image.z) : fieldCount + index,
        }))
      : []),
  ]
    .sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, z: index }));
};

export const getNextLayerZ = (fields, imageItems) => getOrderedCanvasItems(fields, imageItems).length;
