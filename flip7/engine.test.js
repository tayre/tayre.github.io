import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, firstRecipient, scoreEntry, setDraft, commitRound, undoRound, totals, outcome, restoreGame, restoreGameRecord, updateGameHistory } from './engine.js';

const players = [{ name: 'Alex', emoji: '🦊' }, { name: 'Sam', emoji: '🐼' }, { name: 'Riley', emoji: '🐸' }];
const manual = value => ({ kind: 'manual', value });
const cards = (numbers, modifiers = [], double = false) => ({ kind: 'cards', numbers, modifiers, double });
const round = (game, scores) => commitRound({ ...game, draft: scores.map(manual) });

test('number cards double before modifiers and the Flip 7 bonus', () => {
  assert.equal(scoreEntry(cards([1, 2, 3, 4, 5, 6, 7], [4, 8], true)), 83);
  assert.equal(scoreEntry(cards([6, 7, 8, 9, 10, 11, 12], [2, 4, 6, 8, 10], true)), 171);
  assert.equal(scoreEntry(cards([3, 11, 5, 7, 10], [10], false)), 46);
});

test('zero counts as one of seven unique number cards', () => {
  assert.equal(scoreEntry(cards([0, 1, 2, 3, 4, 5, 6])), 36);
  assert.equal(scoreEntry(cards([0])), 0);
  assert.equal(scoreEntry(cards([], [10])), 10);
  assert.equal(scoreEntry(cards([], [], true)), 0);
  assert.equal(scoreEntry({ kind: 'bust' }), 0);
});

test('impossible card selections and invalid manual scores cannot be saved', () => {
  for (const value of [-1, 1.5, 1000, Infinity, NaN, '12', null, '']) assert.throws(() => scoreEntry(manual(value)));
  for (const entry of [cards([3, 3]), cards([-1]), cards([13]), cards([0,1,2,3,4,5,6,7]), cards([1], [2,2]), cards([1], [3]), { ...cards([1]), double: 'yes' }, null]) assert.throws(() => scoreEntry(entry));
  assert.equal(scoreEntry(manual(0)), 0);
  assert.equal(scoreEntry(manual(999)), 999);
});

test('setup supports 1–18 players, safe fallback names, and independent IDs', () => {
  const game = createGame([{ name: '  ', emoji: 'bad' }, { name: 'Alex', emoji: '🐼' }, { name: 'Alex', emoji: '🐼' }]);
  assert.equal(game.players[0].name, 'Player 1');
  assert.equal(game.players[0].emoji, '🦊');
  assert.deepEqual(game.players.map(p => p.id), ['p1', 'p2', 'p3']);
  assert.equal(createGame(Array.from({ length:18 }, () => ({ name:'A',emoji:'🦊' }))).players.length, 18);
  assert.throws(() => createGame([]));
  assert.throws(() => createGame(Array(19).fill(players[0])));
});

test('draft scores do not affect totals or declare a winner', () => {
  const original = createGame(players);
  const changed = setDraft(original, 0, manual(200));
  assert.deepEqual(original.draft, [null, null, null]);
  assert.deepEqual(totals(changed), [0, 0, 0]);
  assert.equal(outcome(changed).type, 'playing');
  assert.throws(() => commitRound(changed), /every player/);
  assert.throws(() => setDraft(original, -1, manual(3)));
});

test('all round scores are counted before selecting the highest total', () => {
  let game = round(createGame(players), [190, 180, 160]);
  game = setDraft(game, 0, manual(10));
  assert.equal(outcome(game).type, 'playing');
  game = setDraft(game, 1, manual(40));
  game = setDraft(game, 2, { kind:'bust' });
  game = commitRound(game);
  assert.deepEqual(totals(game), [200, 220, 160]);
  assert.deepEqual(outcome(game), { type:'won', leaders:[1], top:220 });
  assert.throws(() => commitRound(game), /complete/);
  assert.throws(() => setDraft(game, 0, manual(20)), /complete/);
});

test('ties at 200 continue with all players, including those behind', () => {
  let game = round(createGame(players), [190, 180, 170]);
  game = round(game, [10, 20, 20]);
  assert.equal(outcome(game).type, 'tie');
  game = round(game, [0, 0, 30]);
  assert.deepEqual(outcome(game), { type:'won', leaders:[2], top:220 });
});

test('undo reopens the original entries without double-counting or losing card detail', () => {
  let game = createGame(players);
  const entries = [cards([0,1,2,3,4,5,6], [10], true), {kind:'bust'}, manual(35)];
  game = commitRound({ ...game, draft:entries });
  const reopened = undoRound(game);
  assert.deepEqual(totals(reopened), [0,0,0]);
  assert.deepEqual(reopened.draft, entries);
  assert.equal(game.rounds.length, 1);
  const corrected = commitRound(setDraft(reopened, 2, manual(40)));
  assert.deepEqual(totals(corrected), [67,0,40]);
  assert.equal(corrected.rounds.length, 1);
  assert.throws(() => undoRound(createGame(players)));
});

test('valid saved games restore exactly; partial, corrupt and post-win rounds fail safely', () => {
  let game = round(createGame(players), [40,25,0]);
  game = setDraft(game, 1, cards([4,5], [8], true));
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(game))), game);
  for (const value of [null, {}, { ...game, draft:[null] }, { ...game, rounds:[[manual(12)]] }, { ...game, draft:[manual(-1),null,null] }, { ...game, players:[{name:'bad',emoji:'<svg>'}] }, { ...game, rounds:[[manual(200),manual(100),manual(0)],[manual(1),manual(1),manual(1)]] }]) assert.equal(restoreGame(value), null);
  const won = round(createGame(players), [200,100,0]);
  assert.deepEqual(restoreGame(won), won);
  assert.equal(restoreGame({ ...won, draft:[manual(1),null,null] }), null);
});

test('the first recipient rotates in seating order, wraps, survives reload and follows undo', () => {
  let game = createGame(players);
  for (const name of ['Alex', 'Sam', 'Riley', 'Alex', 'Sam']) {
    assert.equal(firstRecipient(game).name, name);
    assert.equal(firstRecipient(setDraft(game, 0, manual(0))).name, name, 'draft edits do not rotate');
    game = round(game, [0, 0, 0]);
    game = restoreGame(JSON.parse(JSON.stringify(game)));
  }
  assert.equal(firstRecipient(undoRound(game)).name, 'Sam');
  assert.equal(firstRecipient(createGame(game.players)).name, 'Alex', 'new games restart with the first player');
  const solo = round(createGame([players[0]]), [0]);
  assert.equal(firstRecipient(solo).name, 'Alex');
  const fullTable = createGame(Array.from({ length: 18 }, (_, i) => ({ name: `Player ${i + 1}`, emoji: '🐉' })));
  assert.equal(firstRecipient(fullTable, 17).name, 'Player 18');
  assert.equal(firstRecipient(fullTable, 18).name, 'Player 1');
  const tie = round(createGame(players), [200, 200, 0]);
  assert.equal(firstRecipient(tie).name, 'Sam', 'tie-break rounds use the same rotation');
});

test('completed history stays distinct across rematches and follows corrected winning rounds', () => {
  let game = round(createGame(players), [200, 150, 120]);
  const finishedAt = '2026-11-07T19:00:00.000Z';
  let records = updateGameHistory([], game, false, finishedAt);
  assert.equal(records.length, 1);
  assert.deepEqual(totals(records[0].game), [200, 150, 120]);
  records = updateGameHistory(records, game, true, '2026-11-07T20:00:00.000Z');
  assert.equal(records.length, 1, 'archiving the finished current game does not duplicate it');
  assert.equal(records[0].savedAt, finishedAt, 'rematches preserve the completion date');
  game = undoRound(game);
  records = updateGameHistory(records, game);
  assert.equal(records.length, 0, 'undo removes the obsolete result');
  game = commitRound(setDraft(game, 1, manual(220)));
  records = updateGameHistory(records, game);
  assert.equal(records.length, 1);
  assert.equal(outcome(records[0].game).leaders[0], 1, 'corrected winner is saved');
  const rematch = round(createGame(players), [200, 150, 120]);
  records = updateGameHistory(records, rematch);
  assert.equal(records.length, 2, 'identical players and scores still represent different games');
  assert.notEqual(records[0].game.id, records[1].game.id);
  assert.deepEqual(records.map(restoreGameRecord), records);
});

test('replaced unfinished games retain saved rounds and drafts, but empty games are skipped', () => {
  const empty = createGame(players);
  assert.deepEqual(updateGameHistory([], empty, true), []);
  const draft = setDraft(empty, 1, { kind: 'bust' });
  assert.equal(updateGameHistory([], draft, true).length, 1, 'a bust is an entered score');
  const playing = setDraft(round(empty, [12, 20, 30]), 0, cards([4, 9], [10], true));
  assert.deepEqual(updateGameHistory([], playing), [], 'active unfinished games stay in the score table');
  const [record] = updateGameHistory([], playing, true);
  assert.deepEqual(totals(record.game), [12, 20, 30]);
  assert.deepEqual(record.game.draft, playing.draft);
  playing.draft[0].numbers.push(8);
  assert.deepEqual(record.game.draft[0].numbers, [4, 9], 'archived card detail is a separate snapshot');
  assert.deepEqual(restoreGameRecord(JSON.parse(JSON.stringify(record))), record);
});

test('legacy games migrate without changing scores; damaged history records are rejected', () => {
  const original = setDraft(round(createGame(players), [40, 25, 0]), 2, manual(12));
  const { id, startedAt, ...legacy } = original;
  const migrated = restoreGame(legacy);
  assert.ok(migrated.id);
  assert.ok(migrated.startedAt);
  assert.deepEqual(migrated.players, legacy.players);
  assert.deepEqual(migrated.rounds, legacy.rounds);
  assert.deepEqual(migrated.draft, legacy.draft);
  assert.equal(firstRecipient(migrated).name, 'Sam');
  const [record] = updateGameHistory([], original, true);
  for (const invalid of [null, {}, { ...record, savedAt: 'bad' }, { ...record, game: legacy }, { ...record, game: { ...original, draft: [] } }]) {
    assert.equal(restoreGameRecord(invalid), null);
  }
  assert.equal(restoreGame({ ...original, id: '' }), null);
  assert.equal(restoreGame({ ...original, startedAt: 'bad' }), null);
});

test('every requested animal profile survives setup, saving and restoration', () => {
  const animals = ['🐉', '🦡', '🐍', '🦅', '🐢', '🦂'];
  const game = createGame(animals.map(emoji => ({ name: '', emoji })));
  assert.deepEqual(game.players.map(player => player.emoji), animals);
  assert.deepEqual(restoreGame(game).players.map(player => player.emoji), animals);
});
