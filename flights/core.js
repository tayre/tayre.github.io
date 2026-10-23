export const MINUTE = 60_000;
export const ROUTES = {
  outbound: { from: 'YYZ', to: 'SFO', origin: 'Toronto', destination: 'San Francisco', lat: 37.62, lon: -122.38, zone: 'America/Los_Angeles', originZone: 'America/Toronto', duration: 330, number: 'AC 743', date: '2026-10-25', operator: 'Air Canada' },
  return: { from: 'SFO', to: 'YYZ', origin: 'San Francisco', destination: 'Toronto', lat: 43.68, lon: -79.63, zone: 'America/Toronto', originZone: 'America/Los_Angeles', duration: 285, number: 'AC 4067', date: '2026-10-30', operator: 'United Airlines' }
};

export function newFlight(route) {
  return { duration: route.duration, number: route.number, date: route.date, departureTime: '', startedAt: null, landedAt: null };
}

export function cleanFlight(value, route, now = Date.now()) {
  const fallback = newFlight(route);
  if (!value || typeof value !== 'object') return fallback;
  return {
    duration: Number.isInteger(value.duration) && value.duration >= 30 && value.duration <= 900 ? value.duration : fallback.duration,
    number: typeof value.number === 'string' ? value.number.slice(0, 12) : fallback.number,
    date: typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : fallback.date,
    departureTime: typeof value.departureTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.departureTime) ? value.departureTime : '',
    startedAt: Number.isFinite(value.startedAt) && value.startedAt > 0 && value.startedAt <= now ? value.startedAt : null,
    landedAt: Number.isFinite(value.landedAt) && value.landedAt > 0 && value.landedAt <= now && Number.isFinite(value.startedAt) && value.landedAt >= value.startedAt ? value.landedAt : null
  };
}

export function progress(flight, now = Date.now()) {
  const started = Number.isFinite(flight.startedAt);
  const landed = started && Number.isFinite(flight.landedAt);
  const elapsed = started ? Math.max(0, ((landed ? flight.landedAt : now) - flight.startedAt) / MINUTE) : 0;
  const count = Math.ceil(flight.duration / 60);
  return { started, landed, elapsed, count, fraction: landed ? 1 : Math.min(1, elapsed / flight.duration), remaining: Math.max(0, Math.ceil(flight.duration - elapsed)), current: Math.min(count - 1, Math.floor(elapsed / 60)), overtime: started && !landed && elapsed >= flight.duration };
}

export function durationText(minutes) {
  const whole = Math.max(0, Math.ceil(minutes));
  return [Math.floor(whole / 60) ? `${Math.floor(whole / 60)}h` : '', whole % 60 ? `${whole % 60}m` : ''].filter(Boolean).join(' ') || '0m';
}

export function zonedTimestamp(date, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(format.formatToParts(guess).map(part => [part.type, part.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (represented === target) return guess;
    guess += target - represented;
  }
  return null;
}

export function arrivalTime(flight, now = Date.now(), route) {
  const scheduled = route ? zonedTimestamp(flight.date, flight.departureTime, route.originZone) : null;
  return (flight.startedAt ?? scheduled ?? now) + flight.duration * MINUTE;
}

export function weatherAtArrival(data, arrival) {
  const hourly = data?.hourly;
  if (!Array.isArray(hourly?.time) || !hourly.time.length || !Number.isFinite(arrival)) return null;
  let best = -1, delta = Infinity;
  hourly.time.forEach((time, index) => {
    const difference = Math.abs(time * 1000 - arrival);
    if (Number.isFinite(time) && difference < delta) { best = index; delta = difference; }
  });
  if (best < 0 || delta > 30 * MINUTE) return null;
  const temperature = hourly.temperature_2m?.[best], wind = hourly.wind_speed_10m?.[best], code = hourly.weather_code?.[best];
  if (![temperature, wind, code].every(Number.isFinite) || wind < 0) return null;
  return { time: hourly.time[best] * 1000, temperature, wind, code };
}

export function weatherDescription(code) {
  if (code === 0) return 'Clear skies';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45,48].includes(code)) return 'Fog';
  if ([51,53,55].includes(code)) return 'Drizzle';
  if ([56,57].includes(code)) return 'Freezing drizzle';
  if ([61,63,65].includes(code)) return 'Rain';
  if ([66,67].includes(code)) return 'Freezing rain';
  if ([71,73,75,77,85,86].includes(code)) return 'Snow';
  if ([80,81,82].includes(code)) return 'Rain showers';
  if ([95,96,99].includes(code)) return 'Thunderstorms';
  return 'Weather details unavailable';
}

export const CHAPTERS = [
  ['Settle in', 'Find a little comfort. Let your shoulders soften.'],
  ['Make yourself at home', 'A sip of water. A familiar song. One small comfort.'],
  ['A little escape', 'Let a story, a film, or a daydream hold your attention.'],
  ['Find your rhythm', 'There is nothing you need to rush. Let this hour be simple.'],
  ['A little closer', 'Think of one small thing you’ll enjoy on the other side.'],
  ['Room for the journey', 'You can take the rest in small, gentle moments.']
];

export const THOUGHTS = [
  ['You don’t have to carry\nthe whole journey.\nJust this moment.', 'A GENTLE REMINDER'],
  ['Let your shoulders fall.\nThere is nothing to solve\nin this breath.', 'A SMALL INVITATION'],
  ['“Confine thyself\nto the present.”', 'MARCUS AURELIUS · MEDITATIONS VII'],
  ['A thought can pass\nthrough your mind\nwithout becoming a task.', 'LET IT PASS'],
  ['Your task is small:\nrest here, breathe gently,\nlet the crew do theirs.', 'INSPIRED BY EPICTETUS'],
  ['Somewhere ahead,\nan ordinary, lovely\nmoment is waiting.', 'SOMETHING TO LOOK FORWARD TO'],
  ['You can feel nervous\nand still be doing\nsomething brave.', 'BOTH CAN BE TRUE'],
  ['Name three quiet things:\na colour, a texture,\na familiar sound.', 'COME BACK TO THE CABIN'],
  ['This hour can be\na cup of water\nand a favourite album.', 'KEEP IT SMALL'],
  ['You don’t need to\nrehearse the future\nto meet it.', 'INSPIRED BY MARCUS AURELIUS'],
  ['Rest is something\nyou’re allowed to do\nbefore everything feels settled.', 'A LITTLE PERMISSION'],
  ['Picture your first\nunhurried step\non the other side.', 'ONE MOMENT AT A TIME']
];
