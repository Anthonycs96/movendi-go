export type PendingOperation = { key: string; signature: string; path: string; method: string; body: Record<string, unknown>; createdAt: string };
let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("movendi-retail-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(new Error("No se pudo abrir el almacenamiento de recuperación. Habilítalo antes de cobrar.")); };
  });
  return connection;
}
export async function localRead<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction("state").objectStore("state").get(key); request.onsuccess = () => resolve(request.result as T | undefined); request.onerror = () => reject(request.error); });
}
export async function localWrite(key: string, value: unknown) {
  const db = await database();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction("state", "readwrite"); const store = tx.objectStore("state"); if (value === undefined) store.delete(key); else store.put(value, key); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
}
/** Atomic claim serializes tabs; a different unresolved intention cannot replace the first. */
export async function claimOperation(scope: string, proposed: PendingOperation) {
  const db = await database();
  return new Promise<PendingOperation>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"), store = tx.objectStore("state"); let chosen = proposed;
    const request = store.get(`pending:${scope}`);
    request.onsuccess = () => { const existing = request.result as PendingOperation | undefined; if (existing && existing.signature !== proposed.signature) { tx.abort(); return; } chosen = existing ?? proposed; store.put(chosen, `pending:${scope}`); };
    tx.oncomplete = () => resolve(chosen); tx.onabort = tx.onerror = () => reject(new Error("Existe una operación pendiente. Recupera su resultado antes de guardar otra."));
  });
}
export async function completeOperation(scope: string, key: string, sale: boolean) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"), store = tx.objectStore("state"); const request = store.get(`pending:${scope}`);
    request.onsuccess = () => { if ((request.result as PendingOperation | undefined)?.key === key) { store.delete(`pending:${scope}`); if (sale) store.delete(`cart:${scope}`); } };
    tx.oncomplete = () => { if (sale && typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("movendi-retail"); channel.postMessage({ type: "sale-complete", scope }); channel.close(); } resolve(); }; tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
