// Regressionswächter für das Abnahmekriterium aus CLAUDE.md: "kein sichtbarer Text mehr fest
// im Code steht". Ein vollständiger Beweis ist mit einer einfachen Suche nicht möglich, aber
// diese Liste deutscher UI-Wörter/-Sätze, die vor der Übersetzung fest im Code standen, darf in
// den übersetzten Modulen nicht wieder auftauchen. i18n-de.js selbst ist davon ausgenommen, da
// dort die deutschen Texte natürlich stehen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Entfernt //- und /* */-Kommentare grob (reicht für diesen Zweck; kein vollwertiger Parser).
// Codekommentare bleiben absichtlich Deutsch, passend zur übrigen Projektdokumentation
// (CLAUDE.md, vokabel-app-entwurf.md, Commit-Nachrichten) – nur sichtbarer UI-Text zählt für
// das Abnahmekriterium.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES_THAT_MUST_STAY_FREE_OF_GERMAN_UI_TEXT = [
  'src/js/views.js',
  'src/js/app.js',
  'src/js/model.js',
  'src/js/fileio.js',
  'src/js/testgoal.js',
  'src/index.html',
];

// Ausdrücke, die vor Inkrement 5 wortwörtlich im Code standen (Auszug, keine Wortliste des
// ganzen Wortschatzes, aber breit genug, um einen Rückfall zuverlässig zu bemerken).
const FORBIDDEN_PHRASES = [
  'Sitzung beenden',
  'Karten übernehmen',
  'Sitzung starten',
  'Test starten',
  'Zuletzt gesichert',
  'Kastenverteilung',
  'Lernserie',
  'Schnellerfassung',
  'Karten importieren',
  'Trefferquote',
  'Reparaturkiste',
  'Zufällig',
  'Eingabereihenfolge',
  'Vorderseite fehlt',
  'Rückseite fehlt',
  'braucht einen Namen',
  'Systemeinstellung folgen',
  'Übungsrunde mit falschen Karten',
  'Wochenjoker',
  'Ein Feld antippen für Details',
];

test('Abnahmekriterium: kein bekannter deutscher UI-Text steckt noch fest im Code', async () => {
  for (const relPath of FILES_THAT_MUST_STAY_FREE_OF_GERMAN_UI_TEXT) {
    const raw = await readFile(path.join(ROOT, relPath), 'utf8');
    const content = relPath.endsWith('.html') ? raw : stripComments(raw);
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(!content.includes(phrase), `${relPath} enthält noch den festen deutschen Text „${phrase}“ (außerhalb von Kommentaren)`);
    }
  }
});

test('views.js verwendet ctx.t(...) statt eigener Textliterale in den Ansichten', async () => {
  const content = await readFile(path.join(ROOT, 'src/js/views.js'), 'utf8');
  // Grobe Prüfung: die Datei muss durchgängig ctx.t(...) nutzen; eine Mindestanzahl an
  // Aufrufen ist ein guter Hinweis darauf, dass tatsächlich übersetzt statt nur importiert wird.
  const callCount = (content.match(/\bt\(['"]/g) || []).length;
  assert.ok(callCount > 100, `Erwartet deutlich mehr als 100 t(...)-Aufrufe in views.js, gefunden: ${callCount}`);
});
