// Übersetzungskern: reine Nachschlage- und Interpolationslogik, keine DOM-Abhängigkeit.
// Ein Wörterbucheintrag ist entweder ein String mit {platzhaltern} oder eine Funktion
// (params) => string für Fälle, die eigene Pluralregeln brauchen (z. B. "1 Karte" / "2 Karten"
// mit sprachabhängigem Schwellenwert). Fehlt ein Schlüssel in der gewählten Sprache, greift
// zuerst Deutsch als Grundsprache, dann der nackte Schlüssel selbst – damit ein vergessener
// Eintrag sichtbar auffällt statt eine leere Fläche zu hinterlassen.

// Kein Umbenennen beim Import (kein "as"): das eigene Bau-Skript entfernt import-Zeilen nur
// vollständig, ohne Umbenennungen im restlichen Code nachzuziehen – das hat einmal zu einem
// "de is not defined" im gebündelten dist/app.html geführt, obwohl alle node:test-Tests (echte
// ES-Module) grün waren.
import { dictDe } from './i18n-de.js';
import { dictEn } from './i18n-en.js';
import { dictEs } from './i18n-es.js';
import { dictFr } from './i18n-fr.js';
import { dictLa } from './i18n-la.js';

export const DEFAULT_LANGUAGE = 'de';
export const LANGUAGES = ['de', 'en', 'es', 'fr', 'la'];

// Jede Sprache nennt sich selbst beim eigenen Namen, damit man sie in der Liste auch dann
// wiederfindet, wenn man die aktuell eingestellte Oberflächensprache nicht lesen kann.
export const LANGUAGE_NAMES = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  la: 'Latina',
};

const DICTIONARIES = { de: dictDe, en: dictEn, es: dictEs, fr: dictFr, la: dictLa };

const LOCALE_TAGS = {
  de: 'de-DE',
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  la: 'la',
};

export function isSupportedLanguage(value) {
  return LANGUAGES.includes(value);
}

export function localeForLanguage(lang) {
  return LOCALE_TAGS[lang] || LOCALE_TAGS[DEFAULT_LANGUAGE];
}

export function translate(lang, key, params = {}) {
  const dict = DICTIONARIES[lang] || DICTIONARIES[DEFAULT_LANGUAGE];
  let entry = dict[key];
  if (entry === undefined) entry = DICTIONARIES[DEFAULT_LANGUAGE][key];
  if (entry === undefined) return key;
  if (typeof entry === 'function') return entry(params);
  return entry.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}

// Erzeugt eine an eine feste Sprache gebundene t()-Funktion, bequem für Aufrufer, die die
// Sprache nicht bei jedem Aufruf mitgeben wollen.
export function createTranslator(lang) {
  return (key, params) => translate(lang, key, params);
}
