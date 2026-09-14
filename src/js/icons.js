// Eigene, im Dokument eingebettete SVG-Symbole (keine Icon-Bibliothek, kein Webfont).
// Jede Funktion liefert ein <svg>-Element mit aria-hidden, da Icons stets neben
// beschriftetem Text stehen und selbst keine eigene Bedeutung transportieren.

function svg(pathD, { viewBox = '0 0 24 24', extra, circles } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('width', '20');
  el.setAttribute('height', '20');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.classList.add('icon');
  if (Array.isArray(pathD)) {
    for (const d of pathD) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      el.appendChild(p);
    }
  }
  if (Array.isArray(circles)) {
    for (const { cx, cy, r } of circles) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', cx);
      c.setAttribute('cy', cy);
      c.setAttribute('r', r);
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', '2');
      el.appendChild(c);
    }
  }
  if (extra) el.appendChild(extra);
  return el;
}

export const icons = {
  search: () => svg(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M21 21l-4.3-4.3']),
  edit: () => svg(['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M13.5 7.5l3 3']),
  trash: () => svg(['M5 7h14', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13']),
  starFilled: () =>
    svg(['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9 2.6-5.3Z'], {
      extra: (() => {
        const ns = 'http://www.w3.org/2000/svg';
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9 2.6-5.3Z');
        p.setAttribute('fill', 'currentColor');
        p.setAttribute('stroke', 'none');
        return p;
      })(),
    }),
  starOutline: () => svg(['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9 2.6-5.3Z']),
  plus: () => svg(['M12 5v14', 'M5 12h14']),
  upload: () => svg(['M12 16V4', 'M6 10l6-6 6 6', 'M4 20h16']),
  download: () => svg(['M12 4v12', 'M6 10l6 6 6-6', 'M4 20h16']),
  close: () => svg(['M6 6l12 12', 'M18 6L6 18']),
  check: () => svg(['M4 12l5 5L20 6']),
  warning: () => svg(['M12 3l10 18H2L12 3Z', 'M12 10v4', 'M12 17h.01']),
  undo: () => svg(['M9 5L4 10l5 5', 'M4 10h10a6 6 0 0 1 0 12h-2']),
  settings: () =>
    svg(['M3 6h5', 'M12 6h9', 'M3 12h10', 'M17 12h4', 'M3 18h3', 'M10 18h11'], {
      circles: [
        { cx: 10, cy: 6, r: 2 },
        { cx: 15, cy: 12, r: 2 },
        { cx: 8, cy: 18, r: 2 },
      ],
    }),
};
