import { createProgress, factKey, makeRound, normalizeProgress, recordAttempt } from './engine.js';

function unitRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

function shuffled(facts, random) {
  const result = [...facts];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(unitRandom(random) * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Study one multiplication pattern at a time. Choose the table with the most
 * unfinished eligible facts, giving extra priority to facts with misses/help;
 * ties and the all-mastered fallback are random. Existing engine weights choose
 * up to three facts within that table, then their initial order is shuffled.
 *
 * The preview's order repeats without adjacent retries: three facts produce
 * ABC ABC ABC, two produce AB AB, and one appears once. A review pool is a hard
 * scope limit. No eligible facts returns an empty lesson with focusTable null.
 */
export function makeMemoryLesson({ tables, progress = createProgress(), reviewFacts = null, random = Math.random } = {}) {
  const history = normalizeProgress(progress);
  // Exhaust the scoped pool without consuming the caller's random sequence.
  const eligible = makeRound({ tables, progress: history, reviewFacts, length: 100, random: () => 0 });
  if (!eligible.length) return { facts: [], questions: [], focusTable: null };

  const needsByTable = new Map();
  for (const { a, b } of eligible) {
    const fact = history.facts[factKey(a, b)];
    const unfinished = !fact || fact.streak < 3;
    const hadTrouble = fact && (fact.attempts > fact.correct || fact.assisted > 0);
    const need = unfinished ? 1 + (hadTrouble ? 1 : 0) : 0;
    needsByTable.set(a, (needsByTable.get(a) || 0) + need);
  }
  const highestNeed = Math.max(...needsByTable.values());
  const focusOptions = [...needsByTable].filter(([, need]) => need === highestNeed).map(([table]) => table);
  const focusTable = focusOptions[Math.floor(unitRandom(random) * focusOptions.length)];
  const facts = shuffled(makeRound({ tables: [focusTable], progress: history, reviewFacts, length: 3, random }), random);
  const questions = [];
  for (let visit = 1; visit <= facts.length; visit += 1) {
    for (const { a, b } of facts) questions.push({ a, b, visit });
  }
  return { facts, questions, focusTable };
}

/**
 * Record one scored response while allowing at most one mastery-streak credit
 * per fact per lesson. Supply the same fresh Set as `creditedKeys` throughout a
 * lesson. Despite its name, it tracks EVERY first attempt, including a miss or
 * assisted answer: those consume that lesson's credit opportunity as well.
 *
 * Later clean answers update attempt/correct counts without increasing streak.
 * Later misses/help still reset streak, and a spent credit cannot be recovered
 * within the lesson. Mutates and returns progress; also mutates creditedKeys.
 */
export function recordMemoryAttempt(progress, { a, b, correct, assisted = false, creditedKeys, now = Date.now() }) {
  if (!(creditedKeys instanceof Set)) throw new TypeError('A lesson must supply its creditedKeys Set.');
  const key = factKey(a, b);
  const alreadyAttempted = creditedKeys.has(key);
  const previousStreak = progress.facts[key]?.streak || 0;
  recordAttempt(progress, { a, b, correct, assisted, now });
  if (alreadyAttempted && correct && !assisted) progress.facts[key].streak = previousStreak;
  creditedKeys.add(key);
  return progress;
}
