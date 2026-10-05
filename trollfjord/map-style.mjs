import { ARCTIC_LATITUDE, distanceKm } from './explorer-data.mjs?v=20261005.1';
// OpenMapTiles schema, served by OpenFreeMap. Keep the style local so the
// palette and label density stay under our control without a hosted style key.
export const palette = {
  land: '#f5f2e9', water: '#c5dde0', shore: '#a9c8cb',
  vegetation: '#dce5d6', road: '#c8bfae', label: '#455f60', ship: '#14767d'
};

const labelName = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const empty = () => ({ type: 'FeatureCollection', features: [] });
export const NEARBY_RADIUS_KM = 50 * 1.609344;

export function nearbyGeoJSON(reports, ship, now = Date.now()) {
  if (!ship || now - ship.reportedAt > 20 * 60000 || distanceKm(ship.position, ship.position) !== 0) return empty();
  const newest = new Map();
  for (const report of reports) {
    if (report.mmsi === ship.mmsi || now - report.reportedAt > 20 * 60000 || report.reportedAt > now + 5 * 60000) continue;
    if (!newest.has(report.mmsi) || newest.get(report.mmsi).reportedAt < report.reportedAt) newest.set(report.mmsi, report);
  }
  const features = [];
  for (const report of newest.values()) {
    const distance = distanceKm(ship.position, report.position);
    if (distance === null || distance > NEARBY_RADIUS_KM) continue;
    features.push({ type: 'Feature', id: report.mmsi,
      geometry: { type: 'Point', coordinates: [report.position[1], report.position[0]] },
      properties: { mmsi: report.mmsi, name: report.name || `MMSI ${report.mmsi}`,
        imo: report.imo, destination: report.destination, navigation: report.navigation, course: report.course,
        speed: report.speed, reportedAt: report.reportedAt, distanceMiles: distance / 1.609344 }
    });
  }
  return { type: 'FeatureCollection', features };
}

export function trackGeoJSON(report) {
  if (!report || report.track.length < 2) return empty();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: report.track.map(([lat, lon]) => [lon, lat]) }
  }] };
}

export function createStyle() {
  const vector = (id, type, sourceLayer, rest) => ({ id, type,
    source: 'coast', 'source-layer': sourceLayer, ...rest });
  const textPaint = { 'text-color': palette.label, 'text-halo-color': palette.land, 'text-halo-width': 1.5 };
  return {
    version: 8,
    name: 'Trollfjord · Coastal',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      coast: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>' },
      'ship-track': { type: 'geojson', data: empty() },
      'nearby-ships': { type: 'geojson', data: empty() },
      discoveries: { type: 'geojson', data: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { name: 'ARCTIC CIRCLE · ≈66.56° N' },
          geometry: { type: 'LineString', coordinates: [[-180, ARCTIC_LATITUDE], [0, ARCTIC_LATITUDE], [180, ARCTIC_LATITUDE]] } }
      ] } }
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': palette.land } },
      vector('vegetation', 'fill', 'landcover', {
        filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
        paint: { 'fill-color': palette.vegetation, 'fill-opacity': .55 }
      }),
      vector('parks', 'fill', 'park', { paint: { 'fill-color': palette.vegetation, 'fill-opacity': .35 } }),
      vector('ice', 'fill', 'landcover', {
        filter: ['match', ['get', 'subclass'], ['glacier', 'ice_shelf'], true, false],
        paint: { 'fill-color': '#fff', 'fill-opacity': .8 }
      }),
      vector('water', 'fill', 'water', {
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': palette.water, 'fill-outline-color': palette.shore, 'fill-antialias': true }
      }),
      vector('rivers', 'line', 'waterway', { minzoom: 9,
        paint: { 'line-color': palette.shore, 'line-width': .7 }
      }),
      vector('roads', 'line', 'transportation', { minzoom: 6,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        paint: { 'line-color': palette.road, 'line-opacity': .7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, .4, 13, 1.5, 17, 3] }
      }),
      vector('local-roads', 'line', 'transportation', { minzoom: 13,
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        paint: { 'line-color': '#e2dfd6', 'line-width': 1 }
      }),
      vector('buildings', 'fill', 'building', { minzoom: 13,
        paint: { 'fill-color': '#d5cec0', 'fill-outline-color': '#bdb6a8', 'fill-opacity': .65 }
      }),
      vector('borders', 'line', 'boundary', {
        filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': '#a6b5ae', 'line-width': .7, 'line-dasharray': [3, 4], 'line-opacity': .55 }
      }),
      { id: 'arctic-line', type: 'line', source: 'discoveries', filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#b98650', 'line-width': 1.5, 'line-dasharray': [5, 5], 'line-opacity': .8 } },
      { id: 'arctic-label', type: 'symbol', source: 'discoveries', maxzoom: 9,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 430, 'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, -1], 'text-letter-spacing': .05 },
        paint: { 'text-color': '#8d6a40', 'text-halo-color': palette.land, 'text-halo-width': 2 } },
      { id: 'nearby-vessels', type: 'circle', source: 'nearby-ships',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 4, 14, 5],
          'circle-color': '#7b8e94', 'circle-opacity': .55,
          'circle-stroke-color': '#f8f6ef', 'circle-stroke-width': 1, 'circle-stroke-opacity': .65 }
      },
      { id: 'ship-trail', type: 'line', source: 'ship-track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': palette.ship, 'line-width': 2, 'line-opacity': .65 }
      },
      vector('water-labels', 'symbol', 'water_name', { minzoom: 3,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Italic'],
          'text-size': 12, 'text-letter-spacing': .06, 'text-padding': 12 },
        paint: { 'text-color': '#547d85', 'text-halo-color': palette.water, 'text-halo-width': 1 }
      }),
      vector('islands', 'symbol', 'place', { minzoom: 5,
        filter: ['==', ['get', 'class'], 'island'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-padding': 15 },
        paint: { ...textPaint, 'text-color': '#8c998a' }
      }),
      vector('place-dots', 'circle', 'place', { minzoom: 3,
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.7, 9, 2.8],
          'circle-color': '#667f78', 'circle-stroke-color': palette.land, 'circle-stroke-width': 1 }
      }),
      vector('places', 'symbol', 'place', { minzoom: 3,
        filter: ['step', ['zoom'], ['==', ['get', 'class'], 'city'], 5, ['match', ['get', 'class'], ['city', 'town'], true, false], 8, ['match', ['get', 'class'], ['city', 'town', 'village', 'hamlet', 'suburb'], true, false]],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 12, 13, 14], 'text-padding': 6,
          'text-anchor': 'top', 'text-offset': [0, .5], 'symbol-sort-key': ['coalesce', ['get', 'rank'], 10] },
        paint: textPaint
      }),
      vector('peaks', 'symbol', 'mountain_peak', { minzoom: 9,
        layout: { 'text-field': ['concat', '△ ', labelName, ['case', ['!=', ['get', 'ele'], null], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']],
          'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-padding': 12 }, paint: textPaint
      }),
      vector('waterway-labels', 'symbol', 'waterway', { minzoom: 10,
        layout: { 'symbol-placement': 'line', 'text-field': labelName, 'text-font': ['Noto Sans Italic'], 'text-size': 11 },
        paint: { 'text-color': '#547d85', 'text-halo-color': palette.water, 'text-halo-width': 1 }
      }),
      vector('countries', 'symbol', 'place', { maxzoom: 6,
        filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-transform': 'uppercase', 'text-letter-spacing': .15 }, paint: textPaint
      })
    ]
  };
}
