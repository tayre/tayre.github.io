const test = require('node:test');
const assert = require('node:assert/strict');
const NOW = Date.parse('2026-10-05T02:30:00Z');

async function harness() {
  const { createTemperatures } = await import('../temperatures.mjs');
  let time = NOW;
  const calls = [];
  const sunCalls = [];
  const readings = {};
  const responses = { air: 0 };
  const payload = (kind, value) => {
    if (kind === 'sun') return { timezone: 'Europe/Oslo', daily: { time: ['2026-10-05'], sunrise: ['2026-10-05T07:30'], sunset: ['2026-10-05T18:20'], daylight_duration: [39000] } };
    const variable = 'temperature_2m';
    return { current: { time: time / 1000, [variable]: value }, current_units: { [variable]: '°C' } };
  };
  const controller = createTemperatures({
    now: () => time,
    onUpdate: (kind, reading) => { readings[kind] = reading; },
    fetcher: async url => {
      const parsed = new URL(url);
      const kind = parsed.searchParams.has('daily') ? 'sun' : 'air';
      (kind === 'sun' ? sunCalls : calls).push({ kind, url: parsed });
      if (responses[kind] instanceof Error) throw responses[kind];
      const data = typeof responses[kind] === 'function' ? await responses[kind]() : payload(kind, responses[kind]);
      return { ok: true, json: async () => data };
    }
  });
  return { calls, sunCalls, readings, responses, payload, controller,
    advance: ms => { time += ms; },
    report: (position = [67.29038, 14.39673], reportedAt = time) => ({ position, reportedAt }) };
}

test('temperatures use ship coordinates and sea cells, preserve zero, and throttle repeated AIS reports', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  assert.equal(h.readings.air.value, 0);
  assert.equal(h.readings.air.time, NOW);
  for (const call of h.calls) {
    assert.equal(call.url.searchParams.get('latitude'), '67.29038');
    assert.equal(call.url.searchParams.get('longitude'), '14.39673');
    assert.equal(call.url.searchParams.get('cell_selection'), 'sea');
  }
  for (let i = 0; i < 89; i++) {
    h.advance(10000);
    await h.controller.setReport(h.report());
  }
  assert.equal(h.calls.length, 1);
  h.advance(10000);
  await h.controller.setReport(h.report());
  assert.equal(h.calls.length, 2);
});

test('null, outdated, future and wrong-unit temperatures are not presented as current Celsius readings', async () => {
  const h = await harness();
  h.responses.air = null;
  await h.controller.setReport(h.report());
  assert.equal(h.readings.air.state, 'unavailable');
  for (const body of [
    { current: { time: NOW / 1000 - 7200, temperature_2m: 10 }, current_units: { temperature_2m: '°C' } },
    { current: { time: NOW / 1000 + 7200, temperature_2m: 10 }, current_units: { temperature_2m: '°C' } },
    { current: { time: NOW / 1000, temperature_2m: 50 }, current_units: { temperature_2m: '°F' } }
  ]) {
    h.advance(60000);
    h.responses.air = () => body;
    await h.controller.setReport(h.report());
    assert.equal(h.readings.air.state, 'unavailable');
  }
});

test('moving five kilometres requests fresh temperatures, while paused updates make no requests', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  h.advance(60000);
  await h.controller.setReport(h.report([67.4, 14.4]), { refresh: false });
  assert.equal(h.calls.length, 1);
  await h.controller.setReport(h.report([67.4, 14.4]));
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].url.searchParams.get('latitude'), '67.4');
});

test('cached old positions do not trigger requests and late responses for a previous location are discarded', async () => {
  const h = await harness();
  await h.controller.setReport(h.report(undefined, NOW - 21 * 60000));
  assert.equal(h.calls.length, 0);
  assert.equal(h.readings.air.state, 'stale-position');
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  h.responses.air = () => pending;
  const update = h.controller.setReport(h.report());
  await h.controller.setReport(h.report([68, 14.4]));
  finish(h.payload('air', 7));
  await update;
  assert.equal(h.readings.air.state, 'waiting');
  h.responses.air = 6;
  await h.controller.setReport(h.report([68, 14.4]));
  assert.equal(h.readings.air.value, 6);
  assert.equal(h.calls.at(-1).url.searchParams.get('latitude'), '68');
});

test('sun times use the ship position and local timezone, and fail independently of temperatures', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  assert.equal(h.readings.sun.sunrise, '07:30');
  assert.equal(h.readings.sun.timezone, 'Europe/Oslo');
  assert.equal(h.sunCalls[0].url.searchParams.get('timezone'), 'auto');
  assert.equal(h.sunCalls[0].url.searchParams.get('latitude'), '67.29038');
  assert.equal(h.sunCalls[0].url.searchParams.get('daily'), 'sunrise,sunset,daylight_duration');
  h.advance(10000);
  await h.controller.setReport(h.report());
  assert.equal(h.sunCalls.length, 1);
  h.advance(15 * 60000);
  h.responses.sun = new Error('Sun feed unavailable');
  await h.controller.setReport(h.report());
  assert.equal(h.readings.sun.state, 'unavailable');
  assert.equal(h.readings.air.state, 'ready');
  await h.controller.setReport(h.report(undefined, NOW - 21 * 60000));
  assert.equal(h.readings.sun.state, 'stale-position');
});

test('conditions no longer request marine water temperatures', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  assert.deepEqual(h.calls.map(call => call.kind), ['air']);
  assert.equal(h.calls[0].url.hostname, 'api.open-meteo.com');
  assert.equal(h.calls[0].url.searchParams.get('current'), 'temperature_2m');
  assert.equal(h.sunCalls.length, 1);
});
