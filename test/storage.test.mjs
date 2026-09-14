// Testet die adapterunabhängige Repository-Logik aus src/js/storage.js mit einem
// einfachen Speicher-Double. Der echte IndexedDB-Adapter (createIndexedDbAdapter) läuft
// nur im Browser und wird über die manuelle Prüfliste in TESTPLAN.md abgedeckt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../src/js/storage.js';

function createMemoryAdapter() {
  let stored;
  return {
    async getDocument() {
      return stored;
    },
    async putDocument(doc) {
      stored = doc;
    },
    async requestPersist() {
      return true;
    },
  };
}

function createMemoryFlagStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test('load meldet first-run, solange nie gespeichert wurde', async () => {
  const repo = createRepository(createMemoryAdapter(), { flagStore: createMemoryFlagStore() });
  const result = await repo.load();
  assert.equal(result.doc, null);
  assert.equal(result.emptyReason, 'first-run');
});

test('load meldet storage-cleared, wenn schon einmal gespeichert wurde, jetzt aber nichts da ist', async () => {
  const flagStore = createMemoryFlagStore();
  const adapter = createMemoryAdapter();
  const repo = createRepository(adapter, { flagStore });
  await repo.save({ schema: 1, cards: [] });
  // Simuliert einen vom Browser geräumten Speicher: das Dokument verschwindet, das
  // localStorage-Flag (klein, wird laut CLAUDE.md separat behandelt) bleibt bestehen.
  adapter.getDocument = async () => undefined;

  const result = await repo.load();
  assert.equal(result.doc, null);
  assert.equal(result.emptyReason, 'storage-cleared');
});

test('save liefert das Dokument bei load unverändert zurück', async () => {
  const repo = createRepository(createMemoryAdapter(), { flagStore: createMemoryFlagStore() });
  const doc = { schema: 1, cards: [{ id: 'x' }] };
  await repo.save(doc);
  const result = await repo.load();
  assert.deepEqual(result.doc, doc);
  assert.equal(result.emptyReason, null);
});
