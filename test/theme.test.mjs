import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadThemePreference, saveThemePreference, applyThemePreference } from '../src/js/theme.js';

function createMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

function createFakeDocument() {
  const attrs = new Map();
  return {
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    },
  };
}

test('loadThemePreference liefert system, wenn nichts gespeichert ist', () => {
  assert.equal(loadThemePreference(createMemoryStore()), 'system');
});

test('loadThemePreference ignoriert unbekannte gespeicherte Werte', () => {
  const store = createMemoryStore();
  store.setItem('vokabeltrainer.theme', 'phantasie');
  assert.equal(loadThemePreference(store), 'system');
});

test('saveThemePreference speichert light/dark und entfernt den Eintrag bei system', () => {
  const store = createMemoryStore();
  saveThemePreference('dark', store);
  assert.equal(loadThemePreference(store), 'dark');
  saveThemePreference('light', store);
  assert.equal(loadThemePreference(store), 'light');
  saveThemePreference('system', store);
  assert.equal(store.getItem('vokabeltrainer.theme'), null);
});

test('saveThemePreference verweigert unbekannte Werte', () => {
  assert.throws(() => saveThemePreference('lila', createMemoryStore()));
});

test('applyThemePreference setzt bzw. entfernt data-theme auf dem Wurzelelement', () => {
  const doc = createFakeDocument();
  applyThemePreference('dark', doc);
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');
  applyThemePreference('light', doc);
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'light');
  applyThemePreference('system', doc);
  assert.equal(doc.documentElement.getAttribute('data-theme'), null);
});
