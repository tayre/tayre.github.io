'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  todayInZone, gameStatusLabel, isImmutable, pollTier, nextDelay,
  gameOutcome, contenderCount, parseWildCardStandings, wildCardSummary
} = require('../logic.js');

function game(overrides = {}) {
  return {
    status: { abstractGameState: 'Final', detailedState: 'Final' },
    linescore: {},
    gameDate: '2026-06-01T23:07:00Z',
    ...overrides
  };
}

test('todayInZone formats the date in the given timezone, not local/UTC', () => {
  // 2:30am UTC on Jan 2 is still Jan 1 in Toronto (UTC-5 in winter).
  const now = new Date('2026-01-02T02:30:00Z');
  assert.equal(todayInZone('America/Toronto', now), '2026-01-01');
  assert.equal(todayInZone('UTC', now), '2026-01-02');
});

test('gameStatusLabel shows the live inning when a game is in progress', () => {
  const g = game({
    status: { abstractGameState: 'Live', detailedState: 'In Progress' },
    linescore: { currentInning: 7, inningState: 'Bottom', currentInningOrdinal: '7th' }
  });
  assert.equal(gameStatusLabel(g, 'America/Toronto'), 'Bottom 7th');
});

test('gameStatusLabel shows a formatted start time for a scheduled game', () => {
  const g = game({ status: { abstractGameState: 'Preview', detailedState: 'Scheduled' } });
  const label = gameStatusLabel(g, 'America/Toronto');
  assert.match(label, /\d{1,2}:\d{2}\s?(a\.?m\.?|p\.?m\.?)/i);
});

test('gameStatusLabel shows Time TBD when MLB has not announced a start time', () => {
  const g = game({ status: { abstractGameState: 'Preview', detailedState: 'Scheduled', startTimeTBD: true } });
  assert.equal(gameStatusLabel(g, 'America/Toronto'), 'Time TBD');
});

test('gameStatusLabel passes through the detailed state for anything else (e.g. Final, Postponed)', () => {
  assert.equal(gameStatusLabel(game({ status: { abstractGameState: 'Final', detailedState: 'Completed Early: Rain' } }), 'America/Toronto'),
    'Completed Early: Rain');
});

test('isImmutable is true only when every game is Final', () => {
  assert.equal(isImmutable([game()]), true);
  assert.equal(isImmutable([game(), game({ status: { abstractGameState: 'Live' } })]), false);
  assert.equal(isImmutable([]), false, 'no games means we cannot be sure, so do not cache');
  assert.equal(isImmutable(null), false);
});

test('pollTier prioritizes Live over Preview, and falls back to settled', () => {
  assert.equal(pollTier([]), 'settled');
  assert.equal(pollTier([game({ status: { abstractGameState: 'Final' } })]), 'settled');
  assert.equal(pollTier([game({ status: { abstractGameState: 'Preview' } })]), 'upcoming');
  assert.equal(pollTier([
    game({ status: { abstractGameState: 'Preview' } }),
    game({ status: { abstractGameState: 'Live' } })
  ]), 'live');
});

test('pollTier stays at upcoming (not settled) when the Jays are done but another contender is still live', () => {
  const jaysGame = [game({ status: { abstractGameState: 'Final' } })];
  const wholeSlate = [
    jaysGame[0],
    game({ status: { abstractGameState: 'Live' } })
  ];
  assert.equal(pollTier(jaysGame, wholeSlate), 'upcoming');
  assert.equal(pollTier(jaysGame, jaysGame), 'settled', 'no live game elsewhere means fully settled');
  assert.equal(pollTier(jaysGame), 'settled', 'missing context defaults to settled, not a crash');
});

test('nextDelay matches the tier when there have been no failures', () => {
  assert.equal(nextDelay({ tier: 'live', consecutiveFailures: 0 }), 20_000);
  assert.equal(nextDelay({ tier: 'upcoming', consecutiveFailures: 0 }), 60_000);
  assert.equal(nextDelay({ tier: 'settled', consecutiveFailures: 0 }), 300_000);
  assert.equal(nextDelay(), 300_000, 'defaults to the safe, slow tier');
});

test('nextDelay backs off exponentially on repeated failures, capped at 5 minutes', () => {
  assert.equal(nextDelay({ tier: 'live', consecutiveFailures: 1 }), 20_000);
  assert.equal(nextDelay({ tier: 'live', consecutiveFailures: 2 }), 40_000);
  assert.equal(nextDelay({ tier: 'live', consecutiveFailures: 3 }), 80_000);
  assert.equal(nextDelay({ tier: 'live', consecutiveFailures: 6 }), 300_000, 'never exceeds the cap');
});

test('gameOutcome labels a Final game W/L/T from our own perspective, and nothing otherwise', () => {
  assert.equal(gameOutcome(9, 2, 'Final'), 'W ');
  assert.equal(gameOutcome(2, 9, 'Final'), 'L ');
  assert.equal(gameOutcome(4, 4, 'Final'), 'T ');
  assert.equal(gameOutcome(9, 2, 'Live'), '', 'no outcome until the game is Final');
  assert.equal(gameOutcome(null, 2, 'Final'), '', 'missing scores means no outcome');
});

test('contenderCount always shows at least 6 rows, and enough to include our own rank', () => {
  assert.equal(contenderCount(2), 6);
  assert.equal(contenderCount(9), 10);
  assert.equal(contenderCount(NaN), 6, 'unranked team still gets the default 6');
});

function standingsRecord(overrides = {}) {
  return {
    team: { id: 999, name: 'Placeholder', teamName: 'Placeholder' },
    divisionLeader: false, divisionRank: '2', wildCardRank: '5',
    wins: 70, losses: 60, wildCardGamesBack: '3.0', wildCardEliminationNumber: '10',
    ...overrides
  };
}

test('parseWildCardStandings excludes division leaders and sorts by Wild Card rank', () => {
  const data = {
    records: [{
      teamRecords: [
        standingsRecord({ team: { id: 1, name: 'Leader' }, divisionLeader: true, divisionRank: '1' }),
        standingsRecord({ team: { id: 141, name: 'Blue Jays', teamName: 'Blue Jays' }, wildCardRank: '4' }),
        standingsRecord({ team: { id: 2, name: 'Rival' }, wildCardRank: '1' })
      ]
    }]
  };
  const { records, jays, rank } = parseWildCardStandings(data);
  assert.deepEqual(records.map(r => r.team.id), [2, 141]);
  assert.equal(jays.team.name, 'Blue Jays');
  assert.equal(rank, 4);
});

test('wildCardSummary: no data at all', () => {
  assert.equal(wildCardSummary({ jays: undefined, records: [] }), 'No Wild Card standings available for this date.');
});

test('wildCardSummary: division leader takes priority over Wild Card rank', () => {
  const jays = standingsRecord({ divisionLeader: true, divisionRank: '1' });
  assert.equal(wildCardSummary({ jays, records: [] }), 'Toronto leads the division.');
});

test('wildCardSummary: eliminated', () => {
  const jays = standingsRecord({ wildCardEliminationNumber: 'E' });
  assert.equal(wildCardSummary({ jays, records: [] }), 'Toronto is eliminated from the Wild Card race.');
});

test('wildCardSummary: holding a playoff spot', () => {
  const jays = standingsRecord({ wildCardRank: '2' });
  assert.equal(wildCardSummary({ jays, records: [] }), 'Toronto holds Wild Card spot 2.');
});

test('wildCardSummary: tied at the cutoff', () => {
  const jays = standingsRecord({ wildCardRank: '4', wildCardGamesBack: '-' });
  assert.equal(wildCardSummary({ jays, records: [] }), 'Toronto is tied at the cutoff · MLB rank 4.');
});

test('wildCardSummary: chasing the team holding the final spot', () => {
  const jays = standingsRecord({ wildCardRank: '4', wildCardGamesBack: '2.5' });
  const cutoffTeam = standingsRecord({ team: { id: 3, name: 'Cutoff Co', teamName: 'Cutoff' }, wildCardRank: '3' });
  assert.equal(
    wildCardSummary({ jays, records: [cutoffTeam] }),
    'Toronto is 2.5 games back of the final spot. Chasing Cutoff.'
  );
});
