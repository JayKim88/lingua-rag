// PDF library helpers — IndexedDB storage + localStorage metadata
// Kept in a separate file so page.tsx can import without pulling in react-pdf (SSR issue).

const IDB_NAME = "lingua-rag";
const IDB_STORE = "pdf-files";

export const LIBRARY_META_KEY = "lingua-pdf-library";
export const LIBRARY_CURRENT_KEY = "lingua-pdf-current";
export const LIBRARY_MAX = 10;

export interface PdfMeta { name: string; size: number; lastOpened: string; addedAt: number; serverId?: string }

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
  try {
    const raw: Array<{ name: string; size: number; lastOpened: string; addedAt?: number }> =
      JSON.parse(localStorage.getItem(LIBRARY_META_KEY) ?? "[]");
    // Backfill addedAt for entries saved before this field was added
    return raw.map((m, i) => ({
      name: m.name,
      size: m.size,
      lastOpened: m.lastOpened,
      addedAt: m.addedAt ?? new Date(m.lastOpened).getTime() - i,
    }));
  } catch { return []; }
}

export function upsertLibraryMeta(file: File): PdfMeta[] {
  const now = new Date().toISOString();
  const list = getLibraryMeta();
  const existing = list.find((m) => m.name === file.name);
  let updated: PdfMeta[];
  if (existing) {
    // Update lastOpened in-place; preserve insertion order, addedAt, and serverId
    updated = list.map((m) =>
      m.name === file.name ? { ...m, size: file.size, lastOpened: now } : m,
    );
  } else {
    // Append new entry at end to preserve registration order
    updated = [
      ...list,
      { name: file.name, size: file.size, lastOpened: now, addedAt: Date.now() },
    ].slice(0, LIBRARY_MAX);
  }
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}

export function setLibraryMetaServerId(name: string, serverId: string): void {
  const updated = getLibraryMeta().map((m) =>
    m.name === name ? { ...m, serverId } : m,
  );
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
}

export function removeLibraryMeta(name: string): PdfMeta[] {
  const updated = getLibraryMeta().filter((m) => m.name !== name);
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}
