// Datenmodell: Dokumentstruktur, Stapel, Karten, Validierung, Migration, Zusammenführung.
// Reine Funktionen ohne DOM- oder Speicherzugriff, damit sie ohne Browser testbar sind.

export const SCHEMA_VERSION = 2;

// Fehler tragen einen Übersetzungsschlüssel statt fertigen Texts, da model.js laut CLAUDE.md
// ohne DOM- oder Sprachzugriff bleibt ("Module für Datenmodell ... und Übersetzungen" sind
// getrennt); views.js übersetzt i18nKey/i18nParams beim Anzeigen. err.message bleibt der
// Schlüssel selbst als Diagnose-Fallback, falls eine Stelle ihn doch einmal direkt ausgibt.
export class ValidationError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.name = 'ValidationError';
    this.i18nKey = key;
    this.i18nParams = params;
  }
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

export function generateId() {
  const bytes = new Uint8Array(ID_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < ID_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return id;
}

export function nowIso() {
  return new Date().toISOString();
}

// Lokales Kalenderdatum (nicht UTC): Tagesgrenze für Serie und Heatmap ist Mitternacht in
// der Zeitzone des Geräts.
export function localDateIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---- Stapel ----
// Ein Profil enthält mehrere Stapel (vokabel-app-entwurf.md, Kapitel 1 und 6); jede Karte und
// jede Sitzung gehört über deckId zu genau einem davon. Die Lernserie (days[]) bleibt bewusst
// geräteweit statt je Stapel, siehe Kapitel 4.

export function createDeck({ name, langA, langB, changed = nowIso() }) {
  if (!name || !name.trim()) throw new ValidationError('errors.deckNameRequired');
  if (!langA || !langA.trim()) throw new ValidationError('errors.langARequired');
  if (!langB || !langB.trim()) throw new ValidationError('errors.langBRequired');
  return { id: generateId(), name: name.trim(), langA: langA.trim(), langB: langB.trim(), changed };
}

export function addDeck(doc, deck) {
  return { ...doc, decks: [...doc.decks, deck] };
}

// Liefert einen neuen Stapel mit geänderten Feldern; changed wird nur aktualisiert, wenn sich
// tatsächlich etwas ändert (gleiches Muster wie applyCardEdit).
export function applyDeckEdit(deck, { name, langA, langB } = {}) {
  const next = { ...deck };
  let touched = false;
  if (name != null && name !== deck.name) { next.name = name; touched = true; }
  if (langA != null && langA !== deck.langA) { next.langA = langA; touched = true; }
  if (langB != null && langB !== deck.langB) { next.langB = langB; touched = true; }
  if (touched) next.changed = nowIso();
  return next;
}

export function replaceDeck(doc, updatedDeck) {
  return { ...doc, decks: doc.decks.map((d) => (d.id === updatedDeck.id ? updatedDeck : d)) };
}

export function getActiveDeck(doc) {
  return doc.decks.find((d) => d.id === doc.profile.activeDeckId) || doc.decks[0];
}

export function setActiveDeck(doc, deckId) {
  if (!doc.decks.some((d) => d.id === deckId)) return doc;
  return { ...doc, profile: { ...doc.profile, activeDeckId: deckId } };
}

// Entfernt einen Stapel samt seiner Karten (kaskadierend, da eine Karte ohne Stapel nicht
// sinnvoll ist) und liefert beides in einer Form, die restoreDeck rückgängig machen kann.
// Verweigert das Löschen des letzten verbliebenen Stapels: ein Profil ohne jeden Stapel ist ein
// Zustand, den die restliche App (aktiver Stapel, Lern-/Testsitzung) nicht kennt.
export function deleteDeck(doc, deckId) {
  if (doc.decks.length <= 1) throw new ValidationError('errors.lastDeckRequired');
  const index = doc.decks.findIndex((d) => d.id === deckId);
  if (index === -1) return { doc, removedDeck: null, removedCards: [] };
  const removedDeck = { deck: doc.decks[index], index };
  const decks = doc.decks.filter((d) => d.id !== deckId);
  const cardIdsInDeck = doc.cards.filter((c) => c.deckId === deckId).map((c) => c.id);
  const { doc: afterCardDelete, removed: removedCards } = deleteCards({ ...doc, decks }, cardIdsInDeck);
  const activeDeckId = doc.profile.activeDeckId === deckId ? decks[0].id : doc.profile.activeDeckId;
  return {
    doc: { ...afterCardDelete, profile: { ...afterCardDelete.profile, activeDeckId } },
    removedDeck,
    removedCards,
  };
}

// Setzt einen zuvor mit deleteDeck entfernten Stapel samt seiner Karten an ihrer ursprünglichen
// Position wieder ein.
export function restoreDeck(doc, { removedDeck, removedCards }) {
  if (!removedDeck) return doc;
  const decks = [...doc.decks];
  const at = Math.min(removedDeck.index, decks.length);
  decks.splice(at, 0, removedDeck.deck);
  return restoreCards({ ...doc, decks }, removedCards);
}

// ---- Dokument ----

export function createEmptyDocument({ profileName = '', uiLang = 'de', deckName, langA, langB, created = nowIso(), appVersion = '' } = {}) {
  const deck = createDeck({ name: deckName, langA, langB, changed: created });
  return {
    schema: SCHEMA_VERSION,
    meta: { app: appVersion, created, lastBackup: null },
    profile: { name: profileName, uiLang, activeDeckId: deck.id },
    decks: [deck],
    cards: [],
    days: [],
    sessions: [],
  };
}

export function createCard({ a, b, deckId, changed = nowIso() }) {
  if (a == null) throw new ValidationError('errors.frontRequired');
  if (b == null) throw new ValidationError('errors.backRequired');
  if (!deckId) throw new ValidationError('errors.cardDeckRequired');
  return {
    id: generateId(),
    deckId,
    a: String(a),
    b: String(b),
    box: 1,
    streak: 0,
    repair: false,
    marked: false,
    seen: 0,
    correct: 0,
    wrong: 0,
    lastSeen: null,
    changed,
  };
}

// Liefert eine neue Karte mit geänderten Textfeldern bzw. Markierung; changed wird nur
// aktualisiert, wenn sich tatsächlich etwas ändert.
export function applyCardEdit(card, { a, b, marked } = {}) {
  const next = { ...card };
  let touched = false;
  if (a != null && a !== card.a) { next.a = a; touched = true; }
  if (b != null && b !== card.b) { next.b = b; touched = true; }
  if (marked != null && marked !== card.marked) { next.marked = marked; touched = true; }
  if (touched) next.changed = nowIso();
  return next;
}

// Wendet das Ergebnis einer Lern- oder Testantwort auf eine Karte an. Eine richtige Antwort
// hebt den Kasten um eins (höchstens bis 5); während der Reparaturkiste bleibt der Kasten
// stattdessen eingefroren, bis viermal hintereinander richtig geantwortet wurde – erst dann
// verlässt die Karte die Reparaturkiste und landet gezielt in Kasten 2 (nicht durch
// fortlaufendes Hochzählen), damit der Aufwand sichtbar belohnt wird. Eine falsche Antwort
// setzt Kasten und Zähler zurück und legt die Karte in die Reparaturkiste.
export function applyLearningResult(card, correct, now = nowIso()) {
  let { box, streak, repair } = card;
  if (correct) {
    streak += 1;
    if (repair) {
      if (streak >= 4) {
        repair = false;
        box = 2;
      }
    } else {
      box = Math.min(box + 1, 5);
    }
  } else {
    box = 1;
    streak = 0;
    repair = true;
  }
  return {
    ...card,
    box,
    streak,
    repair,
    seen: card.seen + 1,
    correct: card.correct + (correct ? 1 : 0),
    wrong: card.wrong + (correct ? 0 : 1),
    lastSeen: now,
    changed: now,
  };
}

// Hängt eine abgeschlossene Sitzung an sessions[] an und bucht sie in days[] auf den lokalen
// Kalendertag ihres Starts (auch wenn die Sitzung über Mitternacht hinaus lief). days[] bleibt
// geräteweit über alle Stapel hinweg (siehe Kapitel 4 des Entwurfs), auch wenn session.deckId
// den gelernten Stapel festhält.
export function recordSession(doc, session) {
  const sessions = [...doc.sessions, session];
  const dateKey = localDateIso(new Date(session.date));
  const days = [...doc.days];
  const idx = days.findIndex((d) => d.date === dateKey);
  if (idx === -1) {
    days.push({ date: dateKey, correct: session.correct, wrong: session.wrong, seconds: session.seconds });
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
  } else {
    days[idx] = {
      ...days[idx],
      correct: days[idx].correct + session.correct,
      wrong: days[idx].wrong + session.wrong,
      seconds: days[idx].seconds + session.seconds,
    };
  }
  return { ...doc, sessions, days };
}

export function addCards(doc, newCards) {
  return { ...doc, cards: [...doc.cards, ...newCards] };
}

export function replaceCard(doc, updatedCard) {
  return { ...doc, cards: doc.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)) };
}

// Entfernt Karten mit den angegebenen IDs und liefert sowohl das neue Dokument als auch
// die entfernten Karten samt ursprünglichem Index, damit ein Undo sie wieder einsetzen kann.
export function deleteCards(doc, ids) {
  const idSet = new Set(ids);
  const removed = [];
  const cards = [];
  doc.cards.forEach((card, index) => {
    if (idSet.has(card.id)) {
      removed.push({ card, index });
    } else {
      cards.push(card);
    }
  });
  return { doc: { ...doc, cards }, removed };
}

// Setzt zuvor entfernte Karten an ihrer ursprünglichen Position wieder ein.
export function restoreCards(doc, removed) {
  const cards = [...doc.cards];
  const sorted = [...removed].sort((x, y) => x.index - y.index);
  for (const { card, index } of sorted) {
    const at = Math.min(index, cards.length);
    cards.splice(at, 0, card);
  }
  return { ...doc, cards };
}

export function validateDocument(raw) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('errors.invalidDocument');
  if (typeof raw.schema !== 'number') throw new ValidationError('errors.missingSchema');
  if (!Array.isArray(raw.decks) || raw.decks.length === 0) throw new ValidationError('errors.incompleteDeck');
  for (const deck of raw.decks) {
    if (!deck || typeof deck.id !== 'string' || typeof deck.name !== 'string' || typeof deck.langA !== 'string' || typeof deck.langB !== 'string') {
      throw new ValidationError('errors.incompleteDeck');
    }
  }
  const deckIds = new Set(raw.decks.map((d) => d.id));
  if (!raw.profile || !deckIds.has(raw.profile.activeDeckId)) {
    throw new ValidationError('errors.incompleteDeck');
  }
  if (!Array.isArray(raw.cards)) throw new ValidationError('errors.missingCards');
  raw.cards.forEach((card, i) => {
    if (!card || typeof card.id !== 'string' || typeof card.a !== 'string' || typeof card.b !== 'string') {
      throw new ValidationError('errors.corruptCard', { n: i + 1 });
    }
    if (typeof card.box !== 'number' || card.box < 1 || card.box > 5) {
      throw new ValidationError('errors.invalidBox', { n: i + 1 });
    }
    if (!deckIds.has(card.deckId)) {
      throw new ValidationError('errors.corruptCard', { n: i + 1 });
    }
  });
  if (!Array.isArray(raw.days)) throw new ValidationError('errors.missingDays');
  if (!Array.isArray(raw.sessions)) throw new ValidationError('errors.missingSessions');
  const seen = new Set();
  for (const card of raw.cards) {
    if (seen.has(card.id)) throw new ValidationError('errors.duplicateId', { id: card.id });
    seen.add(card.id);
  }
  return raw;
}

// Hebt ein Dokument mit dem alten Einzel-Stapel-Format (schema 1: raw.deck statt raw.decks[],
// Karten ohne deckId) auf schema 2 an: der bisherige Stapel wird zu decks[0], alle Karten und
// Sitzungen erhalten dessen deckId, profile.activeDeckId zeigt darauf.
function migrateV1ToV2(doc) {
  const deckId = generateId();
  const oldDeck = doc.deck || { name: '', langA: '', langB: '' };
  const deck = {
    id: deckId,
    name: oldDeck.name,
    langA: oldDeck.langA,
    langB: oldDeck.langB,
    changed: (doc.meta && doc.meta.created) || nowIso(),
  };
  const { deck: _oldDeck, ...rest } = doc;
  return {
    ...rest,
    schema: 2,
    profile: { ...doc.profile, activeDeckId: deckId },
    decks: [deck],
    cards: (doc.cards || []).map((c) => ({ ...c, deckId })),
    sessions: (doc.sessions || []).map((s) => ({ ...s, deckId })),
  };
}

// Prüft die Schema-Version und hebt ältere Stände an; verweigert neuere Stände mit
// einer klaren Meldung statt sie stillschweigend zu verarbeiten.
export function migrateDocument(raw) {
  if (typeof raw.schema !== 'number') {
    throw new ValidationError('errors.unknownFormat');
  }
  if (raw.schema > SCHEMA_VERSION) {
    throw new ValidationError('errors.newerSchema', { schema: raw.schema, supported: SCHEMA_VERSION });
  }
  let doc = raw;
  if (doc.schema < 2) doc = migrateV1ToV2(doc);
  return doc;
}

// Führt zwei Dokumente zusammen: bei gleicher Karten- bzw. Stapel-ID gewinnt der jüngere
// Änderungsstempel. profile.activeDeckId bleibt der des aktuellen Dokuments, sofern der Stapel
// nach dem Zusammenführen noch existiert, sonst fällt es auf den ersten verbliebenen zurück.
export function mergeDocuments(current, incoming) {
  const decksById = new Map(current.decks.map((d) => [d.id, d]));
  for (const deck of incoming.decks) {
    const existing = decksById.get(deck.id);
    if (!existing || new Date(deck.changed).getTime() > new Date(existing.changed).getTime()) {
      decksById.set(deck.id, deck);
    }
  }
  const mergedDecks = [...decksById.values()];

  const byId = new Map(current.cards.map((c) => [c.id, c]));
  for (const card of incoming.cards) {
    const existing = byId.get(card.id);
    if (!existing || new Date(card.changed).getTime() > new Date(existing.changed).getTime()) {
      byId.set(card.id, card);
    }
  }
  const mergedCards = [...byId.values()];

  const dayKey = (d) => d.date;
  const daysById = new Map(current.days.map((d) => [dayKey(d), d]));
  for (const day of incoming.days) {
    if (!daysById.has(dayKey(day))) daysById.set(dayKey(day), day);
  }

  const sessionKey = (s) => `${s.date}|${s.deckId}|${s.mode}|${s.direction}`;
  const sessionsById = new Map(current.sessions.map((s) => [sessionKey(s), s]));
  for (const session of incoming.sessions) {
    if (!sessionsById.has(sessionKey(session))) sessionsById.set(sessionKey(session), session);
  }

  const activeDeckId = mergedDecks.some((d) => d.id === current.profile.activeDeckId)
    ? current.profile.activeDeckId
    : mergedDecks[0].id;

  return {
    ...current,
    profile: { ...current.profile, activeDeckId },
    decks: mergedDecks,
    cards: mergedCards,
    days: [...daysById.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    sessions: [...sessionsById.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

// Vorderseiten-Duplikate gelten nur innerhalb desselben Stapels: derselbe Begriff in zwei
// verschiedenen Sprachpaaren ist kein Duplikat.
export function findDuplicateFronts(doc, candidates, deckId) {
  const existingFronts = new Map(doc.cards.filter((c) => c.deckId === deckId).map((c) => [c.a.trim(), c]));
  const duplicates = [];
  for (const candidate of candidates) {
    const match = existingFronts.get(candidate.a.trim());
    if (match) duplicates.push({ candidate, existing: match });
  }
  return duplicates;
}
