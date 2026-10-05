export function parseSunTimes(payload, now = Date.now()) {
  const timezone = payload.timezone;
  if (typeof timezone !== 'string' || !timezone) throw new Error('Missing local time zone');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = name => parts.find(p => p.type === name).value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (payload.daily?.time?.[0] !== date) throw new Error('Sun times are not for today');
  const clock = value => typeof value === 'string' && value.startsWith(`${date}T`)
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value.slice(11, 16) : null;
  const sunrise = clock(payload.daily.sunrise?.[0]);
  const sunset = clock(payload.daily.sunset?.[0]);
  const daylight = payload.daily.daylight_duration?.[0];
  let note = 'Near the ship';
  if (!sunrise && !sunset) {
    if (daylight === 0) note = 'Polar night · no sunrise';
    else if (typeof daylight === 'number' && daylight >= 86399 && daylight <= 86400) note = 'Midnight sun · no sunset';
    else throw new Error('Sun times unavailable');
  } else if (!sunrise) note = 'No sunrise today';
  else if (!sunset) note = 'No sunset today';
  return { sunrise, sunset, date, timezone, note };
}
