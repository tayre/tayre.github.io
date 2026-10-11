export const GAMES = [
  { id: 'word-pictures', grade: 1, title: 'Picture word hunt', description: 'Look at the picture. Find its word.', picture: 'cat', color: 'lilac' },
  { id: 'count-pictures', grade: 1, title: 'Count the little things', description: 'Count the pictures. Tap the number.', picture: 'apple', color: 'mint' },
  { id: 'multiplication-pairs', grade: 4, title: 'Times table pairs', description: 'Turn over a fact. Find its answer.', picture: 'star', color: 'yellow' },
  { id: 'capital-pairs', grade: 4, title: 'Capital city pairs', description: 'Match a province to its capital.', picture: 'leaf', color: 'peach' },
];
export const PICTURES = ['cat', 'sun', 'fish', 'star', 'leaf', 'apple'];
export const CAPITALS = [
  ['Alberta', 'Edmonton'], ['British Columbia', 'Victoria'], ['Manitoba', 'Winnipeg'],
  ['New Brunswick', 'Fredericton'], ['Newfoundland and Labrador', 'St. John’s'],
  ['Nova Scotia', 'Halifax'], ['Ontario', 'Toronto'], ['Prince Edward Island', 'Charlottetown'],
  ['Quebec', 'Quebec City'], ['Saskatchewan', 'Regina'],
];
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function choices(answer, pool, random) { return shuffle([answer, ...shuffle(pool.filter(value => value !== answer), random).slice(0, 2)], random); }
export function makeGame(id, random = Math.random) {
  const info = GAMES.find(game => game.id === id);
  if (!info) return null;
  if (info.grade === 1) {
    const pool = id === 'word-pictures' ? PICTURES : Array.from({ length: 10 }, (_, i) => i + 1);
    const questions = shuffle(pool, random).slice(0, 6).map((answer, i) => ({
      answer, picture: id === 'word-pictures' ? answer : PICTURES[i],
      choices: choices(answer, pool, random), wrong: [], solved: false,
    }));
    return { id, kind: 'choose', questions, index: 0, complete: false };
  }
  // Unique products ensure each answer has exactly one matching fact on a board.
  const facts = shuffle(Array.from({ length: 100 }, (_, i) => [Math.floor(i / 10) + 1, i % 10 + 1]), random);
  const products = new Map();
  for (const [a, b] of facts) if (!products.has(a * b)) products.set(a * b, [`${a} × ${b}`, String(a * b)]);
  const pairs = id === 'capital-pairs' ? shuffle(CAPITALS, random).slice(0, 4) : [...products.values()].slice(0, 4);
  const labels = id === 'capital-pairs' ? ['PROVINCE', 'CAPITAL'] : ['FACT', 'ANSWER'];
  const cards = shuffle(pairs.flatMap((pair, pairId) => pair.map((text, side) => ({ pairId, text, label: labels[side] }))), random);
  return { id, kind: 'match', cards, selected: [], matched: [], turns: 0, complete: false };
}
export function chooseAnswer(game, answer) {
  if (game?.kind !== 'choose' || game.complete) return 'ignored';
  const question = game.questions[game.index];
  if (question.solved || !question.choices.includes(answer) || question.wrong.includes(answer)) return 'ignored';
  if (answer === question.answer) { question.solved = true; return 'correct'; }
  question.wrong.push(answer); return 'retry';
}
export function flipCard(game, index) {
  if (game?.kind !== 'match' || game.complete || !Number.isInteger(index) || !game.cards[index] || game.selected.length === 2 || game.selected.includes(index) || game.matched.includes(game.cards[index].pairId)) return 'ignored';
  game.selected.push(index);
  if (game.selected.length === 1) return 'first';
  game.turns++;
  const [a, b] = game.selected.map(i => game.cards[i]);
  if (a.pairId === b.pairId) { game.matched.push(a.pairId); return 'match'; }
  return 'retry';
}
export function nextTurn(game) {
  if (!game || game.complete) return false;
  if (game.kind === 'choose') {
    if (!game.questions[game.index].solved) return false;
    if (game.index === game.questions.length - 1) game.complete = true; else game.index++;
  } else {
    if (game.selected.length !== 2) return false;
    if (game.matched.length === game.cards.length / 2) game.complete = true;
    game.selected = [];
  }
  return true;
}
