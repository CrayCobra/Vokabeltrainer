// Ansichten: reine DOM-Bau- und Ereignis-Verdrahtungsfunktionen. Jede render*-Funktion
// erhält einen Container und einen App-Kontext (ctx) mit Zugriff auf Dokument, Speicherung,
// Navigation, Meldungen und Übersetzung (ctx.t). Um Fokusverlust beim Tippen zu vermeiden,
// wird bei Sucht-/Live-Vorschaufeldern nur ein Teilbaum aktualisiert statt der ganzen Ansicht.
// Kein sichtbarer Text steht hier als Literal – alles läuft über ctx.t(schlüssel, parameter)
// und die Wörterbücher in i18n-*.js (siehe CLAUDE.md: eigenes Modul für Übersetzungen).

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
  createDeck,
  addDeck,
  applyDeckEdit,
  replaceDeck,
  deleteDeck,
  restoreDeck,
  getActiveDeck,
  setActiveDeck,
} from './model.js';
import { parseQuickCapture } from './capture.js';
import { decodeCsvBytes, detectDelimiter, parseCsv, rowsToCards } from './csv.js';
import { parseImportedText } from './fileio.js';
import { buildQueue } from './learn.js';
import { describeGoalProgress, describeGoalLabel, formatDuration } from './testgoal.js';
import {
  computeCurrentStreak,
  computeLongestStreak,
  isCurrentWeekJokerAvailable,
  buildHeatmapWeeks,
  boxDistribution,
} from './stats.js';

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Karten des gerade aktiven Stapels: jede Ansicht, die Karten zeigt oder eine Sitzung
// aufbaut, arbeitet nur mit dieser Teilmenge, nie mit ctx.doc.cards direkt (vokabel-app-
// entwurf.md, Kapitel 1: mehrere Stapel pro Profil, Sitzungen beziehen sich auf genau einen).
function activeDeckCards(ctx) {
  const deckId = getActiveDeck(ctx.doc).id;
  return ctx.doc.cards.filter((c) => c.deckId === deckId);
}

// err.i18nKey stammt aus model.js/fileio.js (ValidationError); ein Fallback auf err.message
// deckt den unwahrscheinlichen Fall eines nicht übersetzten Fehlers ab.
function describeError(ctx, err) {
  return err && err.i18nKey ? ctx.t(err.i18nKey, err.i18nParams) : err.message;
}

// ---------- First run / empty state ----------

export function renderOnboarding(root, ctx) {
  clear(root);
  const t = ctx.t;

  const banner =
    ctx.emptyReason === 'storage-cleared'
      ? el('div', { class: 'banner banner-warning', role: 'alert' }, [
          icons.warning(),
          el('div', {}, [
            el('p', { class: 'banner-title' }, t('onboarding.clearedTitle')),
            el('p', {}, t('onboarding.clearedBody')),
          ]),
        ])
      : null;

  const nameInput = el('input', { id: 'ob-deck-name', type: 'text', required: true, autocomplete: 'off' });
  const langAInput = el('input', {
    id: 'ob-lang-a',
    type: 'text',
    required: true,
    autocomplete: 'off',
    value: t('onboarding.defaultLangA'),
  });
  const langBInput = el('input', {
    id: 'ob-lang-b',
    type: 'text',
    required: true,
    autocomplete: 'off',
    value: t('onboarding.defaultLangB'),
  });
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
            uiLang: ctx.lang,
          });
          await ctx.setInitialDoc(doc);
        } catch (err) {
          errorBox.textContent = describeError(ctx, err);
          errorBox.hidden = false;
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', { for: 'ob-deck-name' }, t('onboarding.deckNameLabel')), nameInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-lang-a' }, t('onboarding.langALabel')), langAInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-lang-b' }, t('onboarding.langBLabel')), langBInput]),
      el('div', { class: 'field' }, [el('label', { for: 'ob-profile' }, t('onboarding.profileLabel')), profileInput]),
      errorBox,
      el('button', { type: 'submit', class: 'btn btn-primary' }, t('onboarding.createButton')),
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
        errorBox.textContent = describeError(ctx, err);
        errorBox.hidden = false;
      }
    },
  });

  const backupLabel = el('label', { for: 'ob-backup-file', class: 'btn btn-secondary file-btn' }, [
    icons.upload(),
    el('span', {}, t('onboarding.loadBackupButton')),
  ]);

  root.append(
    el('main', { class: 'onboarding', id: 'main' }, [
      el('h1', {}, t('app.title')),
      banner,
      el('section', { 'aria-labelledby': 'ob-new-heading' }, [
        el('h2', { id: 'ob-new-heading' }, t('onboarding.newDeckHeading')),
        form,
      ]),
      el('section', { 'aria-labelledby': 'ob-restore-heading' }, [
        el('h2', { id: 'ob-restore-heading' }, t('onboarding.restoreHeading')),
        el('p', {}, t('onboarding.restoreBody')),
        backupLabel,
        el('div', { class: 'visually-hidden' }, [backupInput]),
      ]),
    ])
  );
}

// ---------- App shell ----------

export function renderShell(root, ctx) {
  clear(root);
  const t = ctx.t;

  const nav = el(
    'nav',
    { class: 'main-nav', 'aria-label': t('nav.areasLabel') },
    [
      { view: 'lernen', label: t('nav.learn') },
      { view: 'testen', label: t('nav.test') },
      { view: 'karten', label: t('nav.cards') },
      { view: 'erfassen', label: t('nav.capture') },
      { view: 'import', label: t('nav.import') },
      { view: 'statistik', label: t('nav.stats') },
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
    ? new Date(ctx.doc.meta.lastBackup).toLocaleString(ctx.locale)
    : t('header.lastBackupNever');

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'app-header-top' }, [
      el('h1', { class: 'visually-hidden' }, t('app.title')),
      renderDeckSwitcher(ctx),
      el('span', { class: 'version-tag' }, `v${ctx.APP_VERSION}`),
    ]),
    nav,
    el('div', { class: 'app-header-actions' }, [
      el('span', { class: 'save-status' }, t('header.lastBackup', { date: lastBackup })),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () => ctx.exportDocument(),
        },
        [icons.download(), el('span', {}, t('header.save'))]
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': t('nav.settingsLabel'),
          onclick: () => ctx.navigate('einstellungen'),
        },
        [icons.settings()]
      ),
    ]),
  ]);

  const main = el('main', { id: 'main' });
  root.append(header, main);

  if (ctx.state.view === 'karten') renderCardsView(main, ctx);
  else if (ctx.state.view === 'erfassen') renderCaptureView(main, ctx);
  else if (ctx.state.view === 'import') renderImportView(main, ctx);
  else if (ctx.state.view === 'testen') renderTestView(main, ctx);
  else if (ctx.state.view === 'einstellungen') renderSettingsView(main, ctx);
  else if (ctx.state.view === 'statistik') renderStatsView(main, ctx);
  else renderLearnView(main, ctx);
}

// ---------- Stapel-Umschalter (Kopfbereich) ----------
// Jede Sitzung und jede Kartenansicht bezieht sich auf genau einen Stapel (vokabel-app-
// entwurf.md, Kapitel 1); der Wechsel geschieht hier zentral im Kopfbereich, das Anlegen direkt
// daneben. Umbenennen und Löschen liegt in den Einstellungen (siehe renderDeckManagementSection).

function renderDeckSwitcher(ctx) {
  const t = ctx.t;
  if (ctx.state.creatingDeck) return renderDeckCreateForm(ctx);

  const activeDeck = getActiveDeck(ctx.doc);
  const select = el(
    'select',
    {
      id: 'deck-switcher',
      class: 'deck-switcher-select',
      'aria-label': t('header.deckSwitcherLabel'),
      onchange: async (e) => {
        try {
          await ctx.persist(setActiveDeck(ctx.doc, e.target.value));
        } catch {
          return;
        }
        ctx.render();
      },
    },
    ctx.doc.decks.map((d) => el('option', { value: d.id, selected: d.id === activeDeck.id }, d.name))
  );
  const addBtn = el(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': t('header.newDeckAria'),
      onclick: () => {
        ctx.state.creatingDeck = true;
        ctx.render();
      },
    },
    [icons.plus()]
  );
  return el('div', { class: 'deck-switcher' }, [select, addBtn]);
}

function renderDeckCreateForm(ctx) {
  const t = ctx.t;
  const nameInput = el('input', {
    type: 'text',
    required: true,
    autocomplete: 'off',
    'aria-label': t('onboarding.deckNameLabel'),
    placeholder: t('onboarding.deckNameLabel'),
  });
  const langAInput = el('input', {
    type: 'text',
    required: true,
    autocomplete: 'off',
    'aria-label': t('onboarding.langALabel'),
    placeholder: t('onboarding.langALabel'),
    value: t('onboarding.defaultLangA'),
  });
  const langBInput = el('input', {
    type: 'text',
    required: true,
    autocomplete: 'off',
    'aria-label': t('onboarding.langBLabel'),
    placeholder: t('onboarding.langBLabel'),
    value: t('onboarding.defaultLangB'),
  });
  const errorBox = el('p', { class: 'field-error', hidden: true, role: 'alert' });

  const cancel = () => {
    ctx.state.creatingDeck = false;
    ctx.render();
  };

  const form = el(
    'form',
    {
      class: 'deck-switcher deck-create-form',
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        let deck;
        try {
          deck = createDeck({ name: nameInput.value, langA: langAInput.value, langB: langBInput.value });
        } catch (err) {
          errorBox.textContent = describeError(ctx, err);
          errorBox.hidden = false;
          return;
        }
        try {
          await ctx.persist(setActiveDeck(addDeck(ctx.doc, deck), deck.id));
        } catch {
          return;
        }
        ctx.state.creatingDeck = false;
        ctx.render();
      },
    },
    [
      nameInput,
      langAInput,
      langBInput,
      errorBox,
      el('button', { type: 'submit', class: 'btn btn-primary' }, t('onboarding.createButton')),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: cancel }, t('common.cancel')),
    ]
  );
  return form;
}

// ---------- Settings ----------
// Geräte-/Profilweite Voreinstellungen, unabhängig vom aktiven Stapel: Erscheinungsbild,
// Oberflächensprache und die Verwaltung (Umbenennen/Löschen) aller Stapel des Profils.

function renderSettingsView(container, ctx) {
  const t = ctx.t;
  const currentTheme = ctx.themePreference;
  const themeField = el('fieldset', {}, [
    el('legend', {}, t('settings.appearanceLegend')),
    radioOption('theme', 'system', t('settings.themeSystem'), currentTheme === 'system'),
    radioOption('theme', 'light', t('settings.themeLight'), currentTheme === 'light'),
    radioOption('theme', 'dark', t('settings.themeDark'), currentTheme === 'dark'),
  ]);
  themeField.addEventListener('change', (e) => ctx.setThemePreference(e.target.value));

  const languageField = el(
    'fieldset',
    {},
    [el('legend', {}, t('settings.languageLegend'))].concat(
      ctx.LANGUAGES.map((code) => radioOption('ui-language', code, ctx.LANGUAGE_NAMES[code], code === ctx.lang))
    )
  );
  languageField.addEventListener('change', (e) => ctx.setLanguage(e.target.value));

  container.append(
    el('section', { 'aria-labelledby': 'settings-heading' }, [
      el('h2', { id: 'settings-heading' }, t('settings.heading')),
      themeField,
      languageField,
    ])
  );
  container.append(renderDeckManagementSection(ctx));
}

function renderDeckManagementSection(ctx) {
  const t = ctx.t;
  const list = el('ul', { class: 'card-list', id: 'deck-manage-list' });
  let editingId = null;

  function renderList() {
    clear(list);
    for (const deck of ctx.doc.decks) {
      list.append(editingId === deck.id ? renderEditRow(deck) : renderRow(deck));
    }
  }

  function renderRow(deck) {
    const editBtn = el(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': t('settings.editDeckAria', { name: deck.name }), onclick: () => { editingId = deck.id; renderList(); } },
      [icons.edit()]
    );
    const deleteBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': t('settings.deleteDeckAria', { name: deck.name }),
        onclick: () => doDeleteDeck(deck.id),
      },
      [icons.trash()]
    );
    return el('li', { class: 'card-row' }, [
      el('span', { class: 'card-text card-text-a' }, deck.name),
      el('span', { class: 'card-text card-text-b' }, t('session.directionOption', { a: deck.langA, b: deck.langB })),
      editBtn,
      deleteBtn,
    ]);
  }

  function renderEditRow(deck) {
    const nameInput = el('input', { type: 'text', value: deck.name, 'aria-label': t('onboarding.deckNameLabel') });
    const aInput = el('input', { type: 'text', value: deck.langA, 'aria-label': t('onboarding.langALabel') });
    const bInput = el('input', { type: 'text', value: deck.langB, 'aria-label': t('onboarding.langBLabel') });

    const commit = async () => {
      const updated = applyDeckEdit(deck, { name: nameInput.value.trim(), langA: aInput.value.trim(), langB: bInput.value.trim() });
      try {
        await ctx.persist(replaceDeck(ctx.doc, updated));
      } catch {
        return;
      }
      editingId = null;
      renderList();
    };
    const cancel = () => {
      editingId = null;
      renderList();
    };
    for (const input of [nameInput, aInput, bInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      });
    }

    return el('li', { class: 'card-row card-row-editing' }, [
      nameInput,
      aInput,
      bInput,
      el('button', { type: 'button', class: 'btn btn-primary', onclick: commit }, [icons.check(), el('span', {}, t('common.save'))]),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: cancel }, t('common.cancel')),
    ]);
  }

  async function doDeleteDeck(deckId) {
    let result;
    try {
      result = deleteDeck(ctx.doc, deckId);
    } catch (err) {
      ctx.showToast({ message: describeError(ctx, err) });
      return;
    }
    try {
      await ctx.persist(result.doc);
    } catch {
      return;
    }
    renderList();
    ctx.showToast({
      message: t('settings.deckDeletedToast', { name: result.removedDeck.deck.name }),
      actionLabel: t('cards.undo'),
      onAction: async () => {
        const restored = restoreDeck(ctx.doc, result);
        try {
          await ctx.persist(restored);
        } catch {
          return;
        }
        renderList();
        ctx.render();
      },
    });
    ctx.render();
  }

  renderList();

  return el('section', { 'aria-labelledby': 'deck-manage-heading' }, [
    el('h2', { id: 'deck-manage-heading' }, t('settings.deckManageHeading')),
    list,
  ]);
}

// ---------- Stats ----------

const HEATMAP_WEEKS = 26; // Immer alle 26 Wochen bauen; app.css blendet auf schmalen
// Bildschirmen die ältesten 14 aus, sodass dort nur die jüngsten 12 sichtbar bleiben.
const HEATMAP_NARROW_WEEKS = 12;

function formatDate(ctx, isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(ctx.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function renderStatsView(container, ctx) {
  const t = ctx.t;
  const doc = ctx.doc;
  const currentStreak = computeCurrentStreak(doc.days);
  const longestStreak = computeLongestStreak(doc.days);
  const jokerAvailable = isCurrentWeekJokerAvailable(doc.days);

  const streakSection = el('section', { 'aria-labelledby': 'streak-heading' }, [
    el('h2', { id: 'streak-heading' }, t('stats.streakHeading')),
    el('div', { class: 'streak-stats' }, [
      el('div', { class: 'streak-stat' }, [
        el('p', { class: 'streak-number' }, String(currentStreak)),
        el('p', { class: 'hint' }, t('stats.streakDays', { n: currentStreak })),
      ]),
      el('div', { class: 'streak-stat' }, [
        el('p', { class: 'streak-number' }, String(longestStreak)),
        el('p', { class: 'hint' }, t('stats.longestStreak')),
      ]),
    ]),
    el(
      'span',
      { class: jokerAvailable ? 'badge badge-goal-reached' : 'badge' },
      jokerAvailable ? t('stats.jokerAvailable') : t('stats.jokerUsed')
    ),
  ]);

  const heatmapSection = renderHeatmapSection(ctx, doc);
  const boxSection = renderBoxDistributionSection(ctx, doc);

  container.append(el('div', { class: 'stats-view' }, [streakSection, heatmapSection, boxSection]));
}

function renderHeatmapSection(ctx, doc) {
  const t = ctx.t;
  const weeks = buildHeatmapWeeks(doc.days, HEATMAP_WEEKS);
  const detail = el('p', { class: 'heatmap-detail', 'aria-live': 'polite' }, t('stats.heatmapHint'));

  const dayLabels = el(
    'div',
    { class: 'heatmap-day-labels' },
    ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'].map((key) =>
      el('span', {}, t(`stats.${key}`))
    )
  );

  const weekColumns = weeks.map((week, weekIndex) => {
    const narrow = weekIndex < HEATMAP_WEEKS - HEATMAP_NARROW_WEEKS;
    const cells = week.map((cell) => {
      if (cell.future) {
        return el('span', { class: 'heatmap-cell heatmap-future', 'aria-hidden': 'true' });
      }
      const label = t('stats.heatmapCellDetail', { date: formatDate(ctx, cell.date), correct: cell.correct, wrong: cell.wrong });
      const btn = el('button', {
        type: 'button',
        class: `heatmap-cell heatmap-level-${cell.level}`,
        'aria-label': label,
      });
      btn.addEventListener('focus', () => {
        detail.textContent = label;
      });
      btn.addEventListener('click', () => {
        detail.textContent = label;
      });
      return btn;
    });
    return el('div', { class: narrow ? 'heatmap-week heatmap-week-narrow-hidden' : 'heatmap-week' }, cells);
  });

  const legend = el('div', { class: 'heatmap-legend' }, [
    el('span', { class: 'hint' }, t('stats.legendLess')),
    ...[0, 1, 2, 3, 4].map((level) => el('span', { class: `heatmap-cell heatmap-level-${level}`, 'aria-hidden': 'true' })),
    el('span', { class: 'hint' }, t('stats.legendMore')),
  ]);

  return el('section', { 'aria-labelledby': 'heatmap-heading' }, [
    el('h2', { id: 'heatmap-heading' }, t('stats.heatmapHeading')),
    el('div', { class: 'heatmap-scroll' }, [el('div', { class: 'heatmap-grid' }, [dayLabels, ...weekColumns])]),
    legend,
    detail,
  ]);
}

// Kastenverteilung bleibt je Stapel (Kastenstände hängen an Karten, siehe vokabel-app-
// entwurf.md Kapitel 4), anders als Serie und Heatmap, die geräteweit über alle Stapel laufen.
function renderBoxDistributionSection(ctx, doc) {
  const t = ctx.t;
  const activeDeck = getActiveDeck(doc);
  const dist = boxDistribution(activeDeckCards(ctx));
  const maxCount = Math.max(1, ...Object.values(dist.counts));

  const bars = [1, 2, 3, 4, 5].map((box) => {
    const count = dist.counts[box];
    const pct = Math.round((count / maxCount) * 100);
    return el('div', { class: 'box-bar-row' }, [
      el('span', { class: 'box-bar-label' }, t('stats.boxLabel', { n: box })),
      el('div', { class: 'box-bar-track' }, [el('div', { class: 'box-bar-fill', style: `width: ${pct}%` })]),
      el('span', { class: 'box-bar-count' }, String(count)),
    ]);
  });

  return el('section', { 'aria-labelledby': 'boxdist-heading' }, [
    el('h2', { id: 'boxdist-heading' }, t('stats.boxHeading', { deck: activeDeck.name })),
    el('div', { class: 'box-bars' }, bars),
    el('p', {}, t('stats.totals', { total: dist.total, repair: dist.repair })),
  ]);
}

// ---------- Card list ----------

export function renderCardsView(container, ctx) {
  const t = ctx.t;
  const session = ctx.state.cardsSession;

  const searchField = el('div', { class: 'search-field' }, [
    icons.search(),
    el('input', {
      id: 'card-search',
      type: 'search',
      placeholder: t('cards.searchPlaceholder'),
      value: session.search,
      'aria-label': t('cards.searchLabel'),
      oninput: debounce((e) => {
        session.search = e.target.value;
        renderRows();
      }, 150),
    }),
  ]);

  const boxSelect = el(
    'select',
    {
      'aria-label': t('cards.filterBoxLabel'),
      onchange: (e) => {
        session.filterBox = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, t('cards.filterBoxAll')),
      ...[1, 2, 3, 4, 5].map((n) =>
        el('option', { value: String(n), selected: session.filterBox === String(n) }, t('cards.filterBoxN', { n }))
      ),
    ]
  );

  const repairSelect = el(
    'select',
    {
      'aria-label': t('cards.filterRepairLabel'),
      onchange: (e) => {
        session.filterRepair = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, t('cards.filterAll')),
      el('option', { value: 'yes' }, t('cards.filterRepairOnly')),
      el('option', { value: 'no' }, t('cards.filterRepairNone')),
    ]
  );

  const markedSelect = el(
    'select',
    {
      'aria-label': t('cards.filterMarkedLabel'),
      onchange: (e) => {
        session.filterMarked = e.target.value;
        renderRows();
      },
    },
    [
      el('option', { value: '' }, t('cards.filterAll')),
      el('option', { value: 'yes' }, t('cards.filterMarkedOnly')),
      el('option', { value: 'no' }, t('cards.filterMarkedNone')),
    ]
  );

  const bulkBar = el('div', { class: 'bulk-bar', hidden: true });
  const rowsContainer = el('div', { class: 'card-rows', id: 'card-rows' });
  const heading = el('h2', { id: 'cards-heading' }, t('cards.heading', { n: activeDeckCards(ctx).length }));

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
      el('span', {}, t('cards.selectedCount', { n })),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          onclick: () => doDelete([...session.selection]),
        },
        [icons.trash(), el('span', {}, t('cards.delete'))]
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
        t('cards.deselect')
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
    heading.textContent = t('cards.heading', { n: activeDeckCards(ctx).length });
    renderRows();
    updateBulkBar();
    ctx.showToast({
      message: t('cards.deletedToast', { n: removed.length }),
      actionLabel: t('cards.undo'),
      onAction: async () => {
        if (!session.undo) return;
        const restored = restoreCards(ctx.doc, session.undo.removed);
        try {
          await ctx.persist(restored);
        } catch {
          return;
        }
        session.undo = null;
        heading.textContent = t('cards.heading', { n: activeDeckCards(ctx).length });
        renderRows();
      },
    });
  }

  function renderRows() {
    clear(rowsContainer);
    if (activeDeckCards(ctx).length === 0) {
      rowsContainer.append(el('p', { class: 'empty-state' }, t('cards.emptyDeck')));
      updateBulkBar();
      return;
    }
    const visible = activeDeckCards(ctx).filter(matchesFilters);
    if (visible.length === 0) {
      rowsContainer.append(el('p', { class: 'empty-state' }, t('cards.emptyFiltered')));
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
      'aria-label': t('cards.selectAria', { a: card.a }),
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
        'aria-label': card.marked ? t('cards.unmarkAria') : t('cards.markAria'),
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
        'aria-label': t('cards.editAria', { a: card.a }),
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
        'aria-label': t('cards.deleteAria', { a: card.a }),
        onclick: () => doDelete([card.id]),
      },
      [icons.trash()]
    );

    return el('li', { class: 'card-row' }, [
      checkbox,
      el('span', { class: 'card-text card-text-a' }, card.a || t('common.empty')),
      el('span', { class: 'card-text card-text-b' }, card.b || t('common.empty')),
      el('span', { class: 'badge' }, t('cards.boxBadge', { n: card.box })),
      card.repair ? el('span', { class: 'badge badge-repair' }, t('cards.repairBadge')) : null,
      starBtn,
      editBtn,
      deleteBtn,
    ]);
  }

  function renderEditRow(card) {
    const aInput = el('input', { type: 'text', value: card.a, 'aria-label': t('cards.frontLabel') });
    const bInput = el('input', { type: 'text', value: card.b, 'aria-label': t('cards.backLabel') });

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
      el('button', { type: 'button', class: 'btn btn-primary', onclick: commit }, [icons.check(), el('span', {}, t('common.save'))]),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: cancel }, t('common.cancel')),
    ]);
  }

  renderRows();
}

// ---------- Quick capture ----------

export function renderCaptureView(container, ctx) {
  const t = ctx.t;
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
    summary.append(el('p', {}, t('capture.summary', { n: cards.length })));
    for (const c of cards.slice(0, 50)) {
      list.append(el('li', { class: 'preview-item' }, t('capture.previewArrow', { a: c.a, b: c.b || t('common.empty') })));
    }
    if (cards.length > 50) list.append(el('li', { class: 'preview-item' }, t('capture.previewMore', { n: cards.length - 50 })));
    for (const w of warnings) {
      list.append(
        el('li', { class: 'preview-item preview-warning' }, [
          icons.warning(),
          el('span', {}, t('capture.warningLine', { line: w.line, text: w.text })),
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
          ctx.showToast({ message: t('capture.noneFound') });
          return;
        }
        const deckId = getActiveDeck(ctx.doc).id;
        const newCards = cards.map((c) => createCard({ ...c, deckId }));
        try {
          await ctx.persist(addCards(ctx.doc, newCards));
        } catch {
          return;
        }
        textarea.value = '';
        updatePreview();
        const note = warnings.length ? t('capture.incompleteNote', { n: warnings.length }) : '';
        ctx.showToast({ message: t('capture.createdToast', { n: newCards.length, note }) });
        ctx.refreshHeaderCount();
      },
    },
    t('capture.commit')
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
    t('capture.clear')
  );

  container.append(
    el('section', { 'aria-labelledby': 'capture-heading' }, [
      el('h2', { id: 'capture-heading' }, t('capture.heading', { deck: getActiveDeck(ctx.doc).name })),
      el('p', { id: 'capture-hint', class: 'hint' }, t('capture.hint')),
      el('div', { class: 'capture-layout' }, [
        el('div', { class: 'capture-input' }, [textarea]),
        el('div', { class: 'capture-preview' }, [summary, list]),
      ]),
      el('div', { class: 'actions' }, [commitBtn, clearBtn]),
    ])
  );

  updatePreview();
}

// ---------- Learn ----------

export function renderLearnView(container, ctx) {
  const ls = ctx.state.learnSession;
  if (!ls) renderLearnSetup(container, ctx);
  else if (ls.finished) renderLearnSummary(container, ctx);
  else renderLearnSession(container, ctx);
}

// Gemeinsame Felder für Richtung, Reihenfolge und den Markierungsfilter, genutzt von
// Lern- und Testsitzungs-Einrichtung. idPrefix hält die Radio-IDs beider Ansichten auseinander.
function buildSessionOptionFields(ctx, deck, idPrefix, onChange) {
  const t = ctx.t;
  let direction = 'ab';
  let order = 'random';
  let onlyMarked = false;

  const directionField = el('fieldset', {}, [
    el('legend', {}, t('session.directionLegend')),
    radioOption(`${idPrefix}-direction`, 'ab', t('session.directionOption', { a: deck.langA, b: deck.langB }), true),
    radioOption(`${idPrefix}-direction`, 'ba', t('session.directionOption', { a: deck.langB, b: deck.langA }), false),
  ]);
  directionField.addEventListener('change', (e) => {
    direction = e.target.value;
    onChange();
  });

  const orderField = el('fieldset', {}, [
    el('legend', {}, t('session.orderLegend')),
    radioOption(`${idPrefix}-order`, 'random', t('session.orderRandom'), true),
    radioOption(`${idPrefix}-order`, 'sequential', t('session.orderSequential'), false),
    radioOption(`${idPrefix}-order`, 'box', t('session.orderBox'), false),
  ]);
  orderField.addEventListener('change', (e) => {
    order = e.target.value;
    onChange();
  });

  const markedCheckbox = el('input', { type: 'checkbox', id: `${idPrefix}-only-marked` });
  markedCheckbox.addEventListener('change', (e) => {
    onlyMarked = e.target.checked;
    onChange();
  });
  const markedField = el('div', { class: 'field-row' }, [el('label', {}, [markedCheckbox, ` ${t('session.onlyMarked')}`])]);

  return {
    directionField,
    orderField,
    markedField,
    get direction() {
      return direction;
    },
    get order() {
      return order;
    },
    get onlyMarked() {
      return onlyMarked;
    },
  };
}

function renderLearnSetup(container, ctx) {
  const t = ctx.t;
  const deck = getActiveDeck(ctx.doc);
  const countText = el('p', { class: 'hint' });
  const startBtn = el('button', { type: 'button', class: 'btn btn-primary' }, t('learn.startButton'));

  function updateCount() {
    const deckCards = activeDeckCards(ctx);
    const cards = fields.onlyMarked ? deckCards.filter((c) => c.marked) : deckCards;
    const repairCount = cards.filter((c) => c.repair).length;
    if (deckCards.length === 0) {
      countText.textContent = t('cards.emptyDeck');
    } else if (cards.length === 0) {
      countText.textContent = t('learn.emptyMarked');
    } else {
      countText.textContent = t('learn.countHint', { n: cards.length, repair: repairCount });
    }
    startBtn.disabled = cards.length === 0;
  }

  const fields = buildSessionOptionFields(ctx, deck, 'learn', updateCount);

  startBtn.addEventListener('click', () => {
    const { order, direction, onlyMarked } = fields;
    const cardIds = buildQueue(activeDeckCards(ctx), { order, onlyMarked });
    ctx.startLearnSession({ order, direction, onlyMarked, cardIds });
  });

  updateCount();

  container.append(
    el('section', { 'aria-labelledby': 'learn-heading' }, [
      el('h2', { id: 'learn-heading' }, t('learn.setupHeading')),
      fields.directionField,
      fields.orderField,
      fields.markedField,
      countText,
      startBtn,
    ])
  );
}

function describeRatingOutcome(ctx, prev, updated, correct) {
  const t = ctx.t;
  if (!correct) return t('session.ratingWrong');
  if (prev.repair && updated.repair) return t('session.ratingRepairProgress', { streak: updated.streak });
  if (prev.repair && !updated.repair) return t('session.ratingRepairDone');
  return t('session.ratingBoxUp', { prev: prev.box, next: updated.box });
}

async function rateCurrentCard(ctx, ls, correct) {
  const t = ctx.t;
  const cardId = ls.currentCardId;
  const previousCard = ctx.doc.cards.find((c) => c.id === cardId);
  const updated = applyLearningResult(previousCard, correct);
  ctx.persistBuffered(replaceCard(ctx.doc, updated));

  if (correct) ls.correctCount += 1;
  else ls.wrongCount += 1;
  if (!correct) ls.queue.requeueAfterWrong(cardId);

  ctx.showToast({
    message: describeRatingOutcome(ctx, previousCard, updated, correct),
    actionLabel: t('session.correctionAction'),
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
  }
  ctx.render();
}

// Baut die Umdreh-Karte samt Bewertungsflächen: Tippen/Leertaste dreht um, danach bewerten
// über zwei getrennte Flächen oder die Pfeiltasten. Wird von Lern- und Testsitzung geteilt,
// da sich beide nur in Warteschlangen-Verwaltung und Rahmen (Fortschritt, Ziel) unterscheiden.
function buildFlipCard(ctx, { card, direction, deck, onRate }) {
  const t = ctx.t;
  const frontLabel = direction === 'ab' ? deck.langA : deck.langB;
  const backLabel = direction === 'ab' ? deck.langB : deck.langA;
  const frontText = direction === 'ab' ? card.a : card.b;
  const backText = direction === 'ab' ? card.b : card.a;

  let flipped = false;

  const faceLabel = el('p', { class: 'learn-face-label' }, frontLabel);
  const faceText = el('p', { class: 'learn-face-text' }, frontText || t('common.empty'));
  const cardBtn = el('button', { type: 'button', class: 'learn-card', 'aria-label': t('session.flipAria') }, [
    faceLabel,
    faceText,
  ]);

  const wrongBtn = el(
    'button',
    { type: 'button', class: 'btn btn-danger learn-rate', onclick: () => onRate(false) },
    t('session.wrongBtn')
  );
  const rightBtn = el(
    'button',
    { type: 'button', class: 'btn btn-primary learn-rate', onclick: () => onRate(true) },
    t('session.correctBtn')
  );
  const rateRow = el('div', { class: 'learn-rate-row', hidden: true }, [wrongBtn, rightBtn]);

  function showFace() {
    faceLabel.textContent = flipped ? backLabel : frontLabel;
    faceText.textContent = (flipped ? backText : frontText) || t('common.empty');
    rateRow.hidden = !flipped;
  }

  cardBtn.addEventListener('click', () => {
    flipped = !flipped;
    showFace();
    if (flipped) wrongBtn.focus();
  });

  function handleKeydown(e) {
    if (!flipped) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onRate(true);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onRate(false);
    }
  }

  return { cardBtn, rateRow, handleKeydown, focus: () => cardBtn.focus() };
}

function renderLearnSession(container, ctx) {
  const t = ctx.t;
  const ls = ctx.state.learnSession;
  const deck = getActiveDeck(ctx.doc);
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

  const flip = buildFlipCard(ctx, { card, direction: ls.direction, deck, onRate: (correct) => rateCurrentCard(ctx, ls, correct) });

  const section = el('section', { 'aria-labelledby': 'learn-heading' }, [
    el('h2', { id: 'learn-heading', class: 'visually-hidden' }, t('learn.sessionHiddenHeading')),
  ]);
  section.addEventListener('keydown', flip.handleKeydown);

  const progress = el(
    'p',
    { class: 'learn-progress' },
    t('learn.progress', { correct: ls.correctCount, wrong: ls.wrongCount, n: ls.queue.size() + 1 })
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
        t('learn.endButton')
      ),
      progress,
    ]),
    flip.cardBtn,
    flip.rateRow
  );

  container.append(section);
  flip.focus();
}

function renderLearnSummary(container, ctx) {
  const t = ctx.t;
  const ls = ctx.state.learnSession;
  container.append(
    el('section', { 'aria-labelledby': 'learn-heading' }, [
      el('h2', { id: 'learn-heading' }, t('learn.summaryHeading')),
      el('p', {}, t('learn.summaryText', { correct: ls.correctCount, wrong: ls.wrongCount, total: ls.correctCount + ls.wrongCount })),
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
          t('learn.newSession')
        ),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.navigate('karten') }, t('learn.toCards')),
      ]),
    ])
  );
}

// ---------- Test ----------

export function renderTestView(container, ctx) {
  const ts = ctx.state.testSession;
  if (!ts) renderTestSetup(container, ctx);
  else if (ts.finished) renderTestSummary(container, ctx);
  else renderTestSession(container, ctx);
}

function renderTestSetup(container, ctx) {
  const t = ctx.t;
  const deck = getActiveDeck(ctx.doc);
  const countText = el('p', { class: 'hint' });
  const startBtn = el('button', { type: 'button', class: 'btn btn-primary' }, t('test.startButton'));

  function updateAll() {
    const deckCards = activeDeckCards(ctx);
    const cards = fields.onlyMarked ? deckCards.filter((c) => c.marked) : deckCards;
    if (deckCards.length === 0) {
      countText.textContent = t('cards.emptyDeck');
    } else if (cards.length === 0) {
      countText.textContent = t('learn.emptyMarked');
    } else {
      countText.textContent = t('test.countHint', { n: cards.length });
    }
    startBtn.disabled = cards.length === 0;
  }

  const fields = buildSessionOptionFields(ctx, deck, 'test', updateAll);

  let goalType = 'count';
  const goalCountInput = el('input', { type: 'number', min: '1', value: '20', id: 'goal-count-value' });
  const goalDurationInput = el('input', { type: 'number', min: '1', value: '5', id: 'goal-duration-minutes' });
  const goalAccuracyValueInput = el('input', { type: 'number', min: '1', max: '100', value: '90', id: 'goal-accuracy-value' });
  const goalAccuracyMinInput = el('input', { type: 'number', min: '1', value: '20', id: 'goal-accuracy-mincards' });

  const countSub = el('div', { class: 'field-row' }, [el('label', {}, [t('test.goalCountFieldLabel'), goalCountInput])]);
  const durationSub = el('div', { class: 'field-row', hidden: true }, [
    el('label', {}, [t('test.goalDurationFieldLabel'), goalDurationInput]),
  ]);
  const accuracySub = el('div', { class: 'field-row', hidden: true }, [
    el('label', {}, [t('test.goalAccuracyValueLabel'), goalAccuracyValueInput]),
    el('label', {}, [t('test.goalAccuracyMinLabel'), goalAccuracyMinInput]),
  ]);

  const goalTypeField = el('fieldset', {}, [
    el('legend', {}, t('test.goalLegend')),
    radioOption('test-goal-type', 'count', t('test.goalCount'), true),
    radioOption('test-goal-type', 'duration', t('test.goalDuration'), false),
    radioOption('test-goal-type', 'accuracy', t('test.goalAccuracy'), false),
  ]);
  goalTypeField.addEventListener('change', (e) => {
    goalType = e.target.value;
    countSub.hidden = goalType !== 'count';
    durationSub.hidden = goalType !== 'duration';
    accuracySub.hidden = goalType !== 'accuracy';
  });

  function currentGoal() {
    if (goalType === 'duration') {
      const minutes = Math.max(1, Number(goalDurationInput.value) || 5);
      return { type: 'duration', value: minutes * 60 };
    }
    if (goalType === 'accuracy') {
      const value = Math.min(100, Math.max(1, Number(goalAccuracyValueInput.value) || 90));
      const minCards = Math.max(1, Number(goalAccuracyMinInput.value) || 20);
      return { type: 'accuracy', value, minCards };
    }
    const value = Math.max(1, Number(goalCountInput.value) || 20);
    return { type: 'count', value };
  }

  startBtn.addEventListener('click', () => {
    const { order, direction, onlyMarked } = fields;
    const cardIds = buildQueue(activeDeckCards(ctx), { order, onlyMarked });
    ctx.startTestSession({ order, direction, onlyMarked, goal: currentGoal(), cardIds });
  });

  updateAll();

  container.append(
    el('section', { 'aria-labelledby': 'test-heading' }, [
      el('h2', { id: 'test-heading' }, t('test.setupHeading')),
      fields.directionField,
      fields.orderField,
      fields.markedField,
      goalTypeField,
      countSub,
      durationSub,
      accuracySub,
      countText,
      startBtn,
    ])
  );
}

// Zieht die nächste Karte; ist die Warteschlange leer, aber das Ziel noch nicht erreicht,
// wird der (gefilterte) Kartenbestand erneut aufgebaut – der Testmodus wiederholt den Stapel,
// bis die Person selbst auswertet, statt bei knappen Stapeln vorzeitig abzubrechen.
function drawNextTestCard(ctx, ts) {
  if (ts.queue.isEmpty()) {
    const refillIds = buildQueue(activeDeckCards(ctx), { order: ts.order, onlyMarked: ts.onlyMarked });
    if (refillIds.length === 0) return null;
    ts.queue.enqueueMany(refillIds);
  }
  return ts.queue.draw();
}

async function rateTestCard(ctx, ts, correct) {
  const t = ctx.t;
  const cardId = ts.currentCardId;
  const previousCard = ctx.doc.cards.find((c) => c.id === cardId);
  const updated = applyLearningResult(previousCard, correct);
  ctx.persistBuffered(replaceCard(ctx.doc, updated));

  if (correct) {
    ts.correctCount += 1;
  } else {
    ts.wrongCount += 1;
    ts.wrongCardIds.add(cardId);
    ts.queue.requeueAfterWrong(cardId);
  }

  ctx.showToast({
    message: describeRatingOutcome(ctx, previousCard, updated, correct),
    actionLabel: t('session.correctionAction'),
    duration: 3000,
    onAction: async () => {
      const flippedCorrect = !correct;
      const recorrected = applyLearningResult(previousCard, flippedCorrect);
      ctx.persistBuffered(replaceCard(ctx.doc, recorrected));
      if (!ts.finished) {
        if (correct) {
          ts.correctCount -= 1;
          ts.wrongCount += 1;
          ts.wrongCardIds.add(cardId);
          ts.queue.requeueAfterWrong(cardId);
        } else {
          ts.wrongCount -= 1;
          ts.correctCount += 1;
          ts.wrongCardIds.delete(cardId);
          ts.queue.remove(cardId);
        }
        ctx.render();
      }
    },
  });

  const nextId = drawNextTestCard(ctx, ts);
  if (nextId == null) {
    await ctx.endTestSession(ts);
  } else {
    ts.currentCardId = nextId;
  }
  ctx.render();
}

function renderTestSession(container, ctx) {
  const t = ctx.t;
  const ts = ctx.state.testSession;
  const deck = getActiveDeck(ctx.doc);

  if (ts.paused) {
    renderPausedTestSession(container, ctx, ts);
    return;
  }

  const card = ctx.doc.cards.find((c) => c.id === ts.currentCardId);
  if (!card) {
    const nextId = drawNextTestCard(ctx, ts);
    if (nextId == null) {
      ctx.endTestSession(ts).then(() => ctx.render());
      return;
    }
    ts.currentCardId = nextId;
    ctx.render();
    return;
  }

  const flip = buildFlipCard(ctx, { card, direction: ts.direction, deck, onRate: (correct) => rateTestCard(ctx, ts, correct) });

  const section = el('section', { 'aria-labelledby': 'test-heading' }, [
    el('h2', { id: 'test-heading', class: 'visually-hidden' }, t('test.sessionHiddenHeading')),
  ]);
  section.addEventListener('keydown', flip.handleKeydown);

  const progress = describeGoalProgress(ts.goal, ctx.testSessionStats(ts));
  const progressText = el('p', { class: 'learn-progress', id: 'test-progress' }, t(progress.key, progress.params));
  const goalBadge = el(
    'span',
    { class: 'badge badge-goal-reached', id: 'test-goal-badge', hidden: !progress.reached },
    t('test.goalReachedBadge')
  );

  const topActions = [
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary',
        onclick: async () => {
          await ctx.endTestSession(ts);
          ctx.render();
        },
      },
      t('test.showResult')
    ),
  ];
  if (ts.goal.type === 'duration') {
    topActions.push(
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.pauseTestSession() }, t('test.pause')),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.extendTestSession(120) }, t('test.extend'))
    );
  }

  section.append(
    el('div', { class: 'learn-top-bar' }, [el('div', { class: 'test-top-actions' }, topActions), progressText, goalBadge]),
    flip.cardBtn,
    flip.rateRow
  );

  container.append(section);
  flip.focus();
}

function renderPausedTestSession(container, ctx, ts) {
  const t = ctx.t;
  const progress = describeGoalProgress(ts.goal, ctx.testSessionStats(ts));
  container.append(
    el('section', { 'aria-labelledby': 'test-heading' }, [
      el('h2', { id: 'test-heading', class: 'visually-hidden' }, t('test.pausedHeading')),
      el('div', { class: 'learn-top-bar' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onclick: async () => {
              await ctx.endTestSession(ts);
              ctx.render();
            },
          },
          t('test.showResult')
        ),
        el('p', { class: 'learn-progress' }, t(progress.key, progress.params)),
      ]),
      el('div', { class: 'learn-card test-paused' }, [
        el('p', { class: 'learn-face-text' }, t('test.pausedLabel')),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.resumeTestSession() }, t('test.resume')),
      ]),
    ])
  );
}

function renderTestSummary(container, ctx) {
  const t = ctx.t;
  const ts = ctx.state.testSession;
  const total = ts.correctCount + ts.wrongCount;
  const rate = total === 0 ? 0 : Math.round((ts.correctCount / total) * 100);
  const stats = ctx.testSessionStats(ts);
  const seconds = Math.max(0, Math.round(stats.elapsedMs / 1000));
  const progress = describeGoalProgress(ts.goal, stats);
  const goalLabel = describeGoalLabel(ts.goal);
  const wrongCards = ctx.doc.cards.filter((c) => ts.wrongCardIds.has(c.id));

  const goalLine = progress.reached
    ? t('test.summaryGoalReached', { label: t(goalLabel.key, goalLabel.params) })
    : t('test.summaryGoalNotReached', { label: t(goalLabel.key, goalLabel.params) });

  const wrongList = wrongCards.length
    ? el(
        'ul',
        { class: 'card-list' },
        wrongCards.map((c) =>
          el('li', { class: 'card-row' }, [
            el('span', { class: 'card-text card-text-a' }, c.a || t('common.empty')),
            el('span', { class: 'card-text card-text-b' }, c.b || t('common.empty')),
          ])
        )
      )
    : el('p', { class: 'hint' }, t('test.noWrongCards'));

  container.append(
    el('section', { 'aria-labelledby': 'test-heading' }, [
      el('h2', { id: 'test-heading' }, t('test.summaryHeading')),
      el('p', {}, goalLine),
      el('p', {}, t('test.summaryAccuracy', { rate, correct: ts.correctCount, total })),
      el('p', {}, t('test.summaryDuration', { duration: formatDuration(seconds) })),
      el('h3', {}, t('test.wrongCardsHeading')),
      wrongList,
      el('div', { class: 'actions' }, [
        wrongCards.length
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn btn-primary',
                onclick: () => ctx.startPracticeForWrongCards(wrongCards.map((c) => c.id), ts.direction),
              },
              t('test.practiceWrong')
            )
          : null,
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onclick: () => {
              ctx.state.testSession = null;
              ctx.render();
            },
          },
          t('test.newTest')
        ),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.navigate('karten') }, t('test.toCards')),
      ]),
    ])
  );
}

// ---------- Import ----------

export function renderImportView(container, ctx) {
  const t = ctx.t;
  container.append(
    el('section', { 'aria-labelledby': 'import-heading' }, [
      el('h2', { id: 'import-heading' }, t('import.heading')),
      buildCsvImport(ctx),
      buildBackupImport(ctx),
    ])
  );
}

function buildCsvImport(ctx) {
  const t = ctx.t;
  let rows = [];
  let colA = 0;
  let colB = 1;
  let hasHeader = true;

  const activeDeck = getActiveDeck(ctx.doc);
  const fileInput = el('input', { type: 'file', id: 'csv-file', accept: '.csv,text/csv' });
  const colASelect = el('select', { 'aria-label': t('import.colALabel', { lang: activeDeck.langA }) });
  const colBSelect = el('select', { 'aria-label': t('import.colBLabel', { lang: activeDeck.langB }) });
  const headerCheckbox = el('input', { type: 'checkbox', id: 'csv-header', checked: true });
  const previewTable = el('table', { class: 'csv-preview' });
  const summary = el('p', { class: 'csv-summary' });
  const duplicateBox = el('div', { class: 'duplicate-box', hidden: true });
  const commitBtn = el('button', { type: 'button', class: 'btn btn-primary', hidden: true }, t('import.csvCommit'));
  const configBox = el('div', { hidden: true }, [
    el('div', { class: 'field-row' }, [
      el('label', {}, [t('import.colALabel', { lang: activeDeck.langA }), colASelect]),
      el('label', {}, [t('import.colBLabel', { lang: activeDeck.langB }), colBSelect]),
      el('label', {}, [headerCheckbox, t('import.headerCheckbox')]),
    ]),
    previewTable,
    summary,
    duplicateBox,
    commitBtn,
  ]);

  function columnOptions(select, selectedIndex, maxCols) {
    clear(select);
    for (let i = 0; i < maxCols; i++) {
      select.append(el('option', { value: String(i), selected: i === selectedIndex }, t('import.columnOption', { n: i + 1 })));
    }
  }

  function updatePreview() {
    clear(previewTable);
    const preview = rows.slice(0, 5);
    for (const row of preview) {
      previewTable.append(el('tr', {}, row.map((cell) => el('td', {}, cell))));
    }
    const { cards, skipped } = rowsToCards(rows, colA, colB, { skipFirstRow: hasHeader });
    const skippedNote = skipped.length ? t('import.csvSkippedNote', { n: skipped.length }) : '';
    summary.textContent = t('import.csvSummary', { n: cards.length, skippedNote });
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
    const duplicates = findDuplicateFronts(ctx.doc, cards, activeDeck.id);
    if (duplicates.length === 0) {
      applyCsvCards(cards, 'create');
      return;
    }
    clear(duplicateBox);
    duplicateBox.hidden = false;
    const choice = el('fieldset', {}, [
      el('legend', {}, t('import.duplicateLegend', { n: duplicates.length })),
      radioOption('dup-choice', 'skip', t('import.dupSkip'), true),
      radioOption('dup-choice', 'replace', t('import.dupReplace'), false),
      radioOption('dup-choice', 'create', t('import.dupCreate'), false),
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
        t('import.continueButton')
      ),
    ]);
    duplicateBox.append(choice);
  });

  async function applyCsvCards(cards, mode) {
    const duplicates = findDuplicateFronts(ctx.doc, cards, activeDeck.id);
    const duplicateFronts = new Set(duplicates.map((d) => d.candidate.a.trim()));
    const makeCard = (c) => createCard({ ...c, deckId: activeDeck.id });
    let doc = ctx.doc;
    if (mode === 'skip') {
      const toAdd = cards.filter((c) => !duplicateFronts.has(c.a.trim())).map(makeCard);
      doc = addCards(doc, toAdd);
    } else if (mode === 'replace') {
      for (const c of cards) {
        const existing = doc.cards.find((ec) => ec.deckId === activeDeck.id && ec.a.trim() === c.a.trim());
        if (existing) doc = replaceCard(doc, applyCardEdit(existing, { b: c.b }));
        else doc = addCards(doc, [makeCard(c)]);
      }
    } else {
      doc = addCards(doc, cards.map(makeCard));
    }
    try {
      await ctx.persist(doc);
    } catch {
      return;
    }
    fileInput.value = '';
    rows = [];
    configBox.hidden = true;
    ctx.showToast({ message: t('import.csvDoneToast') });
    ctx.refreshHeaderCount();
  }

  return el('section', { 'aria-labelledby': 'csv-heading', class: 'import-section' }, [
    el('h3', { id: 'csv-heading' }, t('import.csvHeading', { deck: activeDeck.name })),
    el('label', { for: 'csv-file' }, t('import.csvFileLabel')),
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
  const t = ctx.t;
  let importedDoc = null;

  const fileInput = el('input', { type: 'file', id: 'backup-file', accept: '.json,.vok.json,application/json' });
  const summary = el('p', { class: 'backup-summary' });
  const modeBox = el('fieldset', { hidden: true }, [
    el('legend', {}, t('import.backupModeLegend')),
    radioOption('backup-mode', 'merge', t('import.modeMerge'), true),
    radioOption('backup-mode', 'replace', t('import.modeReplace'), false),
  ]);
  const commitBtn = el('button', { type: 'button', class: 'btn btn-primary', hidden: true }, t('import.backupCommit'));

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    summary.className = 'backup-summary';
    try {
      const text = await file.text();
      importedDoc = parseImportedText(text);
      summary.textContent = t('import.backupSummary', { imported: importedDoc.cards.length, current: ctx.doc.cards.length });
      modeBox.hidden = false;
      commitBtn.hidden = false;
    } catch (err) {
      importedDoc = null;
      summary.textContent = describeError(ctx, err);
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
    ctx.showToast({ message: t('import.backupDoneToast') });
    ctx.render();
  });

  return el('section', { 'aria-labelledby': 'backup-heading', class: 'import-section' }, [
    el('h3', { id: 'backup-heading' }, t('import.backupHeading')),
    el('label', { for: 'backup-file' }, t('import.backupFileLabel')),
    fileInput,
    summary,
    modeBox,
    commitBtn,
  ]);
}
