import { ROUTES, zonedTimestamp } from '../core.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const label = value => typeof value === 'string' ? value.slice(0, 120) : null;

export function selectFlight(flights, route, date) {
  return flights.filter(f => {
    const departure = stamp(f.scheduled_out) || stamp(f.scheduled_off);
    if (!departure || f.origin?.code_iata !== route.from || f.destination?.code_iata !== route.to) return false;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: route.originZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(departure));
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day}` === date;
  });
}

export async function onRequest({ request, env, waitUntil }, deps = {}) {
  if (request.method !== 'GET') return json({ message: 'Use GET.' }, 405);
  const url = new URL(request.url);
  const key = url.searchParams.get('route');
  const route = ROUTES[key];
  if (!Object.hasOwn(ROUTES, key)) return json({ message: 'Unknown journey.' }, 400);
  // Only the two configured journeys can spend provider credits.
  const date = route.date;
  const number = route.number.replace(/\s/g, '');
  if (url.searchParams.get('date') !== date || url.searchParams.get('number')?.replace(/\s/g, '').toUpperCase() !== number) {
    return json({ message: 'Live status is configured for your original two flights. Restore those flight details to check.' }, 400);
  }
  const freeProvider = Boolean(env.AVIATIONSTACK_KEY);
  const source = freeProvider ? 'Aviationstack' : 'FlightAware';
  if (!env.AEROAPI_KEY && !freeProvider) return json({ message: 'Live status is not connected yet. Your timer still works.' }, 503);
  const now = deps.now ?? Date.now();
  const start = zonedTimestamp(date, '00:00', route.originZone);
  if (start > now + 48 * 3600000 || start < now - 7 * 86400000) return json({ message: 'Check again within two days of departure. Live status is available around your travel date.' });
  const cache = deps.cache ?? globalThis.caches?.default;
  const cacheKey = new Request(`${url.origin}/flights/api/status?v=2&route=${key}&date=${date}&provider=${source}`);
  const cached = await cache?.match(cacheKey);
  if (cached) return json(await cached.json());
  const ident = env[key === 'return' ? 'RETURN_FLIGHT_IDENT' : 'OUTBOUND_FLIGHT_IDENT'] || number;
  if (!/^[A-Z0-9]{3,10}$/.test(ident)) return json({ message: 'The live flight connection needs a valid flight identifier.' }, 503);
  const upstream = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${ident}`);
  upstream.search = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString(), max_pages: '1' });
  const providerURL = freeProvider ? new URL('https://api.aviationstack.com/v1/flights') : upstream;
  // No flight_date parameter: historical/future endpoints require a paid plan.
  // Match the travel date locally against the real-time response instead.
  if (freeProvider) providerURL.search = new URLSearchParams({ access_key: env.AVIATIONSTACK_KEY, flight_iata: ident, dep_iata: route.from, arr_iata: route.to, limit: '100' });
  try {
    const response = await (deps.fetch ?? fetch)(providerURL, { headers: freeProvider ? { Accept: 'application/json' } : { 'x-apikey': env.AEROAPI_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return json({ message: response.status === 429 ? 'Flight updates are busy. Please try again later.' : 'The flight-data service is unavailable. Please try again later.' }, 502);
    const data = await response.json();
    if (freeProvider) {
      if (data.error || !Array.isArray(data.data)) throw new Error('Provider unavailable');
      data.flights = data.data.filter(f => f.flight_date === date).map(f => ({
        ident_iata: f.flight?.iata, origin: { code_iata: f.departure?.iata, name: f.departure?.airport }, destination: { code_iata: f.arrival?.iata, name: f.arrival?.airport },
        scheduled_out: f.departure?.scheduled, estimated_out: f.departure?.estimated, actual_out: f.departure?.actual,
        scheduled_in: f.arrival?.scheduled, estimated_in: f.arrival?.estimated, actual_in: f.arrival?.actual,
        status: f.flight_status, cancelled: f.flight_status === 'cancelled', diverted: f.flight_status === 'diverted',
        gate_origin: f.departure?.gate, terminal_origin: f.departure?.terminal,
        gate_destination: f.arrival?.gate, terminal_destination: f.arrival?.terminal, baggage_claim: f.arrival?.baggage,
        airline_name: f.airline?.name, operating_ident: f.flight?.codeshared?.flight_iata,
        operating_airline: f.flight?.codeshared?.airline_name,
        aircraft_type: f.aircraft?.icao || f.aircraft?.iata, registration: f.aircraft?.registration
      }));
    }
    if (!Array.isArray(data.flights)) throw new Error('Invalid provider response');
    const matches = selectFlight(data.flights, route, date);
    const f = matches.length === 1 ? matches[0] : null;
    const body = { checkedAt: new Date(now).toISOString(), source, ...(f ? {
      flight: { number: label(f.ident_iata || f.ident), status: f.cancelled ? 'Cancelled' : f.diverted ? 'Diverted' : label(f.status) || 'Status unavailable',
        departure: stamp(f.actual_out) || stamp(f.estimated_out) || stamp(f.scheduled_out),
        departureKind: f.actual_out ? 'Departed gate' : f.estimated_out ? 'Estimated departure' : 'Scheduled departure',
        arrival: stamp(f.actual_in) || stamp(f.estimated_in) || stamp(f.scheduled_in),
        arrivalKind: f.actual_in ? 'Arrived at gate' : f.estimated_in ? 'Estimated arrival' : 'Scheduled arrival',
        gate: label(f.gate_destination),
        airline: label(f.airline_name || f.operator), operatingNumber: label(f.operating_ident), operatingAirline: label(f.operating_airline),
        aircraft: label(f.aircraft_type), registration: label(f.registration),
        departureInfo: { code: route.from, name: label(f.origin?.name), terminal: label(f.terminal_origin), gate: label(f.gate_origin),
          scheduled: stamp(f.scheduled_out), estimated: stamp(f.estimated_out), actual: stamp(f.actual_out) },
        arrivalInfo: { code: route.to, name: label(f.destination?.name), terminal: label(f.terminal_destination), gate: label(f.gate_destination), baggage: label(f.baggage_claim),
          scheduled: stamp(f.scheduled_in), estimated: stamp(f.estimated_in), actual: stamp(f.actual_in) } }
    } : { message: matches.length > 1 ? 'Multiple matching flights were returned. Check with your airline.' : 'No matching flight yet. Try closer to departure; codeshares may need the operating flight number.' }) };
    if (cache) {
      const write = cache.put(cacheKey, Response.json(body, { headers: { 'Cache-Control': 'public, max-age=300' } }));
      if (waitUntil) waitUntil(write); else await write;
    }
    return json(body);
  } catch { return json({ message: 'Could not reach the flight-data service. Please try again when connected.' }, 502); }
}
