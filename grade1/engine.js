import { CARDS, WORD_PACKS, LEARNING_PACKS } from './data.js';

const CARDS_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const NUMBER_RANGES = Array.from({ length: 10 }, (_, index) => `${index * 10 + 1}-${index * 10 + 10}`);

function count(value) {
  return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;
}

function unitRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

/**
 * Select cards in teaching order, optionally shuffled, without changing data.
 * Alphabet accepts 'all'; words accept 'all' or a WORD_PACKS ID; numbers accept
 * 'all' or a decade range such as '1-10', '11-20', through '91-100'.
 * Added topics accept 'all' or their own LEARNING_PACKS ID.
 * Unsupported topics or selections return an empty deck.
 */
export function makeDeck({ topic = 'alphabet', selection = 'all', shuffle = false, random = Math.random } = {}) {
  let cards = CARDS.filter((card) => card.topic === topic);
  if (selection !== 'all') {
    if (topic === 'words') {
      const pack = WORD_PACKS.find(({ id }) => id === selection);
      cards = (pack?.ids || []).map((id) => CARDS_BY_ID.get(id));
    } else if (topic === 'numbers' && NUMBER_RANGES.includes(selection)) {
      const [first, last] = selection.split('-').map(Number);
      cards = cards.filter(({ number }) => number >= first && number <= last);
    } else {
      const pack = LEARNING_PACKS.find(({ id, topic: packTopic }) => id === selection && packTopic === topic);
      cards = (pack?.ids || []).map((id) => CARDS_BY_ID.get(id));
    }
  }
  const deck = cards.map((card) => JSON.parse(JSON.stringify(card)));
  if (shuffle) {
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(unitRandom(random) * (index + 1));
      [deck[index], deck[swap]] = [deck[swap], deck[index]];
    }
  }
  return deck;
}

/** JSON-safe history; `known` is the latest response, not a mastery claim. */
export function createProgress() {
  return { version: 1, cards: {} };
}

export function normalizeProgress(raw) {
  const progress = createProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return progress;
  if (!raw.cards || typeof raw.cards !== 'object' || Array.isArray(raw.cards)) return progress;
  for (const { id } of CARDS) {
    const saved = raw.cards[id];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    const attempts = count(saved.attempts);
    progress.cards[id] = { attempts, known: attempts > 0 && saved.known === true };
  }
  return progress;
}

/** Mutate and return progress once a child chooses known or needs practice. */
export function recordCard(progress, { id, known }) {
  if (!CARDS_BY_ID.has(id)) throw new RangeError('Unknown flashcard ID.');
  progress.cards[id] = { attempts: count(count(progress.cards[id]?.attempts) + 1), known: known === true };
  return progress;
}

/** Scope by a topic ID, or omit topic/use null to summarize all cards. */
export function getStats(progress, topic = null) {
  const cards = topic === null ? CARDS : CARDS.filter((card) => card.topic === topic);
  const stats = { seen: 0, known: 0, total: cards.length };
  for (const { id } of cards) {
    const history = progress?.cards?.[id];
    if (count(history?.attempts) === 0) continue;
    stats.seen += 1;
    if (history.known === true) stats.known += 1;
  }
  return stats;
}

/** Next records practice, without claiming the child knows the answer. */
export function recordVisit(progress, { id }) {
  if (!CARDS_BY_ID.has(id)) throw new RangeError('Unknown flashcard ID.');
  progress.cards[id] = { attempts: count(count(progress.cards[id]?.attempts) + 1), known: progress.cards[id]?.known === true };
  return progress;
}
