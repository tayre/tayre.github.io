import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTS } from './facts-data.js';
import { createFactProgress, normalizeFactProgress, makeFactRound, recordFactAttempt, getFactStats } from './facts-engine.js';

const geography = FACTS.filter((fact) => fact.topic === 'geography');
const science = FACTS.filter((fact) => fact.topic === 'science');

test('rounds respect topics, avoid repeats, and return valid shuffled choices', () => {
  const original = JSON.stringify(FACTS);
  const round = makeFactRound({ topics: ['geography', 'geography', 'unknown'], length: 999, random: () => 0 });
  assert.equal(round.length, geography.length);
  assert.equal(new Set(round.map((fact) => fact.id)).size, round.length);
  for (const fact of round) {
    const source = FACTS.find((item) => item.id === fact.id);
    assert.equal(fact.topic, 'geography');
    assert.equal(fact.choices.length, 4);
    assert.equal(new Set(fact.choices).size, 4);
    assert.ok(fact.choices.includes(fact.answer));
    assert.deepEqual([...fact.choices].sort(), [...source.choices].sort());
    assert.notDeepEqual(fact.choices, source.choices);
    assert.notEqual(fact, source);
    assert.notEqual(fact.choices, source.choices);
  }
  assert.equal(JSON.stringify(FACTS), original);
  const all = makeFactRound({ length: 999 });
  assert.equal(all.length, FACTS.length);
  assert.equal(new Set(all.map((fact) => fact.id)).size, FACTS.length);
});

test('review IDs narrow the topic pool and cannot introduce unknown questions', () => {
  const ids = [geography[0].id, geography[0].id, science[0].id, 'unknown-id'];
  const round = makeFactRound({ topics: ['geography'], reviewIds: ids, random: () => 0 });
  assert.deepEqual(round.map((fact) => fact.id), [geography[0].id]);
  assert.equal(makeFactRound({ reviewIds: ids }).length, 2);
  assert.deepEqual(makeFactRound({ reviewIds: [] }), []);
  assert.deepEqual(makeFactRound({ reviewIds: 'bad' }), []);
  assert.deepEqual(makeFactRound({ topics: [] }), []);
  assert.deepEqual(makeFactRound({ topics: ['unknown'] }), []);
});

test('mixed rounds retain both topics even when weighting and random selection favor one', () => {
  const progress = createFactProgress();
  for (const fact of geography) {
    for (let attempt = 0; attempt < 3; attempt += 1) recordFactAttempt(progress, { id: fact.id, correct: true });
  }
  for (const fact of science) recordFactAttempt(progress, { id: fact.id, correct: false });
  for (const random of [() => 0, () => 0.5, () => 1]) {
    const round = makeFactRound({ progress, length: 10, random });
    assert.equal(round.length, 10);
    assert.equal(new Set(round.map((fact) => fact.id)).size, 10);
    assert.deepEqual(new Set(round.map((fact) => fact.topic)), new Set(['geography', 'science']));
  }
});

test('mixed coverage respects review pools and short round limits and shuffles topic order', () => {
  const reviewIds = [geography[0].id, geography[1].id, science[0].id, 'unknown-id'];
  const round = makeFactRound({ reviewIds, length: 2, random: () => 0 });
  assert.equal(round.length, 2);
  assert.deepEqual(new Set(round.map((fact) => fact.topic)), new Set(['geography', 'science']));
  assert.ok(round.every((fact) => reviewIds.includes(fact.id)));
  // A zero RNG swaps the two seeded topics, so geography need not always open.
  assert.equal(round[0].topic, 'science');
  const short = makeFactRound({ reviewIds, length: 1, random: () => 0 });
  assert.equal(short.length, 1);
  assert.ok(reviewIds.includes(short[0].id));
  assert.deepEqual(makeFactRound({ reviewIds, length: 0 }), []);
  const oneTopicAvailable = makeFactRound({ reviewIds: geography.slice(0, 3).map((fact) => fact.id), length: 10, random: () => 0 });
  assert.equal(oneTopicAvailable.length, 3);
  assert.ok(oneTopicAvailable.every((fact) => fact.topic === 'geography'));
  assert.deepEqual(oneTopicAvailable.map((fact) => fact.id), geography.slice(0, 3).map((fact) => fact.id));
});

test('clean consecutive answers establish mastery and help or misses reset it', () => {
  const progress = createFactProgress();
  const id = geography[0].id;
  const answer = (correct, assisted = false) => recordFactAttempt(progress, { id, correct, assisted, now: 123 });
  answer(true);
  answer(true);
  assert.equal(getFactStats(progress).mastered, 0);
  answer(true);
  assert.equal(getFactStats(progress).mastered, 1);
  answer(false);
  assert.equal(getFactStats(progress).mastered, 0);
  answer(true);
  answer(true, true);
  assert.equal(progress.facts[id].streak, 0);
  answer(true);
  answer(true);
  answer(true);
  assert.deepEqual(progress.facts[id], { attempts: 9, correct: 8, streak: 3, assisted: 1, lastSeen: 123 });
  assert.equal(getFactStats(progress, 'geography').mastered, 1);
  assert.equal(getFactStats(progress, 'science').mastered, 0);
  assert.equal(progress.completedRounds, 0);
  assert.equal(progress.totalPoints, 0);
  assert.throws(() => recordFactAttempt(progress, { id: 'unknown-id', correct: true }), RangeError);
});

test('scheduling favors missed and unseen questions over mastered questions', () => {
  const progress = createFactProgress();
  const [missed, unseen, mastered] = geography;
  recordFactAttempt(progress, { id: missed.id, correct: false });
  for (let index = 0; index < 3; index += 1) recordFactAttempt(progress, { id: mastered.id, correct: true });
  const tally = new Map([[missed.id, 0], [unseen.id, 0], [mastered.id, 0]]);
  for (let sample = 0; sample < 190; sample += 1) {
    const [question] = makeFactRound({ progress, length: 1, reviewIds: [...tally.keys()], random: () => (sample + 0.5) / 190 });
    tally.set(question.id, tally.get(question.id) + 1);
  }
  assert.ok(tally.get(missed.id) > tally.get(unseen.id));
  assert.ok(tally.get(unseen.id) > tally.get(mastered.id));
  assert.ok(tally.get(mastered.id) > 0);
});

test('saved history round-trips and normalization drops unknown IDs and unsafe values', () => {
  const progress = createFactProgress();
  const id = geography[0].id;
  recordFactAttempt(progress, { id, correct: true, now: 456 });
  progress.completedRounds = 4;
  progress.totalPoints = 2500;
  assert.deepEqual(normalizeFactProgress(JSON.parse(JSON.stringify(progress))), progress);
  for (const raw of [null, false, [], 'broken']) assert.deepEqual(normalizeFactProgress(raw), createFactProgress());
  const secondId = science[0].id;
  const restored = normalizeFactProgress({
    version: 99, completedRounds: -2, totalPoints: 12.9,
    facts: {
      [id]: { attempts: 4.9, correct: 99, assisted: 2, streak: 99, lastSeen: Infinity },
      [secondId]: { attempts: -9, correct: '3', streak: NaN, assisted: 99, lastSeen: 456 },
      'unknown-id': { attempts: 20, correct: 20, streak: 20 },
    },
  });
  assert.deepEqual(restored, {
    version: 1, completedRounds: 0, totalPoints: 12,
    facts: {
      [id]: { attempts: 4, correct: 4, assisted: 2, streak: 2, lastSeen: 0 },
      [secondId]: { attempts: 0, correct: 0, assisted: 0, streak: 0, lastSeen: 456 },
    },
  });
  assert.deepEqual(Object.keys(normalizeFactProgress(restored, [geography[0]]).facts), [id]);
  assert.deepEqual(normalizeFactProgress({ facts: { custom: { attempts: 1, correct: 1, streak: 1 } } }, [{ id: 'custom' }]).facts.custom,
    { attempts: 1, correct: 1, streak: 1, assisted: 0, lastSeen: 0 });
  const oversized = normalizeFactProgress({ completedRounds: Number.MAX_VALUE, totalPoints: Number.MAX_VALUE, facts: { [id]: { attempts: Number.MAX_VALUE, correct: Number.MAX_VALUE, streak: Number.MAX_VALUE } } });
  assert.equal(oversized.totalPoints, Number.MAX_SAFE_INTEGER);
  assert.equal(oversized.completedRounds, Number.MAX_SAFE_INTEGER);
  assert.equal(oversized.facts[id].attempts, Number.MAX_SAFE_INTEGER);
});

test('stats sum only supported questions and scope totals by topic', () => {
  const progress = createFactProgress();
  assert.deepEqual(getFactStats(progress), { total: FACTS.length, known: 0, mastered: 0, attempts: 0, correct: 0 });
  recordFactAttempt(progress, { id: geography[0].id, correct: true });
  recordFactAttempt(progress, { id: geography[0].id, correct: false });
  recordFactAttempt(progress, { id: science[0].id, correct: true, assisted: true });
  progress.facts['unknown-id'] = { attempts: 99, correct: 99, streak: 99 };
  assert.deepEqual(getFactStats(progress), { total: FACTS.length, known: 2, mastered: 0, attempts: 3, correct: 2 });
  assert.deepEqual(getFactStats(progress, 'geography'), { total: geography.length, known: 1, mastered: 0, attempts: 2, correct: 1 });
  assert.deepEqual(getFactStats(progress, 'science'), { total: science.length, known: 1, mastered: 0, attempts: 1, correct: 1 });
  assert.deepEqual(getFactStats(progress, 'unknown'), { total: 0, known: 0, mastered: 0, attempts: 0, correct: 0 });
});

test('round length and random boundaries stay within the available questions', () => {
  for (const length of [-1, NaN, Infinity, '10', null]) assert.deepEqual(makeFactRound({ length }), []);
  assert.equal(makeFactRound({ length: 2.9 }).length, 2);
  for (const random of [() => 0, () => 1, () => -1, () => NaN, () => Infinity]) {
    const round = makeFactRound({ random, length: FACTS.length });
    assert.equal(new Set(round.map((fact) => fact.id)).size, FACTS.length);
    assert.ok(round.every((fact) => fact.choices.length === 4 && fact.choices.includes(fact.answer)));
  }
});
