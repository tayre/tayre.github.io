// Approximate educational latitude: the Arctic Circle slowly moves over time.
// https://www.visitnorway.com/things-to-do/nature-attractions/the-arctic-circle/
export const ARCTIC_LATITUDE = 66.56;

// Reference coordinates use [latitude, longitude], like normalized AIS positions.
// User-supplied address, matched by Nominatim to OpenStreetMap building way 949902627.
// https://www.openstreetmap.org/way/949902627 (© OpenStreetMap contributors, ODbL)
export const GUELPH_REFERENCE = [43.5126671, -80.1769543];
export const NORTH_POLE = [90, 0];

export function distanceKm(from, to) {
  const valid = point => Array.isArray(point) && point.length === 2
    && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
  if (!valid(from) || !valid(to)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const lat1 = radians(from[0]);
  const lat2 = radians(to[0]);
  const a = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(radians(to[1] - from[1]) / 2) ** 2;
  // Mean Earth radius in km; clamp floating-point error at antipodal points.
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export function kidReport(report) {
  if (!report) return { speed: '—', movement: 'Listening for the ship…', latitude: '—' };
  const speed = report.speed === null ? '—' : (report.speed * 1.852).toFixed(1);
  const movement = report.navigation === 'Moored' ? 'Tied up at the dock'
    : report.navigation === 'At anchor' ? 'Resting at anchor'
    : report.speed === null ? 'Speed not reported'
    : report.speed < .5 ? 'Moving very slowly' : 'On the move';
  return { speed, movement, latitude: `${Math.abs(report.position[0]).toFixed(1)}° ${report.position[0] < 0 ? 'S' : 'N'}` };
}
