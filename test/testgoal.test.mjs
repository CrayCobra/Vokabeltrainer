import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, isGoalReached, describeGoalProgress, describeGoalLabel } from '../src/js/testgoal.js';
import { translate } from '../src/js/i18n.js';

test('formatDuration formatiert Sekunden als m:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(599), '9:59');
  assert.equal(formatDuration(600), '10:00');
});

test('isGoalReached: Kartenanzahl zählt richtige und falsche Antworten zusammen', () => {
  const goal = { type: 'count', value: 5 };
  assert.equal(isGoalReached(goal, { correctCount: 2, wrongCount: 2, elapsedMs: 0 }), false);
  assert.equal(isGoalReached(goal, { correctCount: 3, wrongCount: 2, elapsedMs: 0 }), true);
  assert.equal(isGoalReached(goal, { correctCount: 5, wrongCount: 1, elapsedMs: 0 }), true);
});

test('isGoalReached: Dauer vergleicht vergangene aktive Zeit mit dem Ziel in Sekunden', () => {
  const goal = { type: 'duration', value: 300 }; // 5 Minuten
  assert.equal(isGoalReached(goal, { correctCount: 0, wrongCount: 0, elapsedMs: 299000 }), false);
  assert.equal(isGoalReached(goal, { correctCount: 0, wrongCount: 0, elapsedMs: 300000 }), true);
  assert.equal(isGoalReached(goal, { correctCount: 0, wrongCount: 0, elapsedMs: 500000 }), true);
});

test('isGoalReached: Trefferquote verlangt Mindestanzahl UND erreichte Quote gleichzeitig', () => {
  const goal = { type: 'accuracy', value: 90, minCards: 10 };
  // Quote schon erreicht, aber Mindestanzahl noch nicht.
  assert.equal(isGoalReached(goal, { correctCount: 5, wrongCount: 0, elapsedMs: 0 }), false);
  // Mindestanzahl erreicht, Quote knapp verfehlt (8/10 = 80%).
  assert.equal(isGoalReached(goal, { correctCount: 8, wrongCount: 2, elapsedMs: 0 }), false);
  // Beides erreicht (9/10 = 90%).
  assert.equal(isGoalReached(goal, { correctCount: 9, wrongCount: 1, elapsedMs: 0 }), true);
  // Über der Mindestanzahl, Quote weiterhin erfüllt.
  assert.equal(isGoalReached(goal, { correctCount: 18, wrongCount: 2, elapsedMs: 0 }), true);
});

test('describeGoalProgress liefert Übersetzungsschlüssel + Parameter je Zielart (kein fertiger Text)', () => {
  const countGoal = describeGoalProgress({ type: 'count', value: 20 }, { correctCount: 4, wrongCount: 1, elapsedMs: 0 });
  assert.equal(countGoal.key, 'testgoal.progressCount');
  assert.deepEqual(countGoal.params, { current: 5, target: 20 });
  assert.equal(countGoal.reached, false);
  assert.equal(translate('de', countGoal.key, countGoal.params), '5 von 20 Karten');
  assert.equal(translate('en', countGoal.key, countGoal.params), '5 of 20 cards');

  const durationGoal = describeGoalProgress({ type: 'duration', value: 300 }, { correctCount: 0, wrongCount: 0, elapsedMs: 125000 });
  assert.equal(translate('de', durationGoal.key, durationGoal.params), '2:05 von 5:00 Minuten');

  const accuracyGoal = describeGoalProgress(
    { type: 'accuracy', value: 90, minCards: 10 },
    { correctCount: 9, wrongCount: 1, elapsedMs: 0 }
  );
  assert.equal(translate('de', accuracyGoal.key, accuracyGoal.params), '10 von mindestens 10 Karten · Trefferquote 90% (Ziel 90%)');
  assert.equal(accuracyGoal.reached, true);
});

test('describeGoalLabel liefert Übersetzungsschlüssel + Parameter, übersetzbar in allen Sprachen', () => {
  const count = describeGoalLabel({ type: 'count', value: 20 });
  assert.equal(translate('de', count.key, count.params), '20 Karten');

  const duration = describeGoalLabel({ type: 'duration', value: 300 });
  assert.equal(translate('de', duration.key, duration.params), '5:00 Minuten');

  const accuracy = describeGoalLabel({ type: 'accuracy', value: 90, minCards: 10 });
  assert.equal(translate('de', accuracy.key, accuracy.params), '90% Trefferquote ab 10 Karten');
});
