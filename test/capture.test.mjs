import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickCapture } from '../src/js/capture.js';

test('alternierende Zeilen ergeben abwechselnd Vorder- und Rückseite', () => {
  const { cards, warnings } = parseQuickCapture('Haus\nhouse\nBaum\ntree');
  assert.deepEqual(cards, [
    { a: 'Haus', b: 'house' },
    { a: 'Baum', b: 'tree' },
  ]);
  assert.equal(warnings.length, 0);
});

test('leere Zeilen sind reine Trenner und werden ignoriert', () => {
  const { cards } = parseQuickCapture('Haus\n\nhouse\n\n\nBaum\ntree\n');
  assert.deepEqual(cards, [
    { a: 'Haus', b: 'house' },
    { a: 'Baum', b: 'tree' },
  ]);
});

test('eine Zeile mit Tabulator bildet allein eine Karte', () => {
  const { cards, warnings } = parseQuickCapture('Haus\thouse\nBaum\ttree');
  assert.deepEqual(cards, [
    { a: 'Haus', b: 'house' },
    { a: 'Baum', b: 'tree' },
  ]);
  assert.equal(warnings.length, 0);
});

test('Tabulator-Zeile unterbricht eine offene alternierende Vorderseite mit Warnung', () => {
  const { cards, warnings } = parseQuickCapture('Apfel\nBirne\tpear');
  assert.deepEqual(cards, [{ a: 'Birne', b: 'pear' }]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].text, 'Apfel');
  assert.equal(warnings[0].reason, 'missing-back');
});

test('fehlende Rückseite am Ende wird als Warnung gemeldet, nicht als Karte', () => {
  const { cards, warnings } = parseQuickCapture('Haus\nhouse\nBaum');
  assert.deepEqual(cards, [{ a: 'Haus', b: 'house' }]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 3);
  assert.equal(warnings[0].text, 'Baum');
});

test('Tabulator mit leerem Rest ergibt eine Karte mit leerer Rückseite', () => {
  const { cards, warnings } = parseQuickCapture('Wort\t');
  assert.deepEqual(cards, [{ a: 'Wort', b: '' }]);
  assert.equal(warnings.length, 0);
});

test('leerer Text ergibt keine Karten und keine Warnungen', () => {
  const { cards, warnings } = parseQuickCapture('   \n\n  ');
  assert.deepEqual(cards, []);
  assert.deepEqual(warnings, []);
});
