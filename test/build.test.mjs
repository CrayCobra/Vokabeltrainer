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
import { buildServiceWorker, buildManifest } from '../build.mjs';

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

  for (const file of [
    'index.html',
    'app.css',
    'app.js',
    'sw.js',
    'manifest.webmanifest',
    'icon.svg',
    'icon-192.png',
    'icon-512.png',
    'apple-touch-icon.png',
  ]) {
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

// Die folgenden Tests greifen auf das dist/ zu, das der Test oben bereits gebaut hat – node:test
// führt Tests innerhalb einer Datei ohne { concurrency: true } der Reihe nach aus, ein erneuter
// Bau wäre hier nur redundant.

test('dist/app.html und dist/pages/ unterscheiden sich nur in Installierbarkeit/Offline-Cache-Anteilen', () => {
  const appHtml = readFileSync(path.join(ROOT, 'dist', 'app.html'), 'utf8');
  // app.html enthält zwei <script>-Tags (Theme-Vorablauf + gebündeltes Hauptskript); das
  // gierige [\s\S]* vor der Gruppe springt zum letzten Script-Block, dem Bündel.
  // Das HTML-Template umschließt das eingesetzte Skript/CSS mit eigenen Zeilenumbrüchen
  // (<script>\n...\n</script>); die sind Formatierung des Templates, kein Bündelinhalt, daher
  // getrimmt vergleichen statt roh.
  const appScript = appHtml.match(/[\s\S]*<script>([\s\S]*?)<\/script>/)[1].trim();
  const appCss = appHtml.match(/<style>\n([\s\S]*?)\n<\/style>/)[1].trim();

  const pagesScript = readFileSync(path.join(ROOT, 'dist', 'pages', 'app.js'), 'utf8').trim();
  const pagesCss = readFileSync(path.join(ROOT, 'dist', 'pages', 'app.css'), 'utf8').trim();

  assert.equal(appScript, pagesScript, 'das gebündelte Skript muss in beiden Artefakten byteidentisch sein');
  assert.equal(appCss, pagesCss, 'das CSS muss in beiden Artefakten byteidentisch sein');
});

test('Manifest ist valide und referenziert nur eigene, tatsächlich vorhandene Dateien', () => {
  const pagesDir = path.join(ROOT, 'dist', 'pages');
  const manifest = JSON.parse(readFileSync(path.join(pagesDir, 'manifest.webmanifest'), 'utf8'));

  assert.match(manifest.start_url, /^\.\//, 'start_url muss relativ sein');
  assert.match(manifest.scope, /^\.\//, 'scope muss relativ sein');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    assert.doesNotMatch(icon.src, /^https?:\/\//, `Icon-Quelle darf keine externe URL sein: ${icon.src}`);
    assert.doesNotThrow(
      () => readFileSync(path.join(pagesDir, icon.src)),
      `im Manifest referenziertes Icon fehlt: ${icon.src}`
    );
  }
  assert.ok(
    manifest.icons.some((icon) => icon.type === 'image/png' && icon.sizes === '512x512'),
    'ein 512x512-PNG-Icon wird für die Installierbarkeit erwartet'
  );
});

test('erzeugte PNG-Icons haben eine gültige Signatur und die erwarteten Abmessungen', () => {
  const pagesDir = path.join(ROOT, 'dist', 'pages');
  const expected = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
  for (const [file, size] of Object.entries(expected)) {
    const buf = readFileSync(path.join(pagesDir, file));
    assert.deepEqual(
      [...buf.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
      `${file} muss eine gültige PNG-Signatur haben`
    );
    assert.equal(buf.readUInt32BE(16), size, `${file} muss ${size}px breit sein`);
    assert.equal(buf.readUInt32BE(20), size, `${file} muss ${size}px hoch sein`);
  }
});

test('pages/index.html registriert den Service Worker und verweist auf apple-touch-icon und Manifest', () => {
  const pagesHtml = readFileSync(path.join(ROOT, 'dist', 'pages', 'index.html'), 'utf8');
  assert.match(pagesHtml, /navigator\.serviceWorker\.register\(["']sw\.js["']\)/);
  assert.match(pagesHtml, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  assert.match(pagesHtml, /<link rel="manifest" href="manifest\.webmanifest">/);
});

test('dist/app.html registriert keinen Service Worker (aus eingebetteter Ressource nicht möglich)', () => {
  const appHtml = readFileSync(path.join(ROOT, 'dist', 'app.html'), 'utf8');
  assert.doesNotMatch(appHtml, /serviceWorker\.register/);
  assert.doesNotMatch(appHtml, /<link rel="manifest"/);
});

// Führt den generierten Service-Worker-Quelltext in einem gemockten Worker-Kontext aus (eigenes,
// minimales In-Memory-`caches` statt eines echten Browsers), um das Cache-Ersetzungsverhalten
// bei einem Versionswechsel zu prüfen, ohne dafür einen echten Browser zu brauchen (siehe
// TESTPLAN.md, "Inkrement 6 – Auslieferung als zwei Artefakte").
function runServiceWorkerInMockScope(source, cacheStore) {
  const listeners = {};
  const fakeCaches = {
    open: async (name) => {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      const store = cacheStore.get(name);
      return {
        addAll: async (urls) => {
          for (const url of urls) store.set(url, true);
        },
      };
    },
    keys: async () => [...cacheStore.keys()],
    delete: async (name) => cacheStore.delete(name),
    match: async () => undefined,
  };
  const context = {
    self: {
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: fakeCaches,
    fetch: async () => {
      throw new Error('fetch sollte im Test nicht aufgerufen werden');
    },
  };
  context.self.caches = fakeCaches;
  vm.createContext(context);
  new vm.Script(source).runInContext(context);
  return {
    async fireInstall() {
      const tasks = [];
      listeners.install({ waitUntil: (p) => tasks.push(p) });
      await Promise.all(tasks);
    },
    async fireActivate() {
      const tasks = [];
      listeners.activate({ waitUntil: (p) => tasks.push(p) });
      await Promise.all(tasks);
    },
  };
}

test('Service Worker ersetzt den Cache bei neuer Version sauber und löscht den alten Cache-Eintrag', async () => {
  const cacheStore = new Map();

  const swV1 = runServiceWorkerInMockScope(buildServiceWorker('1.0.0'), cacheStore);
  await swV1.fireInstall();
  await swV1.fireActivate();
  assert.deepEqual([...cacheStore.keys()], ['vokabeltrainer-1.0.0']);

  const swV2 = runServiceWorkerInMockScope(buildServiceWorker('2.0.0'), cacheStore);
  await swV2.fireInstall();
  assert.deepEqual(
    [...cacheStore.keys()].sort(),
    ['vokabeltrainer-1.0.0', 'vokabeltrainer-2.0.0'],
    'install legt den neuen Cache an, ohne den alten sofort zu löschen'
  );
  await swV2.fireActivate();
  assert.deepEqual(
    [...cacheStore.keys()],
    ['vokabeltrainer-2.0.0'],
    'activate löscht jeden Cache-Namen außer dem aktuellen'
  );
});

test('Manifest-Versionsnummer wechselt mit der App-Version', () => {
  const manifestV1 = JSON.parse(buildManifest('1.2.3'));
  assert.equal(manifestV1.version, '1.2.3');
  assert.doesNotMatch(JSON.stringify(manifestV1), /https?:\/\//);
});
