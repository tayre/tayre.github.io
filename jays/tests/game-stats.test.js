const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inningScorecard, boxscorePlayer, battingSlot, pitcherHand, playerGameSummary, gamePlayers } = require('../logic');

function game(line = {}) {
  return { teams: { away: { team: { abbreviation: 'TOR' }, score: 3 }, home: { team: { abbreviation: 'ATH' }, score: 1 } }, linescore: line };
}

test('inning scorecard shows all nine innings plus R/H/E, preserving unknowns and zeroes', () => {
  const result = inningScorecard(game({ currentInning: 2, innings: [
    { num: 1, away: { runs: 0 }, home: { runs: 1 } }, { num: 2, away: { runs: 3 }, home: {} }
  ], teams: { away: { runs: 3, hits: 5, errors: 0 }, home: { runs: 1, hits: 2, errors: 1 } } }));
  assert.deepEqual(result.headers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 'R', 'H', 'E']);
  assert.deepEqual(result.rows[0], ['TOR', 0, 3, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 3, 5, 0]);
  assert.equal(result.rows[1][2], undefined, 'unplayed home half is not zero');
});

test('scorecard supports shortened games, extra innings and missing linescore data', () => {
  assert.equal(inningScorecard(game({ scheduledInnings: 7 })).headers.length, 10);
  const extra = inningScorecard(game({ currentInning: 11, innings: [{ num: 10, away: { runs: 2 } }] }));
  assert.equal(extra.headers[10], 11);
  assert.equal(extra.rows[0][10], 2);
  assert.equal(extra.rows[0][11], undefined);
  assert.deepEqual(inningScorecard(game()).rows[0].slice(-3), [3, undefined, undefined]);
});

test('lookup uses the actual batter/pitcher id, not stale current-player flags', () => {
  const old = { person: { id: 10 }, gameStatus: { isCurrentPitcher: true } };
  const replacement = { person: { id: 20 } };
  const box = { teams: { home: { players: { ID10: old, ID20: replacement } } } };
  assert.equal(boxscorePlayer(box, 20), replacement);
  assert.equal(boxscorePlayer(box, 30), null);
  assert.equal(boxscorePlayer(null, 20), null);
  assert.equal(boxscorePlayer(box), null);
});

test('lineup slot handles starters and substitutes without confusing jersey numbers', () => {
  for (const [order, expected] of [['100', 1], ['703', 7], ['900', 9], [null, null], ['77', null], ['invalid', null], ['1000', null]]) {
    assert.equal(battingSlot({ battingOrder: order }), expected);
  }
  assert.equal(battingSlot({ jerseyNumber: '27' }), null);
});

test('pitcher handedness comes from pitchHand, never batting side', () => {
  assert.equal(pitcherHand({ person: { pitchHand: { code: 'L' }, batSide: { code: 'R' } } }), 'Throws left');
  assert.equal(pitcherHand({ person: { pitchHand: { code: 'R' } } }), 'Throws right');
  assert.equal(pitcherHand({ person: { pitchHand: { code: 'S' } } }), 'Switch-pitcher');
  assert.equal(pitcherHand({ person: { batSide: { code: 'R' } } }), '');
});

test('player summaries use game stats, preserve zero and never substitute season totals', () => {
  const player = { stats: { batting: { hits: 0, atBats: 0, rbi: 0, homeRuns: 0, baseOnBalls: 1 },
    pitching: { inningsPitched: '1.2', hits: 0, earnedRuns: 0, strikeOuts: 2, baseOnBalls: 1, numberOfPitches: 35 } },
    seasonStats: { batting: { hits: 150, homeRuns: 30 } } };
  assert.equal(playerGameSummary(player, 'batting'), '0-for-0 · 0 RBI · 0 HR · 1 BB');
  assert.equal(playerGameSummary(player, 'pitching'), '1.2 IP · 0 H · 0 ER · 2 K · 1 BB · 35 pitches');
  assert.equal(playerGameSummary({ seasonStats: player.seasonStats }, 'batting'), '');
  assert.equal(playerGameSummary({ stats: { batting: { hits: 1 } } }, 'batting'), '1-for-– · – RBI · – HR · – BB');
});

test('individual tables sort lineup replacements and omit unused bench and bullpen players', () => {
  const players = {
    ID1: { person: { id: 1 }, battingOrder: '700' },
    ID2: { person: { id: 2 }, battingOrder: '100' },
    ID3: { person: { id: 3 }, battingOrder: '701' },
    ID4: { person: { id: 4 }, stats: { batting: {} } },
    ID5: { person: { id: 5 }, stats: { pitching: { inningsPitched: '0.0' } } }
  };
  const team = { players, pitchers: [5] };
  assert.deepEqual(gamePlayers(team, 'batting').map(p => p.person.id), [2, 1, 3]);
  assert.deepEqual(gamePlayers(team, 'pitching').map(p => p.person.id), [5]);
  assert.deepEqual(gamePlayers(undefined, 'batting'), []);
  assert.deepEqual(gamePlayers(undefined, 'pitching'), []);
});
