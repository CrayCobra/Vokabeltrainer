import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  generateId,
  createEmptyDocument,
  createCard,
  applyCardEdit,
  applyLearningResult,
  recordSession,
  localDateIso,
  addCards,
  replaceCard,
  deleteCards,
  restoreCards,
  validateDocument,
  migrateDocument,
  mergeDocuments,
  findDuplicateFronts,
  ValidationError,
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
  try {
    createEmptyDocument({ deckName: '', langA: 'a', langB: 'b' });
    assert.fail('hätte werfen müssen');
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.i18nKey, 'errors.deckNameRequired');
  }
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
  assert.throws(() => validateDocument(doc), (err) => err.i18nKey === 'errors.duplicateId' && err.i18nParams.id === card.id);
});

test('migrateDocument verweigert neuere Schemaversionen', () => {
  assert.throws(
    () => migrateDocument({ schema: SCHEMA_VERSION + 1 }),
    (err) => err.i18nKey === 'errors.newerSchema' && err.i18nParams.schema === SCHEMA_VERSION + 1
  );
  assert.throws(() => migrateDocument({}), (err) => err.i18nKey === 'errors.unknownFormat');
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

test('applyLearningResult: richtige Antwort hebt den Kasten um eins, höchstens bis 5', () => {
  let card = createCard({ a: 'x', b: 'y' });
  for (const expectedBox of [2, 3, 4, 5, 5]) {
    card = applyLearningResult(card, true);
    assert.equal(card.box, expectedBox);
  }
  assert.equal(card.seen, 5);
  assert.equal(card.correct, 5);
  assert.equal(card.wrong, 0);
});

test('applyLearningResult: falsche Antwort setzt Kasten 1, Zähler 0 und legt in die Reparaturkiste', () => {
  let card = createCard({ a: 'x', b: 'y' });
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, true); // Kasten 3
  card = applyLearningResult(card, false);
  assert.equal(card.box, 1);
  assert.equal(card.streak, 0);
  assert.equal(card.repair, true);
  assert.equal(card.wrong, 1);
});

test('applyLearningResult: Reparaturkiste verlangt vier richtige Antworten in Folge und landet dann in Kasten 2', () => {
  let card = { ...createCard({ a: 'x', b: 'y' }), box: 1, repair: true, streak: 0 };
  card = applyLearningResult(card, true);
  assert.equal(card.repair, true, 'nach 1 von 4 noch in der Reparaturkiste');
  assert.equal(card.box, 1, 'Kasten bleibt während der Reparatur eingefroren');
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, true);
  assert.equal(card.repair, true, 'nach 3 von 4 noch in der Reparaturkiste');
  card = applyLearningResult(card, true);
  assert.equal(card.repair, false, 'nach 4 richtigen in Folge verlassen');
  assert.equal(card.box, 2, 'landet gezielt in Kasten 2, nicht durch Hochzählen');
});

test('applyLearningResult: ein einzelner Fehler in der Reparaturkiste setzt den Zähler zurück auf 0', () => {
  let card = { ...createCard({ a: 'x', b: 'y' }), box: 1, repair: true, streak: 0 };
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, false);
  assert.equal(card.streak, 0);
  assert.equal(card.repair, true);
  assert.equal(card.box, 1);
  // Muss danach wieder von vorn vier richtige in Folge sammeln.
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, true);
  card = applyLearningResult(card, true);
  assert.equal(card.repair, true);
  card = applyLearningResult(card, true);
  assert.equal(card.repair, false);
  assert.equal(card.box, 2);
});

test('localDateIso formatiert das lokale Kalenderdatum ohne UTC-Umrechnung', () => {
  const date = new Date(2026, 8, 14, 23, 30); // 14. September 2026, lokale Zeit
  assert.equal(localDateIso(date), '2026-09-14');
});

test('recordSession hängt eine Sitzung an und bucht sie auf den lokalen Starttag', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const localNow = new Date();
  const session = {
    date: localNow.toISOString(),
    mode: 'learn',
    order: 'random',
    direction: 'ab',
    correct: 8,
    wrong: 2,
    seconds: 120,
  };
  doc = recordSession(doc, session);
  assert.equal(doc.sessions.length, 1);
  assert.deepEqual(doc.sessions[0], session);
  const todayKey = localDateIso(localNow);
  assert.deepEqual(doc.days, [{ date: todayKey, correct: 8, wrong: 2, seconds: 120 }]);
});

test('recordSession bündelt mehrere Sitzungen desselben Tages in einem days-Eintrag', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const localNow = new Date();
  const makeSession = (correct, wrong, seconds) => ({
    date: localNow.toISOString(),
    mode: 'learn',
    order: 'random',
    direction: 'ab',
    correct,
    wrong,
    seconds,
  });
  doc = recordSession(doc, makeSession(5, 1, 60));
  doc = recordSession(doc, makeSession(3, 2, 90));
  assert.equal(doc.sessions.length, 2);
  assert.equal(doc.days.length, 1);
  assert.deepEqual(doc.days[0], { date: localDateIso(localNow), correct: 8, wrong: 3, seconds: 150 });
});
