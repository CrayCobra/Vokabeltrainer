// Oberflächensprache: unabhängig von den Stapelsprachen (vokabel-app-entwurf.md, Abschnitt
// 10), daher wie das Erscheinungsbild in localStorage abgelegt statt im .vok.json-Dokument.
// Beim allerersten Start ohne gespeicherte Wahl wird die Browsersprache vorgeschlagen, danach
// bleibt die ausdrückliche Wahl bestehen.

import { DEFAULT_LANGUAGE, isSupportedLanguage } from './i18n.js';

const UI_LANG_STORAGE_KEY = 'vokabeltrainer.uiLang';

export function detectBrowserLanguage(navigatorLike = globalThis.navigator) {
  const raw = (navigatorLike && navigatorLike.language) || '';
  const short = raw.slice(0, 2).toLowerCase();
  return isSupportedLanguage(short) ? short : DEFAULT_LANGUAGE;
}

export function loadUiLanguage(store = globalThis.localStorage, navigatorLike = globalThis.navigator) {
  if (store) {
    try {
      const value = store.getItem(UI_LANG_STORAGE_KEY);
      if (isSupportedLanguage(value)) return value;
    } catch {
      // Kleinigkeit; ohne localStorage bleibt nur die Browsersprache als Vorschlag.
    }
  }
  return detectBrowserLanguage(navigatorLike);
}

export function saveUiLanguage(lang, store = globalThis.localStorage) {
  if (!isSupportedLanguage(lang)) throw new Error(`Unbekannte Sprache: ${lang}`);
  if (!store) return;
  try {
    store.setItem(UI_LANG_STORAGE_KEY, lang);
  } catch {
    // Kleinigkeit; ohne localStorage wird die Wahl beim nächsten Start erneut aus der
    // Browsersprache vorgeschlagen.
  }
}
