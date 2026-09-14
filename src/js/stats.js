// Statistik: Lernserie mit Wochenjoker, Heatmap-Aufbereitung, Kastenverteilung. Reine
// Funktionen ohne DOM-Zugriff, mit injizierbarem „heute“ für Testbarkeit.
//
// Serienregel (vokabel-app-entwurf.md, Abschnitt 4): Die Serie zählt Kalendertage mit
// mindestens einer abgeschlossenen Sitzung. Pro Kalenderwoche (Montag–Sonntag) darf genau ein
// Tag ohne Sitzung übersprungen werden, ohne dass die Serie bricht; dieser Jokertag zählt
// selbst nicht zur Serienlänge, er verhindert nur den Abbruch. Ein zweiter Fehltag in derselben
// Woche bricht die Serie. Der heutige Tag ist, solange er noch läuft, nie ein Fehltag.

import { localDateIso } from './model.js';

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, n) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Montag der Kalenderwoche, die `date` enthält (lokale Zeitzone).
function mondayOf(date) {
  const d = startOfDay(date);
  const weekday = d.getDay(); // 0 = Sonntag ... 6 = Samstag
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function activeDateSet(days) {
  return new Set(days.filter((d) => d.correct + d.wrong > 0).map((d) => d.date));
}

// Läuft von `today` rückwärts und zählt aktive Tage; ein Fehltag pro Kalenderwoche wird
// übersprungen (Joker), ohne die Kette zu unterbrechen und ohne selbst mitgezählt zu werden.
// Der heutige Tag bricht die Kette nie, auch wenn er noch inaktiv ist – er ist ja noch nicht
// vorbei.
export function computeCurrentStreak(days, today = new Date()) {
  const active = activeDateSet(days);
  if (active.size === 0) return 0;

  const minDate = startOfDay(new Date(Math.min(...[...active].map((k) => new Date(k).getTime()))));
  let cursor = startOfDay(today);
  if (!active.has(localDateIso(cursor))) cursor = addDays(cursor, -1);

  const jokerUsedForWeek = new Set();
  let streak = 0;
  while (cursor >= minDate) {
    const key = localDateIso(cursor);
    if (active.has(key)) {
      streak += 1;
    } else {
      const weekKey = localDateIso(mondayOf(cursor));
      if (jokerUsedForWeek.has(weekKey)) break;
      jokerUsedForWeek.add(weekKey);
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Längste jemals erreichte Serie: derselbe Regelsatz, aber vorwärts über die gesamte
// aufgezeichnete Geschichte, ohne die Sonderbehandlung für „heute“.
export function computeLongestStreak(days) {
  const active = activeDateSet(days);
  if (active.size === 0) return 0;

  const timestamps = [...active].map((k) => new Date(k).getTime());
  let cursor = startOfDay(new Date(Math.min(...timestamps)));
  const end = startOfDay(new Date(Math.max(...timestamps)));

  const jokerUsedForWeek = new Set();
  let current = 0;
  let longest = 0;
  while (cursor <= end) {
    const key = localDateIso(cursor);
    if (active.has(key)) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      const weekKey = localDateIso(mondayOf(cursor));
      if (jokerUsedForWeek.has(weekKey)) {
        current = 0;
      } else {
        jokerUsedForWeek.add(weekKey);
      }
    }
    cursor = addDays(cursor, 1);
  }
  return longest;
}

// Ob der Wochenjoker der aktuellen Kalenderwoche noch verfügbar ist (kein Fehltag von Montag
// bis gestern). Der heutige Tag wird nicht geprüft, da er noch nicht vorbei ist.
export function isCurrentWeekJokerAvailable(days, today = new Date()) {
  const active = activeDateSet(days);
  const monday = mondayOf(today);
  let cursor = monday;
  const todayStart = startOfDay(today);
  while (cursor < todayStart) {
    if (!active.has(localDateIso(cursor))) return false;
    cursor = addDays(cursor, 1);
  }
  return true;
}

// Fünf Intensitätsstufen (0 = keine Sitzung) nach der Anzahl richtiger Karten an diesem Tag.
export function heatmapLevel(correct) {
  if (correct <= 0) return 0;
  if (correct < 5) return 1;
  if (correct < 10) return 2;
  if (correct < 20) return 3;
  return 4;
}

// Baut `weekCount` Kalenderwochen (Montag–Sonntag) bis einschließlich der Woche von `today`.
// Tage nach `today` innerhalb der letzten Woche sind als `future` markiert (noch keine Daten).
export function buildHeatmapWeeks(days, weekCount, today = new Date()) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayStart = startOfDay(today);
  const firstMonday = addDays(mondayOf(today), -7 * (weekCount - 1));

  const weeks = [];
  for (let w = 0; w < weekCount; w++) {
    const weekStart = addDays(firstMonday, 7 * w);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const key = localDateIso(date);
      const future = date > todayStart;
      const entry = byDate.get(key);
      const correct = entry ? entry.correct : 0;
      const wrong = entry ? entry.wrong : 0;
      cells.push({ date: key, correct, wrong, level: future ? -1 : heatmapLevel(correct), future });
    }
    weeks.push(cells);
  }
  return weeks;
}

// Verteilung der Karten auf die fünf Kästen, Größe der Reparaturkiste, Gesamtzahl.
export function boxDistribution(cards) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let repair = 0;
  for (const card of cards) {
    counts[card.box] = (counts[card.box] ?? 0) + 1;
    if (card.repair) repair += 1;
  }
  return { counts, repair, total: cards.length };
}
