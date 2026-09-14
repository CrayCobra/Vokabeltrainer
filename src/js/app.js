// Bootstrap: Zustand, Routing, Speicherung, Toasts, Export. DOM-Aufbau der Ansichten
// selbst liegt in views.js.

import { APP_VERSION } from './version.js';
import { createIndexedDbAdapter, createRepository } from './storage.js';
import { renderOnboarding, renderShell } from './views.js';
import { icons } from './icons.js';
import { serializeDocument, buildExportFilename } from './fileio.js';

const VIEWS = ['karten', 'erfassen', 'import'];

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

  const state = {
    view: viewFromHash(),
    cardsSession: freshCardsSession(),
  };

  function showToast({ message, actionLabel, onAction }) {
    const region = document.getElementById('toast-region');
    if (!region) return;
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
    }, 7000);
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
    setInitialDoc,
    showToast,
    exportDocument,
    refreshHeaderCount() {},
  };

  window.addEventListener('hashchange', () => {
    const next = viewFromHash();
    if (next !== state.view) {
      state.view = next;
      state.cardsSession = freshCardsSession();
      render();
    }
  });

  const loaded = await repo.load();
  doc = loaded.doc;
  emptyReason = loaded.emptyReason;
  if (doc) await repo.requestPersistence();
  render();
}
