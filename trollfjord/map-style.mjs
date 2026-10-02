import { ARCTIC_LATITUDE } from './explorer-data.mjs?v=20261002.1';
// OpenMapTiles schema, served by OpenFreeMap. Keep the style local so the
// palette and label density stay under our control without a hosted style key.
export const palette = {
  land: '#f7f6f1', water: '#cfE2e7', shore: '#bdd4d8',
  vegetation: '#dfe8dc', road: '#d9d6cc', label: '#687975', ship: '#227d83'
};

const labelName = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const empty = () => ({ type: 'FeatureCollection', features: [] });

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
      vector('roads', 'line', 'transportation', { minzoom: 8,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        paint: { 'line-color': palette.road, 'line-opacity': .7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, .4, 13, 1.5, 17, 3] }
      }),
      vector('local-roads', 'line', 'transportation', { minzoom: 13,
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        paint: { 'line-color': '#e2dfd6', 'line-width': 1 }
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
      { id: 'ship-trail', type: 'line', source: 'ship-track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': palette.ship, 'line-width': 2, 'line-opacity': .65 }
      },
      vector('water-labels', 'symbol', 'water_name', { minzoom: 5,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Italic'],
          'text-size': 11, 'text-letter-spacing': .04, 'text-padding': 30 },
        paint: { 'text-color': '#7c9fa7', 'text-halo-color': palette.water, 'text-halo-width': 1 }
      }),
      vector('islands', 'symbol', 'place', { minzoom: 7,
        filter: ['==', ['get', 'class'], 'island'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-padding': 15 },
        paint: { ...textPaint, 'text-color': '#8c998a' }
      }),
      vector('places', 'symbol', 'place', { minzoom: 6,
        filter: ['match', ['get', 'class'], ['city', 'town', 'village'], true, false],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 13, 13], 'text-padding': 18 },
        paint: textPaint
      }),
      vector('countries', 'symbol', 'place', { maxzoom: 6,
        filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': labelName, 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-transform': 'uppercase', 'text-letter-spacing': .15 }, paint: textPaint
      })
    ]
  };
}
