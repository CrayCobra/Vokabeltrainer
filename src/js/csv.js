// CSV-Import: Kodierungs- und Trennzeichenerkennung, RFC4180-artiger Parser, Vorschau.

// Erkennt die Kodierung anhand einer BOM oder eines Dekodierversuchs als UTF-8;
// scheitert dieser, wird auf Windows-1252 ausgewichen (deutsches Excel ohne UTF-8-Export).
export function decodeCsvBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function countUnquoted(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

export function detectDelimiter(text) {
  const candidates = [';', ',', '\t'];
  const lines = text.split(/\r\n|\n/).filter((l) => l.length > 0).slice(0, 5);
  let best = ';';
  let bestScore = -1;
  for (const delimiter of candidates) {
    if (lines.length === 0) continue;
    const counts = lines.map((l) => countUnquoted(l, delimiter));
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.every((c) => c === first);
    const score = (consistent ? 1000 : 0) + first;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

// Zustandsbasierter Parser: unterstützt in Anführungszeichen eingeschlossene Felder mit
// eingebetteten Trennzeichen, Zeilenumbrüchen und verdoppelten Anführungszeichen ("").
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Wandelt geparste Zeilen in Kandidaten-Karten um. colA/colB sind 0-basierte Spaltenindizes.
export function rowsToCards(rows, colA, colB, { skipFirstRow = false } = {}) {
  const dataRows = skipFirstRow ? rows.slice(1) : rows;
  const cards = [];
  const skipped = [];
  dataRows.forEach((row, i) => {
    const a = (row[colA] ?? '').trim();
    const b = (row[colB] ?? '').trim();
    if (a === '') { skipped.push({ row: i + 1, reason: 'missing-front' }); return; }
    cards.push({ a, b });
  });
  return { cards, skipped };
}
