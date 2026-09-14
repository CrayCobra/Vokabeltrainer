// Bootstrap: Zustand, Routing, Speicherung, Toasts, Export. DOM-Aufbau der Ansichten
// selbst liegt in views.js.

import { APP_VERSION } from './version.js';
import { createIndexedDbAdapter, createRepository } from './storage.js';
import { createBufferedWriter } from './bufferedwriter.js';
import { renderOnboarding, renderShell } from './views.js';
import { icons } from './icons.js';
import { serializeDocument, buildExportFilename } from './fileio.js';
import { recordSession, nowIso } from './model.js';
import { createSessionQueue } from './learn.js';
import { describeGoalProgress } from './testgoal.js';
import { loadThemePreference, saveThemePreference, applyThemePreference } from './theme.js';

const VIEWS = ['karten', 'erfassen', 'import', 'lernen', 'testen', 'einstellungen', 'statistik'];

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

  // Bereits vor dem ersten Rendern anwenden (ein Inline-Skript in index.html tut dasselbe
  // noch vor dem Laden dieses Skripts, damit kein falsches Erscheinungsbild aufblitzt); hier
  // nur zur Bestätigung und für spätere Änderungen über die Einstellungen.
  let themePreference = loadThemePreference();
  applyThemePreference(themePreference);

  function setThemePreference(value) {
    themePreference = value;
    saveThemePreference(value);
    applyThemePreference(value);
    render();
  }

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
    testSession: null,
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

  function startLearnSession({ order, direction, onlyMarked, cardIds }) {
    if (cardIds.length === 0) return;
    const queue = createSessionQueue(cardIds);
    state.learnSession = {
      order,
      direction,
      onlyMarked,
      queue,
      startedAt: nowIso(),
      startMs: Date.now(),
      correctCount: 0,
      wrongCount: 0,
      currentCardId: queue.draw(),
      finished: false,
    };
    render();
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

  // Startet eine Übungsrunde mit einer vorgegebenen Kartenmenge (etwa den falsch
  // beantworteten Karten eines Tests) und wechselt sofort und synchron in die Lernansicht,
  // statt auf das asynchrone hashchange-Ereignis zu warten.
  function startPracticeForWrongCards(cardIds, direction) {
    if (cardIds.length === 0) return;
    state.testSession = null;
    state.view = 'lernen';
    state.cardsSession = freshCardsSession();
    location.hash = 'lernen';
    startLearnSession({ order: 'sequential', direction, onlyMarked: false, cardIds });
  }

  // ---- Testmodus: Zielarten, Pause/Verlängern für Zeitziele ----

  function testSessionStats(ts) {
    return { correctCount: ts.correctCount, wrongCount: ts.wrongCount, elapsedMs: testElapsedMs(ts) };
  }

  function testElapsedMs(ts) {
    return ts.elapsedMs + (ts.paused || !ts.runningSince ? 0 : Date.now() - ts.runningSince);
  }

  function stopTestTicking(ts) {
    if (ts.timerId != null) {
      clearInterval(ts.timerId);
      ts.timerId = null;
    }
  }

  // Aktualisiert die Fortschrittsanzeige eines laufenden Zeitziels einmal pro Sekunde, ohne
  // die ganze Ansicht neu aufzubauen – das Intervall lebt in state.testSession und damit
  // unabhängig von ctx.render(), sonst würde jedes Rendern (etwa nach einer Bewertung) ein
  // weiteres, nie beendetes Intervall erzeugen.
  function startTestTicking(ts) {
    stopTestTicking(ts);
    if (ts.goal.type !== 'duration') return;
    ts.timerId = setInterval(() => {
      const progressEl = document.getElementById('test-progress');
      if (!progressEl) {
        stopTestTicking(ts);
        return;
      }
      const progress = describeGoalProgress(ts.goal, testSessionStats(ts));
      progressEl.textContent = progress.text;
      const badge = document.getElementById('test-goal-badge');
      if (badge) badge.hidden = !progress.reached;
    }, 1000);
  }

  function startTestSession({ order, direction, onlyMarked, goal, cardIds }) {
    if (cardIds.length === 0) return;
    const queue = createSessionQueue(cardIds);
    const ts = {
      order,
      direction,
      onlyMarked,
      goal,
      queue,
      startedAt: nowIso(),
      correctCount: 0,
      wrongCount: 0,
      currentCardId: queue.draw(),
      finished: false,
      paused: false,
      elapsedMs: 0,
      runningSince: Date.now(),
      timerId: null,
      wrongCardIds: new Set(),
    };
    state.testSession = ts;
    startTestTicking(ts);
    render();
  }

  function pauseTestSession() {
    const ts = state.testSession;
    if (!ts || ts.paused) return;
    ts.elapsedMs = testElapsedMs(ts);
    ts.paused = true;
    ts.runningSince = null;
    stopTestTicking(ts);
    render();
  }

  function resumeTestSession() {
    const ts = state.testSession;
    if (!ts || !ts.paused) return;
    ts.paused = false;
    ts.runningSince = Date.now();
    startTestTicking(ts);
    render();
  }

  function extendTestSession(extraSeconds) {
    const ts = state.testSession;
    if (!ts || ts.goal.type !== 'duration') return;
    ts.goal = { ...ts.goal, value: ts.goal.value + extraSeconds };
    render();
  }

  async function endTestSession(ts) {
    stopTestTicking(ts);
    await flushPersistence();
    if (ts.correctCount + ts.wrongCount > 0) {
      const seconds = Math.max(0, Math.round(testElapsedMs(ts) / 1000));
      const session = {
        date: ts.startedAt,
        mode: 'test',
        order: ts.order,
        direction: ts.direction,
        goal: ts.goal,
        correct: ts.correctCount,
        wrong: ts.wrongCount,
        seconds,
      };
      try {
        await persist(recordSession(doc, session));
      } catch {
        // persist zeigt einen Fehler bereits als Toast; die Kastenstände der einzelnen
        // Karten sind unabhängig davon schon gespeichert.
      }
      ts.finished = true;
    } else {
      state.testSession = null;
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
    startLearnSession,
    endLearnSession,
    startPracticeForWrongCards,
    startTestSession,
    pauseTestSession,
    resumeTestSession,
    extendTestSession,
    endTestSession,
    testSessionStats,
    get themePreference() {
      return themePreference;
    },
    setThemePreference,
    setInitialDoc,
    showToast,
    exportDocument,
    navigate(view) {
      location.hash = view;
    },
    refreshHeaderCount() {},
  };

  function leaveLearnView() {
    const ls = state.learnSession;
    if (ls && !ls.finished) {
      endLearnSession(ls).finally(() => {
        if (state.learnSession === ls) state.learnSession = null;
      });
    } else {
      state.learnSession = null;
    }
  }

  function leaveTestView() {
    const ts = state.testSession;
    if (ts) stopTestTicking(ts);
    if (ts && !ts.finished) {
      endTestSession(ts).finally(() => {
        if (state.testSession === ts) state.testSession = null;
      });
    } else {
      state.testSession = null;
    }
  }

  window.addEventListener('hashchange', () => {
    const next = viewFromHash();
    if (next === state.view) return;
    if (state.view === 'lernen') leaveLearnView();
    if (state.view === 'testen') leaveTestView();
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
