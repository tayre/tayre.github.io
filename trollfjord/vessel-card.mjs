const photoCache = new Map();
const identifier = (value, digits) => new RegExp(`^[1-9][0-9]{${digits - 1}}$`).test(String(value)) ? String(value) : null;
export function vesselProfileUrl(vessel) {
  const mmsi = identifier(vessel.mmsi, 9);
  return mmsi ? `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}` : null;
}
function trustedUrl(value, host) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === host ? url.href : null; } catch { return null; }
}

// Only identifier matches are used: similar ship names are not reliable evidence.
export async function loadVesselPhoto(vessel, { fetcher = fetch, signal } = {}) {
  const imo = identifier(vessel.imo, 7);
  const mmsi = identifier(vessel.mmsi, 9);
  if (!imo && !mmsi) return null;
  const key = imo ? `imo:${imo}` : `mmsi:${mmsi}`;
  if (photoCache.has(key)) return photoCache.get(key);
  const query = `SELECT ?image WHERE { ?ship wdt:${imo ? 'P458' : 'P587'} "${imo || mmsi}"; wdt:P18 ?image. } LIMIT 1`;
  const request = async url => {
    const response = await fetcher(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Photo source unavailable');
    return response.json();
  };
  const result = await request(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`);
  const image = result.results?.bindings?.[0]?.image?.value;
  if (!image) { photoCache.set(key, null); return null; }
  const filename = decodeURIComponent(new URL(image).pathname.split('/').pop());
  const metadata = await request(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo', titles: `File:${filename}`,
    iiprop: 'url|extmetadata', iiurlwidth: '500'
  })}`);
  const info = Object.values(metadata.query?.pages || {})[0]?.imageinfo?.[0];
  const src = trustedUrl(info?.thumburl, 'upload.wikimedia.org') || trustedUrl(info?.thumburl, 'thumb.wikimedia.org');
  const page = trustedUrl(info?.descriptionurl, 'commons.wikimedia.org');
  const meta = info?.extmetadata;
  if (!src || !page || !meta?.Artist?.value || !meta?.LicenseShortName?.value) return null;
  const photo = { src, page, artist: meta.Artist.value, license: meta.LicenseShortName.value };
  photoCache.set(key, photo);
  return photo;
}

export function createVesselCard(vessel) {
  const element = document.createElement('div');
  element.className = 'place-card vessel-card';
  const add = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    element.append(node);
    return node;
  };
  const name = vessel.name || `MMSI ${vessel.mmsi}`;
  add('strong', name);
  const photoStatus = add('p', 'Looking for a ship photo…', 'photo-status');
  const speed = Number.isFinite(vessel.speed) ? `${vessel.speed.toFixed(1)} kn` : 'Speed unavailable';
  add('p', `${Number(vessel.distanceMiles).toFixed(1)} mi from MS Trollfjord · ${speed}`);
  add('p', `${vessel.navigation || 'Status not reported'} · Course ${Number.isFinite(vessel.course) ? `${vessel.course.toFixed(0)}°` : 'not reported'}`);
  add('p', `Destination: ${vessel.destination || 'Not reported'}`);
  add('p', `MMSI ${vessel.mmsi}${identifier(vessel.imo, 7) ? ` · IMO ${vessel.imo}` : ''}`, 'vessel-identifiers');
  add('p', `Reported ${new Date(vessel.reportedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC`);
  const profile = vesselProfileUrl(vessel);
  if (profile) {
    const link = add('a', 'More details on MarineTraffic ↗', 'vessel-profile');
    link.href = profile; link.target = '_blank'; link.rel = 'noopener noreferrer';
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let disposed = false;
  const plainText = html => new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
  loadVesselPhoto(vessel, { signal: controller.signal }).then(photo => {
    if (disposed) return;
    if (!photo) { photoStatus.textContent = 'No photo available'; return; }
    const figure = document.createElement('figure');
    figure.className = 'vessel-photo';
    const img = document.createElement('img');
    img.alt = `Photo of ${name}`; img.width = 250; img.height = 130; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { if (!disposed) { photoStatus.textContent = 'Photo unavailable'; figure.replaceWith(photoStatus); } });
    img.src = photo.src;
    const caption = document.createElement('figcaption');
    const credit = document.createElement('a');
    credit.href = photo.page; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    credit.textContent = `${plainText(photo.artist)} · ${plainText(photo.license)} · Wikimedia Commons`;
    caption.append(credit); figure.append(img, caption); photoStatus.replaceWith(figure);
  }).catch(() => { if (!disposed) photoStatus.textContent = 'Photo unavailable'; }).finally(() => clearTimeout(timeout));
  return { element, dispose() { disposed = true; clearTimeout(timeout); controller.abort(); } };
}
