import { EXTRA_CARDS, EXTRA_TOPICS } from './extra-data.js';

const TOPIC_IDS = new Set(EXTRA_TOPICS.map(({ id }) => id));
const CARDS_BY_ID = new Map();
for (const card of EXTRA_CARDS) {
  if (typeof card.id === 'string' && card.id && TOPIC_IDS.has(card.topic) && !CARDS_BY_ID.has(card.id)) {
    CARDS_BY_ID.set(card.id, card);
  }
}
const CARDS = [...CARDS_BY_ID.values()];

function count(value) {
  return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;
}

function unitRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(unitRandom(random) * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function copyContent(value) {
  if (Array.isArray(value)) return value.map(copyContent);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyContent(item)]));
  return value;
}

function normalizeHistory(raw) {
  const saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const attempts = count(saved.attempts);
  const correct = Math.min(attempts, count(saved.correct));
  const assisted = Math.min(attempts, count(saved.assisted));
  return {
    attempts,
    correct,
    streak: Math.min(correct, attempts - assisted, count(saved.streak)),
    assisted,
    lastSeen: count(saved.lastSeen),
  };
}

/**
 * Prepare a short lesson in one topic, with unique cards and shuffled choices.
 * A supplied reviewIds array is a hard scope limit; unknown IDs are ignored.
 * Passage-based lessons choose a single eligible passage and may be shorter
 * than size, so the child studies one text before answering its questions.
 * All returned content is copied; callers can render it without mutating data.
 */
export function makeExtraLesson(topic, { size = 5, random = Math.random, reviewIds = null } = {}) {
  const limit = count(size);
  if (!TOPIC_IDS.has(topic) || limit === 0) return { topic, cards: [] };
  const review = reviewIds === null ? null : new Set(Array.isArray(reviewIds) ? reviewIds : []);
  let pool = CARDS.filter((card) => card.topic === topic && (!review || review.has(card.id)));
  if (!pool.length) return { topic, cards: [] };

  if (pool.some((card) => typeof card.passage === 'string' && card.passage.trim())) {
    const groups = new Map();
    for (const card of pool) {
      const key = typeof card.passage === 'string' && card.passage.trim() ? card.passage : card.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }
    const blocks = [...groups.values()];
    pool = blocks[Math.floor(unitRandom(random) * blocks.length)];
  }

  const cards = shuffled(pool, random).slice(0, Math.min(limit, pool.length)).map((card) => {
    const copy = copyContent(card);
    copy.choices = shuffled(copy.choices, random);
    return copy;
  });
  return { topic, cards };
}

/**
 * JSON-safe progress. Per-card history has attempts, correct, streak, assisted,
 * and lastSeen. The caller owns completedLessons and totalPoints increments.
 */
export function createExtraProgress() {
  return { version: 1, cards: {}, completedLessons: 0, totalPoints: 0 };
}

export function normalizeExtraProgress(raw) {
  const progress = createExtraProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return progress;
  progress.completedLessons = count(raw.completedLessons);
  progress.totalPoints = count(raw.totalPoints);
  if (!raw.cards || typeof raw.cards !== 'object' || Array.isArray(raw.cards)) return progress;
  for (const { id } of CARDS) {
    const saved = raw.cards[id];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    progress.cards[id] = normalizeHistory(saved);
  }
  return progress;
}

/**
 * Mutate and return progress. Record only the first submitted response to a
 * question. Three consecutive correct, unassisted responses establish mastery;
 * mistakes or help reset the streak. Unique lesson IDs keep credits separated.
 */
export function recordExtraAttempt(progress, { id, correct, assisted = false, now = Date.now() }) {
  if (!CARDS_BY_ID.has(id)) throw new RangeError('Unknown extra lesson card ID.');
  const history = normalizeHistory(progress.cards[id]);
  const clean = correct === true && assisted !== true;
  history.attempts = count(history.attempts + 1);
  if (correct === true) history.correct = count(history.correct + 1);
  if (assisted === true) history.assisted = count(history.assisted + 1);
  history.streak = clean ? count(history.streak + 1) : 0;
  history.lastSeen = count(now);
  progress.cards[id] = history;
  return progress;
}

/** `seen` means attempted; `known` means correct at least once, including help. */
export function getExtraStats(progress, topic = null) {
  const cards = topic === null ? CARDS : CARDS.filter((card) => card.topic === topic);
  const stats = { total: cards.length, seen: 0, known: 0, mastered: 0, attempts: 0, correct: 0 };
  for (const { id } of cards) {
    const history = normalizeHistory(progress?.cards?.[id]);
    if (history.attempts > 0) stats.seen += 1;
    if (history.correct > 0) stats.known += 1;
    if (history.streak >= 3) stats.mastered += 1;
    stats.attempts = count(stats.attempts + history.attempts);
    stats.correct = count(stats.correct + history.correct);
  }
  return stats;
}
