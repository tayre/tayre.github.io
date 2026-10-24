import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, newFlight, cleanFlight, progress, arrivalTime, zonedTimestamp, weatherAtArrival, weatherForDate, localDate, routePosition, nearbyAirports, distanceKm, MINUTE } from '../core.js';

const now = Date.UTC(2026, 9, 25, 18);
test('outbound and United codeshare return have separate identities', () => {
  assert.equal(newFlight(ROUTES.outbound).number, 'AC 743');
  assert.equal(newFlight(ROUTES.return).number, 'AC 4067');
});
test('timer resumes from absolute time and has a partial final chapter', () => {
  const flight = { ...newFlight(ROUTES.outbound), startedAt: now - 125 * MINUTE };
  const p = progress(flight, now);
  assert.equal(p.current, 2); assert.equal(p.remaining, 205); assert.equal(p.count, 6);
  assert.equal(progress(flight, now + 180 * MINUTE).remaining, 25);
  assert.equal(progress(flight, now + 180 * MINUTE).current, 5);
});
test('planned time passing does not claim landing', () => {
  const p = progress({ ...newFlight(ROUTES.outbound), startedAt: now - 400 * MINUTE }, now);
  assert.equal(p.overtime, true); assert.equal(p.landed, false); assert.equal(p.remaining, 0); assert.equal(p.fraction, 1);
});
test('manual landing freezes the timer and completes the journey', () => {
  const flight = { ...newFlight(ROUTES.outbound), startedAt: now - 300 * MINUTE, landedAt: now };
  assert.equal(progress(flight, now + 60 * MINUTE).elapsed, 300);
  assert.equal(progress(flight, now).landed, true);
  assert.equal(progress(flight, now).fraction, 1);
});
test('invalid stored state cannot create NaN progress or future takeoff', () => {
  const result = cleanFlight({ duration: -3, startedAt: now + 60_000, number: 42 }, ROUTES.return, now);
  assert.equal(result.duration, 285); assert.equal(result.startedAt, null);
  assert.equal(progress(result, now).fraction, 0);
});
test('arrival uses elapsed absolute time and is independent of device timezone', () => {
  const flight = { ...newFlight(ROUTES.outbound), startedAt: Date.UTC(2026, 9, 25, 13) };
  assert.equal(arrivalTime(flight, now), Date.UTC(2026, 9, 25, 18, 30));
});
test('planned arrival handles the overnight return and airport timezones', () => {
  const flight = { ...newFlight(ROUTES.return), departureTime: '23:00' };
  assert.equal(zonedTimestamp(flight.date, flight.departureTime, ROUTES.return.originZone), Date.UTC(2026, 9, 31, 6));
  assert.equal(arrivalTime(flight, now, ROUTES.return), Date.UTC(2026, 9, 31, 10, 45));
  assert.equal(zonedTimestamp('2026-03-08', '02:30', 'America/Toronto'), null);
});
test('forecast selects only a nearby hour and rejects missing data', () => {
  const data = { hourly: { time: [now / 1000, now / 1000 + 3600], temperature_2m: [15, 17], wind_speed_10m: [8, 10], weather_code: [1, 2] } };
  assert.equal(weatherAtArrival(data, now + 40 * MINUTE).temperature, 17);
  assert.equal(weatherAtArrival(data, now + 120 * MINUTE), null);
  data.hourly.temperature_2m[1] = null;
  assert.equal(weatherAtArrival(data, now + 60 * MINUTE), null);
  assert.equal(weatherAtArrival({}, now), null);
});

test('daily forecast matches destination date even across UTC midnight', () => {
  const time = Date.parse('2026-10-26T07:00:00Z') / 1000;
  const data = { daily: { time: [time], temperature_2m_min: [11], temperature_2m_max: [19], weather_code: [2], wind_speed_10m_max: [22], precipitation_probability_max: [15] } };
  assert.equal(localDate(time * 1000 - 60000, 'America/Los_Angeles'), '2026-10-25');
  assert.deepEqual(weatherForDate(data, '2026-10-26', 'America/Los_Angeles'), { low: 11, high: 19, code: 2, wind: 22, rain: 15 });
  assert.equal(weatherForDate(data, '2026-10-25', 'America/Los_Angeles'), null);
  data.daily.temperature_2m_min[0] = null;
  assert.equal(weatherForDate(data, '2026-10-26', 'America/Los_Angeles'), null);
  assert.equal(weatherForDate({}, '2026-10-26', 'America/Los_Angeles'), null);
});

test('airport estimates include exact endpoints and reverse the same great-circle path', () => {
  assert.equal(nearbyAirports(ROUTES.outbound, 0).nearest[0].code, 'YYZ');
  assert.equal(nearbyAirports(ROUTES.outbound, 1).nearest[0].code, 'SFO');
  assert.equal(nearbyAirports(ROUTES.return, 0).nearest[0].code, 'SFO');
  assert.equal(nearbyAirports(ROUTES.return, 1).nearest[0].code, 'YYZ');
  for (const f of [0, .1, .5, .8, 1]) {
    const outbound = routePosition(ROUTES.outbound, f), inbound = routePosition(ROUTES.return, 1 - f);
    assert.ok(distanceKm(outbound, inbound) < .001);
    const result = nearbyAirports(ROUTES.outbound, f);
    assert.equal(result.nearest.length, 3);
    assert.ok(result.nearest.every(airport => Number.isFinite(airport.distance)));
    assert.ok(result.nearest[0].distance <= result.nearest[1].distance);
  }
  assert.deepEqual(routePosition(ROUTES.outbound, 2), routePosition(ROUTES.outbound, 1));
  assert.equal(routePosition({ from: 'FAKE', to: 'SFO' }, .5), null);
});
