(function (root) {
  'use strict';

  const MMSI = 258465000;
  const IMO = 9233258;
  const API_URL = 'https://kystdatahuset.kystverket.no/ws/api/ais/realtime/geojson';
  const NAVIGATION = {
    0: 'Under way', 1: 'At anchor', 2: 'Not under command',
    3: 'Restricted manoeuvrability', 4: 'Constrained by draught',
    5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Under sail',
    11: 'Towing astern', 12: 'Pushing / towing alongside',
    14: 'AIS safety device', 15: 'Not reported'
  };

  function numeric(value, min, max) {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function coordinate(value) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lon = numeric(value[0], -180, 180);
    const lat = numeric(value[1], -90, 90);
    return lat === null || lon === null ? null : [lat, lon];
  }

  function utcTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return null;
    // date_time_utc is UTC even when the API omits a timezone suffix.
    const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function normalizeVesselFeature(feature, now = Date.now(), { includeTrack = true } = {}) {
    const properties = feature?.properties;
    const mmsi = numeric(properties?.mmsi, 100000000, 999999999);
    if (!Number.isInteger(mmsi)) return null;
    const type = feature.geometry?.type;
    const coordinates = type === 'Point' ? [feature.geometry.coordinates]
      : type === 'LineString' ? feature.geometry.coordinates : null;
    if (!Array.isArray(coordinates) || !coordinates.length) return null;
    // The GeoJSON track is ordered oldest to newest. Its endpoint is the report position.
    const position = coordinate(coordinates[coordinates.length - 1]);
    const reportedAt = utcTimestamp(properties.date_time_utc);
    if (!position || reportedAt === null || reportedAt > now + 5 * 60 * 1000) return null;
    const track = includeTrack ? coordinates.map(coordinate) : [];
    const destination = typeof properties.destination === 'string' ? properties.destination.trim().slice(0, 80) : '';
    return {
      mmsi, position, reportedAt,
      imo: Number.isInteger(numeric(properties.imo, 1000000, 9999999)) ? Number(properties.imo) : null,
      name: typeof properties.ship_name === 'string' ? properties.ship_name.trim().slice(0, 80) : '',
      // Don't draw a line across malformed/missing points.
      track: track.every(Boolean) ? track : [],
      // The JSON API already decodes SOG to knots; do not divide by 10 again.
      // AIS 102.3 denotes unavailable, while a real zero must remain zero.
      speed: numeric(properties.speed, 0, 102.2),
      course: numeric(properties.cog, 0, 359.9),
      heading: numeric(properties.true_heading, 0, 359),
      destination: destination || 'Not reported',
      navigation: NAVIGATION[numeric(properties.status, 0, 15)] || 'Not reported',
      feature: includeTrack ? feature : undefined
    };
  }

  function normalizeFeature(feature, now = Date.now()) {
    const properties = feature?.properties;
    if (!properties || Number(properties.mmsi) !== MMSI) return null;
    if (properties.imo && Number(properties.imo) !== IMO) return null;
    return normalizeVesselFeature(feature, now);
  }

  function latestReport(payload, now = Date.now()) {
    if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
      throw new Error('The AIS feed returned an unexpected format.');
    }
    let latest = null;
    for (const feature of payload.features) {
      const report = normalizeFeature(feature, now);
      if (report && (!latest || report.reportedAt > latest.reportedAt)) latest = report;
    }
    return latest;
  }

  function reportAge(timestamp, now = Date.now()) {
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
    if (minutes < 1) return 'Reported just now';
    if (minutes < 60) return `Reported ${minutes}m ago`;
    if (minutes < 1440) return `Reported ${Math.floor(minutes / 60)}h ago`;
    return `Reported ${Math.floor(minutes / 1440)}d ago`;
  }

  const api = { MMSI, IMO, API_URL, normalizeFeature, normalizeVesselFeature, latestReport, reportAge };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrollfjordData = api;
})(typeof globalThis === 'object' ? globalThis : this);
