(() => {
  'use strict';

  const timezone = 'America/Toronto';
  const dateInput = document.querySelector('#date');
  const gamesElement = document.querySelector('#games');
  const updateElement = document.querySelector('#update');
  const refreshButton = document.querySelector('#refresh');
  const nextGameButton = document.querySelector('#next-game');
  const celebration = window.JaysCelebration?.();
  let controller;
  let loading = false;
  let displayedDate;
  let lastUpdated;
  let pollTimer;
  let lastTier = 'settled';
  let consecutiveFailures = 0;
  // Past days where every game finished are immutable: cache them so
  // scrubbing through dates (or leaving the tab open) costs no network.
  const dateCache = new Map();
  const boxscoreCache = new Map();
  const recentBoxscores = new Map();

  function today() {
    return JaysLogic.todayInZone(timezone);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function statsTable(caption, headers, rows, { firstHeader = 'Team', className = '' } = {}) {
    const wrap = element('div', 'table-scroll', '');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', caption);
    const table = element('table', `stats-table ${className}`.trim(), '');
    table.append(element('caption', '', caption));
    const head = element('thead', '', '');
    const header = element('tr', '', '');
    for (const label of [firstHeader, ...headers]) {
      const cell = element('th', '', label);
      cell.scope = 'col';
      header.append(cell);
    }
    head.append(header);
    const body = element('tbody', '', '');
    for (const [team, ...values] of rows) {
      const row = element('tr', '', '');
      const label = element('th', '', team);
      label.scope = 'row';
      row.append(label, ...values.map(value => element('td', '', value ?? '–')));
      body.append(row);
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
  }

  function matchupPlayer(role, reference, boxscore, order) {
    const player = JaysLogic.boxscorePlayer(boxscore, reference.id);
    const group = element('div', 'matchup-player', '');
    const name = element('p', 'matchup-name', '');
    name.append(element('span', 'matchup-label', `${role}: `), element('strong', '', reference.fullName));
    const batting = role === 'Batting';
    const slot = Number.isInteger(order) && order >= 1 && order <= 9 ? order : JaysLogic.battingSlot(player);
    const meta = batting
      ? [slot && `#${slot} in order`, player?.position?.abbreviation].filter(Boolean).join(' · ')
      : JaysLogic.pitcherHand(player);
    if (meta) name.append(element('span', 'matchup-meta', ` · ${meta}`));
    group.append(name);
    const summary = JaysLogic.playerGameSummary(player, batting ? 'batting' : 'pitching');
    if (summary) group.append(element('p', 'player-game-summary', `This game: ${summary}`));
    return group;
  }

  function playerStats(team, name) {
    const section = element('section', 'player-stats', '');
    section.setAttribute('aria-label', `${name} player stats`);
    section.append(element('h4', 'player-team-heading', name));
    const columns = {
      batting: [['AB', 'R', 'H', 'RBI', 'HR', 'BB', 'K'], ['atBats', 'runs', 'hits', 'rbi', 'homeRuns', 'baseOnBalls', 'strikeOuts']],
      pitching: [['IP', 'H', 'R', 'ER', 'BB', 'K', 'Pitches'], ['inningsPitched', 'hits', 'runs', 'earnedRuns', 'baseOnBalls', 'strikeOuts', 'numberOfPitches']]
    };
    for (const kind of ['batting', 'pitching']) {
      const players = JaysLogic.gamePlayers(team, kind);
      if (!players.length) continue;
      const [headers, keys] = columns[kind];
      const rows = players.map(player => {
        const slot = JaysLogic.battingSlot(player);
        const meta = kind === 'batting' ? player.position?.abbreviation : JaysLogic.pitcherHand(player);
        const label = `${kind === 'batting' && slot ? `${slot}. ` : ''}${player.person.fullName}${meta ? ` · ${meta}` : ''}`;
        return [label, ...keys.map(key => player.stats?.[kind]?.[key])];
      });
      const caption = kind === 'batting' ? 'Batting' : 'Pitching';
      const table = statsTable(caption, headers, rows, { firstHeader: 'Player', className: 'player-table' });
      table.setAttribute('aria-label', `${name} ${caption.toLowerCase()} stats`);
      section.append(table);
    }
    return section.childElementCount > 1 ? section : null;
  }

  function gameCard(game, boxscore) {
    const card = element('article', 'game', '');
    const line = game.linescore || {};
    const live = game.status.abstractGameState === 'Live';
    const status = JaysLogic.gameStatusLabel(game, timezone);
    const top = element('div', 'game-top', '');
    top.append(element('span', `status${live ? ' live' : ''}`, status));
    if (JaysLogic.isJaysWin(game)) top.append(element('span', 'win-label', 'Jays win!'));
    if (game.doubleHeader && game.doubleHeader !== 'N') {
      top.append(element('span', 'game-number', `Game ${game.gameNumber}`));
    }
    card.append(top);

    for (const side of ['away', 'home']) {
      const entry = game.teams[side];
      const row = element('div', `team${entry.team.id === 141 ? ' jays' : ''}`, '');
      const badge = element('span', 'badge', '');
      const logo = document.createElement('img');
      logo.src = `logos/${entry.team.id}.svg`;
      logo.alt = '';
      logo.width = 36;
      logo.height = 36;
      logo.decoding = 'async';
      logo.addEventListener('error', () => { badge.textContent = entry.team.abbreviation || entry.team.name; }, { once: true });
      badge.append(logo);
      row.append(badge);
      const name = element('div', 'team-name', entry.team.teamName || entry.team.name);
      const record = entry.leagueRecord;
      name.append(element('span', 'location', `${side === 'away' ? 'AWAY' : 'HOME'}${record ? ` · ${record.wins}–${record.losses}` : ''}`));
      if (line.teams?.[side]) {
        const totals = line.teams[side];
        name.append(element('span', 'team-totals', `${totals.hits ?? '–'} hits · ${totals.errors ?? '–'} errors`));
      }
      row.append(name, element('span', 'score', entry.score ?? '–'));
      card.append(row);
    }

    if (game.status.abstractGameState === 'Preview') {
      const pitchers = element('div', 'details', '');
      pitchers.append(element('p', 'probable-label', 'Probable pitchers'));
      for (const side of ['away', 'home']) {
        const entry = game.teams[side];
        pitchers.append(element('p', '', `${entry.team.abbreviation || entry.team.name}: ${entry.probablePitcher?.fullName || 'TBD'}`));
      }
      card.append(pitchers);
    }

    if (live && line.currentInning) {
      const details = element('div', 'details', '');
      if (line.offense?.batter) details.append(matchupPlayer('Batting', line.offense.batter, boxscore, line.offense.battingOrder));
      if (line.defense?.pitcher) details.append(matchupPlayer('Pitching', line.defense.pitcher, boxscore));
      const bug = window.JaysScorebug(game);
      if (bug) {
        const text = element('div', 'live-detail-text', '');
        text.append(...details.childNodes);
        details.classList.add('has-scorebug');
        details.append(text, bug);
      }
      card.append(details);
    }
    if (line.innings?.length || live || game.status.abstractGameState === 'Final') {
      const stats = element('section', 'game-stats', '');
      stats.append(element('h3', 'stats-heading', 'Game stats'));
      const sides = ['away', 'home'];
      const scorecard = JaysLogic.inningScorecard(game);
      stats.append(statsTable('Inning by inning', scorecard.headers, scorecard.rows, { className: 'inning-table' }));
      let hasPlayers = false;
      for (const side of sides) {
        const players = playerStats(boxscore?.teams?.[side], game.teams[side].team.name);
        if (players) { stats.append(players); hasPlayers = true; }
      }
      if (!hasPlayers) stats.append(element('p', 'stat-key', 'Player stats will appear when available.'));
      card.append(stats);
    }
    card.append(element('p', 'venue', game.venue?.name || ''));
    return card;
  }

  async function refresh() {
    const date = dateInput.value;
    if (!date || !dateInput.validity.valid) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading = true;
    refreshButton.disabled = true;
    updateElement.className = '';
    updateElement.textContent = 'Updating…';
    if (displayedDate !== date) {
      celebration?.stop();
      gamesElement.replaceChildren(element('p', 'empty', 'Loading the scoreboard…'));
      document.querySelector('#race').replaceChildren(element('p', 'empty', 'Loading the Wild Card race…'));
      displayedDate = undefined;
      lastUpdated = undefined;
    }
    document.querySelector('#day-label').textContent = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }).format(new Date(`${date}T12:00:00Z`));
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      const standingsDate = date < today() ? date : today();
      let allGames, standings;
      const cached = dateCache.get(date);
      if (cached) {
        ({ allGames, standings } = cached);
      } else {
        const params = new URLSearchParams({ sportId: '1', date, hydrate: 'linescore,team,probablePitcher' });
        const standingsParams = new URLSearchParams({ leagueId: '103', season: standingsDate.slice(0, 4), date: standingsDate, standingsTypes: 'regularSeason', hydrate: 'team' });
        async function getData(path, key) {
          const response = await fetch(`https://statsapi.mlb.com/api/v1/${path}`, { signal: request.signal });
          if (!response.ok) throw new Error(`MLB returned ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data[key])) throw new Error('Invalid MLB response');
          return data;
        }
        const [schedule, standingsResult] = await Promise.allSettled([
          getData(`schedule?${params}`, 'dates'),
          getData(`standings?${standingsParams}`, 'records')
        ]);
        if (controller !== request) return;
        allGames = schedule.status === 'fulfilled'
          ? schedule.value.dates.flatMap(day => day.games || []).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate)) : null;
        standings = standingsResult.status === 'fulfilled' ? standingsResult.value : null;
        // A past day where every game finished will never change again.
        if (allGames && standings && date < today() && JaysLogic.isImmutable(allGames)) {
          dateCache.set(date, { allGames, standings });
        }
      }
      window.JaysRace.render(standings, allGames);
      if (!allGames) throw new Error('Scores unavailable');
      const games = allGames.filter(game => game.teams.away.team.id === 141 || game.teams.home.team.id === 141);
      function renderGames(boxes = []) {
        const cards = games.map((game, index) => gameCard(game, boxes[index]));
        // Avoid announcing unchanged scores to screen readers on every poll.
        const content = document.createElement('div');
        content.append(...(cards.length ? cards : [element('p', 'empty', 'No Blue Jays game scheduled for this day. Check another date.')]));
        if (gamesElement.innerHTML !== content.innerHTML) {
          gamesElement.replaceChildren(...content.childNodes);
        }
      }

      // The schedule and standings are the page's primary information. Paint
      // them immediately; detailed batting and pitching totals can arrive a
      // moment later without delaying the first useful view.
      renderGames(games.map(game => boxscoreCache.get(game.gamePk) || recentBoxscores.get(game.gamePk)));
      celebration?.show(games);
      displayedDate = date;
      lastUpdated = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit'
      }).format(new Date());
      updateElement.textContent = `Scores updated ${lastUpdated}${!standings ? ' · Standings unavailable' : ''}`;
      lastTier = JaysLogic.pollTier(games, allGames);
      consecutiveFailures = 0;

      void (async () => {
        const boxes = await Promise.all(games.map(async game => {
          if (!game.linescore?.innings?.length && !['Live', 'Final'].includes(game.status.abstractGameState)) return null;
          const cachedBox = boxscoreCache.get(game.gamePk);
          if (cachedBox) return cachedBox;
          try {
            // Hydrate handedness in the same request; omit unused biography
            // and stat fields to keep this secondary payload small.
            const params = new URLSearchParams({ hydrate: 'person', fields: 'teams,away,home,players,person,id,fullName,pitchHand,code,description,position,abbreviation,battingOrder,pitchers,stats,batting,pitching,atBats,runs,hits,rbi,homeRuns,baseOnBalls,strikeOuts,plateAppearances,inningsPitched,earnedRuns,numberOfPitches' });
            const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore?${params}`, { signal: request.signal });
            if (!response.ok) return null;
            const box = await response.json();
            recentBoxscores.set(game.gamePk, box);
            if (recentBoxscores.size > 20) recentBoxscores.delete(recentBoxscores.keys().next().value);
            // A finished game's box score is permanent; skip refetching it.
            if (game.status.abstractGameState === 'Final') boxscoreCache.set(game.gamePk, box);
            return box;
          } catch {
            // A box score outage must not hide the main score.
            return null;
          }
        }));
        if (controller === request && dateInput.value === date) {
          renderGames(boxes.map((box, index) => box || recentBoxscores.get(games[index].gamePk)));
        }
      })();
    } catch (error) {
      if (controller !== request) return;
      consecutiveFailures += 1;
      updateElement.className = 'error';
      updateElement.textContent = lastUpdated
        ? `Connection failed. Showing scores from ${lastUpdated}. Retrying automatically.`
        : 'Couldn’t reach MLB. Retrying automatically, or tap Refresh.';
      if (!displayedDate) gamesElement.replaceChildren(element('p', 'empty', 'Scores are unavailable right now.'));
    } finally {
      clearTimeout(timeout);
      if (controller === request) {
        loading = false;
        refreshButton.disabled = false;
      }
    }
  }

  // Runs one refresh, then schedules the next one at a cadence that matches
  // how urgent fresh data actually is: fast while a game is live, slow once
  // the day is settled or MLB is unreachable. Keeps us well clear of any
  // rate limiting without ever falling behind a live game.
  async function cycle() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    await refresh();
    pollTimer = setTimeout(cycle, JaysLogic.nextDelay({ tier: lastTier, consecutiveFailures }));
  }

  function moveDate(offset) {
    const date = new Date(`${dateInput.value || today()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    dateInput.value = date.toISOString().slice(0, 10);
    cycle();
  }

  async function showNextGame() {
    nextGameButton.disabled = true;
    nextGameButton.textContent = 'Finding…';
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 12000);
    const originalDate = dateInput.value;
    try {
      const startDate = today();
      const end = new Date(`${startDate}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 370);
      const params = new URLSearchParams({
        sportId: '1', teamId: '141', startDate, endDate: end.toISOString().slice(0, 10),
        fields: 'dates,games,gameDate,officialDate,status,abstractGameState,detailedState'
      });
      const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error('Schedule unavailable');
      const data = await response.json();
      const next = data.dates.flatMap(day => day.games || [])
        .filter(game => game.status.abstractGameState === 'Preview' && !/Postponed|Cancelled|Suspended/i.test(game.status.detailedState))
        .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0];
      // Respect a date the user selected while the lookup was in flight.
      if (dateInput.value !== originalDate) return;
      if (next) {
        dateInput.value = next.officialDate;
        await cycle();
      } else {
        updateElement.textContent = 'No upcoming game announced in the next year.';
      }
    } catch {
      if (dateInput.value === originalDate) {
        updateElement.className = 'error';
        updateElement.textContent = 'Couldn’t find the next game. Try Next game again.';
      }
    } finally {
      clearTimeout(timeout);
      nextGameButton.disabled = false;
      nextGameButton.textContent = 'Next game';
    }
  }

  function showTodayOnLoad() {
    dateInput.value = today();
  }

  showTodayOnLoad();
  dateInput.addEventListener('change', cycle);
  document.querySelector('#previous').addEventListener('click', () => moveDate(-1));
  document.querySelector('#next').addEventListener('click', () => moveDate(1));
  document.querySelector('#today').addEventListener('click', () => { dateInput.value = today(); cycle(); });
  refreshButton.addEventListener('click', cycle);
  nextGameButton.addEventListener('click', showNextGame);
  // No fixed interval: cycle() reschedules itself at whatever cadence the
  // game state calls for, and stops entirely while the tab is hidden.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cycle(); });
  // A browser may restore this page from its back-forward cache without
  // running the script again. Treat that return like a fresh visit so the
  // dashboard never opens on a previously selected day.
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      showTodayOnLoad();
      cycle();
    }
  });
  window.addEventListener('online', cycle);
  cycle();
})();
