import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, factKey, recordAttempt, getStats } from './engine.js';
import { makeMemoryLesson, recordMemoryAttempt } from './memory.js';

test('a lesson studies one selected table and spaces each of three facts twice apart', () => {
  const lesson = makeMemoryLesson({ tables: [6, 7, 6, 0, 11, '2'], random: () => 0 });
  assert.ok([6, 7].includes(lesson.focusTable));
  assert.equal(lesson.facts.length, 3);
  assert.equal(new Set(lesson.facts.map(({ a, b }) => factKey(a, b))).size, 3);
  assert.ok(lesson.facts.every(({ a, b }) => a === lesson.focusTable && b >= 1 && b <= 10));
  assert.equal(lesson.questions.length, 9);
  lesson.questions.forEach(({ a, b, visit }, index) => {
    assert.deepEqual({ a, b }, lesson.facts[index % 3]);
    assert.equal(visit, Math.floor(index / 3) + 1);
  });
  for (const fact of lesson.facts) {
    const positions = lesson.questions.flatMap((question, index) => question.a === fact.a && question.b === fact.b ? [index] : []);
    assert.equal(positions[1] - positions[0], 3);
    assert.equal(positions[2] - positions[1], 3);
  }
});

test('focus favors unfinished tables and tables with more eligible trouble', () => {
  const progress = createProgress();
  for (let b = 1; b <= 10; b += 1) {
    for (let attempt = 0; attempt < 3; attempt += 1) recordAttempt(progress, { a: 2, b, correct: true });
    recordAttempt(progress, { a: 7, b, correct: false });
  }
  for (const random of [() => 0, () => 0.5, () => 1]) {
    assert.equal(makeMemoryLesson({ tables: [2, 6], progress, random }).focusTable, 6);
    assert.equal(makeMemoryLesson({ tables: [2, 6, 7], progress, random }).focusTable, 7);
  }
  // If every selected fact is mastered, practice still has a valid focus.
  assert.equal(makeMemoryLesson({ tables: [2], progress }).focusTable, 2);
  assert.equal(makeMemoryLesson({ tables: [2], progress }).questions.length, 9);
});

test('review pools limit focus selection, deduplicate, and reduce repetitions for small pools', () => {
  const reviewFacts = [{ a: 3, b: 7 }, { a: 4, b: 6 }, { a: 4, b: 6 }, { a: 4, b: 8 }, { a: 7, b: 3 }, { a: 4, b: 11 }, null];
  const lesson = makeMemoryLesson({ tables: [3, 4], reviewFacts, random: () => 0 });
  assert.equal(lesson.focusTable, 4);
  assert.equal(lesson.facts.length, 2);
  assert.deepEqual(new Set(lesson.facts.map(({ a, b }) => factKey(a, b))), new Set(['4x6', '4x8']));
  assert.equal(lesson.questions.length, 4);
  assert.deepEqual(lesson.questions.map(({ a, b }) => ({ a, b })), [...lesson.facts, ...lesson.facts]);
  assert.deepEqual(lesson.questions.map(({ visit }) => visit), [1, 1, 2, 2]);
  const one = makeMemoryLesson({ tables: [3], reviewFacts, random: () => 0 });
  assert.deepEqual(one, { focusTable: 3, facts: [{ a: 3, b: 7 }], questions: [{ a: 3, b: 7, visit: 1 }] });
  for (const options of [{ tables: [] }, { reviewFacts: [] }, { tables: [9], reviewFacts }, { tables: [0, 11] }]) {
    assert.deepEqual(makeMemoryLesson(options), { focusTable: null, facts: [], questions: [] });
  }
});

test('facts retain weighted selection and random boundaries remain in scope', () => {
  const progress = createProgress();
  recordAttempt(progress, { a: 8, b: 1, correct: false });
  for (let b = 2; b <= 10; b += 1) for (let attempt = 0; attempt < 3; attempt += 1) {
    recordAttempt(progress, { a: 8, b, correct: true });
  }
  let missedSelected = 0;
  let masteredSelected = 0;
  for (let sample = 0; sample < 190; sample += 1) {
    const lesson = makeMemoryLesson({ tables: [8], progress, random: () => (sample + 0.5) / 190 });
    if (lesson.facts.some(({ b }) => b === 1)) missedSelected += 1;
    if (lesson.facts.some(({ b }) => b === 10)) masteredSelected += 1;
  }
  assert.ok(missedSelected > masteredSelected);
  for (const random of [() => 0, () => 1, () => NaN, () => -1, () => Infinity]) {
    const lesson = makeMemoryLesson({ tables: [8], random });
    assert.equal(lesson.focusTable, 8);
    assert.equal(new Set(lesson.facts.map(({ b }) => b)).size, 3);
    assert.ok(lesson.facts.every(({ a, b }) => a === 8 && b >= 1 && b <= 10));
  }
});

test('a fact earns at most one clean mastery credit per lesson while every response is counted', () => {
  const progress = createProgress();
  const creditedKeys = new Set();
  for (let visit = 1; visit <= 3; visit += 1) {
    assert.equal(recordMemoryAttempt(progress, { a: 6, b: 7, correct: true, creditedKeys, now: visit }), progress);
  }
  assert.deepEqual(progress.facts['6x7'], { attempts: 3, correct: 3, streak: 1, assisted: 0, lastSeen: 3 });
  assert.deepEqual([...creditedKeys], ['6x7']);
  assert.equal(getStats(progress).mastered, 0);
  recordMemoryAttempt(progress, { a: 6, b: 7, correct: true, creditedKeys: new Set() });
  assert.equal(progress.facts['6x7'].streak, 2);
  recordMemoryAttempt(progress, { a: 6, b: 7, correct: true, creditedKeys: new Set() });
  assert.equal(getStats(progress).mastered, 1);
  assert.equal(progress.completedRounds, 0);
});

test('a first wrong or assisted answer consumes that lesson’s chance at a mastery credit', () => {
  for (const first of [{ correct: false }, { correct: true, assisted: true }]) {
    const progress = createProgress();
    recordAttempt(progress, { a: 7, b: 8, correct: true });
    const creditedKeys = new Set();
    recordMemoryAttempt(progress, { a: 7, b: 8, ...first, creditedKeys });
    assert.equal(progress.facts['7x8'].streak, 0);
    assert.ok(creditedKeys.has('7x8'));
    recordMemoryAttempt(progress, { a: 7, b: 8, correct: true, creditedKeys });
    recordMemoryAttempt(progress, { a: 7, b: 8, correct: true, creditedKeys });
    assert.equal(progress.facts['7x8'].streak, 0);
    assert.equal(progress.facts['7x8'].attempts, 4);
    recordMemoryAttempt(progress, { a: 7, b: 8, correct: true, creditedKeys: new Set() });
    assert.equal(progress.facts['7x8'].streak, 1);
  }
});

test('later mistakes or help reset a credited streak without letting it recover in the lesson', () => {
  for (const interruption of [{ correct: false }, { correct: true, assisted: true }]) {
    const progress = createProgress();
    recordAttempt(progress, { a: 9, b: 6, correct: true });
    recordAttempt(progress, { a: 9, b: 6, correct: true });
    const creditedKeys = new Set();
    recordMemoryAttempt(progress, { a: 9, b: 6, correct: true, creditedKeys });
    assert.equal(progress.facts['9x6'].streak, 3);
    recordMemoryAttempt(progress, { a: 9, b: 6, ...interruption, creditedKeys });
    recordMemoryAttempt(progress, { a: 9, b: 6, correct: true, creditedKeys });
    assert.equal(progress.facts['9x6'].streak, 0);
    assert.equal(getStats(progress).mastered, 0);
  }
  assert.throws(() => recordMemoryAttempt(createProgress(), { a: 1, b: 1, correct: true }), TypeError);
  const keys = new Set();
  assert.throws(() => recordMemoryAttempt(createProgress(), { a: 11, b: 1, correct: true, creditedKeys: keys }), RangeError);
  assert.equal(keys.size, 0);
});
