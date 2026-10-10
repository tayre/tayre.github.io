import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, normalizeProgress, factKey, makeRound, recordAttempt, getStats, getTableStats, getHint } from './engine.js';

test('ordered facts keep separate histories and cover exactly the 1–10 range', () => {
  const progress = createProgress();
  recordAttempt(progress, { a: 3, b: 7, correct: true, now: 123 });
  assert.equal(progress.facts['3x7'].correct, 1);
  assert.equal(progress.facts['7x3'], undefined);
  assert.equal(getStats(progress).total, 100);
  for (const [a, b] of [[0, 1], [1, 11], [1.5, 2], ['2', 3], [NaN, 2]]) {
    assert.throws(() => factKey(a, b), RangeError);
    assert.throws(() => recordAttempt(progress, { a, b, correct: true }), RangeError);
  }
});

test('mastery requires three consecutive correct unassisted responses', () => {
  const progress = createProgress();
  const answer = (correct, assisted = false) => recordAttempt(progress, { a: 6, b: 8, correct, assisted, now: 456 });
  answer(true);
  answer(true);
  assert.equal(getStats(progress).mastered, 0);
  answer(true);
  assert.equal(getStats(progress).mastered, 1);
  answer(false);
  assert.equal(getStats(progress).mastered, 0);
  answer(true);
  answer(true, true);
  assert.equal(progress.facts['6x8'].streak, 0);
  answer(true);
  answer(true);
  assert.equal(getStats(progress).mastered, 0);
  answer(true);
  assert.equal(getStats(progress).mastered, 1);
  assert.deepEqual(progress.facts['6x8'], { attempts: 9, correct: 8, streak: 3, assisted: 1, lastSeen: 456 });
  assert.equal(getTableStats(progress, 6).mastered, 1);
  assert.equal(getTableStats(progress, 8).mastered, 0);
});

test('rounds honor table scope, contain no duplicates, and cover a single table', () => {
  for (const random of [() => 0, () => 0.5, () => 1, () => NaN]) {
    const round = makeRound({ tables: [7, 7, 0, 11, '3'], random });
    assert.equal(round.length, 10);
    assert.ok(round.every(({ a, b }) => a === 7 && b >= 1 && b <= 10));
    assert.equal(new Set(round.map(({ a, b }) => factKey(a, b))).size, 10);
  }
  const all = makeRound({ length: 200 });
  assert.equal(all.length, 100);
  assert.equal(new Set(all.map(({ a, b }) => factKey(a, b))).size, 100);
  assert.deepEqual(makeRound({ tables: [] }), []);
  assert.deepEqual(makeRound({ length: -1 }), []);
});

test('review rounds deduplicate, reject invalid facts, and respect table scope', () => {
  const round = makeRound({
    tables: [6], length: 10, random: () => 0,
    reviewFacts: [{ a: 6, b: 8 }, { a: 6, b: 8 }, { a: 8, b: 6 }, { a: 6, b: 11 }, null, { a: 6, b: 7 }],
  });
  assert.deepEqual(round, [{ a: 6, b: 8 }, { a: 6, b: 7 }]);
  assert.deepEqual(makeRound({ reviewFacts: [] }), []);
});

test('scheduling gives missed facts more chances and mastered facts fewer', () => {
  const progress = createProgress();
  recordAttempt(progress, { a: 7, b: 1, correct: false });
  for (let index = 0; index < 3; index += 1) recordAttempt(progress, { a: 7, b: 3, correct: true });
  const tally = { 1: 0, 2: 0, 3: 0 };
  for (let sample = 0; sample < 190; sample += 1) {
    const round = makeRound({
      tables: [7], progress, length: 1, random: () => (sample + 0.5) / 190,
      reviewFacts: [{ a: 7, b: 1 }, { a: 7, b: 2 }, { a: 7, b: 3 }],
    });
    tally[round[0].b] += 1;
  }
  assert.deepEqual(tally, { 1: 100, 2: 80, 3: 10 });
});

test('JSON persistence round-trips and normalization bounds corrupt values', () => {
  const progress = createProgress();
  recordAttempt(progress, { a: 10, b: 10, correct: true, now: 999 });
  progress.completedRounds = 3;
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(progress))), progress);
  for (const raw of [null, false, [], 'broken']) assert.deepEqual(normalizeProgress(raw), createProgress());
  const restored = normalizeProgress({
    version: 999, completedRounds: -5,
    facts: {
      '1x1': { attempts: 4.5, correct: 99, assisted: 2, streak: 99, lastSeen: Infinity },
      '1x2': { attempts: -9, correct: '3', streak: NaN, assisted: 99, lastSeen: 123 },
      '0x1': { attempts: 10, correct: 10, streak: 10 },
      '10x11': { attempts: 10, correct: 10, streak: 10 },
      '3x4': [],
    },
  });
  assert.deepEqual(restored, {
    version: 1, completedRounds: 0,
    facts: {
      '1x1': { attempts: 4, correct: 4, assisted: 2, streak: 2, lastSeen: 0 },
      '1x2': { attempts: 0, correct: 0, assisted: 0, streak: 0, lastSeen: 123 },
    },
  });
});

test('stats summarize real attempts and hints cover every fact', () => {
  const progress = createProgress();
  assert.deepEqual(getStats(progress), { total: 100, known: 0, mastered: 0, attempts: 0, correct: 0, accuracy: 0 });
  recordAttempt(progress, { a: 2, b: 8, correct: true });
  recordAttempt(progress, { a: 2, b: 8, correct: false });
  recordAttempt(progress, { a: 5, b: 9, correct: true, assisted: true });
  assert.deepEqual(getStats(progress), { total: 100, known: 2, mastered: 0, attempts: 3, correct: 2, accuracy: 67 });
  assert.deepEqual(getTableStats(progress, 2), { total: 10, known: 1, mastered: 0, attempts: 2, correct: 1, accuracy: 50 });
  for (let a = 1; a <= 10; a += 1) for (let b = 1; b <= 10; b += 1) {
    const hint = getHint(a, b);
    assert.equal(typeof hint, 'string');
    assert.ok(hint.length > 10);
    assert.ok(!hint.includes('NaN'));
  }
  assert.throws(() => getHint(11, 1), RangeError);
});
