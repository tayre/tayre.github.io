(() => {
  'use strict';

  const timezone = 'America/Toronto';
  const dateInput = document.querySelector('#date');
  const gamesElement = document.querySelector('#games');
  const updateElement = document.querySelector('#update');
  const refreshButton = document.querySelector('#refresh');
  const nextGameButton = document.querySelector('#next-game');
  let controller;
  let loading = false;
  let displayedDate;
  let lastUpdated;

  function today() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function statsTable(caption, headers, rows) {
    const wrap = element('div', 'table-scroll', '');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', caption);
    const table = element('table', 'stats-table', '');
    table.append(element('caption', '', caption));
    const head = element('thead', '', '');
    const header = element('tr', '', '');
    for (const label of ['Team', ...headers]) {
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

  function gameCard(game, boxscore) {
    const card = element('article', 'game', '');
    const line = game.linescore || {};
    const live = game.status.abstractGameState === 'Live';
    const state = game.status.detailedState;
    let status = state;
    if (live && state === 'In Progress' && line.currentInning) {
      status = `${line.inningState} ${line.currentInningOrdinal}`;
    } else if (state === 'Scheduled' || state === 'Pre-Game') {
      status = game.status.startTimeTBD ? 'Time TBD' : new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit'
      }).format(new Date(game.gameDate));
    }
    const top = element('div', 'game-top', '');
    top.append(element('span', `status${live ? ' live' : ''}`, status));
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
      details.append(element('p', '', `${line.balls ?? 0} balls · ${line.strikes ?? 0} strikes · ${line.outs ?? 0} outs`));
      const occupied = ['first', 'second', 'third'].filter(base => line.offense?.[base]);
      details.append(element('p', '', occupied.length ? `Runners on ${occupied.join(' & ')}` : 'Bases empty'));
      if (line.offense?.batter) details.append(element('p', '', `Batting: ${line.offense.batter.fullName}`));
      if (line.defense?.pitcher) details.append(element('p', '', `Pitching: ${line.defense.pitcher.fullName}`));
      card.append(details);
    }
    if (line.innings?.length) {
      const stats = element('section', 'game-stats', '');
      stats.append(element('h3', 'stats-heading', 'Game stats'));
      const sides = ['away', 'home'];
      const label = side => game.teams[side].team.abbreviation || game.teams[side].team.name;
      stats.append(statsTable('Runs by inning', line.innings.map(inning => inning.num),
        sides.map(side => [label(side), ...line.innings.map(inning => inning[side]?.runs)])));
      if (boxscore?.teams?.away?.teamStats && boxscore?.teams?.home?.teamStats) {
        stats.append(statsTable('Batting', ['HR', 'BB', 'SO', 'LOB'], sides.map(side => {
          const batting = boxscore.teams[side].teamStats.batting || {};
          return [label(side), batting.homeRuns, batting.baseOnBalls, batting.strikeOuts, line.teams?.[side]?.leftOnBase];
        })));
        stats.append(statsTable('Pitching', ['IP', 'ER', 'K', 'Pitches'], sides.map(side => {
          const pitching = boxscore.teams[side].teamStats.pitching || {};
          return [label(side), pitching.inningsPitched, pitching.earnedRuns, pitching.strikeOuts, pitching.numberOfPitches];
        })));
      } else {
        stats.append(element('p', 'stat-key', 'Batting and pitching stats unavailable. Retrying on the next refresh.'));
      }
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
      const params = new URLSearchParams({ sportId: '1', date, hydrate: 'linescore,team,probablePitcher' });
      const standingsDate = date < today() ? date : today();
      const standingsParams = new URLSearchParams({ leagueId: '103', season: standingsDate.slice(0, 4), date: standingsDate, standingsTypes: 'regularSeason', hydrate: 'team' });
      async function getData(path, key) {
        const response = await fetch(`https://statsapi.mlb.com/api/v1/${path}`, { signal: request.signal });
        if (!response.ok) throw new Error(`MLB returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data[key])) throw new Error('Invalid MLB response');
        return data;
      }
      const [schedule, standings] = await Promise.allSettled([
        getData(`schedule?${params}`, 'dates'),
        getData(`standings?${standingsParams}`, 'records')
      ]);
      if (controller !== request) return;
      const allGames = schedule.status === 'fulfilled'
        ? schedule.value.dates.flatMap(day => day.games || []).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate)) : null;
      window.JaysRace.render(standings.status === 'fulfilled' ? standings.value : null, allGames, standingsDate);
      if (!allGames) throw new Error('Scores unavailable');
      const games = allGames.filter(game => game.teams.away.team.id === 141 || game.teams.home.team.id === 141);
      const boxes = await Promise.all(games.map(async game => {
        if (!game.linescore?.innings?.length) return null;
        try {
          const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`, { signal: request.signal });
          return response.ok ? await response.json() : null;
        } catch {
          // A box score outage must not hide the main score.
          return null;
        }
      }));
      if (controller !== request) return;
      const cards = games.map((game, index) => gameCard(game, boxes[index]));
      // Avoid announcing unchanged scores to screen readers on every poll.
      const content = document.createElement('div');
      content.append(...(cards.length ? cards : [element('p', 'empty', 'No Blue Jays game scheduled for this day. Check another date.')]));
      if (gamesElement.innerHTML !== content.innerHTML) {
        gamesElement.replaceChildren(...content.childNodes);
      }
      displayedDate = date;
      lastUpdated = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit'
      }).format(new Date());
      updateElement.textContent = `Scores updated ${lastUpdated}${standings.status === 'rejected' ? ' · Standings unavailable' : ''}`;
    } catch (error) {
      if (controller !== request) return;
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

  function moveDate(offset) {
    const date = new Date(`${dateInput.value || today()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    dateInput.value = date.toISOString().slice(0, 10);
    refresh();
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
        await refresh();
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

  dateInput.value = today();
  dateInput.addEventListener('change', refresh);
  document.querySelector('#previous').addEventListener('click', () => moveDate(-1));
  document.querySelector('#next').addEventListener('click', () => moveDate(1));
  document.querySelector('#today').addEventListener('click', () => { dateInput.value = today(); refresh(); });
  refreshButton.addEventListener('click', refresh);
  nextGameButton.addEventListener('click', showNextGame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', refresh);
  setInterval(() => { if (!document.hidden && !loading) refresh(); }, 20000);
  refresh();
})();
