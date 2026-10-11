import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_CARDS, EXTRA_TOPICS } from './extra-data.js';
import { makeExtraLesson, createExtraProgress, normalizeExtraProgress, recordExtraAttempt, getExtraStats } from './extra-engine.js';

const regularTopic = EXTRA_TOPICS.find(({ id }) => EXTRA_CARDS.some((card) => card.topic === id) && EXTRA_CARDS.filter((card) => card.topic === id).every((card) => !card.passage)).id;
const regularCards = EXTRA_CARDS.filter(({ topic }) => topic === regularTopic);
const readingCards = EXTRA_CARDS.filter((card) => typeof card.passage === 'string' && card.passage.trim());
const readingTopic = readingCards[0].topic;

test('short lessons use unique cards from exactly the requested topic', () => {
  for (const { id } of EXTRA_TOPICS) {
    const lesson = makeExtraLesson(id);
    assert.equal(lesson.topic, id);
    assert.ok(lesson.cards.length > 0 && lesson.cards.length <= 5);
    assert.equal(new Set(lesson.cards.map(({ id }) => id)).size, lesson.cards.length);
    assert.ok(lesson.cards.every((card) => card.topic === id));
  }
  assert.equal(makeExtraLesson(regularTopic).cards.length, Math.min(5, regularCards.length));
  const complete = makeExtraLesson(regularTopic, { size: 999 });
  assert.deepEqual(new Set(complete.cards.map(({ id }) => id)), new Set(regularCards.map(({ id }) => id)));
  assert.deepEqual(makeExtraLesson('unknown-topic'), { topic: 'unknown-topic', cards: [] });
});

test('review IDs stay within topic scope and never introduce repeats or unknown cards', () => {
  const other = EXTRA_CARDS.find((card) => card.topic !== regularTopic);
  const reviewIds = [regularCards[0].id, regularCards[0].id, other.id, 'unknown-id'];
  const lesson = makeExtraLesson(regularTopic, { reviewIds });
  assert.deepEqual(lesson.cards.map(({ id }) => id), [regularCards[0].id]);
  assert.deepEqual(makeExtraLesson(regularTopic, { reviewIds: [] }).cards, []);
  assert.deepEqual(makeExtraLesson(regularTopic, { reviewIds: 'bad' }).cards, []);
});

test('reading lessons keep one passage together instead of mixing study texts', () => {
  assert.ok(new Set(readingCards.map(({ passage }) => passage)).size > 1);
  for (const random of [() => 0, () => 0.5, () => 1]) {
    const lesson = makeExtraLesson(readingTopic, { size: 999, random });
    const passages = new Set(lesson.cards.map(({ passage }) => passage));
    assert.equal(passages.size, 1);
    const samePassage = readingCards.filter((card) => card.passage === lesson.cards[0].passage);
    assert.deepEqual(new Set(lesson.cards.map(({ id }) => id)), new Set(samePassage.map(({ id }) => id)));
    assert.equal(makeExtraLesson(readingTopic, { size: 1, random }).cards.length, 1);
  }
  const first = readingCards[0];
  const otherPassage = readingCards.find((card) => card.passage !== first.passage);
  const reviewIds = [first.id, otherPassage.id, 'unknown-id'];
  const review = makeExtraLesson(readingTopic, { reviewIds, random: () => 0 });
  assert.equal(review.cards.length, 1);
  assert.ok(reviewIds.includes(review.cards[0].id));
});

test('question and choice shuffles retain answers and never mutate source content', () => {
  const original = JSON.stringify(EXTRA_CARDS);
  const lesson = makeExtraLesson(regularTopic, { size: 999, random: () => 0 });
  assert.notDeepEqual(lesson.cards.map(({ id }) => id), regularCards.map(({ id }) => id));
  for (const card of lesson.cards) {
    const source = EXTRA_CARDS.find(({ id }) => id === card.id);
    assert.notEqual(card, source);
    assert.notEqual(card.study, source.study);
    assert.notEqual(card.choices, source.choices);
    assert.deepEqual(new Set(card.choices), new Set(source.choices));
    assert.ok(card.choices.includes(card.answer));
    assert.notDeepEqual(card.choices, source.choices);
  }
  lesson.cards[0].study.text = 'Changed copy';
  lesson.cards[0].choices[0] = 'Changed choice';
  assert.equal(JSON.stringify(EXTRA_CARDS), original);
  const answerPositions = new Set();
  for (const value of [0, 0.26, 0.51, 0.76, 1]) {
    const [card] = makeExtraLesson(regularTopic, { reviewIds: [regularCards[0].id], random: () => value }).cards;
    answerPositions.add(card.choices.indexOf(card.answer));
  }
  assert.ok(answerPositions.size > 1);
});

test('clean successes establish mastery while mistakes and assistance reset it', () => {
  const progress = createExtraProgress();
  const id = regularCards[0].id;
  const answer = (correct, assisted = false) => recordExtraAttempt(progress, { id, correct, assisted, now: 123 });
  answer(true);
  answer(true);
  assert.equal(getExtraStats(progress).mastered, 0);
  assert.equal(answer(true), progress);
  assert.equal(getExtraStats(progress).mastered, 1);
  answer(false);
  assert.equal(getExtraStats(progress).mastered, 0);
  answer(true);
  answer(true, true);
  assert.equal(progress.cards[id].streak, 0);
  answer(true);
  answer(true);
  answer(true);
  assert.deepEqual(progress.cards[id], { attempts: 9, correct: 8, streak: 3, assisted: 1, lastSeen: 123 });
  assert.equal(progress.completedLessons, 0);
  assert.equal(progress.totalPoints, 0);
  assert.throws(() => recordExtraAttempt(progress, { id: 'unknown-id', correct: true }), RangeError);
  assert.equal(progress.cards['unknown-id'], undefined);
});

test('saved progress round-trips and malformed or unknown histories are bounded', () => {
  const progress = createExtraProgress();
  const id = regularCards[0].id;
  recordExtraAttempt(progress, { id, correct: true, now: 123 });
  progress.completedLessons = 4;
  progress.totalPoints = 500;
  assert.deepEqual(normalizeExtraProgress(JSON.parse(JSON.stringify(progress))), progress);
  for (const raw of [null, undefined, false, [], 'broken']) assert.deepEqual(normalizeExtraProgress(raw), createExtraProgress());
  const second = regularCards[1].id;
  const restored = normalizeExtraProgress({
    version: 99, completedLessons: -3, totalPoints: 45.9,
    cards: {
      [id]: { attempts: 4.8, correct: 99, assisted: 2, streak: 99, lastSeen: Infinity },
      [second]: { attempts: -5, correct: '3', assisted: 100, streak: NaN, lastSeen: 456 },
      [readingCards[0].id]: [],
      'unknown-id': { attempts: 9, correct: 9, streak: 9 },
    },
  });
  assert.deepEqual(restored, {
    version: 1, completedLessons: 0, totalPoints: 45,
    cards: {
      [id]: { attempts: 4, correct: 4, assisted: 2, streak: 2, lastSeen: 0 },
      [second]: { attempts: 0, correct: 0, assisted: 0, streak: 0, lastSeen: 456 },
    },
  });
  const oversized = normalizeExtraProgress({ completedLessons: Number.MAX_VALUE, totalPoints: Number.MAX_VALUE, cards: { [id]: { attempts: Number.MAX_VALUE, correct: Number.MAX_VALUE, streak: Number.MAX_VALUE } } });
  assert.equal(oversized.completedLessons, Number.MAX_SAFE_INTEGER);
  assert.equal(oversized.totalPoints, Number.MAX_SAFE_INTEGER);
  assert.equal(oversized.cards[id].attempts, Number.MAX_SAFE_INTEGER);
});

test('stats separate seeing, knowing, and mastery and respect topic boundaries', () => {
  const progress = createExtraProgress();
  assert.deepEqual(getExtraStats(progress), { total: EXTRA_CARDS.length, seen: 0, known: 0, mastered: 0, attempts: 0, correct: 0 });
  recordExtraAttempt(progress, { id: regularCards[0].id, correct: false });
  recordExtraAttempt(progress, { id: regularCards[0].id, correct: true });
  recordExtraAttempt(progress, { id: readingCards[0].id, correct: true, assisted: true });
  progress.cards['unknown-id'] = { attempts: 99, correct: 99, streak: 99 };
  assert.deepEqual(getExtraStats(progress), { total: EXTRA_CARDS.length, seen: 2, known: 2, mastered: 0, attempts: 3, correct: 2 });
  assert.deepEqual(getExtraStats(progress, regularTopic), { total: regularCards.length, seen: 1, known: 1, mastered: 0, attempts: 2, correct: 1 });
  assert.deepEqual(getExtraStats(progress, 'unknown-topic'), { total: 0, seen: 0, known: 0, mastered: 0, attempts: 0, correct: 0 });
});

test('size and random boundaries cannot exceed or duplicate the available cards', () => {
  for (const size of [0, -1, NaN, Infinity, '5', null]) assert.deepEqual(makeExtraLesson(regularTopic, { size }).cards, []);
  assert.equal(makeExtraLesson(regularTopic, { size: 2.9 }).cards.length, 2);
  for (const random of [() => 0, () => 1, () => -1, () => NaN, () => Infinity]) {
    const { cards } = makeExtraLesson(regularTopic, { size: 999, random });
    assert.equal(cards.length, regularCards.length);
    assert.equal(new Set(cards.map(({ id }) => id)).size, cards.length);
    assert.ok(cards.every((card) => card.choices.includes(card.answer)));
  }
});
