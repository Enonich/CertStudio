export function cloneHistoryValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
