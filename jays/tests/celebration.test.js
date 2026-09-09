'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isJaysWin, createWinTracker } = require('../logic.js');

function game({ id = 123, state = 'Final', detail = state, home = true, us = 5, them = 2 } = {}) {
  const jays = { team: { id: 141 }, score: us };
  const opponent = { team: { id: 147 }, score: them };
  return {
    gamePk: id, status: { abstractGameState: state, detailedState: detail },
    teams: home ? { home: jays, away: opponent } : { home: opponent, away: jays }
  };
}

test('recognizes final Toronto victories at home, away and completed early', () => {
  assert.equal(isJaysWin(game()), true);
  assert.equal(isJaysWin(game({ home: false })), true);
  assert.equal(isJaysWin(game({ us: 1, them: 0 })), true);
  assert.equal(isJaysWin(game({ detail: 'Completed Early: Rain' })), true);
});

test('does not celebrate leads, losses, ties or non-final games', () => {
  for (const state of ['Live', 'Preview', undefined, 'Unknown']) {
    const g = game(); g.status.abstractGameState = state;
    assert.equal(isJaysWin(g), false);
  }
  assert.equal(isJaysWin(game({ us: 1, them: 2 })), false);
  assert.equal(isJaysWin(game({ us: 2, them: 2 })), false);
  assert.equal(isJaysWin(game({ us: 0, them: 0 })), false);
});

test('does not mistake cancelled/postponed/suspended games for a victory', () => {
  for (const detail of ['Postponed', 'Cancelled', 'Canceled', 'Suspended']) {
    assert.equal(isJaysWin(game({ detail })), false);
  }
});

test('ignores other teams, missing data and invalid scores', () => {
  for (const value of [null, undefined, {}, { status: { abstractGameState: 'Final' } }]) assert.equal(isJaysWin(value), false);
  const other = game(); other.teams.home.team.id = 111;
  assert.equal(isJaysWin(other), false);
  for (const value of [null, undefined, NaN, Infinity, -1, '5', 2.5]) {
    const g = game(); g.teams.home.score = value;
    assert.equal(isJaysWin(g), false);
    const missingOpponent = game(); missingOpponent.teams.away.score = value;
    assert.equal(isJaysWin(missingOpponent), false);
  }
});

test('celebrates a live-to-final win once; polling and revisiting do not repeat it', () => {
  const tracker = createWinTracker();
  assert.deepEqual(tracker.claim([game({ state: 'Live' })]), []);
  assert.deepEqual(tracker.claim([game()]), [123]);
  assert.deepEqual(tracker.claim([game()]), []);
  tracker.claim([]);
  assert.deepEqual(tracker.claim([game()]), []);
});

test('celebrates an already-final win on first view and each doubleheader game separately', () => {
  const tracker = createWinTracker();
  assert.deepEqual(tracker.claim([game(), game()]), [123]);
  assert.deepEqual(tracker.claim([game(), game({ id: 124 })]), [124]);
  assert.deepEqual(createWinTracker().claim([game(), game({ id: 124 })]), [123, 124]);
});

test('never claims a loss or a game without a stable MLB identifier', () => {
  const tracker = createWinTracker();
  assert.deepEqual(tracker.claim([game({ us: 0 })]), []);
  assert.deepEqual(tracker.claim([game()]), [123]);
  for (const id of [null, undefined, 0, -1, '124', 1.5]) {
    const g = game(); g.gamePk = id;
    assert.deepEqual(tracker.claim([g]), []);
  }
});

test('session storage deduplicates wins after a reload', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(createWinTracker(storage).claim([game()]), [123]);
  assert.deepEqual(createWinTracker(storage).claim([game()]), []);
  assert.deepEqual(createWinTracker(storage).claim([game({ id: 124 })]), [124]);
});

test('corrupt or inaccessible storage never prevents in-memory deduplication', () => {
  for (const value of ['broken JSON', '{}', 'null', '[null,"123",0,-1]']) {
    const tracker = createWinTracker({ getItem: () => value, setItem() { throw Error('blocked'); } });
    assert.deepEqual(tracker.claim([game()]), [123]);
    assert.deepEqual(tracker.claim([game()]), []);
  }
  const tracker = createWinTracker({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.deepEqual(tracker.claim([game()]), [123]);
  assert.deepEqual(tracker.claim([game()]), []);
});
