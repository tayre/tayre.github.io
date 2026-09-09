(() => {
  'use strict';
  let expanded = false;
  function node(tag, className, text = '') {
    const result = document.createElement(tag);
    result.className = className;
    result.textContent = text;
    return result;
  }

  function gameResult(game, teamId) {
    const away = game.teams.away;
    const home = game.teams.home;
    const isAway = away.team.id === teamId;
    const us = isAway ? away : home;
    const them = isAway ? home : away;
    const opponent = `${isAway ? '@' : 'vs'} ${them.team.abbreviation || them.team.name}`;
    const state = game.status.abstractGameState;
    const result = node('div', 'race-result');
    let status = game.status.detailedState;
    if (state === 'Preview') {
      result.append(node('span', '', opponent));
      if (status === 'Scheduled' || status === 'Pre-Game') {
        status = game.status.startTimeTBD ? 'Time TBD' : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit'
        }).format(new Date(game.gameDate));
      }
    } else {
      const outcome = window.JaysLogic.gameOutcome(us.score, them.score, state);
      result.append(node('span', '', `${outcome}${us.score ?? '–'}–${them.score ?? '–'} ${opponent}`));
      if (state === 'Final') status = 'Final';
      if (state === 'Live' && status === 'In Progress' && game.linescore?.currentInning) {
        status = `${game.linescore.inningState} ${game.linescore.currentInningOrdinal}`;
      }
    }
    const gameNumber = game.doubleHeader && game.doubleHeader !== 'N' ? `G${game.gameNumber} · ` : '';
    result.append(node('span', `race-game-status${state === 'Live' ? ' in-progress' : ''}`, `${gameNumber}${status}`));
    const bug = window.JaysScorebug(game);
    if (bug) {
      const text = node('div', 'race-result-text');
      text.append(...result.childNodes);
      result.classList.add('has-scorebug');
      result.append(text, bug);
    }
    return result;
  }

  function table(records, games, caption) {
    const result = node('table', 'race-table');
    const label = node('caption', 'sr-only', caption);
    const head = node('thead', '');
    const heading = node('tr', '');
    for (const text of ['Team', 'W–L', 'GB', 'Game']) {
      const cell = node('th', '', text);
      cell.scope = 'col';
      heading.append(cell);
    }
    head.append(heading);
    const body = node('tbody', '');
    for (const record of records) {
      const rank = Number(record.wildCardRank);
      const row = node('tr', `${record.team.id === 141 ? 'toronto ' : ''}${rank === 3 ? 'cutoff' : ''}`);
      const team = node('th', 'race-team');
      team.scope = 'row';
      const identity = node('span', 'race-identity');
      identity.append(node('span', 'race-rank', record.divisionLeader || Number(record.divisionRank) === 1 || !(rank > 0) ? '–' : rank));
      const logo = document.createElement('img');
      logo.src = `logos/${record.team.id}.svg`;
      logo.alt = '';
      logo.width = 22;
      logo.height = 22;
      logo.loading = 'lazy';
      logo.decoding = 'async';
      logo.addEventListener('error', () => { logo.hidden = true; }, { once: true });
      const name = node('abbr', '', record.team.abbreviation || record.team.name);
      name.title = record.team.name;
      identity.append(logo, name);
      team.append(identity);
      const gameCell = node('td', 'race-games');
      const fixtures = games?.filter(game => game.teams.away.team.id === record.team.id || game.teams.home.team.id === record.team.id);
      if (!games) gameCell.append(node('span', 'race-game-status', 'Scores unavailable'));
      else if (!fixtures.length) gameCell.append(node('span', 'race-game-status', 'Off day'));
      else gameCell.append(...fixtures.map(game => gameResult(game, record.team.id)));
      row.append(team, node('td', '', `${record.wins}–${record.losses}`), node('td', '', record.wildCardGamesBack ?? '–'), gameCell);
      body.append(row);
    }
    result.append(label, head, body);
    return result;
  }

  function render(data, games) {
    const target = document.querySelector('#race');
    const content = node('div', '');
    content.append(node('h2', '', 'AL Wild Card'));
    if (!data) {
      content.append(node('p', 'race-note error', 'Standings unavailable. Retrying on the next refresh.'));
    } else {
      const { records, jays } = window.JaysLogic.parseWildCardStandings(data);
      content.append(node('p', 'race-summary', window.JaysLogic.wildCardSummary({ jays, records })));
      if (records.length) {
        const torontoIndex = records.findIndex(record => record.team.id === 141);
        const visible = torontoIndex >= 0 ? records.slice(0, torontoIndex + 1) : jays ? [jays] : records;
        const remaining = torontoIndex >= 0 ? records.slice(torontoIndex + 1) : jays ? records : [];
        content.append(table(visible, games, 'Toronto and teams ahead in the AL Wild Card race'));
        if (remaining.length) {
          const more = node('details', 'rest-of-race');
          more.open = expanded;
          const summary = node('summary', '', 'Rest of the AL');
          summary.id = 'rest-of-race-toggle';
          more.append(summary, table(remaining, games, 'Remaining AL Wild Card teams'));
          more.addEventListener('toggle', () => {
            if (more.isConnected) expanded = more.open;
          });
          content.append(more);
        }
      }
    }
    if (target.innerHTML !== content.innerHTML) {
      const restoreFocus = document.activeElement?.id === 'rest-of-race-toggle';
      target.replaceChildren(...content.childNodes);
      if (restoreFocus) document.getElementById('rest-of-race-toggle')?.focus({ preventScroll: true });
    }
  }

  window.JaysRace = { render };
})();
