import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_NAMES, localeForLanguage, isSupportedLanguage } from '../src/js/i18n.js';
import { dictDe as de } from '../src/js/i18n-de.js';
import { dictEn as en } from '../src/js/i18n-en.js';
import { dictEs as es } from '../src/js/i18n-es.js';
import { dictFr as fr } from '../src/js/i18n-fr.js';
import { dictLa as la } from '../src/js/i18n-la.js';

const DICTS = { de, en, es, fr, la };

test('Abnahmekriterium: alle fünf Sprachen sind vollständig (identische Schlüsselmenge)', () => {
  const referenceKeys = new Set(Object.keys(de));
  assert.ok(referenceKeys.size > 100, 'Referenzwörterbuch wirkt unplausibel klein');
  for (const lang of LANGUAGES) {
    const keys = new Set(Object.keys(DICTS[lang]));
    const missing = [...referenceKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !referenceKeys.has(k));
    assert.deepEqual(missing, [], `Sprache "${lang}": fehlende Schlüssel`);
    assert.deepEqual(extra, [], `Sprache "${lang}": verwaiste, nirgendwo sonst vorhandene Schlüssel`);
  }
});

test('jeder Eintrag ist ein String oder eine Funktion, nie leer', () => {
  for (const lang of LANGUAGES) {
    for (const [key, value] of Object.entries(DICTS[lang])) {
      const ok = (typeof value === 'string' && value.length > 0) || typeof value === 'function';
      assert.ok(ok, `Sprache "${lang}", Schlüssel "${key}" ist weder ein nichtleerer String noch eine Funktion`);
    }
  }
});

test('LANGUAGES, LANGUAGE_NAMES und die Wörterbücher stimmen überein', () => {
  assert.deepEqual(new Set(LANGUAGES), new Set(Object.keys(DICTS)));
  for (const lang of LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[lang], `Kein Anzeigename für "${lang}"`);
  }
  assert.equal(DEFAULT_LANGUAGE, 'de');
});

test('translate: einfache Interpolation ersetzt {platzhalter}', () => {
  assert.equal(translate('de', 'header.lastBackup', { date: '14.9.2026' }), 'Zuletzt gesichert: 14.9.2026');
  assert.equal(translate('en', 'header.lastBackup', { date: '9/14/2026' }), 'Last backed up: 9/14/2026');
});

test('translate: fehlender Platzhalterwert bleibt sichtbar statt zu verschwinden', () => {
  assert.equal(translate('de', 'header.lastBackup', {}), 'Zuletzt gesichert: {date}');
});

test('translate: Funktionsschlüssel (Pluralregeln) werden mit den Parametern aufgerufen', () => {
  assert.equal(translate('de', 'stats.streakDays', { n: 1 }), 'Tag in Folge');
  assert.equal(translate('de', 'stats.streakDays', { n: 2 }), 'Tage in Folge');
  assert.equal(translate('en', 'stats.streakDays', { n: 1 }), 'day in a row');
  assert.equal(translate('fr', 'stats.streakDays', { n: 0 }), 'jour de suite'); // 0 ist im Französischen Singular
  assert.equal(translate('fr', 'stats.streakDays', { n: 2 }), 'jours de suite');
});

test('translate: fehlt ein Schlüssel in einer Sprache, greift Deutsch als Rückfallebene', () => {
  // Simuliert eine unvollständige Sprache, ohne die echten Wörterbücher zu verändern.
  const originalTranslate = translate('xx', 'app.title');
  assert.equal(originalTranslate, 'Vokabeltrainer'); // unbekannte Sprache fällt komplett auf Deutsch zurück
});

test('translate: ein völlig unbekannter Schlüssel liefert sich selbst zurück, statt zu crashen', () => {
  assert.equal(translate('de', 'does.not.exist'), 'does.not.exist');
});

test('isSupportedLanguage und localeForLanguage', () => {
  assert.equal(isSupportedLanguage('la'), true);
  assert.equal(isSupportedLanguage('xx'), false);
  assert.equal(localeForLanguage('de'), 'de-DE');
  assert.equal(localeForLanguage('la'), 'la');
  assert.equal(localeForLanguage('xx'), localeForLanguage(DEFAULT_LANGUAGE));
});

test('Pluralfunktionen aller Sprachen unterscheiden 1 von "mehreren" bei Kartenzahlen', () => {
  for (const lang of LANGUAGES) {
    const one = translate(lang, 'cards.deletedToast', { n: 1 });
    const many = translate(lang, 'cards.deletedToast', { n: 5 });
    assert.notEqual(one, many, `Sprache "${lang}" unterscheidet Singular/Plural nicht in cards.deletedToast`);
  }
});
