(() => {
  'use strict';

  const data = window.TrollfjordData;
  const REFRESH_INTERVAL = 60000;
  const STALE_AFTER = 20 * 60000;
  const CACHE_KEY = 'trollfjord-ais-v1';
  const ui = Object.fromEntries(['refresh', 'auto-refresh', 'locate', 'notice', 'tiles-error',
    'report-age', 'position', 'speed', 'course', 'destination', 'navigation', 'reported-at',
    'checked-at'].map(id => [id, document.getElementById(id)]));
  let report = null;
  let map, marker, track;
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
    marker?.getElement()?.classList.toggle('is-old', stale);
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
    if (map) {
      const bearing = report.heading ?? report.course;
      const shape = bearing === null
        ? '<circle cx="17" cy="17" r="6" fill="#171717" stroke="white" stroke-width="2"/>'
        : `<path transform="rotate(${bearing} 17 17)" d="M17 3 25 28 17 24 9 28Z" fill="#171717" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
      const icon = L.divIcon({ className: 'ship-icon', html: `<svg viewBox="0 0 34 34" aria-hidden="true">${shape}</svg>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      if (!marker) {
        marker = L.marker(report.position, { icon, title: 'MS Trollfjord — last reported position', alt: 'MS Trollfjord' }).addTo(map);
        marker.bindTooltip('MS Trollfjord', { permanent: true, direction: 'right', offset: [15, 0], className: 'ship-label' });
        map.setView(report.position, 9, { animate: false });
      } else {
        marker.setLatLng(report.position).setIcon(icon);
      }
      track.setLatLngs(report.track);
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
      const response = await fetch(data.API_URL, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`The AIS feed is unavailable (HTTP ${response.status}).`);
      const incoming = data.latestReport(await response.json());
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

  if (window.L) {
    map = L.map('map', { zoomControl: false, minZoom: 3, maxZoom: 17, scrollWheelZoom: false, worldCopyJump: true }).setView([68.5, 18], 5);
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    let tileFailed = false;
    tiles.on('loading', () => { tileFailed = false; });
    tiles.on('tileerror', () => { tileFailed = true; ui['tiles-error'].hidden = false; });
    tiles.on('load', () => { ui['tiles-error'].hidden = !tileFailed; });
    track = L.polyline([], { color: '#333', weight: 1.5, opacity: .65, interactive: false }).addTo(map);
  } else {
    ui['tiles-error'].textContent = 'The map library could not load. Ship data is shown below.';
    ui['tiles-error'].hidden = false;
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    report = data.normalizeFeature(cached);
    if (report) { paintReport(); showNotice('Showing a saved report while checking for updates…'); }
  } catch { /* Ignore corrupt or unavailable local storage. */ }

  ui.refresh.disabled = false;
  ui.refresh.addEventListener('click', refreshData);
  ui.locate.addEventListener('click', () => { if (report && map) map.setView(report.position, Math.max(map.getZoom(), 9), { animate: false }); });
  ui['auto-refresh'].addEventListener('change', () => { nextRefresh = Date.now() + REFRESH_INTERVAL; schedule(); });
  document.addEventListener('visibilitychange', () => { updateAge(); schedule(); });
  window.addEventListener('online', schedule);
  window.addEventListener('offline', () => { showNotice(report ? 'Offline. Showing the last known position.' : 'Offline. Connect to load the ship’s position.'); schedule(); });
  setInterval(updateAge, 15000);
  refreshData();
})();
