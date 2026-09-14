// Deckt die Abnahmebedingung aus CLAUDE.md ab: "ein Export-Import-Durchlauf ergibt ein
// bitgleiches Dokument".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDocument, parseImportedText, buildExportFilename } from '../src/js/fileio.js';
import { createEmptyDocument, createCard, addCards } from '../src/js/model.js';

function sampleDoc() {
  let doc = createEmptyDocument({ deckName: 'Englisch 5. Klasse', langA: 'Deutsch', langB: 'Englisch', appVersion: '0.1.0' });
  doc = addCards(doc, [
    createCard({ a: 'Haus', b: 'house' }),
    createCard({ a: 'Apfel', b: '' }),
    createCard({ a: 'läuft, rennt', b: 'runs; "fast"' }),
  ]);
  return doc;
}

test('Export gefolgt von Import ergibt ein inhaltsgleiches Dokument', () => {
  const doc = sampleDoc();
  const exported = serializeDocument(doc);
  const imported = parseImportedText(exported);
  assert.deepEqual(imported, doc);
});

test('ein zweiter Export nach dem Import erzeugt bitgleiche Bytes', () => {
  const doc = sampleDoc();
  const firstExport = serializeDocument(doc);
  const imported = parseImportedText(firstExport);
  const secondExport = serializeDocument(imported);
  assert.equal(secondExport, firstExport);
});

test('parseImportedText verweigert unbekannten oder beschädigten Inhalt mit klarer Meldung', () => {
  assert.throws(() => parseImportedText('das ist kein JSON'), (err) => err.i18nKey === 'errors.invalidJson');
  assert.throws(() => parseImportedText('{}'), (err) => err.i18nKey === 'errors.unknownFormat');
  assert.throws(() => parseImportedText('{"schema":1}'));
});

test('buildExportFilename erzeugt einen stabilen, dateisystemtauglichen Namen', () => {
  const doc = sampleDoc();
  const name = buildExportFilename(doc, new Date('2026-09-14T10:00:00Z'));
  assert.equal(name, 'englisch-5-klasse-20260914.vok.json');
  assert.doesNotMatch(name, /[^a-z0-9.-]/);
});
