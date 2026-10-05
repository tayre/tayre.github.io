const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../data.js');
const NOW = Date.parse('2026-10-05T02:30:00Z');
const ship = { mmsi: Data.MMSI, position: [0, 0], reportedAt: NOW };
const vessel = (mmsi, km, extra = {}) => ({ mmsi, position: [km / 6371.0088 * 180 / Math.PI, 0],
  name: 'Nearby vessel', speed: 0, reportedAt: NOW, ...extra });

test('nearby vessels use a 50-statute-mile radius and exclude Trollfjord and stale reports', async () => {
  const { nearbyGeoJSON } = await import('../map-style.mjs');
  const result = nearbyGeoJSON([
    ship, vessel(257000001, 80.46), vessel(257000002, 80.48),
    vessel(257000003, 3, { reportedAt: NOW - 21 * 60000 }),
    vessel(257000004, 3, { reportedAt: NOW + 6 * 60000 })
  ], ship, NOW);
  assert.deepEqual(result.features.map(f => f.id), [257000001]);
  assert.equal(result.features[0].properties.speed, 0);
  assert.ok(result.features[0].properties.distanceMiles < 50);
  assert.deepEqual(result.features[0].geometry.coordinates, [0, vessel(257000001, 80.46).position[0]]);
  assert.equal(nearbyGeoJSON([vessel(257000001, 1)], { ...ship, reportedAt: NOW - 21 * 60000 }, NOW).features.length, 0);
});

test('only the newest vessel position counts, including a ship that left the radius', async () => {
  const { nearbyGeoJSON } = await import('../map-style.mjs');
  const result = nearbyGeoJSON([
    vessel(257000001, 2, { reportedAt: NOW - 60000 }), vessel(257000001, 100),
    vessel(257000002, 3), vessel(257000002, 4, { reportedAt: NOW - 60000 })
  ], ship, NOW);
  assert.deepEqual(result.features.map(f => f.id), [257000002]);
  assert.ok(Math.abs(result.features[0].properties.distanceMiles - 3 / 1.609344) < .001);
});

test('nearby vessels across the date line are included and malformed coordinates are ignored', async () => {
  const { nearbyGeoJSON } = await import('../map-style.mjs');
  const result = nearbyGeoJSON([
    vessel(257000001, 0, { position: [0, -179.9] }),
    vessel(257000002, 0, { position: [91, 0] })
  ], { ...ship, position: [0, 179.9] }, NOW);
  assert.deepEqual(result.features.map(f => f.id), [257000001]);
});

test('the AIS normalizer supports other vessel types without confusing them with Trollfjord', () => {
  const feature = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[14, 67], [14.2, 67.1]] },
    properties: { mmsi: 257000001, ship_name: '  FISHING BOAT  ', ship_type: 30,
      date_time_utc: '2026-10-05T02:29:00', speed: 0 } };
  const report = Data.normalizeVesselFeature(feature, NOW);
  assert.equal(report.name, 'FISHING BOAT');
  assert.deepEqual(report.position, [67.1, 14.2]);
  assert.equal(report.speed, 0);
  assert.equal(Data.normalizeFeature(feature, NOW), null);
  assert.equal(Data.normalizeVesselFeature({ ...feature, properties: { ...feature.properties, mmsi: null } }, NOW), null);
});
