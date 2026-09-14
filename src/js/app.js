// Bootstrap: Zustand, Routing, Speicherung, Toasts, Export. DOM-Aufbau der Ansichten
// selbst liegt in views.js.

import { APP_VERSION } from './version.js';
import { createIndexedDbAdapter, createRepository } from './storage.js';
import { createBufferedWriter } from './bufferedwriter.js';
import { renderOnboarding, renderShell } from './views.js';
import { icons } from './icons.js';
import { serializeDocument, buildExportFilename } from './fileio.js';
import { recordSession } from './model.js';

const VIEWS = ['karten', 'erfassen', 'import', 'lernen'];

function freshCardsSession() {
  return {
    search: '',
    filterBox: '',
    filterRepair: '',
    filterMarked: '',
    selection: new Set(),
    editingId: null,
    undo: null,
  };
}

function viewFromHash() {
  const hash = location.hash.replace('#', '');
  return VIEWS.includes(hash) ? hash : 'karten';
}

function describeStorageError(err) {
  if (err && err.name === 'QuotaExceededError') {
    return 'Der Speicher des Browsers ist voll. Sichere deinen Stand jetzt als Datei und lösche nicht mehr benötigte Karten.';
  }
  return 'Speichern ist fehlgeschlagen. Bitte sichere deinen Stand als Datei, damit nichts verloren geht.';
}

export async function startApp(root) {
  const repo = createRepository(createIndexedDbAdapter());
  let doc = null;
  let emptyReason = null;
  let toastTimeout = null;

  // Liegt außerhalb von root, damit ein Neuaufbau der Ansicht (renderShell räumt root bei
  // jedem Aufruf und baut ihn neu auf) einen gerade angezeigten Toast nicht sofort wieder
  // entfernt – etwa die 3-Sekunden-Korrektur nach jeder bewerteten Lernkarte.
  const toastRegion = document.createElement('div');
  toastRegion.id = 'toast-region';
  toastRegion.setAttribute('role', 'status');
  toastRegion.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastRegion);

  const state = {
    view: viewFromHash(),
    cardsSession: freshCardsSession(),
    learnSession: null,
  };

  function showToast({ message, actionLabel, onAction, duration = 7000 }) {
    const region = toastRegion;
    if (toastTimeout) clearTimeout(toastTimeout);
    region.textContent = '';
    const toast = document.createElement('div');
    toast.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-link';
      btn.textContent = actionLabel;
      btn.addEventListener('click', async () => {
        region.textContent = '';
        await onAction();
      });
      toast.appendChild(btn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn toast-close';
    closeBtn.setAttribute('aria-label', 'Meldung schließen');
    closeBtn.appendChild(icons.close());
    closeBtn.addEventListener('click', () => {
      region.textContent = '';
    });
    toast.appendChild(closeBtn);
    region.appendChild(toast);
    toastTimeout = setTimeout(() => {
      if (region.contains(toast)) region.textContent = '';
    }, duration);
  }

  function render() {
    if (!doc) {
      renderOnboarding(root, { APP_VERSION, emptyReason, setInitialDoc });
      return;
    }
    renderShell(root, ctx);
  }

  async function setInitialDoc(newDoc) {
    await repo.save(newDoc);
    doc = newDoc;
    emptyReason = null;
    state.view = viewFromHash();
    await repo.requestPersistence();
    render();
  }

  async function persist(newDoc) {
    try {
      await repo.save(newDoc);
    } catch (err) {
      showToast({ message: describeStorageError(err) });
      throw err;
    }
    doc = newDoc;
    return doc;
  }

  // Für Aktionen, die schnell hintereinander schreiben (eine Kastenänderung nach jeder
  // bewerteten Karte im Lernmodus): das Dokument wird sofort im Speicher aktualisiert, das
  // tatsächliche Schreiben auf IndexedDB aber gebündelt, damit die Oberfläche flüssig bleibt.
  const writer = createBufferedWriter(async (docToSave) => {
    try {
      await repo.save(docToSave);
    } catch (err) {
      showToast({ message: describeStorageError(err) });
    }
  }, { delay: 400 });

  function persistBuffered(newDoc) {
    doc = newDoc;
    writer.schedule(newDoc);
  }

  async function flushPersistence() {
    await writer.flush();
  }

  async function endLearnSession(ls) {
    await flushPersistence();
    if (ls.correctCount + ls.wrongCount > 0) {
      const seconds = Math.max(0, Math.round((Date.now() - ls.startMs) / 1000));
      const session = {
        date: ls.startedAt,
        mode: 'learn',
        order: ls.order,
        direction: ls.direction,
        correct: ls.correctCount,
        wrong: ls.wrongCount,
        seconds,
      };
      try {
        await persist(recordSession(doc, session));
      } catch {
        // persist zeigt einen Fehler bereits als Toast; die Kastenstände der einzelnen
        // Karten sind unabhängig davon schon gespeichert.
      }
      ls.finished = true;
    } else {
      state.learnSession = null;
    }
  }

  function exportDocument() {
    const stamped = { ...doc, meta: { ...doc.meta, lastBackup: new Date().toISOString() } };
    const text = serializeDocument(stamped);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(stamped);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    persist(stamped).then(() => {
      render();
      showToast({ message: 'Sicherung wurde heruntergeladen.' });
    });
  }

  const ctx = {
    APP_VERSION,
    get doc() {
      return doc;
    },
    state,
    icons,
    render,
    persist,
    persistBuffered,
    flushPersistence,
    endLearnSession,
    setInitialDoc,
    showToast,
    exportDocument,
    navigate(view) {
      location.hash = view;
    },
    refreshHeaderCount() {},
  };

  window.addEventListener('hashchange', () => {
    const next = viewFromHash();
    if (next === state.view) return;
    if (state.view === 'lernen' && state.learnSession && !state.learnSession.finished) {
      const ls = state.learnSession;
      endLearnSession(ls).finally(() => {
        if (state.learnSession === ls) state.learnSession = null;
      });
    } else {
      state.learnSession = null;
    }
    state.view = next;
    state.cardsSession = freshCardsSession();
    render();
  });

  window.addEventListener('beforeunload', () => {
    // Bestmögliches Nachholen eines noch ausstehenden gebündelten Schreibvorgangs; ohne
    // Garantie, da der Browser das Beenden nicht zuverlässig aufhält.
    flushPersistence();
  });

  const loaded = await repo.load();
  doc = loaded.doc;
  emptyReason = loaded.emptyReason;
  if (doc) await repo.requestPersistence();
  render();
}
