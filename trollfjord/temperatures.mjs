import { distanceKm } from './explorer-data.mjs?v=20261005.1';

import { parseSunTimes } from './sun-times.mjs?v=20261005.10';

const MINUTE = 60000;
const SOURCES = [
  { kind: 'sun', endpoint: 'https://api.open-meteo.com/v1/forecast' },
  { kind: 'air', endpoint: 'https://api.open-meteo.com/v1/forecast', variable: 'temperature_2m' }
];

async function loadTemperature(source, position, fetcher, now) {
  const params = new URLSearchParams({
    latitude: position[0], longitude: position[1], current: source.variable,
    cell_selection: 'sea', timeformat: 'unixtime', timezone: 'GMT'
  });
  if (source.kind === 'sun') {
    params.delete('current');
    params.set('daily', 'sunrise,sunset,daylight_duration');
    params.set('timezone', 'auto');
    params.set('timeformat', 'iso8601');
    params.set('forecast_days', '1');
  }
  if (source.kind === 'air') {
    params.set('temperature_unit', 'celsius');
    params.set('elevation', '0');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(`${source.endpoint}?${params}`, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`Temperature feed HTTP ${response.status}`);
    const payload = await response.json();
    if (source.kind === 'sun') return parseSunTimes(payload, now());
    const value = payload.current?.[source.variable];
    const time = payload.current?.time * 1000;
    if (!Number.isFinite(value) || payload.current_units?.[source.variable] !== '°C'
      || !Number.isFinite(time) || time > now() + 5 * MINUTE || now() - time > 60 * MINUTE) {
      throw new Error('No current temperature available at this location.');
    }
    return { value, time };
  } finally {
    clearTimeout(timeout);
  }
}

// AIS can update every ten seconds; model temperatures only need occasional
// requests, or a new location once the ship has moved five kilometres.
export function createTemperatures({ onUpdate, fetcher = fetch, now = Date.now }) {
  let latest = null;
  const feeds = SOURCES.map(source => ({ ...source, busy: false, lastAttempt: null, position: null, interval: 15 * MINUTE }));
  const recentPosition = report => report && Number.isFinite(report.reportedAt)
    && now() - report.reportedAt <= 20 * MINUTE && report.reportedAt <= now() + 5 * MINUTE
    && distanceKm(report.position, report.position) === 0;

  async function refresh(source) {
    if (source.busy) return;
    const elapsed = source.lastAttempt === null ? Infinity : now() - source.lastAttempt;
    const moved = source.position && distanceKm(source.position, latest.position) >= 5;
    if (elapsed < MINUTE || (elapsed < source.interval && !moved)) return;
    source.busy = true;
    source.lastAttempt = now();
    source.position = [...latest.position];
    onUpdate(source.kind, { state: 'loading' });
    let reading;
    let failure;
    try {
      reading = await loadTemperature(source, source.position, fetcher, now);
    } catch (error) {
      failure = error.message;
    } finally {
      source.busy = false;
    }
    // A late response must never replace conditions for a newer ship location.
    if (!recentPosition(latest) || distanceKm(source.position, latest.position) >= 5) {
      source.lastAttempt = null;
      onUpdate(source.kind, { state: 'waiting' });
      return;
    }
    source.interval = reading ? 15 * MINUTE : MINUTE;
    onUpdate(source.kind, reading ? { state: 'ready', ...reading } : { state: 'unavailable', error: failure });
  }

  return {
    async setReport(report, { refresh: shouldRefresh = true } = {}) {
      latest = recentPosition(report) ? report : null;
      if (!latest) {
        for (const source of feeds) {
          source.lastAttempt = null;
          onUpdate(source.kind, { state: report ? 'stale-position' : 'waiting' });
        }
        return;
      }
      if (shouldRefresh) await Promise.all(feeds.map(refresh));
    }
  };
}
