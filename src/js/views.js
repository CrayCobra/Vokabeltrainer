// Ansichten: reine DOM-Bau- und Ereignis-Verdrahtungsfunktionen. Jede render*-Funktion
// erhält einen Container und einen App-Kontext (ctx) mit Zugriff auf Dokument, Speicherung,
// Navigation und Meldungen. Um Fokusverlust beim Tippen zu vermeiden, wird bei Sucht-/Live-
// Vorschaufeldern nur ein Teilbaum aktualisiert statt der ganzen Ansicht.

import { el, clear } from './dom.js';
import { icons } from './icons.js';
import {
  createCard,
  createEmptyDocument,
  applyCardEdit,
  applyLearningResult,
  addCards,
  replaceCard,
  deleteCards,
  restoreCards,
  findDuplicateFronts,
  mergeDocuments,
  nowIso,
} from './model.js';
import { parseQuickCapture } from './capture.js';
import { decodeCsvBytes, detectDelimiter, parseCsv, rowsToCards } from './csv.js';
import { parseImportedText } from './fileio.js';
import { buildQueue, createSessionQueue } from './learn.js';

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Erststart / Leerzustand ----------

export function renderOnboarding(root, ctx) {
  clear(root);

  const banner =
    ctx.emptyReason === 'storage-cleared'
      ? el('div', { class: 'banner banner-warning', role: 'alert' }, [
          icons.warning(),
          el('div', {}, [
            el('p', { class: 'banner-title' }, 'Der gespeicherte Stand wurde vom Browser entfernt.'),
            el(
              'p',
              {},
              'Das kann passieren, wenn der Speicher lange nicht genutzt oder vom System geräumt wurde. Lade unten eine Sicherungsdatei, um weiterzumachen, oder leg einen neuen Stapel an.'
            ),
          ]),
        ])
      : null;

  const nameInput = el('input', { id: 'ob-deck-name', type: 'text', required: true, autocomplete: 'off' });
  const langAInput = el('input', { id: 'ob-lang-a', type: 'text', required: true, autocomplete: 'off', value: 'Deutsch' });
  const langBInput = el('input', { id: 'ob-lang-b', type: 'text', required: true, autocomplete: 'off', value: 'Englisch' });
  const profileInput = el('input', { id: 'ob-profile', type: 'text', autocomplete: 'off' });
  const errorBox = el('p', { class: 'field-error', hidden: true, role: 'alert' });

  const form = el(
    'form',
    {
      class: 'onboarding-form',
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        try {
          const doc = createEmptyDocument({
            deckName: nameInput.value,
            langA: langAInput.value,
            langB: langBInput.value,
            profileName: profileInput.value,
            appVersion: ctx.APP_VERSION,
          });
          await ctx.setInitialDoc(doc);
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', { for: 'ob-deck-name' }, 'Name des Stapels'), nameInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-lang-a' }, 'Sprache A'), langAInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-lang-b' }, 'Sprache B'), langBInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-profile' }, 'Profilname (optional)'), profileInput]),
      errorBox,
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Stapel anlegen'),
    ]
  );

  const backupInput = el('input', {
    type: 'file',
    id: 'ob-backup-file',
    accept: '.json,.vok.json,application/json',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const doc = parseImportedText(text);
        await ctx.setInitialDoc(doc);
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    },
  });

  const backupLabel = el('label', { for: 'ob-backup-file', class: 'btn btn-secondary file-btn' }, [
    icons.upload(),
    el('span', {}, 'Sicherungsdatei laden'),
  ]);

  root.append(
    el('main', { class: 'onboarding', id: 'main' }, [
      el('h1', {}, 'Vokabeltrainer'),
      banner,
      el('section', { 'aria-labelledby': 'ob-new-heading' }, [el('h2', { id: 'ob-new-heading' }, 'Neuen Stapel anlegen'), form]),
      el('section', { 'aria-labelledby': 'ob-restore-heading' }, [
        el('h2', { id: 'ob-restore-heading' }, 'Vorhandenen Stand laden'),
        el('p', {}, 'Eine zuvor gesicherte .vok.json-Datei lädt den kompletten Stapel samt Lernstand.'),
        backupLabel,
        el('div', { class: 'visually-hidden' }, [backupInput]),
      ]),
    ])
  );
}

// ---------- Anwendungsrahmen ----------

export function renderShell(root, ctx) {
  clear(root);

  const nav = el(
    'nav',
    { class: 'main-nav', 'aria-label': 'Bereiche' },
    [
      { view: 'lernen', label: 'Lernen' },
      { view: 'karten', label: 'Karten' },
      { view: 'erfassen', label: 'Erfassen' },
      { view: 'import', label: 'Import' },
    ].map(({ view, label }) =>
      el(
        'a',
        {
          href: `#${view}`,
          class: ctx.state.view === view ? 'nav-link active' : 'nav-link',
          'aria-current': ctx.state.view === view ? 'page' : null,
        },
        label
      )
    )
  );

  const lastBackup = ctx.doc.meta.lastBackup
    ? new Date(ctx.doc.meta.lastBackup).toLocaleString('de-DE')
    : 'noch nie';

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'app-header-top' }, [
      el('h1', {}, ctx.doc.deck.name),
      el('span', { class: 'version-tag' }, `v${ctx.APP_VERSION}`),
    ]),
    nav,
    el('div', { class: 'app-header-actions' }, [
      el('span', { class: 'save-status' }, `Zuletzt gesichert: ${lastBackup}`),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () => ctx.exportDocument(),
        },
        [icons.download(), el('span', {}, 'Sichern')]
      ),
    ]),
  ]);

  const main = el('main', { id: 'main' });
  root.append(header, main);

  if (ctx.state.view === 'karten') renderCardsView(main, ctx);
  else if (ctx.state.view === 'erfassen') renderCaptureView(main, ctx);
  else if (ctx.state.view === 'import') renderImportView(main, ctx);
  else renderLearnView(main, ctx);
}

// ---------- Kartenliste ----------

export function renderCardsView(container, ctx) {
  const session = ctx.state.cardsSession;

  const searchField = el('div', { class: 'search-field' }, [
    icons.search(),
    el('input', {
      id: 'card-search',
      type: 'search',
      placeholder: 'Suchen…',
      value: session.search,
      'aria-label': 'Karten durchsuchen',
      oninput: debounce((e) => {
        session.search = e.target.value;
        renderRows();
      }, 150),
    }),
  ]);

  const boxSelect = el(
    'select',
    {
      'aria-label': 'Nach Kasten filtern',
      onchange: (e) => {
        session.filterBox = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, 'Alle Kästen'),
      ...[1, 2, 3, 4, 5].map((n) =>
        el('option', { value: String(n), selected: session.filterBox === String(n) }, `Kasten ${n}`)
      ),
    ]
  );

  const repairSelect = el(
    'select',
    {
      'aria-label': 'Nach Reparaturkiste filtern',
      onchange: (e) => {
        session.filterRepair = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, 'Alle Karten'),
      el('option', { value: 'yes' }, 'Nur Reparaturkiste'),
      el('option', { value: 'no' }, 'Ohne Reparaturkiste'),
    ]
  );

  const markedSelect = el(
    'select',
    {
      'aria-label': 'Nach Markierung filtern',
      onchange: (e) => {
        session.filterMarked = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, 'Alle Karten'),
      el('option', { value: 'yes' }, 'Nur markierte'),
      el('option', { value: 'no' }, 'Nur unmarkierte'),
    ]
  );

  const bulkBar = el('div', { class: 'bulk-bar', hidden: true });
  const rowsContainer = el('div', { class: 'card-rows', id: 'card-rows' });
  const heading = el('h2', { id: 'cards-heading' }, `Karten (${ctx.doc.cards.length})`);

  container.append(
    el('section', { 'aria-labelledby': 'cards-heading' }, [
      heading,
      el('div', { class: 'toolbar' }, [searchField, boxSelect, repairSelect, markedSelect]),
      bulkBar,
      rowsContainer,
    ])
  );

  function updateBulkBar() {
    const n = session.selection.size;
    clear(bulkBar);
    if (n === 0) {
      bulkBar.hidden = true;
      return;
    }
    bulkBar.hidden = false;
    bulkBar.append(
      el('span', {}, `${n} ausgewählt`),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          onclick: () => doDelete([...session.selection]),
        },
        [icons.trash(), el('span', {}, 'Löschen')]
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: () => {
            session.selection.clear();
            renderRows();
          },
        },
        'Abwählen'
      )
    );
  }

  function matchesFilters(card) {
    if (session.search && !`${card.a} ${card.b}`.toLowerCase().includes(session.search.toLowerCase())) return false;
    if (session.filterBox && card.box !== Number(session.filterBox)) return false;
    if (session.filterRepair === 'yes' && !card.repair) return false;
    if (session.filterRepair === 'no' && card.repair) return false;
    if (session.filterMarked === 'yes' && !card.marked) return false;
    if (session.filterMarked === 'no' && card.marked) return false;
    return true;
  }

  async function doDelete(ids) {
    const { doc: newDoc, removed } = deleteCards(ctx.doc, ids);
    try {
      await ctx.persist(newDoc);
    } catch {
      return;
    }
    ids.forEach((id) => session.selection.delete(id));
    session.undo = { removed };
    heading.textContent = `Karten (${ctx.doc.cards.length})`;
    renderRows();
    updateBulkBar();
    ctx.showToast({
      message: `${removed.length} Karte${removed.length === 1 ? '' : 'n'} gelöscht.`,
      actionLabel: 'Rückgängig',
      onAction: async () => {
        if (!session.undo) return;
        const restored = restoreCards(ctx.doc, session.undo.removed);
        try {
          await ctx.persist(restored);
        } catch {
          return;
        }
        session.undo = null;
        heading.textContent = `Karten (${ctx.doc.cards.length})`;
        renderRows();
      },
    });
  }

  function renderRows() {
    clear(rowsContainer);
    if (ctx.doc.cards.length === 0) {
      rowsContainer.append(el('p', { class: 'empty-state' }, 'Noch keine Karten. Lege welche über „Erfassen“ oder „Import“ an.'));
      updateBulkBar();
      return;
    }
    const visible = ctx.doc.cards.filter(matchesFilters);
    if (visible.length === 0) {
      rowsContainer.append(el('p', { class: 'empty-state' }, 'Keine Karten passen zu den Filtern.'));
      updateBulkBar();
      return;
    }
    const list = el('ul', { class: 'card-list' });
    for (const card of visible) {
      list.append(session.editingId === card.id ? renderEditRow(card) : renderRow(card));
    }
    rowsContainer.append(list);
    updateBulkBar();
  }

  function renderRow(card) {
    const checkbox = el('input', {
      type: 'checkbox',
      'aria-label': `${card.a} auswählen`,
      checked: session.selection.has(card.id),
      onchange: (e) => {
        if (e.target.checked) session.selection.add(card.id);
        else session.selection.delete(card.id);
        updateBulkBar();
      },
    });

    const starBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-pressed': String(card.marked),
        'aria-label': card.marked ? 'Markierung entfernen' : 'Karte markieren',
        onclick: async () => {
          const updated = applyCardEdit(card, { marked: !card.marked });
          try {
            await ctx.persist(replaceCard(ctx.doc, updated));
          } catch {
            return;
          }
          renderRows();
        },
      },
      [card.marked ? icons.starFilled() : icons.starOutline()]
    );

    const editBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `${card.a} bearbeiten`,
        onclick: () => {
          session.editingId = card.id;
          renderRows();
        },
      },
      [icons.edit()]
    );

    const deleteBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `${card.a} löschen`,
        onclick: () => doDelete([card.id]),
      },
      [icons.trash()]
    );

    return el('li', { class: 'card-row' }, [
      checkbox,
      el('span', { class: 'card-text card-text-a' }, card.a || '(leer)'),
      el('span', { class: 'card-text card-text-b' }, card.b || '(leer)'),
      el('span', { class: 'badge' }, `Kasten ${card.box}`),
      card.repair ? el('span', { class: 'badge badge-repair' }, 'Reparatur') : null,
      starBtn,
      editBtn,
      deleteBtn,
    ]);
  }

  function renderEditRow(card) {
    const aInput = el('input', { type: 'text', value: card.a, 'aria-label': 'Vorderseite' });
    const bInput = el('input', { type: 'text', value: card.b, 'aria-label': 'Rückseite' });

    const commit = async () => {
      const updated = applyCardEdit(card, { a: aInput.value.trim(), b: bInput.value.trim() });
      try {
        await ctx.persist(replaceCard(ctx.doc, updated));
      } catch {
        return;
      }
      session.editingId = null;
      renderRows();
    };
    const cancel = () => {
      session.editingId = null;
      renderRows();
    };

    aInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    bInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });

    return el('li', { class: 'card-row card-row-editing' }, [
      aInput,
      bInput,
      el('button', { type: 'button', class: 'btn btn-primary', onclick: commit }, [icons.check(), el('span', {}, 'Speichern')]),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: cancel }, 'Abbrechen'),
    ]);
  }

  renderRows();
}

// ---------- Schnellerfassung ----------

export function renderCaptureView(container, ctx) {
  const textarea = el('textarea', {
    id: 'capture-text',
    rows: '14',
    'aria-describedby': 'capture-hint',
  });
  const summary = el('div', { id: 'capture-summary', class: 'capture-summary' });
  const list = el('ul', { id: 'capture-list', class: 'capture-list' });

  function updatePreview() {
    const { cards, warnings } = parseQuickCapture(textarea.value);
    clear(summary);
    clear(list);
    summary.append(el('p', {}, `${cards.length} Karte${cards.length === 1 ? '' : 'n'} werden angelegt.`));
    for (const c of cards.slice(0, 50)) {
      list.append(el('li', { class: 'preview-item' }, `${c.a} → ${c.b || '(leer)'}`));
    }
    if (cards.length > 50) list.append(el('li', { class: 'preview-item' }, `… und ${cards.length - 50} weitere`));
    for (const w of warnings) {
      list.append(
        el('li', { class: 'preview-item preview-warning' }, [
          icons.warning(),
          el('span', {}, `Zeile ${w.line}: „${w.text}“ – Rückseite fehlt, wird nicht übernommen.`),
        ])
      );
    }
  }
  textarea.addEventListener('input', debounce(updatePreview, 150));

  const commitBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onclick: async () => {
        const { cards, warnings } = parseQuickCapture(textarea.value);
        if (cards.length === 0) {
          ctx.showToast({ message: 'Keine vollständigen Karten gefunden.' });
          return;
        }
        const newCards = cards.map((c) => createCard(c));
        try {
          await ctx.persist(addCards(ctx.doc, newCards));
        } catch {
          return;
        }
        textarea.value = '';
        updatePreview();
        const note = warnings.length ? ` ${warnings.length} unvollständige Zeile(n) wurden nicht übernommen.` : '';
        ctx.showToast({ message: `${newCards.length} Karte${newCards.length === 1 ? '' : 'n'} angelegt.${note}` });
        ctx.refreshHeaderCount();
      },
    },
    'Karten übernehmen'
  );

  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary',
      onclick: () => {
        textarea.value = '';
        updatePreview();
      },
    },
    'Textfeld leeren'
  );

  container.append(
    el('section', { 'aria-labelledby': 'capture-heading' }, [
      el('h2', { id: 'capture-heading' }, 'Schnellerfassung'),
      el(
        'p',
        { id: 'capture-hint', class: 'hint' },
        'Eine Zeile Vorderseite, nächste Zeile Rückseite, abwechselnd. Leere Zeilen trennen nur optisch. Enthält eine Zeile einen Tabulator, bildet sie allein eine Karte (Vorderseite Tab Rückseite).'
      ),
      el('div', { class: 'capture-layout' }, [
        el('div', { class: 'capture-input' }, [textarea]),
        el('div', { class: 'capture-preview' }, [summary, list]),
      ]),
      el('div', { class: 'actions' }, [commitBtn, clearBtn]),
    ])
  );

  updatePreview();
}

// ---------- Lernen ----------

export function renderLearnView(container, ctx) {
  const ls = ctx.state.learnSession;
  if (!ls) renderLearnSetup(container, ctx);
  else if (ls.finished) renderLearnSummary(container, ctx);
  else renderLearnSession(container, ctx);
}

function renderLearnSetup(container, ctx) {
  const deck = ctx.doc.deck;
  let order = 'random';
  let direction = 'ab';
  let onlyMarked = false;

  const countText = el('p', { class: 'hint' });
  const startBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Sitzung starten');

  function selectableCards() {
    return onlyMarked ? ctx.doc.cards.filter((c) => c.marked) : ctx.doc.cards;
  }

  function updateCount() {
    const cards = selectableCards();
    const repairCount = cards.filter((c) => c.repair).length;
    if (ctx.doc.cards.length === 0) {
      countText.textContent = 'Noch keine Karten. Lege welche über „Erfassen“ oder „Import“ an.';
    } else if (cards.length === 0) {
      countText.textContent = 'Keine markierten Karten vorhanden.';
    } else {
      countText.textContent = `${cards.length} Karte${cards.length === 1 ? '' : 'n'} in dieser Sitzung, davon ${repairCount} in der Reparaturkiste.`;
    }
    startBtn.disabled = cards.length === 0;
  }

  const directionField = el('fieldset', {}, [
    el('legend', {}, 'Richtung'),
    radioOption('learn-direction', 'ab', `${deck.langA} → ${deck.langB}`, true),
    radioOption('learn-direction', 'ba', `${deck.langB} → ${deck.langA}`, false),
  ]);
  directionField.addEventListener('change', (e) => {
    direction = e.target.value;
  });

  const orderField = el('fieldset', {}, [
    el('legend', {}, 'Reihenfolge'),
    radioOption('learn-order', 'random', 'Zufällig', true),
    radioOption('learn-order', 'sequential', 'Eingabereihenfolge', false),
    radioOption('learn-order', 'box', 'Nach Kästen (aufsteigend)', false),
  ]);
  orderField.addEventListener('change', (e) => {
    order = e.target.value;
  });

  const markedCheckbox = el('input', { type: 'checkbox', id: 'learn-only-marked' });
  markedCheckbox.addEventListener('change', (e) => {
    onlyMarked = e.target.checked;
    updateCount();
  });

  startBtn.addEventListener('click', () => {
    const ids = buildQueue(ctx.doc.cards, { order, onlyMarked });
    if (ids.length === 0) return;
    const queue = createSessionQueue(ids);
    ctx.state.learnSession = {
      order,
      direction,
      onlyMarked,
      queue,
      startedAt: nowIso(),
      startMs: Date.now(),
      correctCount: 0,
      wrongCount: 0,
      currentCardId: queue.draw(),
      flipped: false,
      finished: false,
    };
    ctx.render();
  });

  updateCount();

  container.append(
    el('section', { 'aria-labelledby': 'learn-heading' }, [
      el('h2', { id: 'learn-heading' }, 'Lernsitzung einrichten'),
      directionField,
      orderField,
      el('div', { class: 'field-row' }, [
        el('label', {}, [markedCheckbox, ' Nur markierte Karten']),
      ]),
      countText,
      startBtn,
    ])
  );
}

function describeRatingOutcome(prev, updated, correct) {
  if (!correct) return 'Falsch – zurück auf Kasten 1, in der Reparaturkiste.';
  if (prev.repair && updated.repair) return `Richtig – ${updated.streak}/4 in der Reparaturkiste.`;
  if (prev.repair && !updated.repair) return 'Richtig – Reparaturkiste geschafft, Kasten 2.';
  return `Richtig – Kasten ${prev.box} → ${updated.box}.`;
}

async function rateCurrentCard(ctx, ls, correct) {
  const cardId = ls.currentCardId;
  const previousCard = ctx.doc.cards.find((c) => c.id === cardId);
  const updated = applyLearningResult(previousCard, correct);
  ctx.persistBuffered(replaceCard(ctx.doc, updated));

  if (correct) ls.correctCount += 1;
  else ls.wrongCount += 1;
  if (!correct) ls.queue.requeueAfterWrong(cardId);

  ctx.showToast({
    message: describeRatingOutcome(previousCard, updated, correct),
    actionLabel: 'Korrigieren',
    duration: 3000,
    onAction: async () => {
      const flippedCorrect = !correct;
      const recorrected = applyLearningResult(previousCard, flippedCorrect);
      ctx.persistBuffered(replaceCard(ctx.doc, recorrected));
      if (!ls.finished) {
        if (correct) {
          ls.correctCount -= 1;
          ls.wrongCount += 1;
          ls.queue.requeueAfterWrong(cardId);
        } else {
          ls.wrongCount -= 1;
          ls.correctCount += 1;
          ls.queue.remove(cardId);
        }
        ctx.render();
      }
    },
  });

  if (ls.queue.isEmpty()) {
    await ctx.endLearnSession(ls);
  } else {
    ls.currentCardId = ls.queue.draw();
    ls.flipped = false;
  }
  ctx.render();
}

function renderLearnSession(container, ctx) {
  const ls = ctx.state.learnSession;
  const deck = ctx.doc.deck;
  const card = ctx.doc.cards.find((c) => c.id === ls.currentCardId);

  // Kann durch eine zwischenzeitliche Löschung der Karte theoretisch entfallen; dann einfach
  // die nächste Karte ziehen, statt mit einer leeren Ansicht hängen zu bleiben.
  if (!card) {
    ls.currentCardId = ls.queue.isEmpty() ? null : ls.queue.draw();
    if (!ls.currentCardId) {
      ctx.endLearnSession(ls).then(() => ctx.render());
      return;
    }
    ctx.render();
    return;
  }

  const frontLabel = ls.direction === 'ab' ? deck.langA : deck.langB;
  const backLabel = ls.direction === 'ab' ? deck.langB : deck.langA;
  const frontText = ls.direction === 'ab' ? card.a : card.b;
  const backText = ls.direction === 'ab' ? card.b : card.a;

  let flipped = false;

  const faceLabel = el('p', { class: 'learn-face-label' }, frontLabel);
  const faceText = el('p', { class: 'learn-face-text' }, frontText || '(leer)');
  const cardBtn = el(
    'button',
    { type: 'button', class: 'learn-card', 'aria-label': 'Karte umdrehen (Leertaste)' },
    [faceLabel, faceText]
  );

  const wrongBtn = el(
    'button',
    { type: 'button', class: 'btn btn-danger learn-rate', onclick: () => rateCurrentCard(ctx, ls, false) },
    'Falsch'
  );
  const rightBtn = el(
    'button',
    { type: 'button', class: 'btn btn-primary learn-rate', onclick: () => rateCurrentCard(ctx, ls, true) },
    'Richtig'
  );
  const rateRow = el('div', { class: 'learn-rate-row', hidden: true }, [wrongBtn, rightBtn]);

  function showFace() {
    faceLabel.textContent = flipped ? backLabel : frontLabel;
    faceText.textContent = (flipped ? backText : frontText) || '(leer)';
    rateRow.hidden = !flipped;
  }

  cardBtn.addEventListener('click', () => {
    flipped = !flipped;
    showFace();
    if (flipped) wrongBtn.focus();
  });

  const section = el('section', { 'aria-labelledby': 'learn-heading' });
  section.addEventListener('keydown', (e) => {
    if (!flipped) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); rateCurrentCard(ctx, ls, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); rateCurrentCard(ctx, ls, false); }
  });

  const progress = el(
    'p',
    { class: 'learn-progress' },
    `Richtig: ${ls.correctCount} · Falsch: ${ls.wrongCount} · Noch ${ls.queue.size() + 1} Karte${ls.queue.size() === 0 ? '' : 'n'}`
  );

  section.append(
    el('div', { class: 'learn-top-bar' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: async () => {
            await ctx.endLearnSession(ls);
            ctx.render();
          },
        },
        'Sitzung beenden'
      ),
      progress,
    ]),
    cardBtn,
    rateRow
  );

  container.append(section);
  cardBtn.focus();
}

function renderLearnSummary(container, ctx) {
  const ls = ctx.state.learnSession;
  container.append(
    el('section', { 'aria-labelledby': 'learn-heading' }, [
      el('h2', { id: 'learn-heading' }, 'Sitzung beendet'),
      el('p', {}, `${ls.correctCount} richtig, ${ls.wrongCount} falsch von ${ls.correctCount + ls.wrongCount} Karten.`),
      el('div', { class: 'actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => {
              ctx.state.learnSession = null;
              ctx.render();
            },
          },
          'Neue Sitzung'
        ),
        el(
          'button',
          { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.navigate('karten') },
          'Zur Kartenliste'
        ),
      ]),
    ])
  );
}

// ---------- Import ----------

export function renderImportView(container, ctx) {
  container.append(
    el('section', { 'aria-labelledby': 'import-heading' }, [
      el('h2', { id: 'import-heading' }, 'Karten importieren'),
      buildCsvImport(ctx),
      buildBackupImport(ctx),
    ])
  );
}

function buildCsvImport(ctx) {
  let rows = [];
  let colA = 0;
  let colB = 1;
  let hasHeader = true;

  const fileInput = el('input', { type: 'file', id: 'csv-file', accept: '.csv,text/csv' });
  const colASelect = el('select', { 'aria-label': `Spalte für ${ctx.doc.deck.langA}` });
  const colBSelect = el('select', { 'aria-label': `Spalte für ${ctx.doc.deck.langB}` });
  const headerCheckbox = el('input', { type: 'checkbox', id: 'csv-header', checked: true });
  const previewTable = el('table', { class: 'csv-preview' });
  const summary = el('p', { class: 'csv-summary' });
  const duplicateBox = el('div', { class: 'duplicate-box', hidden: true });
  const commitBtn = el('button', { type: 'button', class: 'btn btn-primary', hidden: true }, 'Karten übernehmen');
  const configBox = el('div', { hidden: true }, [
    el('div', { class: 'field-row' }, [
      el('label', {}, [`Spalte für ${ctx.doc.deck.langA}: `, colASelect]),
      el('label', {}, [`Spalte für ${ctx.doc.deck.langB}: `, colBSelect]),
      el('label', {}, [headerCheckbox, ' Erste Zeile ist Kopfzeile']),
    ]),
    previewTable,
    summary,
    duplicateBox,
    commitBtn,
  ]);

  function columnOptions(select, selectedIndex, maxCols) {
    clear(select);
    for (let i = 0; i < maxCols; i++) {
      select.append(el('option', { value: String(i), selected: i === selectedIndex }, `Spalte ${i + 1}`));
    }
  }

  function updatePreview() {
    clear(previewTable);
    const preview = rows.slice(0, 5);
    for (const row of preview) {
      previewTable.append(el('tr', {}, row.map((cell) => el('td', {}, cell))));
    }
    const { cards, skipped } = rowsToCards(rows, colA, colB, { skipFirstRow: hasHeader });
    summary.textContent = `${cards.length} Karte(n) werden angelegt.${skipped.length ? ` ${skipped.length} Zeile(n) ohne Vorderseite übersprungen.` : ''}`;
    clear(duplicateBox);
    commitBtn.hidden = cards.length === 0;
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const text = decodeCsvBytes(buffer);
    const delimiter = detectDelimiter(text);
    rows = parseCsv(text, delimiter);
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 1);
    colA = 0;
    colB = Math.min(1, maxCols - 1);
    columnOptions(colASelect, colA, maxCols);
    columnOptions(colBSelect, colB, maxCols);
    configBox.hidden = false;
    updatePreview();
  });

  colASelect.addEventListener('change', (e) => {
    colA = Number(e.target.value);
    updatePreview();
  });
  colBSelect.addEventListener('change', (e) => {
    colB = Number(e.target.value);
    updatePreview();
  });
  headerCheckbox.addEventListener('change', (e) => {
    hasHeader = e.target.checked;
    updatePreview();
  });

  commitBtn.addEventListener('click', () => {
    const { cards } = rowsToCards(rows, colA, colB, { skipFirstRow: hasHeader });
    const duplicates = findDuplicateFronts(ctx.doc, cards);
    if (duplicates.length === 0) {
      applyCsvCards(cards, 'create');
      return;
    }
    clear(duplicateBox);
    duplicateBox.hidden = false;
    const choice = el(
      'fieldset',
      {},
      [
        el('legend', {}, `${duplicates.length} Vorderseite(n) gibt es im Stapel schon. Wie verfahren?`),
        radioOption('dup-choice', 'skip', 'Vorhandene Karten überspringen', true),
        radioOption('dup-choice', 'replace', 'Vorhandene Karten ersetzen (nur Rückseite)', false),
        radioOption('dup-choice', 'create', 'Trotzdem als neue Karte anlegen', false),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => {
              const selected = duplicateBox.querySelector('input[name="dup-choice"]:checked').value;
              applyCsvCards(cards, selected);
            },
          },
          'Fortfahren'
        ),
      ]
    );
    duplicateBox.append(choice);
  });

  async function applyCsvCards(cards, mode) {
    const duplicates = findDuplicateFronts(ctx.doc, cards);
    const duplicateFronts = new Set(duplicates.map((d) => d.candidate.a.trim()));
    let doc = ctx.doc;
    if (mode === 'skip') {
      const toAdd = cards.filter((c) => !duplicateFronts.has(c.a.trim())).map(createCard);
      doc = addCards(doc, toAdd);
    } else if (mode === 'replace') {
      for (const c of cards) {
        const existing = doc.cards.find((ec) => ec.a.trim() === c.a.trim());
        if (existing) doc = replaceCard(doc, applyCardEdit(existing, { b: c.b }));
        else doc = addCards(doc, [createCard(c)]);
      }
    } else {
      doc = addCards(doc, cards.map(createCard));
    }
    try {
      await ctx.persist(doc);
    } catch {
      return;
    }
    fileInput.value = '';
    rows = [];
    configBox.hidden = true;
    ctx.showToast({ message: 'CSV-Import abgeschlossen.' });
    ctx.refreshHeaderCount();
  }

  return el('section', { 'aria-labelledby': 'csv-heading', class: 'import-section' }, [
    el('h3', { id: 'csv-heading' }, 'Aus CSV-Datei'),
    el('label', { for: 'csv-file' }, 'CSV-Datei auswählen'),
    fileInput,
    configBox,
  ]);
}

function radioOption(name, value, label, checked) {
  const id = `${name}-${value}`;
  return el('div', { class: 'radio-option' }, [
    el('input', { type: 'radio', name, value, id, checked }),
    el('label', { for: id }, label),
  ]);
}

function buildBackupImport(ctx) {
  let importedDoc = null;

  const fileInput = el('input', { type: 'file', id: 'backup-file', accept: '.json,.vok.json,application/json' });
  const summary = el('p', { class: 'backup-summary' });
  const modeBox = el('fieldset', { hidden: true }, [
    el('legend', {}, 'Wie soll importiert werden?'),
    radioOption('backup-mode', 'merge', 'Zusammenführen (empfohlen)', true),
    radioOption('backup-mode', 'replace', 'Vollständig ersetzen', false),
  ]);
  const commitBtn = el('button', { type: 'button', class: 'btn btn-primary', hidden: true }, 'Import durchführen');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    summary.className = 'backup-summary';
    try {
      const text = await file.text();
      importedDoc = parseImportedText(text);
      summary.textContent = `Datei enthält ${importedDoc.cards.length} Karte(n). Aktueller Stapel: ${ctx.doc.cards.length} Karte(n).`;
      modeBox.hidden = false;
      commitBtn.hidden = false;
    } catch (err) {
      importedDoc = null;
      summary.textContent = err.message;
      summary.className = 'backup-summary field-error';
      modeBox.hidden = true;
      commitBtn.hidden = true;
    }
  });

  commitBtn.addEventListener('click', async () => {
    if (!importedDoc) return;
    const mode = modeBox.querySelector('input[name="backup-mode"]:checked').value;
    const doc = mode === 'replace' ? importedDoc : mergeDocuments(ctx.doc, importedDoc);
    try {
      await ctx.persist(doc);
    } catch {
      return;
    }
    fileInput.value = '';
    importedDoc = null;
    modeBox.hidden = true;
    commitBtn.hidden = true;
    summary.textContent = '';
    ctx.showToast({ message: 'Import abgeschlossen.' });
    ctx.render();
  });

  return el('section', { 'aria-labelledby': 'backup-heading', class: 'import-section' }, [
    el('h3', { id: 'backup-heading' }, 'Aus Sicherungsdatei (.vok.json)'),
    el('label', { for: 'backup-file' }, 'Sicherungsdatei auswählen'),
    fileInput,
    summary,
    modeBox,
    commitBtn,
  ]);
}
