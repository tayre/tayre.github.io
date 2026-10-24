import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, selectFlight } from '../backend/status.mjs';
import { ROUTES } from '../core.js';

const fixture = { ident_iata: 'AC743', origin: { code_iata: 'YYZ' }, destination: { code_iata: 'SFO' }, scheduled_out: '2026-10-26T01:00:00Z', estimated_in: '2026-10-26T06:30:00Z', status: 'Scheduled' };
const request = (query = 'route=outbound&number=AC743&date=2026-10-25') => new Request(`https://example.com/flights/api/status?${query}`);
const context = (req = request(), env = { AEROAPI_KEY: 'test-secret' }) => ({ request: req, env });
const now = Date.parse('2026-10-25T12:00:00Z');

test('matches departure airport local day rather than UTC day, and exact route', () => {
  assert.deepEqual(selectFlight([fixture, { ...fixture, destination: { code_iata: 'LAX' } }, { ...fixture, scheduled_out: '2026-10-25T01:00:00Z' }], ROUTES.outbound, '2026-10-25'), [fixture]);
});
test('missing secret and invalid requests never contact provider', async () => {
  const deps = { now, fetch: () => { throw new Error('Should not fetch'); } };
  assert.equal((await onRequest(context(request(), {}), deps)).status, 503);
  for (const q of ['route=__proto__', 'route=outbound&number=AC999&date=2026-10-25', 'route=outbound&number=AC743&date=2026-11-25']) assert.equal((await onRequest(context(request(q)), deps)).status, 400);
});
test('normalizes provider response and caches without exposing secret', async () => {
  let saved;
  const result = await onRequest(context(), { now, cache: { match: async () => null, put: async (key, value) => { saved = value; } }, fetch: async (url, options) => {
    assert.equal(url.hostname, 'aeroapi.flightaware.com');
    assert.equal(options.headers['x-apikey'], 'test-secret');
    assert.equal(url.searchParams.get('start'), '2026-10-25T04:00:00.000Z');
    return Response.json({ flights: [fixture] });
  } });
  const body = await result.json();
  assert.equal(body.flight.arrivalKind, 'Estimated arrival');
  assert.equal(body.checkedAt, new Date(now).toISOString());
  assert.equal(JSON.stringify(body).includes('test-secret'), false);
  assert.equal(saved.headers.get('Cache-Control'), 'public, max-age=300');
});
test('cache hit skips provider and retains original timestamp', async () => {
  const result = await onRequest(context(), { now, cache: { match: async () => Response.json({ checkedAt: 'earlier' }) }, fetch: () => assert.fail('Provider called') });
  assert.equal((await result.json()).checkedAt, 'earlier');
});
test('no result and ambiguous result never select a different flight', async () => {
  for (const flights of [[], [fixture, fixture]]) {
    const result = await onRequest(context(), { now, fetch: async () => Response.json({ flights }) });
    const body = await result.json();
    assert.ok(body.message);
    assert.equal(body.flight, undefined);
  }
});
test('upstream errors and timeout are safe and not cached', async () => {
  for (const fetch of [async () => new Response('private upstream details', { status: 401 }), async () => { throw new Error('test-secret'); }]) {
    const result = await onRequest(context(), { now, fetch });
    assert.equal(result.status, 502);
    assert.doesNotMatch(await result.text(), /test-secret|private upstream/);
  }
});
test('far future date does not spend provider credits', async () => {
  const result = await onRequest(context(), { now: Date.parse('2026-10-01'), fetch: () => assert.fail('Provider called') });
  assert.match((await result.json()).message, /within two days/);
});
test('free Aviationstack uses real-time endpoint and normalizes matching flights', async () => {
  const result = await onRequest(context(request(), { AVIATIONSTACK_KEY: 'free-secret' }), { now, fetch: async (url, options) => {
    assert.equal(url.origin, 'https://api.aviationstack.com');
    assert.equal(url.searchParams.get('access_key'), 'free-secret');
    assert.equal(url.searchParams.get('flight_iata'), 'AC743');
    assert.equal(url.searchParams.has('flight_date'), false);
    assert.equal(options.headers['x-apikey'], undefined);
    const f = { flight_date: '2026-10-25', flight: { iata: 'AC743', codeshared: { flight_iata: 'UA999', airline_name: 'United' } }, airline: { name: 'Air Canada' }, aircraft: { icao: 'A320', registration: 'C-TEST' }, flight_status: 'active', departure: { iata: 'YYZ', airport: 'Toronto Pearson', scheduled: fixture.scheduled_out, terminal: '1', gate: 'F60' }, arrival: { iata: 'SFO', airport: 'San Francisco International', estimated: fixture.estimated_in, gate: 'G2', terminal: 'I', baggage: '4' } };
    return Response.json({ data: [f, { ...f, flight_date: '2026-10-24' }] });
  } });
  const body = await result.json();
  assert.equal(body.source, 'Aviationstack');
  assert.equal(body.flight.status, 'active');
  assert.equal(body.flight.gate, 'G2');
  assert.equal(body.flight.departureInfo.terminal, '1');
  assert.equal(body.flight.departureInfo.gate, 'F60');
  assert.equal(body.flight.departureInfo.scheduled, fixture.scheduled_out);
  assert.equal(body.flight.arrivalInfo.name, 'San Francisco International');
  assert.equal(body.flight.arrivalInfo.terminal, 'I');
  assert.equal(body.flight.arrivalInfo.baggage, '4');
  assert.equal(body.flight.airline, 'Air Canada');
  assert.equal(body.flight.operatingNumber, 'UA999');
  assert.equal(body.flight.aircraft, 'A320');
  assert.equal(body.flight.registration, 'C-TEST');
  assert.doesNotMatch(JSON.stringify(body), /free-secret/);
});
test('free plan quota errors do not become flight results', async () => {
  const result = await onRequest(context(request(), { AVIATIONSTACK_KEY: 'secret' }), { now, fetch: async () => Response.json({ error: { code: 'usage_limit_reached' } }) });
  assert.equal(result.status, 502);
  assert.equal((await result.json()).flight, undefined);
});
