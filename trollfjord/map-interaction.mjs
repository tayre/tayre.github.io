// Select actual marker centres within a circular screen-space target, not the
// first rendered feature (which depends on layer order and tile duplication).
export function pickMapFeature(features, point, project, radius) {
  let best = null;
  let bestDistance = Infinity;
  let bestPriority = Infinity;
  for (const feature of features) {
    if (feature.geometry?.type !== 'Point') continue;
    const screen = project(feature.geometry.coordinates);
    const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
    if (!Number.isFinite(distance) || distance > radius) continue;
    const priority = feature.layer?.id === 'nearby-vessels' ? 0 : 1;
    if (priority < bestPriority || (priority === bestPriority && distance < bestDistance)) {
      best = feature; bestDistance = distance; bestPriority = priority;
    }
  }
  return best;
}
