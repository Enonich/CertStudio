/**
 * Walk the text nodes of `root` and return the total character offset of
 * `node` at `nodeOffset` relative to the start of `root`'s text content.
 * Used to snapshot a DOM Range position so it can be restored after the
 * element's innerHTML is replaced (e.g. when contentEditable is toggled).
 */
export function getCaretOffset(root, node, nodeOffset) {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current;
  while ((current = walker.nextNode())) {
    if (current === node) return count + nodeOffset;
    count += current.textContent.length;
  }
  return count;
}

/**
 * Reconstruct a DOM Range from character offsets `start` / `end` inside
 * `root`. Returns null when the offsets exceed the available text content.
 */
export function createRangeFromOffset(root, start, end) {
  const range = document.createRange();
  let chars = 0;
  let startNode = null;
  let endNode = null;
  let startOff = 0;
  let endOff = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current;
  while ((current = walker.nextNode())) {
    const len = current.textContent.length;
    if (startNode === null && chars + len >= start) {
      startNode = current;
      startOff = start - chars;
    }
    if (endNode === null && chars + len >= end) {
      endNode = current;
      endOff = end - chars;
      break;
    }
    chars += len;
  }
  if (startNode && endNode) {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range;
  }
  return null;
}
