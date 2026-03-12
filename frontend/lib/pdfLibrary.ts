// PDF library helpers — IndexedDB storage + localStorage metadata
// Kept in a separate file so page.tsx can import without pulling in react-pdf (SSR issue).

const IDB_NAME = "lingua-rag";
const IDB_STORE = "pdf-files";

export const LIBRARY_META_KEY = "lingua-pdf-library";
export const LIBRARY_CURRENT_KEY = "lingua-pdf-current"; // stores chatId
export const LIBRARY_MAX = 10;

export type IndexStatus = "pending" | "indexing" | "ready" | "failed";
export interface PdfMeta { name: string; size: number; lastOpened: string; addedAt: number; pdfServerId?: string; indexStatus?: IndexStatus; chatId?: string; folderId?: string | null }

// Generate a short random ID (nanoid-style, 21 chars)
export function generateChatId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(arr, (v) => chars[v % chars.length]).join("");
}

export function findMetaByChatId(chatId: string): PdfMeta | undefined {
  return getLibraryMeta().find((m) => m.chatId === chatId);
}

// ---------------------------------------------------------------------------
// IndexedDB helpers — keyed by chatId (unique per upload)
// ---------------------------------------------------------------------------
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfToLibrary(file: File, chatId: string): Promise<void> {
  const data = await file.arrayBuffer();
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ name: file.name, type: file.type, data }, chatId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfFromLibrary(chatId: string): Promise<File | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(chatId);
      req.onsuccess = () => {
        const stored = req.result;
        if (!stored) { resolve(null); return; }
        resolve(new File([stored.data], stored.name, { type: stored.type }));
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// Migration helper: try loading by old name-based key, re-save under chatId
export async function migratePdfKey(name: string, chatId: string): Promise<File | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(name);
      req.onsuccess = () => {
        const stored = req.result;
        if (!stored) { resolve(null); return; }
        // Re-save under chatId key and delete old name key
        store.put(stored, chatId);
        store.delete(name);
        resolve(new File([stored.data], stored.name, { type: stored.type }));
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function deletePdfFromLibrary(chatId: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(chatId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// localStorage metadata helpers — keyed by chatId
// ---------------------------------------------------------------------------
export function getLibraryMeta(): PdfMeta[] {
  try {
    const raw: PdfMeta[] = JSON.parse(localStorage.getItem(LIBRARY_META_KEY) ?? "[]");
    // Backfill chatId and addedAt for legacy entries; deduplicate by chatId
    let needsPersist = false;
    const withChatId = raw.map((m, i) => {
      const entry = {
        ...m,
        addedAt: m.addedAt ?? new Date(m.lastOpened).getTime() - i,
      };
      if (!entry.chatId) {
        entry.chatId = generateChatId();
        needsPersist = true;
      }
      return entry;
    });
    // Deduplicate by chatId
    const seen = new Set<string>();
    const deduped = withChatId.filter((m) => {
      if (seen.has(m.chatId!)) return false;
      seen.add(m.chatId!);
      return true;
    });
    if (needsPersist || deduped.length !== raw.length) {
      localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(deduped));
    }
    return deduped;
  } catch { return []; }
}

export function upsertLibraryMeta(file: File, chatId: string): PdfMeta[] {
  const now = new Date().toISOString();
  const list = getLibraryMeta();
  const existing = list.find((m) => m.chatId === chatId);
  let updated: PdfMeta[];
  if (existing) {
    // Update lastOpened in-place; preserve insertion order, addedAt, pdfServerId
    updated = list.map((m) =>
      m.chatId === chatId ? { ...m, name: file.name, size: file.size, lastOpened: now } : m,
    );
  } else {
    // Append new entry at end to preserve registration order
    updated = [
      ...list,
      { name: file.name, size: file.size, lastOpened: now, addedAt: Date.now(), chatId },
    ].slice(0, LIBRARY_MAX);
  }
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}

export function setLibraryMetaPdfServerId(chatId: string, pdfServerId: string): void {
  const updated = getLibraryMeta().map((m) =>
    m.chatId === chatId ? { ...m, pdfServerId } : m,
  );
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
}

export function updateLibraryIndexStatus(chatId: string, indexStatus: IndexStatus): void {
  const updated = getLibraryMeta().map((m) =>
    m.chatId === chatId ? { ...m, indexStatus } : m,
  );
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
}

export function setLibraryMetaFolderId(chatId: string, folderId: string | null): void {
  const updated = getLibraryMeta().map((m) =>
    m.chatId === chatId ? { ...m, folderId } : m,
  );
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
}

export function removeLibraryMeta(chatId: string): PdfMeta[] {
  const updated = getLibraryMeta().filter((m) => m.chatId !== chatId);
  localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(updated));
  return updated;
}

// ---------------------------------------------------------------------------
// sessionStorage helpers — per-tab guest PDF management
// Each browser tab gets its own independent PDF list (ChatPDF-style).
// ---------------------------------------------------------------------------
const SESSION_META_KEY = "guest-tab-pdfs";

export function getSessionMeta(): PdfMeta[] {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_META_KEY) ?? "[]");
  } catch { return []; }
}

export function findSessionMetaByChatId(chatId: string): PdfMeta | undefined {
  return getSessionMeta().find((m) => m.chatId === chatId);
}

export function upsertSessionMeta(file: File, chatId: string): void {
  const list = getSessionMeta();
  const now = new Date().toISOString();
  const existing = list.find((m) => m.chatId === chatId);
  if (existing) {
    existing.lastOpened = now;
  } else {
    list.push({ name: file.name, size: file.size, lastOpened: now, addedAt: Date.now(), chatId });
  }
  sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(list));
}

export function setSessionMetaPdfServerId(chatId: string, pdfServerId: string): void {
  const updated = getSessionMeta().map((m) =>
    m.chatId === chatId ? { ...m, pdfServerId } : m,
  );
  sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(updated));
}
