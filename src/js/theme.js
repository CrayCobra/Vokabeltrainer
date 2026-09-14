// Erscheinungsbild: folgt per Voreinstellung der Systemeinstellung, lässt sich aber
// überschreiben (siehe vokabel-app-entwurf.md, Abschnitt 9). Eine Kleinigkeit im Sinne von
// CLAUDE.md, daher in localStorage abgelegt statt im .vok.json-Dokument.

const STORAGE_KEY = 'vokabeltrainer.theme';
export const THEME_OPTIONS = ['system', 'light', 'dark'];

export function loadThemePreference(store = globalThis.localStorage) {
  if (!store) return 'system';
  try {
    const value = store.getItem(STORAGE_KEY);
    return THEME_OPTIONS.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(value, store = globalThis.localStorage) {
  if (!THEME_OPTIONS.includes(value)) throw new Error(`Unbekanntes Erscheinungsbild: ${value}`);
  if (!store) return;
  try {
    if (value === 'system') store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, value);
  } catch {
    // Kleinigkeit: ist localStorage nicht verfügbar, bleibt nur die Systemeinstellung wirksam.
  }
}

// Setzt data-theme auf dem Wurzelelement; app.css wertet es sowohl im hellen als auch im
// dunklen Systemzustand aus, damit eine ausdrückliche Wahl in beide Richtungen gewinnt.
export function applyThemePreference(value, doc = globalThis.document) {
  if (!doc || !doc.documentElement) return;
  if (value === 'light' || value === 'dark') doc.documentElement.setAttribute('data-theme', value);
  else doc.documentElement.removeAttribute('data-theme');
}
