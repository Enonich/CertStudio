const PROJECT_HANDLE_DB_NAME = 'template-mapper-project-db';
const PROJECT_HANDLE_STORE_NAME = 'project-handles';
const PROJECT_HANDLE_KEY = 'current-project-file';

export function normalizeProjectFilename(rawName) {
  const value = typeof rawName === 'string' ? rawName.trim() : '';
  const lowered = value.toLowerCase();
  const fallback = 'certificate-project';
  const baseCandidate =
    !value || lowered === 'undefined' || lowered === 'null' || lowered === 'nan'
      ? fallback
      : value.replace(/\.json$/i, '');
  const sanitized = baseCandidate
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/g, '')
    .trim();
  const base = sanitized || fallback;
  return `${base}.json`;
}

export function canUseSavePicker() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.showSaveFilePicker === 'function'
  );
}

function runIndexedDbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function openProjectHandleDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(PROJECT_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_HANDLE_STORE_NAME)) {
        db.createObjectStore(PROJECT_HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

export async function getStoredProjectFileHandle() {
  const db = await openProjectHandleDb();
  if (!db) {
    return null;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    return (await runIndexedDbRequest(store.get(PROJECT_HANDLE_KEY))) || null;
  } finally {
    db.close();
  }
}

export async function setStoredProjectFileHandle(handle) {
  const db = await openProjectHandleDb();
  if (!db) {
    return;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    await runIndexedDbRequest(store.put(handle, PROJECT_HANDLE_KEY));
  } finally {
    db.close();
  }
}

export async function clearStoredProjectFileHandle() {
  const db = await openProjectHandleDb();
  if (!db) {
    return;
  }
  try {
    const transaction = db.transaction(PROJECT_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_HANDLE_STORE_NAME);
    await runIndexedDbRequest(store.delete(PROJECT_HANDLE_KEY));
  } finally {
    db.close();
  }
}
