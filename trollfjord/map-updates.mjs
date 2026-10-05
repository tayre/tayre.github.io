// Avoid worker parsing and tiling when a refreshed GeoJSON source is unchanged.
export function createSourceUpdater(map) {
  const previous = new Map();
  return (id, data) => {
    const source = map.getSource(id);
    if (!source) return false;
    const serialized = JSON.stringify(data);
    const cached = previous.get(id);
    if (cached?.source === source && cached.serialized === serialized) return false;
    source.setData(data);
    previous.set(id, { source, serialized });
    return true;
  };
}

// Reuse nearby geometry between polls, but expire it as soon as any displayed
// report crosses the stale threshold (including during a network outage).
export function createNearbyCache(build) {
  let previous;
  return (reports, ship, now = Date.now()) => {
    const key = JSON.stringify(ship && [ship.mmsi, ship.position, ship.reportedAt]);
    if (previous && previous.reports === reports && previous.key === key
      && now >= previous.at && now < previous.expires) return previous.data;
    const data = build(reports, ship, now);
    let expires = Infinity;
    for (const time of [ship?.reportedAt, ...data.features.map(f => f.properties.reportedAt)]) {
      const expiry = time + 20 * 60000 + 1;
      if (expiry > now) expires = Math.min(expires, expiry);
    }
    previous = { reports, key, at: now, expires, data };
    return data;
  };
}
