// Rep clips kept on this device only (IndexedDB), so a patient can rewatch
// their own reps in history without uploading video. Every call fails soft:
// private windows or blocked storage just mean no local clips.
// ponytail: keeps the newest MAX_CLIPS; a size budget could replace the count.

const DB = "physiotrace-clips";
const STORE = "clips";
const MAX_CLIPS = 60;

type Stored = { id: string; blob: Blob; created: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function saveLocalClip(id: string, blob: Blob): Promise<void> {
  try {
    await run("readwrite", (s) =>
      s.put({ id, blob, created: Date.now() } satisfies Stored),
    );
    const all = await run<Stored[]>("readonly", (s) => s.getAll());
    const old = all
      .sort((a, b) => b.created - a.created)
      .slice(MAX_CLIPS)
      .map((c) => c.id);
    for (const key of old) await run("readwrite", (s) => s.delete(key));
  } catch {
    /* Storage unavailable: the clip simply is not kept. */
  }
}

export async function getLocalClip(id: string): Promise<Blob | undefined> {
  try {
    const row = await run<Stored | undefined>("readonly", (s) => s.get(id));
    return row?.blob;
  } catch {
    return undefined;
  }
}

export async function localClipIds(): Promise<Set<string>> {
  try {
    const keys = await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return new Set(keys.map(String));
  } catch {
    return new Set();
  }
}

export async function deleteLocalClips(ids: Iterable<string>): Promise<void> {
  try {
    for (const id of ids) await run("readwrite", (s) => s.delete(id));
  } catch {
    /* Nothing stored, or storage unavailable. */
  }
}
