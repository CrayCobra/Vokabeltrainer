// Zeichnet das App-Icon (dieselbe Form wie src/icon.svg) prozedural als RGBA-Rasterbild, damit
// das Bau-Skript daraus PNGs erzeugen kann, ohne einen SVG-Renderer als Abhängigkeit zu
// brauchen. Das Motiv ist bewusst hier dupliziert, nicht aus icon.svg geparst: die Form ist
// klein und stabil, ein eigener Mini-SVG-Parser für einen einzigen Anwendungsfall wäre mehr
// Risiko als der Doppeleintrag. Ändert sich icon.svg, muss diese Datei von Hand nachgezogen
// werden – ein Test vergleicht Kernfarben, damit ein Auseinanderlaufen auffällt.

const BG = [10, 88, 202]; // #0a58ca
const WHITE = [255, 255, 255];

function roundedRectCoverage(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
  const qy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
  return Math.sqrt(qx * qx + qy * qy) <= r;
}

function rotatePoint(px, py, pivotX, pivotY, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - pivotX;
  const dy = py - pivotY;
  return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
}

function segmentCoverage(px, py, x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  const dist = Math.hypot(px - nearX, py - nearY);
  return dist <= width / 2;
}

// Shapes in Zeichenreihenfolge (hinten nach vorne), Koordinaten im 64x64-Raum von icon.svg.
function shapesAt(px, py) {
  const layers = [];
  if (roundedRectCoverage(px, py, 0, 0, 64, 64, 14)) layers.push([...BG, 255]);
  const [rx, ry] = rotatePoint(px, py, 14, 20, 6); // invers zu rotate(-6 14 20)
  if (roundedRectCoverage(rx, ry, 14, 20, 30, 20, 3)) layers.push([...WHITE, 140]); // opacity 0.55
  if (roundedRectCoverage(px, py, 18, 22, 30, 20, 3)) layers.push([...WHITE, 255]);
  if (segmentCoverage(px, py, 23, 29, 43, 29, 2)) layers.push([...BG, 255]);
  if (segmentCoverage(px, py, 23, 35, 37, 35, 2)) layers.push([...BG, 255]);
  return layers;
}

function compositeSample(px, py) {
  let r = 0, g = 0, b = 0, a = 0;
  for (const [sr, sg, sb, sa8] of shapesAt(px, py)) {
    const sa = sa8 / 255;
    const outA = sa + a * (1 - sa);
    if (outA > 0) {
      r = (sr * sa + r * a * (1 - sa)) / outA;
      g = (sg * sa + g * a * (1 - sa)) / outA;
      b = (sb * sa + b * a * (1 - sa)) / outA;
    }
    a = outA;
  }
  return [r, g, b, a];
}

// Rendert das Icon bei `size` Pixel Kantenlänge. `supersample` Subpixel je Achse pro Zielpixel
// liefern die Kantenglättung, da roundedRectCoverage/segmentCoverage harte Ja/Nein-Tests sind.
export function renderIconRGBA(size, supersample = 4) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const scale = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < supersample; sy++) {
        const py = (y + (sy + 0.5) / supersample) * scale;
        for (let sx = 0; sx < supersample; sx++) {
          const px = (x + (sx + 0.5) / supersample) * scale;
          const [sr, sg, sb, sa] = compositeSample(px, py);
          // Premultiplied mitteln, damit teiltransparente Randpixel keine falsche Farbe annehmen.
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const n = supersample * supersample;
      const outA = a / n;
      const idx = (y * size + x) * 4;
      if (outA > 0) {
        rgba[idx] = r / n / outA;
        rgba[idx + 1] = g / n / outA;
        rgba[idx + 2] = b / n / outA;
      }
      rgba[idx + 3] = Math.round(outA * 255);
    }
  }
  return rgba;
}
