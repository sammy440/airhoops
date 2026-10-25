import type { Recording } from "./recording";

/**
 * Recordings live in IndexedDB (not localStorage) because a session of 40+
 * clips can exceed localStorage's ~5 MB quota.
 */
const DB_NAME = "airhoops";
const STORE = "recordings";

let dbPromise: Promise<IDBDatabase> | null = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listRecordings(): Promise<Recording[]> {
  const all = await tx<Recording[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const saveRecording = (r: Recording) => tx("readwrite", (s) => s.put(r));
export const deleteRecording = (id: string) => tx("readwrite", (s) => s.delete(id));
export const clearRecordings = () => tx("readwrite", (s) => s.clear());
