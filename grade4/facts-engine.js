import { FACTS, FACT_TOPICS } from './facts-data.js';

/**
 * Progress is JSON-safe, with history keyed by a stable question ID:
 * { version: 1, facts: {
 *   'example-id': { attempts: 4, correct: 3, streak: 2, assisted: 1, lastSeen: 1234 }
 * }, completedRounds: 0, totalPoints: 0 }
 *
 * Missing IDs have no history. Three consecutive correct, unassisted responses
 * establish mastery. The UI owns round and point totals and records one attempt
 * per question; a hint or revealed answer makes that response assisted.
 */

const MASTERY_STREAK = 3;
const FACTS_BY_ID = new Map(FACTS.map((fact) => [fact.id, fact]));

function count(value) {
  return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;
}

function normalizeHistory(raw) {
  const history = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const attempts = count(history.attempts);
  const correct = Math.min(attempts, count(history.correct));
  const assisted = Math.min(attempts, count(history.assisted));
  return {
    attempts,
    correct,
    streak: Math.min(correct, attempts - assisted, count(history.streak)),
    assisted,
    lastSeen: count(history.lastSeen),
  };
}

export function createFactProgress() {
  return { version: 1, facts: {}, completedRounds: 0, totalPoints: 0 };
}

/** Restore supported fields and known IDs only, bounding corrupt saved values. */
export function normalizeFactProgress(raw, validFacts = FACTS) {
  const progress = createFactProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return progress;
  progress.completedRounds = count(raw.completedRounds);
  progress.totalPoints = count(raw.totalPoints);
  if (!raw.facts || typeof raw.facts !== 'object' || Array.isArray(raw.facts)) return progress;

  for (const fact of Array.isArray(validFacts) ? validFacts : []) {
    if (!fact || typeof fact.id !== 'string' || !fact.id || fact.id === '__proto__') continue;
    const saved = raw.facts[fact.id];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    progress.facts[fact.id] = normalizeHistory(saved);
  }
  return progress;
}

function unitRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

function practiceWeight(raw) {
  const history = normalizeHistory(raw);
  if (!history.attempts) return 8;
  if (history.streak >= MASTERY_STREAK) return 1;
  const base = [8, 6, 3][history.streak];
  return base + Math.min(4, history.attempts - history.correct) * 2;
}

function shuffledCopy(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(unitRandom(random) * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

/**
 * Sample unique questions within the selected topics, favoring unfamiliar or
 * missed questions. A supplied reviewIds array further limits the pool.
 * Mixed rounds include every available topic when the round has enough slots;
 * remaining slots use weighted selection, and mixed question order is shuffled.
 * Returned question objects and choice arrays are copies; source data is intact.
 */
export function makeFactRound({ topics = FACT_TOPICS.map(({ id }) => id), progress = createFactProgress(), length = 10, reviewIds = null, random = Math.random } = {}) {
  const selectedTopics = new Set(Array.isArray(topics) ? topics : []);
  const review = reviewIds === null ? null : new Set(Array.isArray(reviewIds) ? reviewIds : []);
  const seen = new Set();
  const candidates = FACTS.filter((fact) => {
    if (!selectedTopics.has(fact.topic) || (review && !review.has(fact.id)) || seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  }).map((fact) => ({ fact, weight: practiceWeight(progress?.facts?.[fact.id]) }));
  const target = Math.min(candidates.length, count(length));
  const availableTopics = [...new Set(candidates.map(({ fact }) => fact.topic))];
  const round = [];

  const pickQuestion = (topic = null) => {
    const pool = topic === null ? candidates : candidates.filter(({ fact }) => fact.topic === topic);
    let threshold = unitRandom(random) * pool.reduce((sum, item) => sum + item.weight, 0);
    let index = 0;
    while (index < pool.length - 1 && threshold >= pool[index].weight) {
      threshold -= pool[index].weight;
      index += 1;
    }
    const picked = pool[index];
    candidates.splice(candidates.indexOf(picked), 1);
    const { fact } = picked;
    round.push({ ...fact, choices: shuffledCopy(fact.choices, random) });
  };

  if (availableTopics.length > 1 && target >= availableTopics.length) {
    for (const topic of availableTopics) pickQuestion(topic);
  }
  while (round.length < target) pickQuestion();
  return availableTopics.length > 1 ? shuffledCopy(round, random) : round;
}

/** Mutate and return progress. Unknown question IDs are rejected. */
export function recordFactAttempt(progress, { id, correct, assisted = false, now = Date.now() }) {
  if (!FACTS_BY_ID.has(id)) throw new RangeError('Unknown fact question ID.');
  const history = normalizeHistory(progress.facts[id]);
  history.attempts = count(history.attempts + 1);
  if (correct) history.correct = count(history.correct + 1);
  if (assisted) history.assisted = count(history.assisted + 1);
  history.streak = correct && !assisted ? count(history.streak + 1) : 0;
  history.lastSeen = count(now);
  progress.facts[id] = history;
  return progress;
}

/** `known` counts questions answered correctly at least once, including help. */
export function getFactStats(progress, topic = null) {
  const questions = topic === null ? FACTS : FACTS.filter((fact) => fact.topic === topic);
  const stats = { total: questions.length, known: 0, mastered: 0, attempts: 0, correct: 0 };
  for (const question of questions) {
    const history = normalizeHistory(progress?.facts?.[question.id]);
    stats.attempts = count(stats.attempts + history.attempts);
    stats.correct = count(stats.correct + history.correct);
    if (history.correct > 0) stats.known += 1;
    if (history.streak >= MASTERY_STREAK) stats.mastered += 1;
  }
  return stats;
}
