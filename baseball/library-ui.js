import { newGame, derive } from './engine.js';
import { identifyGame } from './storage.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date();
const dateText = iso => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const shortDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const visibleGame = game => game.mlb || game.events.length || game.teams[0] !== 'Visitors' || game.teams[1] !== 'Home';

export function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportGame(game) {
  const state = derive(game);
  downloadJSON({ ...game, summary: { runs: state.runs.map(r => r.reduce((a, b) => a + b, 0)), hits: state.hits, errors: state.errors }, journal: state.log }, `fieldnotes-${game.dateISO || 'game'}-${game.teams.join('-').replace(/[^a-z0-9-]/gi, '-')}.json`);
}

export async function setupLibrary({ repository, mlb, getGame, activate, persist, refresh, notify }) {
  let preferences = await repository.getPreferences();
  let scope = 'favorite', scheduleGames = [], teams = [];
  let scheduleRequest = 0, scheduleAbort, selectionAbort, selecting = false;
  const currentYear = today().getFullYear();
  $('#schedule-month').innerHTML = Array.from({ length: 12 }, (_, month) => `<option value="${month}">${new Date(2024, month, 1).toLocaleDateString(undefined, { month: 'long' })}</option>`).join('');
  $('#schedule-year').innerHTML = Array.from({ length: currentYear - 1900 + 2 }, (_, i) => currentYear + 1 - i).map(year => `<option value="${year}">${year}</option>`).join('');
  $('#schedule-month').value = today().getMonth();
  $('#schedule-year').value = currentYear;
  $('#favorite-filter').textContent = preferences.favoriteTeam === 141 ? 'Blue Jays' : 'Favourite';

  async function loadTeams() {
    try {
      teams = await mlb.teams(currentYear);
      $('#favorite-team').innerHTML = teams.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');
      $('#favorite-team').value = preferences.favoriteTeam;
      $('#favorite-filter').textContent = teams.find(t => t.id === preferences.favoriteTeam)?.shortName || 'Favourite';
    } catch { $('#settings-status').textContent = 'Team list unavailable. Try again later.'; }
  }

  async function loadSchedule() {
    const request = ++scheduleRequest;
    scheduleAbort?.abort(); scheduleAbort = new AbortController();
    $('#schedule-status').textContent = 'Loading…';
    $('#schedule-games').setAttribute('aria-busy', 'true');
    $('#schedule-games').innerHTML = '';
    try {
      const games = await mlb.schedule(Number($('#schedule-year').value), Number($('#schedule-month').value), scope === 'favorite' ? preferences.favoriteTeam : null, scheduleAbort.signal);
      if (request !== scheduleRequest) return;
      scheduleGames = games;
      const saved = await repository.listGames();
      const savedIds = new Set(saved.filter(g => g.mlb).map(g => g.mlb.gamePk));
      let lastDate = '';
      $('#schedule-games').innerHTML = games.map(game => {
        const heading = game.date !== lastDate ? `<h3 class="schedule-day">${shortDate(game.date)}</h3>` : '';
        lastDate = game.date;
        const isFinal = /final|completed|game over/i.test(game.status);
        const time = game.timeTBD ? 'TBD' : new Date(game.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const status = isFinal || /postponed|cancelled|suspended|in progress/i.test(game.status) ? game.status : time;
        return `${heading}<button class="schedule-game" data-game="${game.gamePk}" aria-label="${escape(`${game.teams[0].name} at ${game.teams[1].name}, ${shortDate(game.date)}${game.gameNumber ? `, game ${game.gameNumber}` : ''}`)}"><span class="matchup"><span><b>${escape(game.teams[0].abbreviation)}</b><span>${escape(game.teams[0].shortName)}</span></span><span><b>${escape(game.teams[1].abbreviation)}</b><span>${escape(game.teams[1].shortName)}</span></span></span><span class="game-time">${savedIds.has(game.gamePk) ? 'Resume' : escape(status)}${game.gameNumber ? `<small>Game ${game.gameNumber}</small>` : ''}<span aria-hidden="true">↗</span></span></button>`;
      }).join('');
      $('#schedule-status').textContent = games.length ? '' : 'No games this month.';
    } catch {
      if (request !== scheduleRequest) return;
      $('#schedule-status').textContent = 'Schedule unavailable.';
      $('#schedule-games').innerHTML = '<button type="button" id="retry-schedule" class="soft-button">Try again</button>';
    } finally {
      if (request === scheduleRequest) $('#schedule-games').removeAttribute('aria-busy');
    }
  }

  function setSelecting(value) {
    selecting = value;
    document.querySelectorAll('#games-dialog button:not([data-close]), #games-dialog select').forEach(b => b.disabled = value);
  }

  $('#new-game').addEventListener('click', () => { $('#games-dialog').showModal(); loadSchedule(); });
  $('#games-dialog').addEventListener('close', () => { scheduleRequest++; scheduleAbort?.abort(); selectionAbort?.abort(); setSelecting(false); });
  $('#schedule-month').addEventListener('change', loadSchedule);
  $('#schedule-year').addEventListener('change', loadSchedule);
  function changeMonth(step) {
    const date = new Date(Number($('#schedule-year').value), Number($('#schedule-month').value) + step, 1);
    if (date.getFullYear() < 1901 || date.getFullYear() > currentYear + 1) return;
    $('#schedule-year').value = date.getFullYear(); $('#schedule-month').value = date.getMonth(); loadSchedule();
  }
  $('#previous-month').addEventListener('click', () => changeMonth(-1));
  $('#next-month').addEventListener('click', () => changeMonth(1));
  $('#schedule-today').addEventListener('click', () => { $('#schedule-year').value = currentYear; $('#schedule-month').value = today().getMonth(); loadSchedule(); });
  $('#schedule-scope').addEventListener('click', e => {
    const button = e.target.closest('[data-scope]');
    if (!button || selecting) return;
    scope = button.dataset.scope;
    document.querySelectorAll('[data-scope]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    loadSchedule();
  });
  $('#schedule-games').addEventListener('click', async e => {
    if (e.target.closest('#retry-schedule')) { loadSchedule(); return; }
    const button = e.target.closest('[data-game]');
    if (!button || selecting) return;
    const match = scheduleGames.find(g => g.gamePk === Number(button.dataset.game));
    if (!match) return;
    setSelecting(true);
    selectionAbort = new AbortController();
    const signal = selectionAbort.signal;
    $('#schedule-status').textContent = 'Opening…';
    try {
      const saved = (await repository.listGames()).find(g => g.mlb?.gamePk === match.gamePk);
      let next = saved;
      if (!next) {
        let lineups;
        try { lineups = await mlb.lineups(match.gamePk, signal); } catch { /* A game can start before lineups are posted. */ }
        if (signal.aborted) return;
        next = identifyGame(newGame(match.teams[0].shortName, match.teams[1].shortName, lineups));
        next.mlb = match;
        next.dateISO = match.date;
        next.date = dateText(match.date);
        next.lineupPending = !lineups || lineups.flat().some(n => /^Batter \d+$/.test(n));
      }
      if (signal.aborted) return;
      await activate(next);
      $('#games-dialog').close();
      if (next.lineupPending) notify('Lineup pending · load it in Settings');
    } catch { $('#schedule-status').textContent = 'Could not save. Export the current game in Settings first.'; }
    finally { setSelecting(false); }
  });
  $('#custom-game').addEventListener('click', () => { $('#games-dialog').close(); $('#setup-dialog').showModal(); });

  async function renderSettings() {
    const current = getGame();
    $('#current-game-label').textContent = current.teams.join(' · ');
    $('#refresh-lineup').hidden = !current.mlb || current.events.length > 0;
    $('#lineup-status').textContent = current.lineupPending ? 'Lineup not posted yet.' : '';
    $('#recovery-export').hidden = !repository.readError;
    const games = (await repository.listGames()).filter(visibleGame);
    $('#saved-games').innerHTML = games.length ? games.map(g => {
      const state = derive(g), scores = state.runs.map(r => r.reduce((sum, n) => sum + n, 0));
      return `<div class="saved-game"><button class="saved-game-open" data-resume="${escape(g.id)}" aria-label="Open ${escape(g.teams.join(' at '))}, ${escape(dateText(g.dateISO || g.createdAt))}"><span>${escape(g.teams.join(' · '))}</span><small>${escape(dateText(g.dateISO || g.createdAt))} · ${g.finished ? 'Final' : 'In progress'}${g.id === current.id ? ' · Open' : ''}</small></button><span class="saved-score">${scores.join('–')}</span><button class="icon-button" data-export="${escape(g.id)}" aria-label="Export ${escape(g.teams.join(' at '))}">↓</button></div>`;
    }).join('') : '<p class="form-help">No saved games yet.</p>';
  }
  $('#settings').addEventListener('click', () => { $('#settings-status').textContent = ''; renderSettings(); $('#settings-dialog').showModal(); if (!teams.length) loadTeams(); });
  $('#favorite-team').addEventListener('change', async () => {
    const favoriteTeam = Number($('#favorite-team').value);
    try {
      await repository.setPreferences({ favoriteTeam });
      preferences.favoriteTeam = favoriteTeam;
      $('#favorite-filter').textContent = teams.find(t => t.id === favoriteTeam)?.shortName || 'Favourite';
      $('#settings-status').textContent = '';
    } catch { $('#favorite-team').value = preferences.favoriteTeam; $('#settings-status').textContent = 'Could not save preference.'; }
  });
  $('#saved-games').addEventListener('click', async e => {
    const open = e.target.closest('[data-resume]'), download = e.target.closest('[data-export]');
    if (download) { const game = download.dataset.export === getGame().id ? getGame() : await repository.getGame(download.dataset.export); if (game) exportGame(game); }
    if (open) {
      try {
        const game = open.dataset.resume === getGame().id ? getGame() : await repository.getGame(open.dataset.resume);
        if (game) { await activate(game); $('#settings-dialog').close(); }
      } catch { $('#settings-status').textContent = 'Could not save. Export the current game first.'; }
    }
  });
  $('#export').addEventListener('click', () => exportGame(getGame()));
  $('#export-all').addEventListener('click', async () => {
    const data = await repository.exportAll(), current = getGame();
    // Include in-memory changes even if storage is full or unavailable.
    data.games = [...data.games.filter(g => g.id !== current.id), current];
    data.activeId = current.id;
    downloadJSON(data, 'fieldnotes-games.json');
  });
  $('#recovery-export').addEventListener('click', async () => {
    const data = await repository.recoveryData();
    if (data) downloadJSON(data, 'fieldnotes-recovery.json');
  });
  $('#refresh-lineup').addEventListener('click', async () => {
    const game = getGame();
    if (!game.mlb || game.events.length) return;
    $('#refresh-lineup').disabled = true;
    $('#lineup-status').textContent = 'Loading…';
    try {
      const lineups = await mlb.lineups(game.mlb.gamePk);
      if (getGame().id !== game.id || game.events.length) return;
      game.lineups = lineups;
      game.lineupPending = lineups.flat().some(n => /^Batter \d+$/.test(n));
      await persist(); refresh(); renderSettings();
    } catch { $('#lineup-status').textContent = 'Lineup unavailable. Try again later.'; }
    finally { $('#refresh-lineup').disabled = false; }
  });
}
