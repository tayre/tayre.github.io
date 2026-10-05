const test = require('node:test');
const assert = require('node:assert/strict');
const NOW = Date.parse('2026-10-05T02:30:00Z');

async function harness() {
  const { createTemperatures } = await import('../temperatures.mjs');
  let time = NOW;
  const calls = [];
  const readings = {};
  const responses = { air: 0, sea: 10.4 };
  const payload = (kind, value) => {
    const variable = kind === 'air' ? 'temperature_2m' : 'sea_surface_temperature';
    return { current: { time: time / 1000, [variable]: value }, current_units: { [variable]: '°C' } };
  };
  const controller = createTemperatures({
    now: () => time,
    onUpdate: (kind, reading) => { readings[kind] = reading; },
    fetcher: async url => {
      const parsed = new URL(url);
      const kind = parsed.hostname.startsWith('marine-') ? 'sea' : 'air';
      calls.push({ kind, url: parsed });
      if (responses[kind] instanceof Error) throw responses[kind];
      const data = typeof responses[kind] === 'function' ? await responses[kind]() : payload(kind, responses[kind]);
      return { ok: true, json: async () => data };
    }
  });
  return { calls, readings, responses, payload, controller,
    advance: ms => { time += ms; },
    report: (position = [67.29038, 14.39673], reportedAt = time) => ({ position, reportedAt }) };
}

test('temperatures use ship coordinates and sea cells, preserve zero, and throttle repeated AIS reports', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  assert.equal(h.readings.air.value, 0);
  assert.equal(h.readings.sea.value, 10.4);
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
  assert.equal(h.calls.length, 2);
  h.advance(10000);
  await h.controller.setReport(h.report());
  assert.equal(h.calls.length, 4);
});

test('sea outages do not hide air temperatures, and only the failed feed retries after a minute', async () => {
  const h = await harness();
  h.responses.sea = new Error('Marine feed unavailable');
  await h.controller.setReport(h.report());
  assert.equal(h.readings.air.state, 'ready');
  assert.equal(h.readings.sea.state, 'unavailable');
  assert.equal(h.readings.sea.value, undefined);
  h.advance(60000);
  h.responses.sea = 9.8;
  await h.controller.setReport(h.report());
  assert.deepEqual(h.calls.map(call => call.kind), ['air', 'sea', 'sea']);
  assert.equal(h.readings.sea.value, 9.8);
});

test('null, outdated, future and wrong-unit temperatures are not presented as current Celsius readings', async () => {
  const h = await harness();
  h.responses.sea = null;
  await h.controller.setReport(h.report());
  assert.equal(h.readings.sea.state, 'unavailable');
  for (const body of [
    { current: { time: NOW / 1000 - 7200, sea_surface_temperature: 10 }, current_units: { sea_surface_temperature: '°C' } },
    { current: { time: NOW / 1000 + 7200, sea_surface_temperature: 10 }, current_units: { sea_surface_temperature: '°C' } },
    { current: { time: NOW / 1000, sea_surface_temperature: 50 }, current_units: { sea_surface_temperature: '°F' } }
  ]) {
    h.advance(60000);
    h.responses.sea = () => body;
    await h.controller.setReport(h.report());
    assert.equal(h.readings.sea.state, 'unavailable');
  }
});

test('moving five kilometres requests fresh temperatures, while paused updates make no requests', async () => {
  const h = await harness();
  await h.controller.setReport(h.report());
  h.advance(60000);
  await h.controller.setReport(h.report([67.4, 14.4]), { refresh: false });
  assert.equal(h.calls.length, 2);
  await h.controller.setReport(h.report([67.4, 14.4]));
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[2].url.searchParams.get('latitude'), '67.4');
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
  assert.equal(h.calls.at(-2).url.searchParams.get('latitude'), '68');
});
