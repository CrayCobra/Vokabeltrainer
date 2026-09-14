import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  generateId,
  createEmptyDocument,
  createCard,
  applyCardEdit,
  addCards,
  replaceCard,
  deleteCards,
  restoreCards,
  validateDocument,
  migrateDocument,
  mergeDocuments,
  findDuplicateFronts,
} from '../src/js/model.js';

test('generateId liefert kurze, eindeutige Zufallsketten', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(generateId());
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[a-z0-9]{8}$/);
});

test('createEmptyDocument verlangt Stapelname und Sprachen', () => {
  assert.throws(() => createEmptyDocument({ deckName: '', langA: 'a', langB: 'b' }));
  assert.throws(() => createEmptyDocument({ deckName: 'x', langA: '', langB: 'b' }));
  const doc = createEmptyDocument({ deckName: 'Englisch 5', langA: 'Deutsch', langB: 'Englisch' });
  assert.equal(doc.schema, SCHEMA_VERSION);
  assert.deepEqual(doc.cards, []);
  assert.deepEqual(doc.days, []);
  assert.deepEqual(doc.sessions, []);
});

test('createCard und applyCardEdit', () => {
  // Fester, alter Zeitstempel statt nowIso(): eine Bearbeitung direkt nach dem Anlegen
  // kann sonst innerhalb derselben Millisekunde denselben ISO-Zeitstempel erhalten und
  // den Änderungsvergleich unten unzuverlässig (zeitabhängig) machen.
  const card = createCard({ a: 'Haus', b: 'house', changed: '2020-01-01T00:00:00.000Z' });
  assert.equal(card.box, 1);
  assert.equal(card.streak, 0);
  assert.equal(card.repair, false);
  assert.equal(card.marked, false);

  const edited = applyCardEdit(card, { marked: true });
  assert.equal(edited.marked, true);
  assert.notEqual(edited.changed, card.changed);

  const unchanged = applyCardEdit(card, { a: card.a });
  assert.equal(unchanged.changed, card.changed, 'ohne echte Änderung bleibt der Zeitstempel gleich');
});

test('createCard erlaubt eine leere Rückseite', () => {
  const card = createCard({ a: 'Wort', b: '' });
  assert.equal(card.b, '');
});

test('addCards, replaceCard, deleteCards, restoreCards', () => {
  let doc = createEmptyDocument({ deckName: 'Test', langA: 'de', langB: 'en' });
  const c1 = createCard({ a: 'eins', b: 'one' });
  const c2 = createCard({ a: 'zwei', b: 'two' });
  const c3 = createCard({ a: 'drei', b: 'three' });
  doc = addCards(doc, [c1, c2, c3]);
  assert.equal(doc.cards.length, 3);

  const updated = applyCardEdit(c2, { b: 'TWO' });
  doc = replaceCard(doc, updated);
  assert.equal(doc.cards[1].b, 'TWO');

  const { doc: afterDelete, removed } = deleteCards(doc, [c1.id, c3.id]);
  assert.equal(afterDelete.cards.length, 1);
  assert.equal(afterDelete.cards[0].id, c2.id);
  assert.equal(removed.length, 2);

  const restored = restoreCards(afterDelete, removed);
  assert.equal(restored.cards.length, 3);
  // Ursprüngliche Reihenfolge (c1, c2, c3) muss wiederhergestellt sein.
  assert.deepEqual(
    restored.cards.map((c) => c.id),
    [c1.id, c2.id, c3.id]
  );
});

test('validateDocument erkennt beschädigte Dokumente', () => {
  assert.throws(() => validateDocument(null));
  assert.throws(() => validateDocument({}));
  assert.throws(() => validateDocument({ schema: 1, deck: {}, cards: [] }));
  assert.throws(() =>
    validateDocument({ schema: 1, deck: { name: 'x', langA: 'a', langB: 'b' }, cards: [{ id: '1' }], days: [], sessions: [] })
  );
  const doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  assert.equal(validateDocument(doc), doc);
});

test('validateDocument verweigert doppelte Karten-IDs', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const card = createCard({ a: 'a', b: 'b' });
  doc = addCards(doc, [card, { ...card }]);
  assert.throws(() => validateDocument(doc), /mehrfach/);
});

test('migrateDocument verweigert neuere Schemaversionen', () => {
  assert.throws(() => migrateDocument({ schema: SCHEMA_VERSION + 1 }), /neueren Version/);
  assert.throws(() => migrateDocument({}), /Unbekanntes Dateiformat/);
});

test('mergeDocuments: jüngerer Änderungsstempel gewinnt bei gleicher Karten-ID', () => {
  let a = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  const card = createCard({ a: 'Baum', b: 'tree', changed: '2026-01-01T00:00:00.000Z' });
  a = addCards(a, [card]);

  let b = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  const newerCard = { ...card, b: 'TREE', changed: '2026-02-01T00:00:00.000Z' };
  b = addCards(b, [newerCard]);

  const merged = mergeDocuments(a, b);
  assert.equal(merged.cards.length, 1);
  assert.equal(merged.cards[0].b, 'TREE');

  // Umgekehrte Richtung: älterer eingehender Stand darf den neueren nicht verdrängen.
  const mergedReverse = mergeDocuments(b, a);
  assert.equal(mergedReverse.cards[0].b, 'TREE');
});

test('mergeDocuments fügt neue Karten aus beiden Seiten zusammen', () => {
  let a = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  a = addCards(a, [createCard({ a: 'eins', b: 'one' })]);
  let b = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  b = addCards(b, [createCard({ a: 'zwei', b: 'two' })]);
  const merged = mergeDocuments(a, b);
  assert.equal(merged.cards.length, 2);
});

test('findDuplicateFronts erkennt gleiche Vorderseiten', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  doc = addCards(doc, [createCard({ a: 'Apfel', b: 'apple' })]);
  const duplicates = findDuplicateFronts(doc, [{ a: 'Apfel', b: 'apple (neu)' }, { a: 'Birne', b: 'pear' }]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].existing.a, 'Apfel');
});
