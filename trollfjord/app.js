(() => {
  'use strict';

  const data = window.TrollfjordData;
  const REFRESH_INTERVAL = 10000;
  const STALE_AFTER = 20 * 60000;
  const CACHE_KEY = 'trollfjord-ais-v1';
  const ui = Object.fromEntries(['refresh', 'auto-refresh', 'locate', 'notice', 'tiles-error',
    'report-age', 'position', 'speed', 'course', 'destination', 'navigation', 'reported-at',
    'checked-at', 'temperature-air', 'temperature-air-time',
    'sunrise', 'sunset', 'sun-times-note'].map(id => [id, document.getElementById(id)]));
  let report = null;
  let mapView;
  let explorer;
  let temperatures;
  let traffic = [];
  let busy = false;
  let refreshTimer;
  let nextRefresh = Date.now();
  let lastChecked = null;

  const utcTime = timestamp => new Date(timestamp).toLocaleTimeString('en-GB', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function showNotice(message) {
    ui.notice.textContent = message;
    ui.notice.hidden = !message;
  }

  function updateAge() {
    if (!report) return;
    const stale = Date.now() - report.reportedAt > STALE_AFTER;
    ui['report-age'].textContent = data.reportAge(report.reportedAt);
    ui['report-age'].classList.toggle('is-recent', !stale);
    mapView?.setStale(stale);
    temperatures?.setReport(report, { refresh: false });
  }

  function paintReport() {
    const [lat, lon] = report.position;
    ui.position.textContent = `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'} / ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
    ui.speed.textContent = report.speed === null ? '—' : report.speed.toFixed(1);
    ui.course.textContent = report.course === null ? '—' : `${report.course.toFixed(1)}°`;
    ui.destination.textContent = report.destination;
    ui.navigation.textContent = report.navigation;
    const date = new Date(report.reportedAt).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
    ui['reported-at'].textContent = `${date} · ${utcTime(report.reportedAt)}`;
    ui['reported-at'].title = new Date(report.reportedAt).toISOString();
    explorer?.setReport(report);
    temperatures?.setReport(report, { refresh: !document.hidden && navigator.onLine });
    if (mapView) {
      mapView.setReport(report);
      ui.locate.disabled = false;
    }
    updateAge();
  }

  function updateCheckLabel() {
    const checked = lastChecked ? `Checked ${utcTime(lastChecked)} UTC` : 'Not checked yet';
    ui['checked-at'].textContent = !navigator.onLine ? 'Offline'
      : !ui['auto-refresh'].checked ? `${checked} · auto-refresh off`
      : document.hidden ? `${checked} · paused` : checked;
  }

  function schedule() {
    clearTimeout(refreshTimer);
    if (!busy && ui['auto-refresh'].checked && !document.hidden && navigator.onLine) {
      refreshTimer = setTimeout(refreshData, Math.max(0, nextRefresh - Date.now()));
    }
    updateCheckLabel();
  }

  async function refreshData() {
    if (busy) return;
    clearTimeout(refreshTimer);
    if (!navigator.onLine) {
      showNotice(report ? 'Offline. Showing the last saved AIS report.' : 'Offline. Connect to load the ship’s position.');
      schedule();
      return;
    }
    busy = true;
    ui.refresh.disabled = true;
    ui.refresh.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(data.API_URL, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(`The AIS feed is unavailable (HTTP ${response.status}).`);
      const payload = await response.json();
      const incoming = data.latestReport(payload);
      traffic = payload.features.map(feature => data.normalizeVesselFeature(feature)).filter(Boolean);
      lastChecked = Date.now();
      if (!incoming) {
        showNotice(report ? 'No newer report in the feed. Showing the last known position.' : 'MS Trollfjord has no valid position in the current feed. Retrying automatically while auto-refresh is on.');
      } else if (report && incoming.reportedAt < report.reportedAt) {
        showNotice('The feed returned an older report. Keeping the newer saved position.');
      } else {
        report = incoming;
        paintReport();
        showNotice(Date.now() - report.reportedAt > STALE_AFTER ? 'This AIS report is over 20 minutes old. Showing the last known position.' : '');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(report.feature)); } catch { /* The map works without browser storage. */ }
      }
      mapView?.setTraffic(traffic);
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'The AIS request timed out.' : 'Could not update the AIS feed.';
      showNotice(`${reason} ${report ? 'Showing the last known position.' : 'Use Refresh to try again.'}`);
    } finally {
      clearTimeout(timeout);
      busy = false;
      ui.refresh.disabled = false;
      ui.refresh.removeAttribute('aria-busy');
      nextRefresh = Date.now() + REFRESH_INTERVAL;
      updateAge();
      schedule();
    }
  }

  // Load the graphics independently: a disabled GPU or failed module must not
  // stop AIS polling or the accessible text readout.
  import('./map.mjs?v=20261005.12').then(({ createShipMap }) => {
    mapView = createShipMap({
      onError(message) { ui['tiles-error'].textContent = message; ui['tiles-error'].hidden = false; },
      onReady() { ui['tiles-error'].hidden = true; }
    });
    mapView.setTraffic(traffic);
    explorer?.setMap(mapView);
    if (report) paintReport();
  }).catch(error => {
    console.error('Could not load the WebGL map.', error);
    ui['tiles-error'].setAttribute('data-error', error.message);
    ui['tiles-error'].textContent = 'The WebGL map could not start. Ship data is still shown below.';
    ui['tiles-error'].hidden = false;
  });

  import('./temperatures.mjs?v=20261005.11').then(({ createTemperatures }) => {
    temperatures = createTemperatures({
      onUpdate(kind, reading) {
        if (kind === 'sun') {
          ui.sunrise.textContent = reading.state === 'ready' ? (reading.sunrise || '—') : '—';
          ui.sunset.textContent = reading.state === 'ready' ? (reading.sunset || '—') : '—';
          ui['sun-times-note'].textContent = reading.state === 'ready'
            ? `${reading.note} · ${reading.date} · ${reading.timezone.replaceAll('_', ' ')} local time`
            : reading.state === 'loading' ? 'Updating sun times…'
            : reading.state === 'stale-position' ? 'Position too old for sun times'
            : reading.state === 'unavailable' ? 'Sun times unavailable' : 'Waiting for position';
          return;
        }
        const value = ui[`temperature-${kind}`];
        const time = ui[`temperature-${kind}-time`];
        value.textContent = reading.state === 'ready' ? reading.value.toFixed(1) : '—';
        time.textContent = reading.state === 'ready' ? `${utcTime(reading.time).slice(0, 5)} UTC`
          : reading.state === 'loading' ? 'Updating…'
          : reading.state === 'unavailable' ? 'Unavailable'
          : reading.state === 'stale-position' ? 'Position too old' : 'Waiting for position';
        value.title = reading.state === 'ready' ? `Nearby model estimate for ${new Date(reading.time).toISOString()}` : '';
      }
    });
    if (report) temperatures.setReport(report, { refresh: !document.hidden && navigator.onLine });
  }).catch(error => {
    console.error('Could not load nearby temperatures.', error);
    ui['temperature-air-time'].textContent = 'Unavailable';
    ui['sun-times-note'].textContent = 'Sun times unavailable';
  });

  import('./explorer.mjs?v=20261005.3').then(({ createExplorer }) => {
    explorer = createExplorer();
    if (report) explorer.setReport(report);
    if (mapView) explorer.setMap(mapView);
  }).catch(error => {
    console.error('Could not load the ship overview.', error);
    document.getElementById('kid-movement').textContent = 'Ship overview unavailable. See the captain’s numbers below.';
  });

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    report = data.normalizeFeature(cached);
    if (report) { paintReport(); showNotice('Showing a saved report while checking for updates…'); }
  } catch { /* Ignore corrupt or unavailable local storage. */ }

  ui.refresh.disabled = false;
  ui.refresh.addEventListener('click', refreshData);
  ui.locate.addEventListener('click', () => mapView?.locate());
  ui['auto-refresh'].addEventListener('change', () => { nextRefresh = Date.now() + REFRESH_INTERVAL; schedule(); });
  document.addEventListener('visibilitychange', () => { updateAge(); schedule(); });
  window.addEventListener('online', schedule);
  window.addEventListener('offline', () => { showNotice(report ? 'Offline. Showing the last known position.' : 'Offline. Connect to load the ship’s position.'); schedule(); });
  setInterval(updateAge, 15000);
  refreshData();
})();
