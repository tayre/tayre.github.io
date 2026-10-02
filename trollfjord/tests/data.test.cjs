const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFeature, latestReport, reportAge } = require('../data.js');

const now = Date.parse('2026-10-02T16:00:00Z');
function feature(properties = {}, geometry = {}) {
  return {
    type: 'Feature',
    properties: { mmsi: 258465000, imo: 9233258, ship_name: 'TROLLFJORD',
      date_time_utc: '2026-10-02T15:58:44', speed: 0, cog: 273.7,
      true_heading: 85, status: 5, destination: 'NO ALF', ...properties },
    geometry: { type: 'LineString', coordinates: [[25.96, 70.98], [25.96742, 70.9821]], ...geometry }
  };
}

test('extracts the actual track endpoint and preserves zero speed', () => {
  const report = normalizeFeature(feature(), now);
  assert.deepEqual(report.position, [70.9821, 25.96742]);
  assert.deepEqual(report.track, [[70.98, 25.96], [70.9821, 25.96742]]);
  assert.equal(report.reportedAt, Date.parse('2026-10-02T15:58:44Z'));
  assert.equal(report.speed, 0);
  assert.equal(report.navigation, 'Moored');
});

test('uses MMSI and IMO rather than confusing another ship of the same name', () => {
  assert.equal(normalizeFeature(feature({ mmsi: 259042710, imo: 1024857 }), now), null);
  assert.equal(normalizeFeature(feature({ imo: 1024857 }), now), null);
  assert.ok(normalizeFeature(feature({ mmsi: '258465000', imo: '9233258' }), now));
});

test('unavailable AIS values and nulls are not rendered as real readings', () => {
  for (const value of [null, undefined, '', ' ', false]) {
    const report = normalizeFeature(feature({ speed: value, cog: value, true_heading: value, status: value }), now);
    assert.equal(report.speed, null);
    assert.equal(report.course, null);
    assert.equal(report.heading, null);
    assert.equal(report.navigation, 'Not reported');
  }
  const report = normalizeFeature(feature({ speed: 102.3, cog: 360, true_heading: 511, destination: '  ' }), now);
  assert.equal(report.speed, null);
  assert.equal(report.course, null);
  assert.equal(report.heading, null);
  assert.equal(report.destination, 'Not reported');
});

test('invalid endpoints are rejected, missing intermediate points do not invent a trail', () => {
  for (const coordinates of [[], [[null, null]], [[181, 91]], [[25, '']], [[25, 70], [25, 91]]]) {
    assert.equal(normalizeFeature(feature({}, { coordinates }), now), null);
  }
  const report = normalizeFeature(feature({}, { coordinates: [[25, 70], [null, null], [26, 71]] }), now);
  assert.deepEqual(report.position, [71, 26]);
  assert.deepEqual(report.track, []);
});

test('UTC times, missing timestamps, and implausible future reports are handled', () => {
  assert.equal(normalizeFeature(feature({ date_time_utc: '2026-10-02T17:58:44+02:00' }), now).reportedAt,
    Date.parse('2026-10-02T15:58:44Z'));
  for (const value of [null, '', 'not a date', '2026-10-02T17:00:00']) {
    assert.equal(normalizeFeature(feature({ date_time_utc: value }), now), null);
  }
});

test('selects the newest valid report and treats empty feeds separately from malformed feeds', () => {
  const newest = feature();
  const old = feature({ date_time_utc: '2026-10-02T15:48:00' });
  const invalid = feature({ date_time_utc: '2026-10-02T16:30:00' });
  const payload = { type: 'FeatureCollection', features: [newest, old, invalid, feature({ mmsi: 123 })] };
  assert.equal(latestReport(payload, now).feature, newest);
  assert.equal(latestReport({ type: 'FeatureCollection', features: [] }, now), null);
  assert.throws(() => latestReport({ error: 'unavailable' }), /unexpected format/);
});

test('report age grows from the AIS timestamp, including cached reports', () => {
  assert.equal(reportAge(now - 30000, now), 'Reported just now');
  assert.equal(reportAge(now - 120000, now), 'Reported 2m ago');
  assert.equal(reportAge(now - 7200000, now), 'Reported 2h ago');
  assert.equal(reportAge(now - 172800000, now), 'Reported 2d ago');
});
