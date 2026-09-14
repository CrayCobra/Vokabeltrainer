// Speicherschicht hinter einer schmalen Schnittstelle: laden, speichern, Statusinformationen.
// createIndexedDbAdapter() ist die Browser-Implementierung; createRepository() enthält die
// adapterunabhängige Logik (Leerzustand erkennen, dauerhaften Speicher anfordern) und ist
// dadurch ohne echten Browser testbar, wenn ein anderer Adapter injiziert wird.

const DB_NAME = 'vokabeltrainer';
const DB_VERSION = 1;
const STORE_NAME = 'document';
const DOCUMENT_KEY = 'main';
const RAN_BEFORE_KEY = 'vokabeltrainer.ranBefore';

export function createIndexedDbAdapter(idbFactory = globalThis.indexedDB) {
  if (!idbFactory) throw new Error('IndexedDB steht in dieser Umgebung nicht zur Verfügung.');

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = idbFactory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async getDocument() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(DOCUMENT_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async putDocument(doc) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(doc, DOCUMENT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async requestPersist() {
      if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return false;
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    },
  };
}

// localStorage merkt sich nur, ob die App schon einmal erfolgreich Daten gespeichert hat,
// damit ein leerer Speicher beim Start von einem echten Erststart unterschieden werden kann.
function createRanBeforeFlag(store = globalThis.localStorage) {
  return {
    get() {
      if (!store) return false;
      try {
        return store.getItem(RAN_BEFORE_KEY) === '1';
      } catch {
        return false;
      }
    },
    set() {
      if (!store) return;
      try {
        store.setItem(RAN_BEFORE_KEY, '1');
      } catch {
        // Kleinigkeit; falls localStorage nicht verfügbar ist, wird nur die Erklärung beim
        // leeren Start seltener korrekt zwischen Erststart und geräumtem Speicher unterscheiden.
      }
    },
  };
}

export function createRepository(adapter, { flagStore = globalThis.localStorage } = {}) {
  const ranBefore = createRanBeforeFlag(flagStore);

  return {
    // Liefert { doc: null, emptyReason: 'first-run' | 'storage-cleared' } oder { doc, emptyReason: null }.
    async load() {
      const doc = await adapter.getDocument();
      if (doc) return { doc, emptyReason: null };
      return { doc: null, emptyReason: ranBefore.get() ? 'storage-cleared' : 'first-run' };
    },
    async save(doc) {
      await adapter.putDocument(doc);
      ranBefore.set();
    },
    async requestPersistence() {
      if (typeof adapter.requestPersist === 'function') return adapter.requestPersist();
      return false;
    },
  };
}
