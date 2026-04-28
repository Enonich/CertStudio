import { useEditorStore } from '../store/useEditorStore';
import { getCanvasItemKey } from '../lib/canvasItems';

/**
 * Manages canvas layer z-ordering: sync, drag-reorder, and directional moves.
 *
 * @param {{ orderedCanvasItems: Array, selectedCanvasItems: Array }} deps
 */
export function useLayerOrder({ orderedCanvasItems, selectedCanvasItems }) {
  const { setFields, setImageItems } = useEditorStore();

  const syncLayerOrder = (nextOrderedItems) => {
    const zByKey = new Map(nextOrderedItems.map((item, index) => [getCanvasItemKey(item.kind, item.id), index]));
    setFields((prev) => prev.map((field) => ({ ...field, z: zByKey.get(getCanvasItemKey('field', field.id)) ?? field.z ?? 0 })));
    setImageItems((prev) => prev.map((image) => ({ ...image, z: zByKey.get(getCanvasItemKey('image', image.id)) ?? image.z ?? 0 })));
  };

  const reorderLayerByDrag = (fromDisplayIndex, toDisplayIndex) => {
    const displayItems = [...orderedCanvasItems].reverse();
    const [moved] = displayItems.splice(fromDisplayIndex, 1);
    displayItems.splice(toDisplayIndex, 0, moved);
    syncLayerOrder([...displayItems].reverse());
  };

  const reorderSelectionLayers = (direction) => {
    if (selectedCanvasItems.length === 0) return;
    const selectedKeys = new Set(selectedCanvasItems.map((item) => getCanvasItemKey(item.kind, item.id)));
    const nextOrder = [...orderedCanvasItems];

    if (direction === 'front') {
      const selected = nextOrder.filter((item) => selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      const unselected = nextOrder.filter((item) => !selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      syncLayerOrder([...unselected, ...selected]);
      return;
    }

    if (direction === 'back') {
      const selected = nextOrder.filter((item) => selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      const unselected = nextOrder.filter((item) => !selectedKeys.has(getCanvasItemKey(item.kind, item.id)));
      syncLayerOrder([...selected, ...unselected]);
      return;
    }

    if (direction === 'forward') {
      for (let index = nextOrder.length - 2; index >= 0; index -= 1) {
        const currentKey = getCanvasItemKey(nextOrder[index].kind, nextOrder[index].id);
        const nextKey = getCanvasItemKey(nextOrder[index + 1].kind, nextOrder[index + 1].id);
        if (selectedKeys.has(currentKey) && !selectedKeys.has(nextKey)) {
          [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
        }
      }
      syncLayerOrder(nextOrder);
      return;
    }

    if (direction === 'backward') {
      for (let index = 1; index < nextOrder.length; index += 1) {
        const currentKey = getCanvasItemKey(nextOrder[index].kind, nextOrder[index].id);
        const prevKey = getCanvasItemKey(nextOrder[index - 1].kind, nextOrder[index - 1].id);
        if (selectedKeys.has(currentKey) && !selectedKeys.has(prevKey)) {
          [nextOrder[index], nextOrder[index - 1]] = [nextOrder[index - 1], nextOrder[index]];
        }
      }
      syncLayerOrder(nextOrder);
    }
  };

  return { reorderLayerByDrag, reorderSelectionLayers };
}
