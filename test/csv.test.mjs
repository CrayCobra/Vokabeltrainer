import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsvBytes, detectDelimiter, parseCsv, rowsToCards } from '../src/js/csv.js';

test('decodeCsvBytes erkennt eine UTF-8-BOM', () => {
  const utf8Bytes = new TextEncoder().encode('Übung;exercise');
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Bytes]);
  assert.equal(decodeCsvBytes(bytes.buffer), 'Übung;exercise');
});

test('decodeCsvBytes fällt bei ungültigem UTF-8 auf Windows-1252 zurück (deutsches Excel)', () => {
  // "Übung" in Windows-1252: Ü = 0xDC, u-b-u-n-g als ASCII. Direkt als Uint8Array gebaut,
  // damit kein gepoolter Node-Buffer-Speicher versehentlich mitgeliefert wird.
  const bytes = new Uint8Array([0xdc, 0x62, 0x75, 0x6e, 0x67, 0x3b, 0x65, 0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65]);
  assert.equal(decodeCsvBytes(bytes.buffer), 'Übung;exercise');
});

test('detectDelimiter erkennt Semikolon (deutsches Excel)', () => {
  const text = 'Wort;Bedeutung\nHaus;house\nBaum;tree';
  assert.equal(detectDelimiter(text), ';');
});

test('detectDelimiter erkennt Komma', () => {
  const text = 'Wort,Bedeutung\nHaus,house\nBaum,tree';
  assert.equal(detectDelimiter(text), ',');
});

test('detectDelimiter erkennt Tabulator', () => {
  const text = 'Wort\tBedeutung\nHaus\thouse';
  assert.equal(detectDelimiter(text), '\t');
});

test('parseCsv verarbeitet Anführungszeichen mit eingebettetem Trennzeichen, Zeilenumbruch und "" ', () => {
  const text = 'a;b\n"Haus, groß";"house"\n"mehrzeilig\nText";"multi"\n"mit ""Zitat""";"quote"';
  const rows = parseCsv(text, ';');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['Haus, groß', 'house'],
    ['mehrzeilig\nText', 'multi'],
    ['mit "Zitat"', 'quote'],
  ]);
});

test('rowsToCards überspringt Zeilen ohne Vorderseite und kann die Kopfzeile weglassen', () => {
  const rows = [
    ['Wort', 'Bedeutung'],
    ['Haus', 'house'],
    ['', 'ohne Vorderseite'],
    ['Baum', 'tree'],
  ];
  const { cards, skipped } = rowsToCards(rows, 0, 1, { skipFirstRow: true });
  assert.deepEqual(cards, [
    { a: 'Haus', b: 'house' },
    { a: 'Baum', b: 'tree' },
  ]);
  assert.equal(skipped.length, 1);
});
