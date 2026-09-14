// Export/Import als .vok.json-Datei. Rein textbasiert, kein DOM-Zugriff, damit ein
// Export-Import-Durchlauf deterministisch und ohne Browser testbar bleibt.

import { migrateDocument, validateDocument, ValidationError } from './model.js';

export function serializeDocument(doc) {
  return JSON.stringify(doc, null, 2);
}

export function parseImportedText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError('errors.invalidJson');
  }
  const migrated = migrateDocument(raw);
  return validateDocument(migrated);
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function slugify(name) {
  return (
    name
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'stapel'
  );
}

export function buildExportFilename(doc, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${slugify(doc.deck.name)}-${y}${m}${d}.vok.json`;
}
