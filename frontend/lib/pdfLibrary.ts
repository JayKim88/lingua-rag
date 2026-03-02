// PDF library helpers — IndexedDB storage + localStorage metadata
// Kept in a separate file so page.tsx can import without pulling in react-pdf (SSR issue).

const IDB_NAME = "lingua-rag";
const IDB_STORE = "pdf-files";

export const LIBRARY_META_KEY = "lingua-pdf-library";
export const LIBRARY_CURRENT_KEY = "lingua-pdf-current";
export const LIBRARY_MAX = 10;

export interface PdfMeta { name: string; size: number; lastOpened: string }

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfToLibrary(file: File): Promise<void> {
  const data = await file.arrayBuffer();
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ name: file.name, type: file.type, data }, file.name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfFromLibrary(name: string): Promise<File | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(name);
      req.onsuccess = () => {
        const stored = req.result;
        if (!stored) { resolve(null); return; }
        resolve(new File([stored.data], stored.name, { type: stored.type }));
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function deletePdfFromLibrary(name: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// localStorage metadata helpers
// ---------------------------------------------------------------------------
export function getLibraryMeta(): PdfMeta[] {
  try { return JSON.parse(localStorage.getItem(LIBRARY_META_KEY) ?? "[]"); }
  catch { return []; }
}

export function upsertLibraryMeta(file: File): PdfMeta[] {
  const list = getLibraryMeta().filter((m) => m.name !== file.name);
  const updated = [
    { name: file.name, size: file.size, lastOpened: new Date().toISOString() },
    ...list,
  ].slice(0, LIBRARY_MAX);
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}

export function removeLibraryMeta(name: string): PdfMeta[] {
  const updated = getLibraryMeta().filter((m) => m.name !== name);
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}
