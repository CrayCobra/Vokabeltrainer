import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, createSessionQueue } from '../src/js/learn.js';
import { createCard } from '../src/js/model.js';

function card(overrides) {
  return { ...createCard({ a: 'x', b: 'y', deckId: 'deck1' }), ...overrides };
}

test('buildQueue: sequential hält die Eingabereihenfolge innerhalb jeder Gruppe', () => {
  const cards = [
    card({ id: 'r1', a: 'r1', repair: true }),
    card({ id: 'n1', a: 'n1', repair: false }),
    card({ id: 'n2', a: 'n2', repair: false }),
    card({ id: 'r2', a: 'r2', repair: true }),
    card({ id: 'n3', a: 'n3', repair: false }),
  ];
  const ids = buildQueue(cards, { order: 'sequential' });
  // Reparaturkarten (r1, r2) bevorzugt, aber im Verhältnis 2:3 eingestreut, nicht geblockt.
  assert.deepEqual(ids, ['r1', 'r2', 'n1', 'n2', 'n3']);
});

test('buildQueue: Verhältnis von etwa zwei Reparaturkarten auf drei reguläre Karten', () => {
  const repairCards = Array.from({ length: 6 }, (_, i) => card({ id: `r${i}`, repair: true }));
  const regularCards = Array.from({ length: 9 }, (_, i) => card({ id: `n${i}`, repair: false }));
  const ids = buildQueue([...repairCards, ...regularCards], { order: 'sequential' });
  assert.deepEqual(ids, [
    'r0', 'r1', 'n0', 'n1', 'n2',
    'r2', 'r3', 'n3', 'n4', 'n5',
    'r4', 'r5', 'n6', 'n7', 'n8',
  ]);
});

test('buildQueue: box sortiert aufsteigend nach Kastenstand', () => {
  const cards = [
    card({ id: 'a', box: 3 }),
    card({ id: 'b', box: 1 }),
    card({ id: 'c', box: 5 }),
    card({ id: 'd', box: 2 }),
  ];
  const ids = buildQueue(cards, { order: 'box' });
  assert.deepEqual(ids, ['b', 'd', 'a', 'c']);
});

test('buildQueue: nur markierte Karten, wenn onlyMarked gesetzt ist', () => {
  const cards = [card({ id: 'a', marked: true }), card({ id: 'b', marked: false }), card({ id: 'c', marked: true })];
  const ids = buildQueue(cards, { order: 'sequential', onlyMarked: true });
  assert.deepEqual(ids, ['a', 'c']);
});

test('buildQueue: random liefert alle Karten genau einmal', () => {
  const cards = Array.from({ length: 20 }, (_, i) => card({ id: `c${i}` }));
  const ids = buildQueue(cards, { order: 'random' });
  assert.equal(ids.length, 20);
  assert.deepEqual([...ids].sort(), cards.map((c) => c.id).sort());
});

test('createSessionQueue: eine falsch beantwortete Karte erscheint frühestens nach drei weiteren Karten wieder', () => {
  const queue = createSessionQueue(['a', 'b', 'c', 'd', 'e']);
  const drawn = queue.draw();
  assert.equal(drawn, 'a');
  queue.requeueAfterWrong('a');
  const rest = [];
  while (!queue.isEmpty()) rest.push(queue.draw());
  assert.deepEqual(rest, ['b', 'c', 'd', 'a', 'e']);
});

test('createSessionQueue: requeue bei sehr kurzer Restwarteschlange reiht sofort wieder ein', () => {
  const queue = createSessionQueue(['only']);
  assert.equal(queue.draw(), 'only');
  queue.requeueAfterWrong('only');
  assert.equal(queue.isEmpty(), false);
  assert.equal(queue.draw(), 'only');
  assert.equal(queue.isEmpty(), true);
});

test('createSessionQueue: enqueueMany füllt eine leere Warteschlange erneut auf (Testmodus-Wiederholung)', () => {
  const queue = createSessionQueue(['a', 'b']);
  queue.draw();
  queue.draw();
  assert.equal(queue.isEmpty(), true);
  queue.enqueueMany(['c', 'd', 'e']);
  const rest = [];
  while (!queue.isEmpty()) rest.push(queue.draw());
  assert.deepEqual(rest, ['c', 'd', 'e']);
});

test('createSessionQueue: remove entfernt eine ausstehende Wiedervorlage (Korrektur falsch → richtig)', () => {
  const queue = createSessionQueue(['a', 'b', 'c']);
  queue.draw();
  queue.requeueAfterWrong('a');
  queue.remove('a');
  const rest = [];
  while (!queue.isEmpty()) rest.push(queue.draw());
  assert.deepEqual(rest, ['b', 'c']);
});
