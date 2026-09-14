// Regressionstest für build/icon-render.mjs: das Motiv ist absichtlich als eigener Zeichencode
// dupliziert statt aus src/icon.svg geparst (siehe Kommentar dort). Dieser Test fängt zumindest
// ein Auseinanderlaufen der Kernfarben ab, wenn jemand nur eine der beiden Dateien ändert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderIconRGBA } from '../build/icon-render.mjs';
import { encodePNG } from '../build/png.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Kernfarben aus src/icon.svg stecken auch im gerenderten Icon', () => {
  const svg = readFileSync(path.join(ROOT, 'src', 'icon.svg'), 'utf8');
  const fillColors = [...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
  assert.ok(fillColors.includes('#0a58ca'), 'Hintergrundfarbe aus icon.svg fehlt im Test-Fixture');
  assert.ok(fillColors.includes('#ffffff'), 'Kartenfarbe aus icon.svg fehlt im Test-Fixture');

  const size = 64;
  const rgba = renderIconRGBA(size, 2);
  // Pixel (4,4) liegt sicher im abgerundeten Hintergrund, außerhalb jeder Karte/Linie.
  const idx = (4 * size + 4) * 4;
  assert.deepEqual([rgba[idx], rgba[idx + 1], rgba[idx + 2]], [10, 88, 202]);
  assert.equal(rgba[idx + 3], 255);
});

test('renderIconRGBA liefert transparente Ecken (abgerundetes Icon, kein Quadrat)', () => {
  const size = 64;
  const rgba = renderIconRGBA(size, 2);
  const idx = 0; // Pixel (0,0), außerhalb des Eckradius von 14
  assert.equal(rgba[idx + 3], 0, 'die äußere Ecke muss transparent sein, nicht blau gefüllt');
});

test('encodePNG(renderIconRGBA(...)) erzeugt eine gültige, korrekt große PNG-Datei', () => {
  const size = 32;
  const png = encodePNG(size, size, renderIconRGBA(size, 2));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
});
