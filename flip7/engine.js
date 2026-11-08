export const TARGET = 200;
export const MAX_PLAYERS = 18;
export const MODIFIERS = [2, 4, 6, 8, 10];
export const PROFILES = [
  ['🦊', 'Fox'], ['🐼', 'Panda'], ['🐸', 'Frog'], ['🦁', 'Lion'],
  ['🐙', 'Octopus'], ['🦄', 'Unicorn'], ['🐻', 'Bear'], ['🐨', 'Koala'],
  ['🐯', 'Tiger'], ['🐧', 'Penguin'], ['🦋', 'Butterfly'], ['🐢', 'Turtle'],
  ['🚀', 'Rocket'], ['🍀', 'Clover'], ['🌈', 'Rainbow'], ['⚡', 'Lightning'],
  ['🍓', 'Strawberry'], ['🍕', 'Pizza'], ['🌻', 'Sunflower'], ['🌵', 'Cactus'],
  ['👾', 'Alien'], ['🤖', 'Robot'], ['🐈', 'Cat'], ['🐶', 'Dog'],
  ['🐉', 'Dragon'], ['🦡', 'Badger'], ['🐍', 'Snake'], ['🦅', 'Eagle'], ['🦂', 'Scorpion'],
];

const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const validEmoji = emoji => PROFILES.some(([value]) => value === emoji);
export const cleanName = (name, index) => (typeof name === 'string' ? name.trim().slice(0, 24) : '') || `Player ${index + 1}`;

export function scoreEntry(entry) {
  if (!entry || typeof entry !== 'object') return fail('Add a score for every player.');
  if (entry.kind === 'bust') return 0;
  if (entry.kind === 'manual') {
    if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value > 999) return fail('Enter a whole-number score from 0 to 999.');
    return entry.value;
  }
  if (entry.kind !== 'cards' || !Array.isArray(entry.numbers) || !Array.isArray(entry.modifiers) || typeof entry.double !== 'boolean') return fail('Check the selected cards.');
  if (entry.numbers.length > 7 || new Set(entry.numbers).size !== entry.numbers.length || entry.numbers.some(n => !Number.isInteger(n) || n < 0 || n > 12)) return fail('Choose up to seven different number cards.');
  if (new Set(entry.modifiers).size !== entry.modifiers.length || entry.modifiers.some(n => !MODIFIERS.includes(n))) return fail('Check the modifier cards.');
  const numberTotal = entry.numbers.reduce((sum, n) => sum + n, 0);
  const bonusTotal = entry.modifiers.reduce((sum, n) => sum + n, 0);
  return numberTotal * (entry.double ? 2 : 1) + bonusTotal + (entry.numbers.length === 7 ? 15 : 0);
}

export function createGame(players) {
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) return fail(`Choose 1–${MAX_PLAYERS} players.`);
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    startedAt: new Date().toISOString(),
    players: players.map((p, i) => ({ id: `p${i + 1}`, name: cleanName(p.name, i), emoji: validEmoji(p.emoji) ? p.emoji : PROFILES[i % PROFILES.length][0] })),
    rounds: [],
    draft: players.map(() => null),
  };
}

// Only the first recipient rotates; the dealer and seating order stay the same.
// Deriving it from saved rounds also handles reloads, ties and undo.
export function firstRecipient(game, roundIndex = game.rounds.length) {
  return game.players[roundIndex % game.players.length];
}

export function totals(game) {
  return game.players.map((_, i) => game.rounds.reduce((total, round) => total + scoreEntry(round[i]), 0));
}

export function outcome(game) {
  const scores = totals(game);
  const top = Math.max(...scores);
  const leaders = scores.map((score, i) => score === top ? i : -1).filter(i => i >= 0);
  return { type: top < TARGET ? 'playing' : leaders.length > 1 ? 'tie' : 'won', leaders, top };
}

export function setDraft(game, index, entry) {
  if (outcome(game).type === 'won') return fail('This game is complete. Start another game or undo the last round.');
  if (!Number.isInteger(index) || index < 0 || index >= game.players.length) return fail('Choose a player.');
  if (entry !== null) scoreEntry(entry);
  return { ...game, draft: game.draft.map((value, i) => i === index ? copy(entry) : value) };
}

export function commitRound(game) {
  if (outcome(game).type === 'won') return fail('This game is already complete.');
  if (game.draft.length !== game.players.length || game.draft.some(entry => entry === null)) return fail('Add a score for every player. A bust counts as zero.');
  game.draft.forEach(scoreEntry);
  return { ...game, rounds: [...game.rounds, copy(game.draft)], draft: game.players.map(() => null) };
}

export function undoRound(game) {
  if (!game.rounds.length) return fail('There are no saved rounds to undo.');
  return { ...game, rounds: game.rounds.slice(0, -1), draft: copy(game.rounds.at(-1)) };
}

// Reject partial/corrupt saves instead of guessing totals or silently changing scores.
export function restoreGame(value) {
  try {
    if (!value || !Array.isArray(value.players) || !Array.isArray(value.rounds) || !Array.isArray(value.draft)) return null;
    const game = createGame(value.players);
    // Older saves have no identity or date. Give them one during migration.
    if (value.id !== undefined || value.startedAt !== undefined) {
      if (typeof value.id !== 'string' || !value.id.length || value.id.length > 100 || !validDate(value.startedAt)) return null;
      game.id = value.id;
      game.startedAt = value.startedAt;
    }
    if (value.players.some((p, i) => p.id !== game.players[i].id || typeof p.name !== 'string' || !validEmoji(p.emoji))) return null;
    if (value.draft.length !== game.players.length) return null;
    let restored = game;
    for (const round of value.rounds) {
      if (!Array.isArray(round) || round.length !== game.players.length) return null;
      restored = commitRound({ ...restored, draft: round });
    }
    value.draft.forEach(entry => { if (entry !== null) scoreEntry(entry); });
    if (outcome(restored).type === 'won' && value.draft.some(entry => entry !== null)) return null;
    return { ...restored, draft: copy(value.draft) };
  } catch { return null; }
}

export function restoreGameRecord(value) {
  if (!value || !validDate(value.savedAt) || !value.game?.id || !value.game?.startedAt) return null;
  const game = restoreGame(value.game);
  if (!game || (!game.rounds.length && !game.draft.some(entry => entry !== null))) return null;
  return { savedAt: value.savedAt, game };
}

// Keep one snapshot per game. Undoing a win removes its old result until the
// corrected game is finished (or deliberately replaced with a new game).
export function updateGameHistory(records, game, archive = false, savedAt = new Date().toISOString()) {
  // Starting a rematch must keep the original completion date.
  if (archive && outcome(game).type === 'won' && records.some(record => record.game.id === game.id)) return records;
  const others = records.filter(record => record.game.id !== game.id);
  const hasScores = game.rounds.length > 0 || game.draft.some(entry => entry !== null);
  if (outcome(game).type !== 'won' && (!archive || !hasScores)) return others;
  return [{ savedAt, game: copy(game) }, ...others];
}
