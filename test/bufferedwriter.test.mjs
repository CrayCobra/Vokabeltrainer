import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBufferedWriter } from '../src/js/bufferedwriter.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('createBufferedWriter bündelt schnell aufeinanderfolgende Aufrufe zu einem Schreibvorgang', async () => {
  const calls = [];
  const writer = createBufferedWriter(async (value) => calls.push(value), { delay: 20 });

  writer.schedule('a');
  writer.schedule('b');
  writer.schedule('c');
  assert.equal(calls.length, 0, 'vor Ablauf der Verzögerung wird noch nicht geschrieben');

  await wait(60);
  assert.deepEqual(calls, ['c'], 'nur der zuletzt übergebene Wert wird geschrieben');
});

test('flush schreibt sofort und verwirft den ausstehenden Timer', async () => {
  const calls = [];
  const writer = createBufferedWriter(async (value) => calls.push(value), { delay: 5000 });

  writer.schedule('x');
  await writer.flush();
  assert.deepEqual(calls, ['x']);

  await wait(20);
  assert.deepEqual(calls, ['x'], 'nach flush darf der ursprüngliche Timer nicht erneut schreiben');
});

test('flush ohne ausstehenden Schreibvorgang ruft writeFn nicht auf', async () => {
  const calls = [];
  const writer = createBufferedWriter(async (value) => calls.push(value), { delay: 20 });
  await writer.flush();
  assert.deepEqual(calls, []);
});
