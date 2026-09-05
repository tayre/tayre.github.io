// Pure, DOM-free helpers shared by app.js, race.js, and the unit tests.
// No dependencies: works as a plain <script> (exposes window.JaysLogic) and
// as a CommonJS module for `node --test` (module.exports).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JaysLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Today's date, as YYYY-MM-DD, in the given IANA timezone.
  function todayInZone(timezone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  // Status text for a game card: live inning, scheduled start time, or the
  // detailed state MLB reports (Final, Postponed, etc.) as a fallback.
  function gameStatusLabel(game, timezone) {
    const line = game.linescore || {};
    const live = game.status.abstractGameState === 'Live';
    const state = game.status.detailedState;
    if (live && state === 'In Progress' && line.currentInning) {
      return `${line.inningState} ${line.currentInningOrdinal}`;
    }
    if (state === 'Scheduled' || state === 'Pre-Game') {
      return game.status.startTimeTBD ? 'Time TBD' : new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit'
      }).format(new Date(game.gameDate));
    }
    return state;
  }

  // A day's games are safe to cache forever once every game on it is Final.
  // Anything less certain (Live, Preview, Postponed) must keep polling.
  function isImmutable(games) {
    return Array.isArray(games) && games.length > 0
      && games.every(game => game.status?.abstractGameState === 'Final');
  }

  // How urgently we need fresh data. Primarily driven by the Blue Jays'
  // game(s) for the displayed date, mirroring how a person would actually
  // check this page. If the Jays are done but other Wild Card contenders
  // (allGames, the full day's slate) are still live, stay at a moderate
  // cadence rather than dropping straight to the slow "settled" tier —
  // this page tracks the whole race, not just Toronto's own score.
  function pollTier(games, allGames) {
    if (Array.isArray(games) && games.length > 0) {
      if (games.some(game => game.status?.abstractGameState === 'Live')) return 'live';
      if (games.some(game => game.status?.abstractGameState === 'Preview')) return 'upcoming';
    }
    if (Array.isArray(allGames) && allGames.some(game => game.status?.abstractGameState === 'Live')) return 'upcoming';
    return 'settled';
  }

  const TIER_DELAYS = { live: 20_000, upcoming: 60_000, settled: 300_000 };
  const BASE_RETRY = 20_000;
  const MAX_DELAY = 300_000;

  // Delay before the next automatic poll. Consecutive failures back off
  // exponentially (20s, 40s, 80s, 160s, capped at 5 minutes) regardless of
  // tier, since a failing API isn't telling us anything about game state.
  function nextDelay({ tier = 'settled', consecutiveFailures = 0 } = {}) {
    if (consecutiveFailures > 0) {
      const backoff = BASE_RETRY * 2 ** Math.min(consecutiveFailures - 1, 4);
      return Math.min(backoff, MAX_DELAY);
    }
    return TIER_DELAYS[tier] ?? TIER_DELAYS.settled;
  }

  // 'W '/'L '/'T ' prefix for a finished game, '' otherwise (matches the
  // race table's compact result strings, e.g. "W 9–2 @ KC").
  function gameOutcome(usScore, themScore, state) {
    if (state !== 'Final' || usScore == null || themScore == null) return '';
    if (usScore > themScore) return 'W ';
    if (usScore < themScore) return 'L ';
    return 'T ';
  }

  // Always show at least 6 rows, and always enough to include Toronto's own
  // rank, so the team never falls into the collapsed "Rest of the AL".
  function contenderCount(rank) {
    return Math.max(6, Number.isFinite(rank) ? rank + 1 : 6);
  }

  // Shape the raw MLB standings payload into the Wild Card contenders list
  // (division leaders excluded), plus Toronto's own record and rank.
  function parseWildCardStandings(data) {
    const all = data.records.flatMap(record => record.teamRecords || []);
    const records = all
      .filter(record => !record.divisionLeader && Number(record.divisionRank) !== 1 && Number(record.wildCardRank) > 0)
      .sort((a, b) => Number(a.wildCardRank) - Number(b.wildCardRank));
    const jays = all.find(record => record.team.id === 141);
    return { records, jays, rank: Number(jays?.wildCardRank) };
  }

  // The one-line Wild Card status sentence shown above the standings table.
  function wildCardSummary({ jays, records }) {
    if (!jays) return 'No Wild Card standings available for this date.';
    const rank = Number(jays.wildCardRank);
    if (jays.divisionLeader || Number(jays.divisionRank) === 1) return 'Toronto leads the division.';
    if (!(rank > 0)) return 'No Wild Card standings available for this date.';
    if (jays.wildCardEliminationNumber === 'E') return 'Toronto is eliminated from the Wild Card race.';
    if (rank <= 3) return `Toronto holds Wild Card spot ${rank}.`;
    const gap = jays.wildCardGamesBack;
    const tied = gap === '-' || Number(gap) === 0;
    let summary = tied ? `Toronto is tied at the cutoff · MLB rank ${rank}.`
      : `Toronto is ${gap ?? '–'} games back of the final spot.`;
    const cutoff = records.find(record => Number(record.wildCardRank) === 3);
    if (cutoff) summary += ` Chasing ${cutoff.team.teamName || cutoff.team.name}.`;
    return summary;
  }

  return {
    todayInZone, gameStatusLabel, isImmutable, pollTier, nextDelay,
    gameOutcome, contenderCount, parseWildCardStandings, wildCardSummary,
    TIER_DELAYS, BASE_RETRY, MAX_DELAY
  };
});
