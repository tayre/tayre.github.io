/**
 * Small, dependency-free learning engine. Facts are ordered: 3 × 7 and 7 × 3
 * each get their own practice history. All operands are integers from 1 to 10.
 *
 * Progress is JSON-safe:
 * { version: 1, completedRounds: 0, facts: {
 *   '3x7': { attempts: 4, correct: 3, streak: 2, assisted: 1, lastSeen: 1234 }
 * } }
 *
 * Missing facts have no practice history. A fact is mastered after three
 * consecutive correct, unassisted responses. The UI records one attempt per
 * presented question and marks it assisted after a hint or an earlier miss.
 */

const TABLE_SIZE = 10;
const MASTERY_STREAK = 3;

function validOperand(value) {
  return Number.isInteger(value) && value >= 1 && value <= TABLE_SIZE;
}

function assertFact(a, b) {
  if (!validOperand(a) || !validOperand(b)) {
    throw new RangeError('Multiplication facts must use whole numbers from 1 to 10.');
  }
}

function count(value) {
  return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;
}

function emptyFact() {
  return { attempts: 0, correct: 0, streak: 0, assisted: 0, lastSeen: 0 };
}

export function factKey(a, b) {
  assertFact(a, b);
  return `${a}x${b}`;
}

export function createProgress() {
  return { version: 1, facts: {}, completedRounds: 0 };
}

/** Restore only supported fields, ignoring malformed/foreign fact entries. */
export function normalizeProgress(raw) {
  const progress = createProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return progress;
  progress.completedRounds = count(raw.completedRounds);
  if (!raw.facts || typeof raw.facts !== 'object' || Array.isArray(raw.facts)) return progress;

  for (let a = 1; a <= TABLE_SIZE; a += 1) {
    for (let b = 1; b <= TABLE_SIZE; b += 1) {
      const key = factKey(a, b);
      const saved = raw.facts[key];
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
      const attempts = count(saved.attempts);
      const correct = Math.min(attempts, count(saved.correct));
      const assisted = Math.min(attempts, count(saved.assisted));
      progress.facts[key] = {
        attempts,
        correct,
        streak: Math.min(correct, attempts - assisted, count(saved.streak)),
        assisted,
        lastSeen: count(saved.lastSeen),
      };
    }
  }
  return progress;
}

function practiceWeight(history) {
  if (!history || history.attempts === 0) return 8;
  const streak = count(history.streak);
  const base = streak >= MASTERY_STREAK ? 1 : [8, 6, 3][streak];
  // Recent recovery matters more than old misses once a fact is mastered.
  const misses = Math.max(0, count(history.attempts) - count(history.correct));
  return base + (streak < MASTERY_STREAK ? Math.min(4, misses) * 2 : 0);
}

function unitRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

/**
 * Sample without replacement, favoring unlearned and missed facts. `tables`
 * selects the first operand; omitting it selects all tables. An explicit empty
 * selection returns no questions. `reviewFacts`, when supplied, limits the pool
 * to those {a,b} objects (still respecting the selected tables).
 */
export function makeRound({ tables, progress = createProgress(), length = 10, random = Math.random, reviewFacts = null } = {}) {
  const selected = new Set(
    (tables === undefined ? Array.from({ length: TABLE_SIZE }, (_, index) => index + 1) : Array.isArray(tables) ? tables : [])
      .filter(validOperand),
  );
  const seen = new Set();
  const candidates = [];
  const add = (a, b) => {
    if (!validOperand(a) || !validOperand(b) || !selected.has(a)) return;
    const key = factKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ a, b, weight: practiceWeight(progress?.facts?.[key]) });
  };

  if (reviewFacts !== null) {
    if (Array.isArray(reviewFacts)) {
      for (const fact of reviewFacts) if (fact && typeof fact === 'object') add(fact.a, fact.b);
    }
  } else {
    for (const a of selected) for (let b = 1; b <= TABLE_SIZE; b += 1) add(a, b);
  }

  const target = Math.min(candidates.length, count(length));
  const round = [];
  while (round.length < target) {
    const totalWeight = candidates.reduce((sum, fact) => sum + fact.weight, 0);
    let threshold = unitRandom(random) * totalWeight;
    let index = 0;
    while (index < candidates.length - 1 && threshold >= candidates[index].weight) {
      threshold -= candidates[index].weight;
      index += 1;
    }
    const [picked] = candidates.splice(index, 1);
    round.push({ a: picked.a, b: picked.b });
  }
  return round;
}

/** Mutate and return progress. Call once per question, not once per keypress. */
export function recordAttempt(progress, { a, b, correct, assisted = false, now = Date.now() }) {
  const key = factKey(a, b);
  const fact = progress.facts[key] || emptyFact();
  fact.attempts += 1;
  if (correct) fact.correct += 1;
  if (assisted) fact.assisted += 1;
  fact.streak = correct && !assisted ? fact.streak + 1 : 0;
  fact.lastSeen = count(now);
  progress.facts[key] = fact;
  return progress;
}

function statsFor(progress, tables) {
  const stats = { total: tables.length * TABLE_SIZE, known: 0, mastered: 0, attempts: 0, correct: 0, accuracy: 0 };
  for (const a of tables) {
    for (let b = 1; b <= TABLE_SIZE; b += 1) {
      const fact = progress?.facts?.[factKey(a, b)];
      if (!fact) continue;
      stats.attempts += fact.attempts;
      stats.correct += fact.correct;
      if (fact.correct > 0) stats.known += 1;
      if (fact.streak >= MASTERY_STREAK) stats.mastered += 1;
    }
  }
  stats.accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
  return stats;
}

export function getStats(progress) {
  return statsFor(progress, Array.from({ length: TABLE_SIZE }, (_, index) => index + 1));
}

export function getTableStats(progress, table) {
  assertFact(table, 1);
  return statsFor(progress, [table]);
}

/** A short, age-appropriate strategy. Showing it makes the response assisted. */
export function getHint(a, b) {
  assertFact(a, b);
  if (a === 1 || b === 1) return `One group of ${Math.max(a, b)} is ${Math.max(a, b)}.`;
  if (a === 10 || b === 10) return `To multiply ${a === 10 ? b : a} by 10, put a zero after it.`;
  if (a === 2 || b === 2) return `Double ${a === 2 ? b : a}: ${a === 2 ? b : a} + ${a === 2 ? b : a}.`;
  if (a === 5 || b === 5) {
    const other = a === 5 ? b : a;
    return `10 × ${other} = ${10 * other}. Take half to find 5 × ${other}.`;
  }
  if (a === 9 || b === 9) {
    const other = a === 9 ? b : a;
    return `10 × ${other} = ${10 * other}. Subtract ${other} to find 9 × ${other}.`;
  }
  if (a === 4 || b === 4) {
    const other = a === 4 ? b : a;
    return `Double ${other} to get ${2 * other}, then double ${2 * other} again.`;
  }
  if (a === 3 || b === 3) {
    const other = a === 3 ? b : a;
    return `Double ${other} to get ${2 * other}, then add one more ${other}.`;
  }
  return `Split ${a} into 5 + ${a - 5}: 5 × ${b} = ${5 * b} and ${a - 5} × ${b} = ${(a - 5) * b}. Add them together.`;
}
