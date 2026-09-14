// Regressionstest für build.mjs selbst: prüft, dass beide Artefakte entstehen, keine
// import/export-Reste übrig bleiben, kein Netzwerkaufruf referenziert wird und das
// gebündelte Skript syntaktisch gültiges JavaScript ist. Das tatsächliche Verhalten im
// Browser (Offline-Start, Installierbarkeit) ist nur manuell prüfbar, siehe TESTPLAN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('build.mjs erzeugt dist/app.html und dist/pages/ ohne Netzwerkreferenzen', () => {
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'pipe' });

  const appHtml = readFileSync(path.join(ROOT, 'dist', 'app.html'), 'utf8');
  // Die SVG-Namensraum-Kennung ist keine Netzwerkadresse, sondern ein reiner XML-Bezeichner
  // (createElementNS), den Browser nicht abrufen; er wird vor der Prüfung ausgeblendet.
  const withoutNamespaceIds = appHtml.replaceAll('http://www.w3.org/2000/svg', '');
  assert.doesNotMatch(withoutNamespaceIds, /https?:\/\//, 'dist/app.html darf keine externen URLs enthalten');
  assert.doesNotMatch(appHtml, /^\s*import\s/m);
  assert.doesNotMatch(appHtml, /^\s*export\s/m);
  assert.match(appHtml, /<style>/, 'CSS muss inline eingebettet sein');
  assert.doesNotMatch(appHtml, /<link rel="stylesheet"/);

  const scriptMatch = appHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'app.html muss ein eingebettetes <script> enthalten');
  assert.doesNotThrow(() => new vm.Script(scriptMatch[1]), 'gebündeltes Skript muss syntaktisch gültig sein');

  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // Die im Header sichtbare Versionsnummer entsteht erst zur Laufzeit im Browser (siehe
  // TESTPLAN.md); statisch prüfbar ist, dass build.mjs sie ins Dokument und ins Bündel
  // eingesetzt hat.
  assert.match(appHtml, new RegExp(`name="application-version" content="${pkg.version.replace(/\./g, '\\.')}"`));
  assert.match(appHtml, new RegExp(`APP_VERSION = '${pkg.version.replace(/\./g, '\\.')}'`));

  for (const file of ['index.html', 'app.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg']) {
    const p = path.join(ROOT, 'dist', 'pages', file);
    assert.doesNotThrow(() => readFileSync(p, 'utf8'), `dist/pages/${file} muss erzeugt werden`);
  }

  const pagesHtml = readFileSync(path.join(ROOT, 'dist', 'pages', 'index.html'), 'utf8');
  assert.doesNotMatch(pagesHtml.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//);

  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'dist', 'pages', 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.version, pkg.version);

  const pagesScript = readFileSync(path.join(ROOT, 'dist', 'pages', 'app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(pagesScript));
});
