// Schnellerfassung: liest ein Textfeld zeilenweise abwechselnd als Vorder- und Rückseite.
// Leere Zeilen sind optische Trenner und werden ignoriert. Eine Zeile mit Tabulator
// bildet allein eine Karte (A und B derselben Zeile), etwa beim Einfügen aus Tabellen.

export function parseQuickCapture(text) {
  const lines = text.split(/\r\n|\n/);
  const cards = [];
  const warnings = [];
  let pendingFront = null;
  let pendingFrontLine = null;

  const flushPendingAsWarning = () => {
    if (pendingFront !== null) {
      warnings.push({ line: pendingFrontLine, text: pendingFront, reason: 'missing-back' });
      pendingFront = null;
      pendingFrontLine = null;
    }
  };

  lines.forEach((rawLine, idx) => {
    if (rawLine.trim() === '') return;

    if (rawLine.includes('\t')) {
      flushPendingAsWarning();
      const tabIndex = rawLine.indexOf('\t');
      const a = rawLine.slice(0, tabIndex).trim();
      const b = rawLine.slice(tabIndex + 1).trim();
      cards.push({ a, b });
      return;
    }

    const value = rawLine.trim();
    if (pendingFront === null) {
      pendingFront = value;
      pendingFrontLine = idx + 1;
    } else {
      cards.push({ a: pendingFront, b: value });
      pendingFront = null;
      pendingFrontLine = null;
    }
  });

  flushPendingAsWarning();

  return { cards, warnings };
}
