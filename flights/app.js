import { ROUTES, MINUTE, cleanFlight, progress, durationText, arrivalTime, zonedTimestamp, weatherAtArrival, weatherForDate, localDate, nearbyAirports, weatherDescription, CHAPTERS, THOUGHTS } from './core.js';

const $ = id => document.getElementById(id);
const STORAGE = 'still-flight-v1';
let stored;
try { stored = JSON.parse(localStorage.getItem(STORAGE)); } catch {}
let routeKey = stored?.route === 'return' ? 'return' : 'outbound';
const flights = Object.fromEntries(Object.entries(ROUTES).map(([key, route]) => [key, cleanFlight(stored?.flights?.[key], route)]));
let thoughtIndex = 0, selectedChapter = null, toastTimer, initialElapsed, airportPreview = null;
let weatherCache = {};
try { weatherCache = JSON.parse(localStorage.getItem('still-weather-v2')) || {}; } catch {}
if (typeof weatherCache !== 'object' || Array.isArray(weatherCache)) weatherCache = {};
let theme = stored?.theme === 'night' ? 'night' : 'day';
let storageFailed = false;
const liveBusy = new Set(), weatherBusy = new Set(), automaticLookups = new Set(), weatherErrors = new Map();
let savedLive;
try { savedLive = JSON.parse(localStorage.getItem('still-live-v2')); } catch {}
const liveResults = new Map(savedLive && typeof savedLive === 'object' && !Array.isArray(savedLive) ? Object.entries(savedLive) : []);
const liveKey = () => `${routeKey}:${flights[routeKey].number}:${flights[routeKey].date}`;

function detailRow(container, title, value) {
  if (!value) return;
  const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
  term.textContent = title; description.textContent = value;
  row.append(term, description); container.append(row);
}

function renderLive() {
  const result = liveResults.get(liveKey());
  const busy = liveBusy.has(liveKey());
  $('live-refresh').disabled = busy;
  $('live-refresh').textContent = busy ? 'Looking up flight…' : 'Refresh flight details';
  $('live-heading').textContent = `${flights[routeKey].number} · ${ROUTES[routeKey].from} → ${ROUTES[routeKey].to}`;
  $('live-summary').textContent = result?.flight ? result.flight.status : result?.message || (busy ? 'Checking the latest flight details…' : 'Flight details will appear when connected.');
  const f = result?.flight, route = ROUTES[routeKey];
  const details = $('live-details'); details.replaceChildren();
  if (f) {
    detailRow(details, 'Airline', [f.airline, f.operatingAirline && `operated by ${f.operatingAirline}`, f.operatingNumber].filter(Boolean).join(' · '));
    for (const [label, info, zone] of [['Departure', f.departureInfo, route.originZone], ['Arrival', f.arrivalInfo, route.zone]]) {
      if (!info) continue;
      detailRow(details, `${label} airport`, info.name || info.code);
      for (const [kind, time] of [['Scheduled', info.scheduled], ['Estimated', info.estimated], ['Actual', info.actual]]) {
        if (time) detailRow(details, `${kind} ${label.toLowerCase()}`, localTime(Date.parse(time), zone, true));
      }
      detailRow(details, `${label} terminal / gate`, [info.terminal && `Terminal ${info.terminal}`, info.gate && `Gate ${info.gate}`].filter(Boolean).join(' · '));
    }
    detailRow(details, 'Baggage claim', f.arrivalInfo?.baggage);
    detailRow(details, 'Aircraft', [f.aircraft, f.registration].filter(Boolean).join(' · '));
    if (!f.departureInfo) detailRow(details, f.departureKind, f.departure && localTime(Date.parse(f.departure), route.originZone, true));
    if (!f.arrivalInfo) detailRow(details, f.arrivalKind, f.arrival && localTime(Date.parse(f.arrival), route.zone, true));
  }
  const checked = Date.parse(result?.checkedAt), stale = Number.isFinite(checked) && Date.now() - checked >= 5 * MINUTE;
  $('live-meta').textContent = Number.isFinite(checked) ? `${stale || !navigator.onLine ? 'Saved update' : result.source} · checked ${localTime(checked, route.originZone, true)} · ${result?.flight && result.message ? result.message : 'updates may be delayed'}` : 'Connect to look up status, times, gates, and aircraft when available.';
}

async function lookupFlight(manual = false) {
  if (liveBusy.has(liveKey())) return;
  const key = liveKey(), previous = liveResults.get(key);
  if (previous?.checkedAt && Date.now() - Date.parse(previous.checkedAt) < 5 * MINUTE) { if (manual) toast('This update was checked less than five minutes ago.'); return; }
  if (!navigator.onLine) { if (manual) toast('You’re offline. Showing the last saved flight update.'); return; }
  const params = new URLSearchParams({ route: routeKey, number: flights[routeKey].number, date: flights[routeKey].date });
  liveBusy.add(key); renderLive();
  try {
    const response = await fetch(new URL(`./api/status?${params}`, location.href), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
    const result = await response.json();
    if (!result || (!result.message && !result.flight)) throw new Error('Invalid response');
    liveResults.set(key, response.ok ? result : { ...previous, message: result.message });
    try { localStorage.setItem('still-live-v2', JSON.stringify(Object.fromEntries(liveResults))); } catch {}
  } catch { liveResults.set(key, { ...previous, message: 'Could not refresh flight details. Try again when connected.' }); }
  finally { liveBusy.delete(key); renderLive(); renderWeather(); if (key === liveKey()) loadWeather(); }
}
$('live-refresh').addEventListener('click', () => lookupFlight(true));

function loadJourneyUpdates() {
  const key = liveKey();
  if (!automaticLookups.has(key)) { automaticLookups.add(key); lookupFlight(); }
  loadWeather();
}

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
  renderAirports();
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
  loadJourneyUpdates();
  if (!storageFailed) toast('Your flight is saved. One small chapter at a time.');
});

$('reset-flight').addEventListener('click', () => {
  if ($('reset-flight').textContent !== 'Tap again to reset') {
    $('reset-flight').textContent = 'Tap again to reset';
    setTimeout(() => { $('reset-flight').textContent = 'Reset this journey'; }, 5000);
    return;
  }
  flights[routeKey] = { ...flights[routeKey], startedAt: null, landedAt: null };
  selectedChapter = null; airportPreview = null; save(); render(); loadWeather(); $('settings-dialog').close(); toast('A fresh start. Your flight details are still here.');
});
$('settings-open').addEventListener('click', openSettings);
$('edit-time').addEventListener('click', openSettings);
$('start-flight').addEventListener('click', () => { if (progress(flights[routeKey]).started) return; flights[routeKey].startedAt = Date.now(); flights[routeKey].landedAt = null; selectedChapter = null; airportPreview = null; save(); render(); loadWeather(); if (!storageFailed) toast('Your timer has started. Just this hour.'); });
$('landed').addEventListener('click', () => { flights[routeKey].landedAt = Date.now(); save(); render(); toast('Welcome to the other side.'); });
$('theme-toggle').addEventListener('click', () => { theme = theme === 'day' ? 'night' : 'day'; setTheme(); save(); });
document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => { routeKey = button.dataset.route; selectedChapter = null; airportPreview = null; save(); render(); loadJourneyUpdates(); }));
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

function weatherContext() {
  const flight = flights[routeKey], route = ROUTES[routeKey], p = progress(flight);
  const reportedArrival = Date.parse(liveResults.get(liveKey())?.flight?.arrival);
  let arrival = null;
  if (!p.overtime && !p.landed) {
    if (p.started || flight.departureTime) arrival = arrivalTime(flight, Date.now(), route);
    else if (Number.isFinite(reportedArrival)) arrival = reportedArrival;
  }
  const date = p.landed ? localDate(flight.landedAt, route.zone) : arrival === null ? flight.date : localDate(arrival, route.zone);
  return { route, arrival, date, key: `${routeKey}:${date}` };
}

function renderWeather() {
  const { route, arrival, date, key } = weatherContext();
  const cache = weatherCache[key], busy = weatherBusy.has(key), error = weatherErrors.get(key);
  const hourly = arrival === null ? null : weatherAtArrival(cache?.data, arrival);
  const daily = weatherForDate(cache?.data, date, route.zone);
  $('arrival-heading').textContent = `${route.destination} weather`;
  $('weather-refresh').disabled = busy;
  $('weather-refresh').textContent = busy ? 'Checking weather…' : 'Refresh weather';
  $('weather-value').textContent = hourly ? `${Math.round(hourly.temperature)}°C` : daily ? `${Math.round(daily.low)}–${Math.round(daily.high)}°C` : '—';
  $('weather-summary').textContent = hourly || daily ? weatherDescription((hourly || daily).code) : error || (busy ? 'Loading your destination forecast…' : 'Connect for your destination forecast.');
  const details = $('weather-details'); details.replaceChildren();
  if (hourly) detailRow(details, 'Surface wind', `${Math.round(hourly.wind)} km/h`);
  if (daily) {
    detailRow(details, 'Daily low / high', `${Math.round(daily.low)}° / ${Math.round(daily.high)}°C`);
    detailRow(details, 'Chance of precipitation', `${Math.round(daily.rain)}%`);
    detailRow(details, 'Daily maximum surface wind', `${Math.round(daily.wind)} km/h`);
  }
  const age = cache ? Math.max(0, Math.floor((Date.now() - cache.fetchedAt) / MINUTE)) : 0;
  const targetLabel = hourly ? `Arrival forecast · ${localTime(hourly.time, route.zone, true)}` : `Travel-day forecast · ${dateLabel(date)}`;
  $('weather-meta').textContent = `${targetLabel}${cache && (hourly || daily) ? ` · ${!navigator.onLine || age >= 60 ? 'saved ' : 'retrieved '}${age < 1 ? 'just now' : durationText(age) + ' ago'}` : ''}${error && (hourly || daily) ? ' · refresh unavailable' : ''} · Open-Meteo`;
}

async function loadWeather(manual = false) {
  const { route, date, key } = weatherContext();
  if (weatherBusy.has(key)) return;
  if (!navigator.onLine) { if (manual) toast('You’re offline. Showing any saved forecast.'); return; }
  const today = localDate(Date.now(), route.zone), lastDay = localDate(Date.now() + 15 * 86400000, route.zone);
  if (date < today || date > lastDay) {
    weatherErrors.set(key, 'Forecasts are available from today through the next 15 days.'); renderWeather(); return;
  }
  const cache = weatherCache[key];
  if (cache?.fetchedAt > Date.now() - 5 * MINUTE && weatherForDate(cache.data, date, route.zone)) {
    if (manual) toast('This forecast was retrieved less than five minutes ago.'); return;
  }
  weatherBusy.add(key); weatherErrors.delete(key); renderWeather();
  const params = new URLSearchParams({ latitude: route.lat, longitude: route.lon,
    hourly: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max,wind_speed_10m_max',
    start_date: date, end_date: date, timeformat: 'unixtime', timezone: route.zone, wind_speed_unit: 'kmh' });
  try {
    const data = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!weatherForDate(data, date, route.zone)) throw new Error('No matching forecast');
    weatherCache[key] = { data, fetchedAt: Date.now() };
    try { localStorage.setItem('still-weather-v2', JSON.stringify(weatherCache)); } catch {}
    if (manual && weatherContext().key === key) toast('Forecast saved for offline viewing.');
  } catch { weatherErrors.set(key, 'Weather couldn’t be refreshed. Try again when connected.'); }
  finally { weatherBusy.delete(key); renderWeather(); }
}
$('weather-refresh').addEventListener('click', () => loadWeather(true));

function renderAirports() {
  const flight = flights[routeKey], route = ROUTES[routeKey], p = progress(flight);
  const minutes = airportPreview ?? Math.min(flight.duration, p.elapsed);
  const estimate = nearbyAirports(route, minutes / flight.duration);
  $('airport-time').max = flight.duration;
  $('airport-time').value = Math.round(minutes);
  $('airport-time-label').textContent = `${durationText(minutes)} into ${durationText(flight.duration)}`;
  $('airport-follow').hidden = airportPreview === null;
  $('airport-mode').textContent = airportPreview !== null ? 'Previewing a point in your journey' : p.landed ? 'Journey complete · destination area' : p.overtime ? 'Planned arrival point · adjust your timer if needed' : p.started ? 'Following your flight timer' : 'At departure · start your timer or explore below';
  const list = $('airport-list'); list.replaceChildren();
  if (!estimate) return;
  for (const airport of estimate.nearest) {
    const item = document.createElement('li'), heading = document.createElement('strong'), name = document.createElement('span'), detail = document.createElement('small'), link = document.createElement('a');
    heading.textContent = `${airport.code} · about ${Math.round(airport.distance)} km away`;
    name.textContent = airport.name;
    detail.textContent = [airport.city, airport.region].filter(Boolean).join(' · ');
    link.textContent = 'Airport details ↗'; link.className = 'source-link';
    link.href = `https://ourairports.com/airports/${encodeURIComponent(airport.ident)}/`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(heading, name, detail, link); list.append(item);
  }
  $('airport-position').textContent = `Estimated position ${estimate.position.lat.toFixed(1)}°N, ${Math.abs(estimate.position.lon).toFixed(1)}°W · straight-line distance to each airport`;
}
$('airport-time').addEventListener('input', () => { airportPreview = Number($('airport-time').value); renderAirports(); });
$('airport-follow').addEventListener('click', () => { airportPreview = null; renderAirports(); });

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
window.addEventListener('online', () => { renderOffline(); lookupFlight(); loadWeather(); });
window.addEventListener('offline', () => { renderOffline(); renderWeather(); renderLive(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if ($('calm-dialog').open && !breathPaused) startBreath(); } });
setInterval(() => { if (!document.hidden) render(); }, 15_000);
setTheme(); render(); loadJourneyUpdates();
