import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, normalizeSchedule, extractLineups, MLBClient } from './mlb.js';

test('month navigation includes the last day and handles leap years', () => {
  assert.deepEqual(monthRange(2024, 1), { startDate: '2024-02-01', endDate: '2024-02-29' });
  assert.deepEqual(monthRange(2026, 11), { startDate: '2026-12-01', endDate: '2026-12-31' });
});

test('schedule keeps both doubleheader games and their original game dates', () => {
  const game = { gamePk: 10, season: '2026', gameDate: '2026-06-02T00:07:00Z', officialDate: '2026-06-01', doubleHeader: 'Y', gameNumber: 1, status: { detailedState: 'Final' }, teams: { away: { team: { id: 141, name: 'Toronto Blue Jays', teamName: 'Blue Jays', abbreviation: 'TOR' }, score: 9 }, home: { team: { id: 147, name: 'New York Yankees', teamName: 'Yankees', abbreviation: 'NYY' }, score: 1 } } };
  const games = normalizeSchedule({ dates: [{ date: '2026-06-01', games: [{ ...game, gamePk: 11, gameNumber: 2 }, game] }] });
  assert.equal(games.length, 2); assert.deepEqual(games.map(g => g.gamePk), [10, 11]);
  assert.equal(games[0].date, '2026-06-01'); assert.equal(games[0].teams[0].shortName, 'Blue Jays');
  assert.equal(games[0].teams[0].score, undefined); // Start an empty scorebook, without importing the result.
});

test('historical lineups use starters, not substitutes or the final batting order', () => {
  const data = { teams: { away: { battingOrder: [2], players: { ID2: { battingOrder: '101', person: { fullName: 'Pinch hitter' } }, ID1: { battingOrder: '100', person: { fullName: 'Starter' } }, ID3: { person: { fullName: 'Pitcher' } } } } } };
  const lineups = extractLineups(data);
  assert.equal(lineups[0][0], 'Starter'); assert.equal(lineups[0][1], 'Batter 2'); assert.equal(lineups[1].length, 9);
});

test('unposted lineups have nine usable placeholder slots per team', () => {
  assert.deepEqual(extractLineups({}).map(l => l.length), [9, 9]);
  assert.equal(extractLineups({})[1][8], 'Batter 9');
});

test('Jays filter is applied to the request and All MLB removes it', async () => {
  const oldFetch = globalThis.fetch, urls = [];
  globalThis.fetch = async url => { urls.push(url); return { ok: true, json: async () => ({ dates: [] }) }; };
  try {
    const client = new MLBClient();
    await client.schedule(2026, 3, 141); await client.schedule(2026, 3, null);
    assert.equal(new URL(urls[0]).searchParams.get('teamId'), '141');
    assert.equal(new URL(urls[1]).searchParams.has('teamId'), false);
    assert.equal(new URL(urls[1]).searchParams.get('endDate'), '2026-04-30');
  } finally { globalThis.fetch = oldFetch; }
});
