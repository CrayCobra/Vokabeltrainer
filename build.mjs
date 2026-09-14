#!/usr/bin/env node
// Eigenes, abhängigkeitsfreies Bau-Skript. Erzeugt aus src/ zwei Artefakte:
//   dist/app.html   – eigenständige Einzeldatei, läuft per Doppelklick über file://
//   dist/pages/      – Ordner für GitHub Pages mit Manifest und Service Worker
// Beide stammen aus derselben Quelle (src/js/*.js werden zu einem einzigen,
// modulfreien Skript zusammengefügt) und unterscheiden sich nur in
// Installierbarkeit und Offline-Cache.

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Reihenfolge ist wichtig: jedes Modul darf nur von vorherigen abhängen.
const MODULE_ORDER = [
  'version.js',
  'dom.js',
  'icons.js',
  'model.js',
  'csv.js',
  'capture.js',
  'fileio.js',
  'storage.js',
  'learn.js',
  'testgoal.js',
  'bufferedwriter.js',
  'theme.js',
  'stats.js',
  'i18n-de.js',
  'i18n-en.js',
  'i18n-es.js',
  'i18n-fr.js',
  'i18n-la.js',
  'i18n.js',
  'uilang.js',
  'views.js',
  'app.js',
];

// Prüft vor dem Bündeln, dass MODULE_ORDER weder eine Datei aus src/js/ vergisst noch eine
// nicht mehr vorhandene nennt, und dass jedes import-Ziel vor der importierenden Datei steht.
// Ein vergessener Eintrag hier führt sonst nicht zu einem Fehler beim Bauen, sondern zu einem
// "X is not defined" erst zur Laufzeit im Browser – genau das ist einmal passiert (testgoal.js
// fehlte), unbemerkt von den node:test-Tests, die echte ES-Module statt des Bündels prüfen.
async function validateModuleGraph() {
  const files = (await readdir(path.join(SRC, 'js'))).filter((f) => f.endsWith('.js'));
  const missingFromOrder = files.filter((f) => !MODULE_ORDER.includes(f));
  const staleInOrder = MODULE_ORDER.filter((f) => !files.includes(f));
  if (missingFromOrder.length > 0) {
    throw new Error(`Diese Dateien in src/js/ fehlen in MODULE_ORDER: ${missingFromOrder.join(', ')}`);
  }
  if (staleInOrder.length > 0) {
    throw new Error(`MODULE_ORDER nennt Dateien, die es in src/js/ nicht (mehr) gibt: ${staleInOrder.join(', ')}`);
  }

  const indexOf = new Map(MODULE_ORDER.map((name, i) => [name, i]));
  for (const [i, name] of MODULE_ORDER.entries()) {
    const raw = await readFile(path.join(SRC, 'js', name), 'utf8');
    const importMatches = raw.matchAll(/^import\s+\{([^}]*)\}\s+from\s+['"]\.\/([^'"]+)['"];\s*$/gm);
    for (const match of importMatches) {
      const [, names, dep] = match;
      // stripModuleSyntax entfernt die ganze import-Zeile und verlässt sich darauf, dass der
      // importierte Name danach als gleichnamige Top-Level-Bindung existiert; "import { x as y }"
      // bricht das, weil der Rest der Datei "y" verwendet, das es im Bündel nie gibt. Einmal
      // passiert (i18n.js), als "de is not defined" erst zur Laufzeit sichtbar, nicht beim Bauen.
      if (/\bas\b/.test(names)) {
        throw new Error(`${name} importiert mit "as" (umbenennend) aus './${dep}' – das unterstützt das Bau-Skript nicht, da es import-Zeilen nur entfernt, ohne Umbenennungen nachzuziehen. Ohne "as" importieren.`);
      }
      if (!indexOf.has(dep)) {
        throw new Error(`${name} importiert './${dep}', das nicht in MODULE_ORDER steht.`);
      }
      if (indexOf.get(dep) >= i) {
        throw new Error(`${name} importiert './${dep}', das in MODULE_ORDER erst an gleicher Stelle oder später folgt.`);
      }
    }
  }
}

const TOP_LEVEL_DECL = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)|^(?:export\s+)?let\s+(\w+)|^(?:export\s+)?class\s+(\w+)/gm;

function extractTopLevelNames(source) {
  const names = [];
  for (const match of source.matchAll(TOP_LEVEL_DECL)) {
    names.push(match[1] || match[2] || match[3] || match[4]);
  }
  return names;
}

// Prüft, dass kein von zwei Dateien unabhängig vergebener Name (exportiert oder nicht) nach
// dem Bündeln in derselben Top-Level-Ebene kollidiert. Eine Kollision zwischen zwei `const`
// wirft beim Bauen (vm.Script erkennt "already been declared"), eine zwischen zwei `function`
// dagegen nicht – das ist gültiges JavaScript, überschreibt aber still die erste Definition
// mit der zweiten. Genau das ist einmal passiert (cardWord in allen fünf i18n-*.js-Dateien),
// unbemerkt von jedem Test, der die echten ES-Module statt des Bündels prüft. Diese Prüfung
// deckt beide Fälle vorab ab, unabhängig davon, ob JavaScript selbst einen Fehler wirft.
async function assertNoDuplicateTopLevelNames() {
  const owners = new Map();
  for (const name of MODULE_ORDER) {
    const raw = await readFile(path.join(SRC, 'js', name), 'utf8');
    for (const ident of extractTopLevelNames(raw)) {
      if (!owners.has(ident)) owners.set(ident, []);
      owners.get(ident).push(name);
    }
  }
  const collisions = [...owners.entries()].filter(([, files]) => files.length > 1);
  if (collisions.length > 0) {
    const details = collisions.map(([ident, files]) => `${ident} (${files.join(', ')})`).join('; ');
    throw new Error(`Mehrfach vergebene Bezeichner würden sich nach dem Bündeln gegenseitig überschreiben: ${details}`);
  }
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

async function bundleScript(version) {
  const parts = [];
  for (const name of MODULE_ORDER) {
    const raw = await readFile(path.join(SRC, 'js', name), 'utf8');
    parts.push(`// ---- src/js/${name} ----\n${stripModuleSyntax(raw)}`);
  }
  const body = parts.join('\n\n').replaceAll('__APP_VERSION__', version);
  return [
    '(function () {',
    "'use strict';",
    body,
    'function boot() { startApp(document.getElementById("app")); }',
    'if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); } else { boot(); }',
    '})();',
  ].join('\n');
}

function assertNoModuleLeftovers(script) {
  const importLeak = /^\s*import\s/m.test(script);
  const exportLeak = /^\s*export\s/m.test(script);
  if (importLeak || exportLeak) {
    throw new Error('Gebündeltes Skript enthält noch import/export – Bündelung unvollständig.');
  }
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

async function buildAppHtml(script, css, version) {
  let html = await readFile(path.join(SRC, 'index.html'), 'utf8');
  const iconSvg = await readFile(path.join(SRC, 'icon.svg'), 'utf8');
  const iconDataUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg, 'utf8').toString('base64')}`;

  html = html.replace(/\s*<link rel="stylesheet" href="app\.css">\s*/, `\n<style>\n${css}\n</style>\n`);
  html = html.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    `<script>\n${script}\n</script>`
  );
  html = html.replace('__APP_VERSION__', version);
  html = html.replace('</head>', `  <link rel="icon" href="${iconDataUri}">\n</head>`);

  await mkdir(DIST, { recursive: true });
  await writeFile(path.join(DIST, 'app.html'), html, 'utf8');
}

function buildManifest(version) {
  return JSON.stringify(
    {
      name: 'Vokabeltrainer',
      short_name: 'Vokabeltrainer',
      description: 'Digitaler Karteikasten – lokal, ohne Konto, ohne Internet.',
      start_url: './index.html',
      scope: './',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#0a58ca',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      lang: 'de',
      version,
    },
    null,
    2
  );
}

function buildServiceWorker(version) {
  return `// Wird bei neuer Version sauber ersetzt; cacht ausschließlich eigene Dateien,
// ohne Nutzerdaten (die liegen in IndexedDB, nicht im Cache) zu berühren.
const CACHE_NAME = 'vokabeltrainer-${version}';
const APP_SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
`;
}

async function buildPages(script, css, version) {
  const pagesDir = path.join(DIST, 'pages');
  await mkdir(pagesDir, { recursive: true });

  let html = await readFile(path.join(SRC, 'index.html'), 'utf8');
  html = html.replace('__APP_VERSION__', version);
  html = html.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    '<script src="app.js"></script>'
  );
  html = html.replace('</head>', '  <link rel="icon" href="icon.svg">\n  <link rel="manifest" href="manifest.webmanifest">\n</head>');
  html = html.replace(
    '</body>',
    '  <script>if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("sw.js")); }</script>\n</body>'
  );

  await writeFile(path.join(pagesDir, 'index.html'), html, 'utf8');
  await writeFile(path.join(pagesDir, 'app.css'), css, 'utf8');
  await writeFile(path.join(pagesDir, 'app.js'), script, 'utf8');
  await writeFile(path.join(pagesDir, 'manifest.webmanifest'), buildManifest(version), 'utf8');
  await writeFile(path.join(pagesDir, 'sw.js'), buildServiceWorker(version), 'utf8');
  await writeFile(path.join(pagesDir, 'icon.svg'), await readFile(path.join(SRC, 'icon.svg'), 'utf8'), 'utf8');
}

async function main() {
  await validateModuleGraph();
  await assertNoDuplicateTopLevelNames();
  const version = await readVersion();
  const css = await readFile(path.join(SRC, 'app.css'), 'utf8');
  const script = await bundleScript(version);
  assertNoModuleLeftovers(script);

  await rm(DIST, { recursive: true, force: true });
  await buildAppHtml(script, css, version);
  await buildPages(script, css, version);

  console.log(`Version ${version} gebaut: dist/app.html und dist/pages/`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
