const test = require('node:test');
const assert = require('node:assert/strict');

test('surface distances handle known arcs, the poles, date line and invalid positions', async () => {
  const { distanceKm } = await import('../explorer-data.mjs');
  assert.equal(distanceKm([43, -80], [43, -80]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 90]) - 10007.557) < .01);
  assert.ok(Math.abs(distanceKm([70, 25], [90, 0]) - 2223.902) < .01);
  assert.ok(Math.abs(distanceKm([0, 179], [0, -179]) - 222.390) < .01);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 180]) - 20015.114) < .01);
  assert.equal(distanceKm([0, 0], null), null);
  assert.equal(distanceKm([91, 0], [0, 0]), null);
  assert.equal(distanceKm([NaN, 0], [0, 0]), null);
});

test('kid-friendly speed uses knots-to-km/h and does not turn missing speed into zero', async () => {
  const { kidReport } = await import('../explorer-data.mjs');
  const sailing = { speed: 10, navigation: 'Under way', position: [70.98, 25.96] };
  assert.equal(kidReport(sailing).speed, '18.5');
  assert.equal(kidReport(sailing).movement, 'On the move');
  assert.equal(kidReport({ ...sailing, speed: null }).speed, '—');
  assert.equal(kidReport({ ...sailing, speed: 0, navigation: 'Moored' }).movement, 'Tied up at the dock');
  assert.equal(kidReport(null).speed, '—');
});

test('WebGL trail preserves GeoJSON longitude/latitude order and never invents a second point', async () => {
  const { trackGeoJSON } = await import('../map-style.mjs');
  assert.deepEqual(trackGeoJSON({ track: [[70, 20], [71, 21]] }).features[0].geometry.coordinates, [[20, 70], [21, 71]]);
  assert.equal(trackGeoJSON({ track: [[70, 20]] }).features.length, 0);
  assert.equal(trackGeoJSON(null).features.length, 0);
});
