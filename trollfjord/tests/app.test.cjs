const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Data = require('../data.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const NOW = Date.parse('2026-10-02T16:00:00Z');
const report = (time = '2026-10-02T15:58:44') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [25.96742, 70.9821] },
  properties: { mmsi: 258465000, imo: 9233258, date_time_utc: time,
    speed: 0, cog: 120, true_heading: 85, status: 5, destination: 'NO ALF' }
});
const payload = (...features) => ({ type: 'FeatureCollection', features });

function app(cached = null) {
  let now = NOW;
  let nextId = 0;
  const timers = new Map();
  const docEvents = {};
  const winEvents = {};
  const elements = {};
  const storage = new Map(cached ? [['trollfjord-ais-v1', JSON.stringify(cached)]] : []);
  const request = { payload: payload(report()), calls: 0, error: null };
  const document = { hidden: false,
    addEventListener: (name, fn) => { docEvents[name] = fn; },
    getElementById: id => elements[id] ||= { textContent: '', hidden: true, checked: true,
      disabled: true, events: {}, classList: { toggle() {} },
      setAttribute() {}, removeAttribute() {}, addEventListener(name, fn) { this.events[name] = fn; } }
  };
  const navigator = { onLine: true };
  const window = { TrollfjordData: { ...Data,
    normalizeFeature: value => Data.normalizeFeature(value, now),
    latestReport: value => Data.latestReport(value, now),
    reportAge: timestamp => Data.reportAge(timestamp, now) },
    addEventListener: (name, fn) => { winEvents[name] = fn; } };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { window, document, navigator, Date: Clock, AbortController,
    setTimeout: (fn, delay) => { timers.set(++nextId, { fn, delay }); return nextId; },
    clearTimeout: id => timers.delete(id), setInterval() {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch: async () => {
      request.calls++;
      if (request.error) throw request.error;
      return { ok: true, json: async () => request.payload };
    }
  });
  return { elements, timers, storage, request, navigator, document, docEvents, winEvents,
    advance: ms => { now += ms; },
    flush: () => new Promise(resolve => setImmediate(resolve)),
    refresh: () => elements.refresh.events.click() };
}

test('outages and empty or regressing feeds retain the last real report and timestamp', async () => {
  const h = app();
  await h.flush();
  const position = h.elements.position.textContent;
  const reportedAt = h.elements['reported-at'].textContent;
  assert.equal(h.elements.speed.textContent, '0.0');
  assert.equal(h.elements.notice.hidden, true);
  assert.match(reportedAt, /15:58:44/);

  h.advance(600000);
  h.request.error = new Error('network unavailable');
  await h.refresh();
  assert.equal(h.elements.position.textContent, position);
  assert.equal(h.elements['reported-at'].textContent, reportedAt);
  assert.match(h.elements.notice.textContent, /Could not update.*last known position/);
  assert.match(h.elements['report-age'].textContent, /11m ago/);

  h.request.error = null;
  h.request.payload = payload();
  await h.refresh();
  assert.equal(h.elements['reported-at'].textContent, reportedAt);
  assert.match(h.elements.notice.textContent, /No newer report/);

  h.request.payload = payload(report('2026-10-02T15:48:44'));
  await h.refresh();
  assert.equal(h.elements['reported-at'].textContent, reportedAt);
  assert.match(h.elements.notice.textContent, /older report/);

  h.request.payload = payload(report('2026-10-02T16:09:00'));
  await h.refresh();
  assert.match(h.elements['reported-at'].textContent, /16:09:00/);
  assert.equal(h.elements.notice.hidden, true);
  assert.match(h.storage.get('trollfjord-ais-v1'), /16:09:00/);
});

test('hidden/offline tabs and unchecked auto-refresh do not schedule network polls', async () => {
  const h = app();
  await h.flush();
  assert.equal([...h.timers.values()][0].delay, 10000);
  h.document.hidden = true;
  h.docEvents.visibilitychange();
  assert.equal(h.timers.size, 0);
  h.advance(120000);
  h.document.hidden = false;
  h.docEvents.visibilitychange();
  assert.equal([...h.timers.values()][0].delay, 0);
  h.navigator.onLine = false;
  h.winEvents.offline();
  assert.equal(h.timers.size, 0);
  await h.refresh();
  assert.equal(h.request.calls, 1, 'manual refresh also respects offline status');
  h.navigator.onLine = true;
  h.winEvents.online();
  assert.equal(h.timers.size, 1);
  h.elements['auto-refresh'].checked = false;
  h.elements['auto-refresh'].events.change();
  assert.equal(h.timers.size, 0);
});

test('cached reports retain their original time until a newer report arrives', async () => {
  const h = app(report('2026-10-01T10:00:00'));
  assert.match(h.elements['reported-at'].textContent, /01 Oct.*10:00:00/);
  assert.match(h.elements.notice.textContent, /saved report/);
  await h.flush();
  assert.match(h.elements['reported-at'].textContent, /02 Oct.*15:58:44/);
});
