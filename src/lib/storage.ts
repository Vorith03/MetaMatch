import type { AppState } from "../types";

const DATABASE = "metamatch";
const STORE = "state";
const KEY = "main";
const FALLBACK_KEY = "metamatch-state";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(seed: AppState): Promise<AppState> {
  try {
    const database = await openDatabase();
    const stored = await new Promise<AppState | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as AppState | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return stored?.version === 1 ? stored : structuredClone(seed);
  } catch {
    const stored = localStorage.getItem(FALLBACK_KEY);
    return stored ? (JSON.parse(stored) as AppState) : structuredClone(seed);
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(state, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `metamatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importState(file: File): Promise<AppState> {
  const candidate = JSON.parse(await file.text()) as Partial<AppState>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.games) ||
    !candidate.model ||
    !Array.isArray(candidate.comparisons)
  ) {
    throw new Error("That file is not a MetaMatch v1 backup.");
  }
  return candidate as AppState;
}
