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
  createDeck,
  addDeck,
  applyDeckEdit,
  replaceDeck,
  deleteDeck,
  restoreDeck,
  getActiveDeck,
  setActiveDeck,
  validateDocument,
  migrateDocument,
  mergeDocuments,
  findDuplicateFronts,
  ValidationError,
} from '../src/js/model.js';

// Kürzel für Tests, die eine Karte im aktiven Stapel eines frischen Dokuments brauchen.
function docWithCard(a = 'eins', b = 'one') {
  let doc = createEmptyDocument({ deckName: 'Test', langA: 'de', langB: 'en' });
  const card = createCard({ a, b, deckId: getActiveDeck(doc).id });
  doc = addCards(doc, [card]);
  return { doc, card };
}

test('generateId liefert kurze, eindeutige Zufallsketten', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(generateId());
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[a-z0-9]{8}$/);
});

test('createEmptyDocument verlangt Stapelname und Sprachen und legt den ersten Stapel als aktiv an', () => {
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
  assert.equal(doc.decks.length, 1);
  assert.equal(doc.decks[0].name, 'Englisch 5');
  assert.equal(doc.profile.activeDeckId, doc.decks[0].id);
  assert.deepEqual(doc.cards, []);
  assert.deepEqual(doc.days, []);
  assert.deepEqual(doc.sessions, []);
});

test('createCard und applyCardEdit', () => {
  const { doc } = docWithCard();
  const deckId = getActiveDeck(doc).id;
  // Fester, alter Zeitstempel statt nowIso(): eine Bearbeitung direkt nach dem Anlegen
  // kann sonst innerhalb derselben Millisekunde denselben ISO-Zeitstempel erhalten und
  // den Änderungsvergleich unten unzuverlässig (zeitabhängig) machen.
  const card = createCard({ a: 'Haus', b: 'house', deckId, changed: '2020-01-01T00:00:00.000Z' });
  assert.equal(card.deckId, deckId);
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

test('createCard erlaubt eine leere Rückseite, verlangt aber deckId', () => {
  const { doc } = docWithCard();
  const deckId = getActiveDeck(doc).id;
  const card = createCard({ a: 'Wort', b: '', deckId });
  assert.equal(card.b, '');
  assert.throws(() => createCard({ a: 'Wort', b: 'word' }), (err) => err.i18nKey === 'errors.cardDeckRequired');
});

test('addCards, replaceCard, deleteCards, restoreCards', () => {
  let doc = createEmptyDocument({ deckName: 'Test', langA: 'de', langB: 'en' });
  const deckId = getActiveDeck(doc).id;
  const c1 = createCard({ a: 'eins', b: 'one', deckId });
  const c2 = createCard({ a: 'zwei', b: 'two', deckId });
  const c3 = createCard({ a: 'drei', b: 'three', deckId });
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

test('createDeck verlangt Name und Sprachen, addDeck/applyDeckEdit/replaceDeck', () => {
  assert.throws(() => createDeck({ name: '', langA: 'a', langB: 'b' }), (err) => err.i18nKey === 'errors.deckNameRequired');
  assert.throws(() => createDeck({ name: 'x', langA: '', langB: 'b' }), (err) => err.i18nKey === 'errors.langARequired');

  let doc = createEmptyDocument({ deckName: 'Englisch', langA: 'de', langB: 'en' });
  // Fester, alter Zeitstempel statt nowIso(): applyDeckEdit direkt danach kann sonst
  // innerhalb derselben Millisekunde denselben ISO-Zeitstempel erhalten (siehe gleiches
  // Muster bei createCard/applyCardEdit oben).
  const french = createDeck({ name: 'Französisch', langA: 'de', langB: 'fr', changed: '2020-01-01T00:00:00.000Z' });
  doc = addDeck(doc, french);
  assert.equal(doc.decks.length, 2);

  const renamed = applyDeckEdit(french, { name: 'Français' });
  assert.equal(renamed.name, 'Français');
  assert.notEqual(renamed.changed, french.changed);
  doc = replaceDeck(doc, renamed);
  assert.equal(doc.decks[1].name, 'Français');
});

test('getActiveDeck/setActiveDeck', () => {
  let doc = createEmptyDocument({ deckName: 'Englisch', langA: 'de', langB: 'en' });
  const firstId = getActiveDeck(doc).id;
  const french = createDeck({ name: 'Französisch', langA: 'de', langB: 'fr' });
  doc = addDeck(doc, french);
  assert.equal(getActiveDeck(doc).id, firstId, 'neu angelegter Stapel wird nicht automatisch aktiv');

  doc = setActiveDeck(doc, french.id);
  assert.equal(getActiveDeck(doc).id, french.id);

  const unchanged = setActiveDeck(doc, 'unbekannt');
  assert.equal(getActiveDeck(unchanged).id, french.id, 'unbekannte deckId ändert nichts');
});

test('deleteDeck entfernt kaskadierend die Karten des Stapels und restoreDeck macht es rückgängig', () => {
  let doc = createEmptyDocument({ deckName: 'Englisch', langA: 'de', langB: 'en' });
  const englishId = getActiveDeck(doc).id;
  const french = createDeck({ name: 'Französisch', langA: 'de', langB: 'fr' });
  doc = addDeck(doc, french);
  doc = addCards(doc, [
    createCard({ a: 'Haus', b: 'house', deckId: englishId }),
    createCard({ a: 'maison', b: 'Haus', deckId: french.id }),
  ]);
  doc = setActiveDeck(doc, french.id);

  const result = deleteDeck(doc, french.id);
  assert.equal(result.doc.decks.length, 1);
  assert.equal(result.doc.cards.length, 1);
  assert.equal(result.doc.cards[0].deckId, englishId);
  assert.equal(result.doc.profile.activeDeckId, englishId, 'aktiver Stapel wechselt, wenn er selbst gelöscht wurde');

  const restored = restoreDeck(result.doc, result);
  assert.equal(restored.decks.length, 2);
  assert.equal(restored.cards.length, 2);
  assert.deepEqual(
    restored.decks.map((d) => d.id),
    doc.decks.map((d) => d.id)
  );
});

test('deleteDeck verweigert das Löschen des letzten Stapels', () => {
  const doc = createEmptyDocument({ deckName: 'Englisch', langA: 'de', langB: 'en' });
  assert.throws(() => deleteDeck(doc, getActiveDeck(doc).id), (err) => err.i18nKey === 'errors.lastDeckRequired');
});

test('validateDocument erkennt beschädigte Dokumente', () => {
  assert.throws(() => validateDocument(null));
  assert.throws(() => validateDocument({}));
  assert.throws(() => validateDocument({ schema: 2, decks: [], cards: [] }));
  assert.throws(() =>
    validateDocument({
      schema: 2,
      decks: [{ id: 'd1', name: 'x', langA: 'a', langB: 'b' }],
      profile: { activeDeckId: 'd1' },
      cards: [{ id: '1', deckId: 'd1' }],
      days: [],
      sessions: [],
    })
  );
  const doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  assert.equal(validateDocument(doc), doc);
});

test('validateDocument verweigert doppelte Karten-IDs und Karten mit unbekanntem Stapel', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const deckId = getActiveDeck(doc).id;
  const card = createCard({ a: 'a', b: 'b', deckId });
  doc = addCards(doc, [card, { ...card }]);
  assert.throws(() => validateDocument(doc), (err) => err.i18nKey === 'errors.duplicateId' && err.i18nParams.id === card.id);

  let doc2 = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  doc2 = addCards(doc2, [createCard({ a: 'a', b: 'b', deckId: 'unbekannt' })]);
  assert.throws(() => validateDocument(doc2), (err) => err.i18nKey === 'errors.corruptCard');
});

test('migrateDocument verweigert neuere Schemaversionen und hebt Schema 1 auf Schema 2 an', () => {
  assert.throws(
    () => migrateDocument({ schema: SCHEMA_VERSION + 1 }),
    (err) => err.i18nKey === 'errors.newerSchema' && err.i18nParams.schema === SCHEMA_VERSION + 1
  );
  assert.throws(() => migrateDocument({}), (err) => err.i18nKey === 'errors.unknownFormat');

  const v1 = {
    schema: 1,
    meta: { app: '0.1.0', created: '2020-01-01T00:00:00.000Z', lastBackup: null },
    profile: { name: 'Kind', uiLang: 'de' },
    deck: { name: 'Englisch', langA: 'Deutsch', langB: 'Englisch' },
    cards: [
      { id: 'c1', a: 'Haus', b: 'house', box: 2, streak: 1, repair: false, marked: false, seen: 1, correct: 1, wrong: 0, lastSeen: null, changed: '2020-01-01T00:00:00.000Z' },
    ],
    days: [{ date: '2020-01-01', correct: 1, wrong: 0, seconds: 30 }],
    sessions: [{ date: '2020-01-01T00:00:00.000Z', mode: 'learn', order: 'random', direction: 'ab', correct: 1, wrong: 0, seconds: 30 }],
  };
  const migrated = migrateDocument(v1);
  assert.equal(migrated.schema, 2);
  assert.equal(migrated.decks.length, 1);
  assert.equal(migrated.decks[0].name, 'Englisch');
  assert.equal(migrated.profile.activeDeckId, migrated.decks[0].id);
  assert.equal(migrated.cards[0].deckId, migrated.decks[0].id);
  assert.equal(migrated.sessions[0].deckId, migrated.decks[0].id);
  assert.equal(migrated.deck, undefined, 'das alte Einzel-deck-Feld darf nicht mehr vorhanden sein');
  assert.doesNotThrow(() => validateDocument(migrated));
});

test('mergeDocuments: jüngerer Änderungsstempel gewinnt bei gleicher Karten-ID', () => {
  let a = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  const deckId = getActiveDeck(a).id;
  const card = createCard({ a: 'Baum', b: 'tree', deckId, changed: '2026-01-01T00:00:00.000Z' });
  a = addCards(a, [card]);

  let b = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  const newerCard = { ...card, deckId: getActiveDeck(b).id, b: 'TREE', changed: '2026-02-01T00:00:00.000Z' };
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
  a = addCards(a, [createCard({ a: 'eins', b: 'one', deckId: getActiveDeck(a).id })]);
  let b = createEmptyDocument({ deckName: 'Stapel', langA: 'de', langB: 'en' });
  b = addCards(b, [createCard({ a: 'zwei', b: 'two', deckId: getActiveDeck(b).id })]);
  const merged = mergeDocuments(a, b);
  assert.equal(merged.cards.length, 2);
});

test('mergeDocuments führt Stapel zusammen und behält den aktiven Stapel, sofern er noch existiert', () => {
  // b als bearbeitete Kopie von a ableiten (gleiche Stapel-IDs), nicht zwei unabhängig
  // angelegte Dokumente: createEmptyDocument vergibt bei jedem Aufruf eine neue zufällige
  // Stapel-ID, zwei separat angelegte "Englisch"-Stapel würden also nie zusammenfallen.
  let a = createEmptyDocument({ deckName: 'Englisch', langA: 'de', langB: 'en' });
  const french = createDeck({ name: 'Französisch', langA: 'de', langB: 'fr', changed: '2026-01-01T00:00:00.000Z' });
  a = addDeck(a, french);

  const b = {
    ...a,
    decks: a.decks.map((d) => (d.id === french.id ? { ...d, name: 'Français', changed: '2026-02-01T00:00:00.000Z' } : d)),
  };

  const merged = mergeDocuments(a, b);
  assert.equal(merged.decks.length, 2);
  const frenchMerged = merged.decks.find((d) => d.id === french.id);
  assert.equal(frenchMerged.name, 'Français', 'jüngerer Änderungsstempel gewinnt auch bei Stapeln');
  assert.equal(merged.profile.activeDeckId, getActiveDeck(a).id, 'aktiver Stapel von a bleibt erhalten, existiert noch');
});

test('findDuplicateFronts erkennt gleiche Vorderseiten nur innerhalb desselben Stapels', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const deckId = getActiveDeck(doc).id;
  doc = addCards(doc, [createCard({ a: 'Apfel', b: 'apple', deckId })]);
  const duplicates = findDuplicateFronts(doc, [{ a: 'Apfel', b: 'apple (neu)' }, { a: 'Birne', b: 'pear' }], deckId);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].existing.a, 'Apfel');

  const otherDeck = createDeck({ name: 'Y', langA: 'a', langB: 'b' });
  doc = addDeck(doc, otherDeck);
  const noDuplicates = findDuplicateFronts(doc, [{ a: 'Apfel', b: 'apple' }], otherDeck.id);
  assert.equal(noDuplicates.length, 0, 'derselbe Begriff in einem anderen Stapel ist kein Duplikat');
});

test('applyLearningResult: richtige Antwort hebt den Kasten um eins, höchstens bis 5', () => {
  const { card: base } = docWithCard();
  let card = base;
  for (const expectedBox of [2, 3, 4, 5, 5]) {
    card = applyLearningResult(card, true);
    assert.equal(card.box, expectedBox);
  }
  assert.equal(card.seen, 5);
  assert.equal(card.correct, 5);
  assert.equal(card.wrong, 0);
});

test('applyLearningResult: falsche Antwort setzt Kasten 1, Zähler 0 und legt in die Reparaturkiste', () => {
  const { card: base } = docWithCard();
  let card = applyLearningResult(base, true);
  card = applyLearningResult(card, true); // Kasten 3
  card = applyLearningResult(card, false);
  assert.equal(card.box, 1);
  assert.equal(card.streak, 0);
  assert.equal(card.repair, true);
  assert.equal(card.wrong, 1);
});

test('applyLearningResult: Reparaturkiste verlangt vier richtige Antworten in Folge und landet dann in Kasten 2', () => {
  const { card: base } = docWithCard();
  let card = { ...base, box: 1, repair: true, streak: 0 };
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
  const { card: base } = docWithCard();
  let card = { ...base, box: 1, repair: true, streak: 0 };
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
    deckId: getActiveDeck(doc).id,
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

test('recordSession bündelt mehrere Sitzungen desselben Tages in einem days-Eintrag, geräteweit über alle Stapel', () => {
  let doc = createEmptyDocument({ deckName: 'x', langA: 'a', langB: 'b' });
  const englishId = getActiveDeck(doc).id;
  const french = createDeck({ name: 'Französisch', langA: 'x', langB: 'fr' });
  doc = addDeck(doc, french);
  const localNow = new Date();
  const makeSession = (deckId, correct, wrong, seconds) => ({
    date: localNow.toISOString(),
    mode: 'learn',
    deckId,
    order: 'random',
    direction: 'ab',
    correct,
    wrong,
    seconds,
  });
  doc = recordSession(doc, makeSession(englishId, 5, 1, 60));
  doc = recordSession(doc, makeSession(french.id, 3, 2, 90));
  assert.equal(doc.sessions.length, 2);
  assert.equal(doc.days.length, 1, 'days bleibt geräteweit, nicht je Stapel');
  assert.deepEqual(doc.days[0], { date: localDateIso(localNow), correct: 8, wrong: 3, seconds: 150 });
});
