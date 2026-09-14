import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCurrentStreak,
  computeLongestStreak,
  isCurrentWeekJokerAvailable,
  heatmapLevel,
  buildHeatmapWeeks,
  boxDistribution,
} from '../src/js/stats.js';

function day(dateStr, correct = 1, wrong = 0) {
  return { date: dateStr, correct, wrong, seconds: 60 };
}

test('computeCurrentStreak: ununterbrochene Tage werden einfach gezählt', () => {
  const days = [day('2026-09-14'), day('2026-09-15'), day('2026-09-16')];
  assert.equal(computeCurrentStreak(days, new Date(2026, 8, 16)), 3);
});

test('computeCurrentStreak: ein Fehltag pro Kalenderwoche (Joker) bricht die Serie nicht, zählt aber selbst nicht mit', () => {
  // Montag 7.9. bis Samstag 12.9.2026, Donnerstag 10.9. ausgelassen.
  const days = [day('2026-09-07'), day('2026-09-08'), day('2026-09-09'), day('2026-09-11'), day('2026-09-12')];
  assert.equal(computeCurrentStreak(days, new Date(2026, 8, 12)), 5);
});

test('computeCurrentStreak: zwei Fehltage in derselben Woche brechen die Serie', () => {
  // Montag 7.9., Dienstag+Mittwoch fehlen, Donnerstag 10.9. aktiv.
  const days = [day('2026-09-07'), day('2026-09-10')];
  assert.equal(computeCurrentStreak(days, new Date(2026, 8, 10)), 1);
});

test('computeCurrentStreak: der heutige Tag bricht die Serie nicht, auch wenn er noch inaktiv ist', () => {
  const days = [day('2026-09-14'), day('2026-09-15'), day('2026-09-16')];
  // Heute (17.9.) noch ohne Sitzung.
  assert.equal(computeCurrentStreak(days, new Date(2026, 8, 17)), 3);
});

test('computeCurrentStreak: ohne jemals eine Sitzung ist die Serie 0', () => {
  assert.equal(computeCurrentStreak([], new Date(2026, 8, 17)), 0);
});

test('computeCurrentStreak und computeLongestStreak: Serie über eine Monats- und Jahresgrenze hinweg', () => {
  // Woche Montag 30.12.2024 bis Sonntag 5.1.2025 (Neujahr 1.1. ausgelassen), dazu die
  // Vorwoche Fr–So (27.–29.12.2024) als direkte Fortsetzung.
  const days = [
    day('2024-12-27'),
    day('2024-12-28'),
    day('2024-12-29'),
    day('2024-12-30'),
    day('2024-12-31'),
    // 2025-01-01 bewusst ausgelassen (Jokertag)
    day('2025-01-02'),
    day('2025-01-03'),
    day('2025-01-04'),
    day('2025-01-05'),
  ];
  const today = new Date(2025, 0, 5);
  assert.equal(computeCurrentStreak(days, today), 9);
  assert.equal(computeLongestStreak(days), 9);
});

test('computeLongestStreak: findet eine vergangene, längere Serie unabhängig von der aktuellen', () => {
  const days = [
    day('2024-01-01'),
    day('2024-01-02'),
    day('2024-01-03'),
    day('2024-01-04'),
    day('2024-01-05'),
    day('2024-01-06'),
    day('2024-01-07'),
    day('2024-01-08'),
    day('2024-01-09'),
    day('2024-01-10'),
    // große Lücke, weit über jeden Joker hinaus
    day('2024-02-05'),
  ];
  assert.equal(computeLongestStreak(days), 10);
  assert.equal(computeCurrentStreak(days, new Date(2024, 1, 5)), 1);
});

test('isCurrentWeekJokerAvailable: verfügbar, solange kein Fehltag seit Montag vorkam', () => {
  const days = [day('2026-09-07'), day('2026-09-08'), day('2026-09-09')];
  assert.equal(isCurrentWeekJokerAvailable(days, new Date(2026, 8, 10)), true);
});

test('isCurrentWeekJokerAvailable: bereits verbraucht nach dem ersten Fehltag dieser Woche', () => {
  const days = [day('2026-09-07')]; // Montag aktiv, Dienstag fehlt
  assert.equal(isCurrentWeekJokerAvailable(days, new Date(2026, 8, 9)), false);
});

test('isCurrentWeekJokerAvailable: der heutige Tag selbst wird nicht geprüft', () => {
  const days = [];
  assert.equal(isCurrentWeekJokerAvailable(days, new Date(2026, 8, 7)), true); // heute ist Montag
});

test('heatmapLevel: fünf Stufen an den Schwellenwerten', () => {
  assert.equal(heatmapLevel(0), 0);
  assert.equal(heatmapLevel(1), 1);
  assert.equal(heatmapLevel(4), 1);
  assert.equal(heatmapLevel(5), 2);
  assert.equal(heatmapLevel(9), 2);
  assert.equal(heatmapLevel(10), 3);
  assert.equal(heatmapLevel(19), 3);
  assert.equal(heatmapLevel(20), 4);
  assert.equal(heatmapLevel(100), 4);
});

test('buildHeatmapWeeks: richtige Anzahl Wochen und Zellen, letzte Woche endet bei heute', () => {
  const today = new Date(2026, 8, 16); // Mittwoch
  const weeks = buildHeatmapWeeks([day('2026-09-14', 6)], 3, today);
  assert.equal(weeks.length, 3);
  for (const week of weeks) assert.equal(week.length, 7);

  const lastWeek = weeks[2];
  assert.equal(lastWeek[0].date, '2026-09-14'); // Montag der aktuellen Woche
  assert.equal(lastWeek[0].level, heatmapLevel(6));
  assert.equal(lastWeek[6].date, '2026-09-20'); // Sonntag
});

test('buildHeatmapWeeks: Tage nach heute sind als future markiert und tragen keine Stufe', () => {
  const today = new Date(2026, 8, 16); // Mittwoch
  const weeks = buildHeatmapWeeks([], 1, today);
  const week = weeks[0];
  const byDate = Object.fromEntries(week.map((c) => [c.date, c]));
  assert.equal(byDate['2026-09-16'].future, false);
  assert.equal(byDate['2026-09-17'].future, true);
  assert.equal(byDate['2026-09-17'].level, -1);
});

test('boxDistribution zählt Kästen, Reparaturkiste und Gesamtzahl', () => {
  const cards = [
    { box: 1, repair: false },
    { box: 1, repair: true },
    { box: 3, repair: false },
    { box: 5, repair: false },
    { box: 5, repair: false },
  ];
  const dist = boxDistribution(cards);
  assert.deepEqual(dist.counts, { 1: 2, 2: 0, 3: 1, 4: 0, 5: 2 });
  assert.equal(dist.repair, 1);
  assert.equal(dist.total, 5);
});
