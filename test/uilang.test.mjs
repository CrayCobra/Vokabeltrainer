import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBrowserLanguage, loadUiLanguage, saveUiLanguage } from '../src/js/uilang.js';

function createMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test('detectBrowserLanguage erkennt eine unterstützte Sprache am Präfix', () => {
  assert.equal(detectBrowserLanguage({ language: 'fr-FR' }), 'fr');
  assert.equal(detectBrowserLanguage({ language: 'es' }), 'es');
});

test('detectBrowserLanguage fällt bei nicht unterstützten Sprachen auf Deutsch zurück', () => {
  assert.equal(detectBrowserLanguage({ language: 'ja-JP' }), 'de');
  assert.equal(detectBrowserLanguage({}), 'de');
});

test('loadUiLanguage nutzt eine gespeicherte Wahl, wenn vorhanden', () => {
  const store = createMemoryStore();
  store.setItem('vokabeltrainer.uiLang', 'la');
  assert.equal(loadUiLanguage(store, { language: 'en-US' }), 'la');
});

test('loadUiLanguage schlägt ohne gespeicherte Wahl die Browsersprache vor', () => {
  const store = createMemoryStore();
  assert.equal(loadUiLanguage(store, { language: 'es-MX' }), 'es');
});

test('loadUiLanguage ignoriert einen ungültigen gespeicherten Wert', () => {
  const store = createMemoryStore();
  store.setItem('vokabeltrainer.uiLang', 'xx');
  assert.equal(loadUiLanguage(store, { language: 'fr-CA' }), 'fr');
});

test('saveUiLanguage schreibt eine gültige Sprache und verweigert unbekannte', () => {
  const store = createMemoryStore();
  saveUiLanguage('en', store);
  assert.equal(store.getItem('vokabeltrainer.uiLang'), 'en');
  assert.throws(() => saveUiLanguage('xx', store));
});
