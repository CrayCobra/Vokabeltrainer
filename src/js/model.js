// Datenmodell: Dokumentstruktur, Karten, Validierung, Migration, Zusammenführung.
// Reine Funktionen ohne DOM- oder Speicherzugriff, damit sie ohne Browser testbar sind.

export const SCHEMA_VERSION = 1;

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

export function createEmptyDocument({ profileName = '', uiLang = 'de', deckName, langA, langB, created = nowIso(), appVersion = '' } = {}) {
  if (!deckName || !deckName.trim()) throw new Error('Der Stapel braucht einen Namen.');
  if (!langA || !langA.trim()) throw new Error('Sprache A fehlt.');
  if (!langB || !langB.trim()) throw new Error('Sprache B fehlt.');
  return {
    schema: SCHEMA_VERSION,
    meta: { app: appVersion, created, lastBackup: null },
    profile: { name: profileName, uiLang },
    deck: { name: deckName.trim(), langA: langA.trim(), langB: langB.trim() },
    cards: [],
    days: [],
    sessions: [],
  };
}

export function createCard({ a, b, changed = nowIso() }) {
  if (a == null) throw new Error('Vorderseite fehlt.');
  if (b == null) throw new Error('Rückseite fehlt.');
  return {
    id: generateId(),
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
  if (!raw || typeof raw !== 'object') throw new Error('Die Datei enthält kein gültiges Vokabeltrainer-Dokument.');
  if (typeof raw.schema !== 'number') throw new Error('Der Datei fehlt die Schema-Version.');
  if (!raw.deck || typeof raw.deck.name !== 'string' || typeof raw.deck.langA !== 'string' || typeof raw.deck.langB !== 'string') {
    throw new Error('Der Stapel-Eintrag der Datei ist unvollständig.');
  }
  if (!Array.isArray(raw.cards)) throw new Error('Die Kartenliste der Datei fehlt oder ist beschädigt.');
  raw.cards.forEach((card, i) => {
    if (!card || typeof card.id !== 'string' || typeof card.a !== 'string' || typeof card.b !== 'string') {
      throw new Error(`Karte Nr. ${i + 1} in der Datei ist beschädigt.`);
    }
    if (typeof card.box !== 'number' || card.box < 1 || card.box > 5) {
      throw new Error(`Karte Nr. ${i + 1} hat einen ungültigen Kastenstand.`);
    }
  });
  if (!Array.isArray(raw.days)) throw new Error('Der Tagesverlauf der Datei fehlt oder ist beschädigt.');
  if (!Array.isArray(raw.sessions)) throw new Error('Die Sitzungsliste der Datei fehlt oder ist beschädigt.');
  const seen = new Set();
  for (const card of raw.cards) {
    if (seen.has(card.id)) throw new Error(`Die Karten-ID „${card.id}“ kommt in der Datei mehrfach vor.`);
    seen.add(card.id);
  }
  return raw;
}

// Prüft die Schema-Version und hebt ältere Stände an; verweigert neuere Stände mit
// einer klaren Meldung statt sie stillschweigend zu verarbeiten.
export function migrateDocument(raw) {
  if (typeof raw.schema !== 'number') {
    throw new Error('Unbekanntes Dateiformat: keine Schema-Version angegeben.');
  }
  if (raw.schema > SCHEMA_VERSION) {
    throw new Error(
      `Diese Datei stammt aus einer neueren Version der App (Schema ${raw.schema}, unterstützt wird ${SCHEMA_VERSION}) und kann nicht geöffnet werden.`
    );
  }
  let doc = raw;
  // Platz für künftige Migrationsschritte, sobald SCHEMA_VERSION erhöht wird.
  // if (doc.schema < 2) { doc = migrateV1ToV2(doc); }
  return doc;
}

// Führt zwei Dokumente zusammen: bei gleicher Karten-ID gewinnt der jüngere Änderungsstempel.
// Stapel-Metadaten (deck, profile) bleiben die des aktuellen Dokuments.
export function mergeDocuments(current, incoming) {
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

  const sessionKey = (s) => `${s.date}|${s.mode}|${s.direction}`;
  const sessionsById = new Map(current.sessions.map((s) => [sessionKey(s), s]));
  for (const session of incoming.sessions) {
    if (!sessionsById.has(sessionKey(session))) sessionsById.set(sessionKey(session), session);
  }

  return {
    ...current,
    cards: mergedCards,
    days: [...daysById.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    sessions: [...sessionsById.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

export function findDuplicateFronts(doc, candidates) {
  const existingFronts = new Map(doc.cards.map((c) => [c.a.trim(), c]));
  const duplicates = [];
  for (const candidate of candidates) {
    const match = existingFronts.get(candidate.a.trim());
    if (match) duplicates.push({ candidate, existing: match });
  }
  return duplicates;
}
