const API = 'https://statsapi.mlb.com/api/v1';

async function get(path, signal) {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) timeout.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(`${API}${path}`, { signal: timeout.signal });
    if (!response.ok) throw new Error('MLB data unavailable');
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function monthRange(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return { startDate: `${prefix}-01`, endDate: `${prefix}-${new Date(year, month + 1, 0).getDate()}` };
}

export function normalizeSchedule(data) {
  return (data.dates || []).flatMap(day => (day.games || []).map(game => ({
    gamePk: game.gamePk,
    date: game.officialDate || day.date,
    startsAt: game.gameDate,
    status: game.status?.detailedState || 'Scheduled',
    timeTBD: !!game.status?.startTimeTBD,
    gameNumber: game.doubleHeader !== 'N' ? game.gameNumber : null,
    season: Number(game.season),
    venue: game.venue?.name || '',
    teams: ['away', 'home'].map(side => ({
      id: game.teams[side].team.id,
      name: game.teams[side].team.name,
      shortName: game.teams[side].team.teamName || game.teams[side].team.name,
      abbreviation: game.teams[side].team.abbreviation || game.teams[side].team.name.slice(0, 3).toUpperCase()
    }))
  }))).sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.gamePk - b.gamePk);
}

export function extractLineups(data) {
  return ['away', 'home'].map(side => {
    const players = Object.values(data.teams?.[side]?.players || {}).filter(p => Number(p.battingOrder) >= 100);
    return Array.from({ length: 9 }, (_, i) => {
      // Historical box scores include substitutes. Use the earliest player in
      // each batting slot, not the final battingOrder array.
      const player = players.filter(p => Math.floor(Number(p.battingOrder) / 100) === i + 1).sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))[0];
      return player?.person?.fullName || `Batter ${i + 1}`;
    });
  });
}

export class MLBClient {
  constructor() { this.cache = new Map(); }
  async schedule(year, month, teamId, signal) {
    const params = new URLSearchParams({ sportId: '1', season: String(year), ...monthRange(year, month), hydrate: 'team,venue' });
    if (teamId) params.set('teamId', String(teamId));
    const key = params.toString();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < 60000) return cached.games;
    const games = normalizeSchedule(await get(`/schedule?${params}`, signal));
    this.cache.set(key, { games, time: Date.now() });
    return games;
  }
  async teams(season, signal) {
    const data = await get(`/teams?sportId=1&season=${season}`, signal);
    return data.teams.map(t => ({ id: t.id, name: t.name, shortName: t.teamName })).sort((a, b) => a.name.localeCompare(b.name));
  }
  async lineups(gamePk, signal) { return extractLineups(await get(`/game/${gamePk}/boxscore`, signal)); }
}
