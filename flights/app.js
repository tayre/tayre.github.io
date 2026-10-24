import { ROUTES, MINUTE, cleanFlight, progress, durationText, arrivalTime, zonedTimestamp, weatherAtArrival, weatherDescription, CHAPTERS, THOUGHTS } from './core.js';

const $ = id => document.getElementById(id);
const STORAGE = 'still-flight-v1';
let stored;
try { stored = JSON.parse(localStorage.getItem(STORAGE)); } catch {}
let routeKey = stored?.route === 'return' ? 'return' : 'outbound';
const flights = Object.fromEntries(Object.entries(ROUTES).map(([key, route]) => [key, cleanFlight(stored?.flights?.[key], route)]));
let thoughtIndex = 0, selectedChapter = null, toastTimer, initialElapsed, weatherBusy = false;
let weatherCache = {};
try { weatherCache = JSON.parse(localStorage.getItem('still-weather-v1')) || {}; } catch {}
let theme = stored?.theme === 'night' ? 'night' : 'day';
let storageFailed = false;
let liveBusy = false;
const liveResults = new Map();
const liveKey = () => `${routeKey}:${flights[routeKey].number}:${flights[routeKey].date}`;

function renderLive() {
  const result = liveResults.get(liveKey());
  $('live-refresh').disabled = liveBusy;
  $('live-refresh').textContent = liveBusy ? 'Checking…' : 'Check flight status';
  $('live-summary').textContent = result?.flight ? `${result.flight.number || flights[routeKey].number} · ${result.flight.status}` : result?.message || 'Check your flight’s latest reported status when connected.';
  const f = result?.flight, route = ROUTES[routeKey];
  $('live-details').textContent = f ? [f.departure && `${f.departureKind}: ${localTime(Date.parse(f.departure), route.originZone, true)}`, f.arrival && `${f.arrivalKind}: ${localTime(Date.parse(f.arrival), route.zone, true)}`, f.gate && `Arrival gate ${f.gate}`].filter(Boolean).join(' · ') : '';
  $('live-meta').textContent = result?.checkedAt ? `${result.source} · checked ${localTime(Date.parse(result.checkedAt), route.originZone, true)} · updates may be delayed` : 'Updates on request · your timer runs independently';
}

$('live-refresh').addEventListener('click', async () => {
  if (liveBusy) return;
  const key = liveKey(), previous = liveResults.get(key);
  if (previous?.checkedAt && Date.now() - Date.parse(previous.checkedAt) < 5 * MINUTE) { toast('This update was checked less than five minutes ago.'); return; }
  const params = new URLSearchParams({ route: routeKey, number: flights[routeKey].number, date: flights[routeKey].date });
  liveBusy = true; renderLive();
  try {
    const response = await fetch(new URL(`./api/status?${params}`, location.href), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
    const result = await response.json();
    if (!result || (!result.message && !result.flight)) throw new Error('Invalid response');
    liveResults.set(key, result);
  } catch { liveResults.set(key, { message: 'Live status is unavailable here. Check your connection or try the Cloudflare site. Your timer still works.' }); }
  finally { liveBusy = false; renderLive(); }
});

function toast(message) {
  $('app-message').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('app-message').textContent = ''; }, 6500);
}

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ route: routeKey, flights, theme })); }
  catch { storageFailed = true; toast('This browser can’t save your timer. Keep this tab open during your flight.'); }
}

function setTheme() {
  document.body.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-label', theme === 'night' ? 'Switch to day palette' : 'Switch to night palette');
  $('theme-toggle').title = theme === 'night' ? 'Day palette' : 'Night palette';
  document.querySelector('meta[name="theme-color"]').content = theme === 'night' ? '#222922' : '#f7f6f2';
}

function dateLabel(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date) : '';
}

function localTime(value, zone, withDate = false) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone, ...(withDate ? { month: 'short', day: 'numeric' } : {}) }).format(value);
}

function renderChapters(p) {
  const container = $('chapters');
  if (container.childElementCount !== p.count) {
    container.replaceChildren();
    for (let i = 0; i < p.count; i++) {
      const button = document.createElement('button');
      button.className = 'chapter';
      button.innerHTML = '<span class="chapter-bar"><span class="chapter-fill"></span></span><span class="chapter-label"></span>';
      button.addEventListener('click', () => { selectedChapter = i; render(); });
      container.append(button);
    }
  }
  const selected = Math.min(selectedChapter ?? p.current, p.count - 1);
  [...container.children].forEach((button, i) => {
    const length = Math.min(60, flights[routeKey].duration - i * 60);
    const fill = p.landed ? 100 : Math.min(100, Math.max(0, (p.elapsed - i * 60) / length * 100));
    button.querySelector('.chapter-fill').style.width = `${fill}%`;
    button.querySelector('.chapter-label').textContent = `Hour ${i + 1}`;
    button.setAttribute('aria-pressed', String(i === selected));
    button.setAttribute('aria-label', `Hour ${i + 1}, ${length} minutes${fill >= 100 ? ', complete' : i === p.current && p.started ? ', current chapter' : ''}`);
    button.classList.toggle('complete', fill >= 100);
  });
  const [title, thought] = CHAPTERS[Math.min(selected, CHAPTERS.length - 1)];
  $('chapter-number').textContent = String(selected + 1).padStart(2, '0');
  $('chapter-title').textContent = p.landed ? 'A moment to arrive' : title;
  $('chapter-thought').textContent = p.landed ? 'You made room for the journey. Take that kindness with you.' : thought;
  const thisLength = Math.min(60, flights[routeKey].duration - selected * 60);
  $('chapter-time').textContent = p.landed ? 'WELCOME' : p.started && selected === p.current && !p.overtime ? `${Math.ceil(thisLength - (p.elapsed - selected * 60))} MIN IN THIS CHAPTER` : `${thisLength} MIN CHAPTER`;
}

function render() {
  const route = ROUTES[routeKey], flight = flights[routeKey], p = progress(flight);
  document.querySelectorAll('[data-route]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.route === routeKey)));
  $('origin-code').textContent = route.from;
  $('origin-name').textContent = route.origin;
  $('destination-code').textContent = route.to;
  $('destination-name').textContent = route.destination;
  $('landscape-label').textContent = [flight.number, dateLabel(flight.date), route.operator === 'United Airlines' ? 'OPERATED BY UNITED' : 'AIR CANADA'].filter(Boolean).join(' · ');
  $('arrival-heading').textContent = `${route.destination} awaits.`;
  $('time-remaining').textContent = p.landed ? 'You’re here.' : p.overtime ? 'Take your time.' : durationText(p.started ? p.remaining : flight.duration);
  $('time-caption').textContent = p.landed ? 'journey complete' : p.overtime ? 'planned time has passed' : p.started ? 'estimated time left' : 'planned flight time';
  $('chapter-eyebrow').textContent = p.started && !p.landed ? `YOUR JOURNEY · ${durationText(Math.floor(p.elapsed))} BEHIND YOU` : 'YOUR JOURNEY, IN SMALL CHAPTERS';
  $('route-status').textContent = p.landed ? 'Welcome to the other side.' : p.overtime ? 'Your journey is still unfolding.' : p.started ? `${Math.floor(p.fraction * 100)}% of your planned time behind you` : 'A journey to look forward to';
  $('start-flight').hidden = p.started;
  $('landed').hidden = !p.started || p.landed;
  $('edit-time').textContent = p.started ? 'Adjust flight time' : 'Already in the air?';
  $('progress-note').hidden = p.landed;
  $('progress-note').textContent = p.overtime ? 'Adjust the time using your crew’s latest estimate.' : p.started ? (storageFailed ? 'Keep this tab open; saving isn’t available.' : 'Timer running · saved on this device') : 'Starts your timer from this moment.';
  const fraction = p.fraction;
  const x = 142 + 716 * fraction, y = 231 - 318 * fraction * (1 - fraction);
  $('plane-marker').style.left = `${x / 10}%`;
  $('plane-marker').style.top = `${7 + y / 320 * 73}%`;
  const landscape = $('plane-marker').parentElement;
  const heading = Math.atan2(-318 * (1 - 2 * fraction) * landscape.clientHeight * .73 / 320, 716 * landscape.clientWidth / 1000) * 180 / Math.PI;
  $('route-plane').setAttribute('transform', `rotate(${heading})`);
  $('path-progress').style.strokeDasharray = `${fraction * 100} 100`;
  renderChapters(p);
  renderWeather();
  renderLive();
}

function openSettings() {
  const flight = flights[routeKey], route = ROUTES[routeKey], p = progress(flight);
  $('settings-route').textContent = `${route.origin} to ${route.destination} · ${route.operator}`;
  $('flight-number').value = flight.number;
  $('flight-date').value = flight.date;
  $('departure-time').value = flight.departureTime;
  $('departure-hint').textContent = `Optional, for a forecast before takeoff. Use local time in ${route.origin}.`;
  $('duration-hours').value = Math.floor(flight.duration / 60);
  $('duration-minutes').value = flight.duration % 60;
  initialElapsed = p.started ? String(Math.floor(p.elapsed)) : '';
  $('elapsed-minutes').value = initialElapsed;
  $('settings-error').textContent = '';
  $('reset-flight').textContent = 'Reset this journey';
  $('settings-dialog').showModal();
}

$('flight-form').addEventListener('submit', event => {
  event.preventDefault();
  const duration = Number($('duration-hours').value) * 60 + Number($('duration-minutes').value);
  const elapsed = $('elapsed-minutes').value;
  if (!Number.isInteger(duration) || duration < 30 || duration > 900) { $('settings-error').textContent = 'Choose a flight time between 30 minutes and 15 hours.'; return; }
  if ($('departure-time').value && zonedTimestamp($('flight-date').value, $('departure-time').value, ROUTES[routeKey].originZone) === null) { $('settings-error').textContent = 'Please choose a valid local departure time.'; return; }
  const previous = flights[routeKey];
  const number = $('flight-number').value.trim().toUpperCase();
  const changedElapsed = elapsed !== initialElapsed;
  flights[routeKey] = { ...previous, duration, number, date: $('flight-date').value, departureTime: $('departure-time').value,
    startedAt: changedElapsed ? (elapsed === '' ? null : Date.now() - Number(elapsed) * MINUTE) : previous.startedAt,
    landedAt: changedElapsed ? null : previous.landedAt };
  selectedChapter = null;
  save(); render(); $('settings-dialog').close();
  if (!storageFailed) toast('Your flight is saved. One small chapter at a time.');
});

$('reset-flight').addEventListener('click', () => {
  if ($('reset-flight').textContent !== 'Tap again to reset') {
    $('reset-flight').textContent = 'Tap again to reset';
    setTimeout(() => { $('reset-flight').textContent = 'Reset this journey'; }, 5000);
    return;
  }
  flights[routeKey] = { ...flights[routeKey], startedAt: null, landedAt: null };
  selectedChapter = null; save(); render(); $('settings-dialog').close(); toast('A fresh start. Your flight details are still here.');
});
$('settings-open').addEventListener('click', openSettings);
$('edit-time').addEventListener('click', openSettings);
$('start-flight').addEventListener('click', () => { if (progress(flights[routeKey]).started) return; flights[routeKey].startedAt = Date.now(); flights[routeKey].landedAt = null; selectedChapter = null; save(); render(); if (!storageFailed) toast('Your timer has started. Just this hour.'); });
$('landed').addEventListener('click', () => { flights[routeKey].landedAt = Date.now(); save(); render(); toast('Welcome to the other side.'); });
$('theme-toggle').addEventListener('click', () => { theme = theme === 'day' ? 'night' : 'day'; setTheme(); save(); });
document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => { routeKey = button.dataset.route; selectedChapter = null; save(); render(); }));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
$('about-open').addEventListener('click', () => $('about-dialog').showModal());
$('next-thought').addEventListener('click', () => {
  thoughtIndex = (thoughtIndex + 1) % THOUGHTS.length;
  const [thought, credit] = THOUGHTS[thoughtIndex];
  $('thought-text').textContent = thought;
  $('thought-credit').textContent = credit;
  $('thought-count').textContent = `${String(thoughtIndex + 1).padStart(2, '0')} / ${THOUGHTS.length}`;
});

async function fetchJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

function renderWeather() {
  const flight = flights[routeKey], route = ROUTES[routeKey], p = progress(flight);
  $('weather-refresh').disabled = weatherBusy;
  $('weather-refresh').textContent = weatherBusy ? 'A moment…' : weatherCache[routeKey] ? 'Refresh weather ↗' : 'Arrival weather ↗';
  const cache = weatherCache[routeKey];
  const target = arrivalTime(flight, Date.now(), route);
  const result = weatherAtArrival(cache?.data, target);
  if (!p.started && !flight.departureTime) {
    $('weather-summary').textContent = 'Add your departure time for a glimpse of arrival weather.';
    $('weather-meta').textContent = 'Or check back after takeoff · forecast near the airport';
    return;
  }
  if (!result || p.overtime || p.landed) {
    $('weather-summary').textContent = p.landed ? 'A new place. A fresh moment.' : p.overtime ? 'Adjust your flight time for a new arrival forecast.' : cache ? 'No saved forecast for this arrival time. Refresh when you’re connected.' : 'A small glimpse of the weather when you arrive.';
    $('weather-meta').textContent = 'Forecast near the airport · not a prediction of the ride';
    return;
  }
  const age = Math.max(0, Math.floor((Date.now() - cache.fetchedAt) / MINUTE));
  const stale = age >= 60;
  $('weather-summary').textContent = `${Math.round(result.temperature)}°C · ${weatherDescription(result.code)} · Surface wind ${Math.round(result.wind)} km/h`;
  $('weather-meta').textContent = `${stale ? 'Older saved forecast' : 'Forecast'} · ${localTime(result.time, route.zone, true)} · retrieved ${age < 1 ? 'just now' : durationText(age) + ' ago'} · Open-Meteo`;
}

$('weather-refresh').addEventListener('click', async () => {
  if (weatherBusy) return;
  const key = routeKey, flight = flights[key], route = ROUTES[key], p = progress(flight);
  if (!p.started && !flight.departureTime) { openSettings(); $('departure-time').focus(); toast('Add your local departure time, or check weather after takeoff.'); return; }
  if (p.overtime) { toast('Adjust your planned flight time to check weather for your new arrival.'); return; }
  if (p.landed) { toast('This journey is complete. Switch flights or reset it to plan another arrival.'); return; }
  const arrival = arrivalTime(flight, Date.now(), route);
  if (arrival < Date.now() - 30 * MINUTE || arrival > Date.now() + 15 * 24 * 60 * MINUTE) { toast('Arrival forecasts are available for the next 15 days. Check your date and departure time.'); return; }
  if (weatherCache[key]?.fetchedAt > Date.now() - 5 * MINUTE && weatherAtArrival(weatherCache[key].data, arrival)) { toast('Your saved forecast was retrieved less than five minutes ago.'); return; }
  weatherBusy = true; renderWeather();
  const params = new URLSearchParams({ latitude: route.lat, longitude: route.lon, hourly: 'temperature_2m,weather_code,wind_speed_10m', start_date: new Date(arrival).toISOString().slice(0, 10), end_date: new Date(arrival + 60 * MINUTE).toISOString().slice(0, 10), timeformat: 'unixtime', timezone: 'GMT', wind_speed_unit: 'kmh' });
  try {
    const data = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!weatherAtArrival(data, arrival)) throw new Error('No matching forecast');
    weatherCache[key] = { data, fetchedAt: Date.now() };
    try { localStorage.setItem('still-weather-v1', JSON.stringify(weatherCache)); } catch {}
    if (routeKey === key) toast('A little glimpse of the other side. Forecast saved for offline viewing.');
  } catch { toast('Weather couldn’t be refreshed. Your saved journey is still here.'); }
  finally { weatherBusy = false; renderWeather(); }
});

let breathInterval, breathStart, breathElapsed = 0, breathPaused = false;
function updateBreath() {
  const elapsed = breathElapsed + (breathPaused ? 0 : performance.now() - breathStart);
  if (elapsed >= 60_000) {
    clearInterval(breathInterval);
    $('guided-breath').classList.remove('is-running', 'is-paused');
    $('breath-label').textContent = 'Just be here';
    $('breath-progress').textContent = 'A quiet minute, just for you.';
    $('breath-toggle').textContent = 'Another quiet minute';
    return;
  }
  $('breath-label').textContent = breathPaused ? 'Your own pace' : elapsed % 10_000 < 4000 ? 'Breathe in' : 'Breathe out';
  $('breath-progress').textContent = breathPaused ? 'Take all the time you need.' : `${Math.min(6, Math.floor(elapsed / 10_000) + 1)} of 6 gentle breaths`;
}
function startBreath() {
  clearInterval(breathInterval);
  breathStart = performance.now(); breathElapsed = 0; breathPaused = false;
  $('guided-breath').classList.remove('is-running', 'is-paused');
  void $('guided-breath').offsetWidth;
  $('guided-breath').classList.add('is-running');
  $('breath-toggle').textContent = 'Pause breathing guide';
  updateBreath(); breathInterval = setInterval(updateBreath, 250);
}
function openCalm(bumpy) {
  $('calm-eyebrow').textContent = bumpy ? 'COME BACK TO SOMETHING STEADY' : 'A MOMENT JUST FOR YOU';
  $('calm-title').textContent = bumpy ? 'You only need this moment.' : 'Let the next breath be easy.';
  $('calm-intro').textContent = bumpy ? 'Let the crew take care of the flight. Bring your attention back to the seat beneath you.' : 'Follow the circle, if it feels comfortable. Your own pace is fine.';
  $('calm-anchor').textContent = bumpy ? 'Feet resting. Hands soft. One easy breath.' : 'Soften your shoulders. Unclench your jaw.';
  $('bumpy-notes').hidden = !bumpy;
  if (!$('calm-dialog').open) $('calm-dialog').showModal();
  setCalmMode(bumpy ? 'ground' : 'breathe');
}
function setCalmMode(mode) {
  const ground = mode === 'ground';
  $('grounding-panel').hidden = !ground;
  $('breathing-panel').hidden = ground;
  document.querySelectorAll('[data-calm-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.calmMode === mode)));
  $('calm-title').textContent = ground ? 'Let the aircraft do the flying.' : 'Let the next breath be easy.';
  $('calm-intro').textContent = ground ? 'Uneven air can feel like an uneven road. Bring your attention to what’s supporting you.' : 'Breathe in gently for 4, then out for 6. Your own comfortable pace is always fine.';
  if (ground) { clearInterval(breathInterval); $('guided-breath').classList.remove('is-running', 'is-paused'); }
  else startBreath();
}
document.querySelectorAll('[data-calm-mode]').forEach(button => button.addEventListener('click', () => setCalmMode(button.dataset.calmMode)));
const anchors = ['Notice where the seat meets your back. Let it take a little more of your weight.', 'Rest your feet on the floor. Notice the gentle pressure beneath them.', 'Let your hands rest. Loosen your fingers, then soften your shoulders.'];
document.querySelectorAll('[data-anchor]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-anchor]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('grounding-prompt').textContent = anchors[Number(button.dataset.anchor)];
}));
$('breathe-open').addEventListener('click', () => openCalm(false));
$('bumpy-open').addEventListener('click', () => openCalm(true));
$('dock-breathe').addEventListener('click', () => openCalm(false));
$('dock-ground').addEventListener('click', () => openCalm(true));
$('breath-toggle').addEventListener('click', () => {
  if ($('breath-toggle').textContent === 'Another quiet minute') { startBreath(); return; }
  if (!breathPaused) breathElapsed += performance.now() - breathStart;
  else breathStart = performance.now();
  breathPaused = !breathPaused;
  $('guided-breath').classList.toggle('is-paused', breathPaused);
  $('breath-toggle').textContent = breathPaused ? 'Resume breathing guide' : 'Pause breathing guide';
  updateBreath();
});
$('calm-dialog').addEventListener('close', () => { clearInterval(breathInterval); $('guided-breath').classList.remove('is-running', 'is-paused'); });

let offlineReady = false;
function renderOffline() {
  const label = offlineReady ? navigator.onLine ? 'Ready for offline' : 'Offline · your quiet space is here' : 'Keep this tab open offline';
  $('offline-status').replaceChildren();
  const dot = document.createElement('span'); dot.className = 'status-dot';
  $('offline-status').append(dot, document.createTextNode(label));
}
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(async registration => {
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (worker) worker.postMessage({ type: 'VERIFY_OFFLINE' });
  }).catch(renderOffline);
  navigator.serviceWorker.addEventListener('message', event => { if (event.data?.type === 'OFFLINE_READY') { offlineReady = true; renderOffline(); } });
} else renderOffline();
window.addEventListener('online', renderOffline);
window.addEventListener('offline', renderOffline);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if ($('calm-dialog').open && !breathPaused) startBreath(); } });
setInterval(() => { if (!document.hidden) render(); }, 15_000);
setTheme(); render();
