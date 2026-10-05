import { kidReport, distanceKm, GUELPH_REFERENCE, NORTH_POLE } from './explorer-data.mjs?v=20261005.1';

export function createExplorer() {
  const el = id => document.getElementById(id);
  let map = null;
  const distanceText = km => km === null ? '—' : Math.round(km).toLocaleString('en-CA');
  el('overview').addEventListener('click', () => map?.overview());

  return {
    setReport(report) {
      const facts = kidReport(report);
      el('kid-speed').textContent = facts.speed;
      el('speed-knots').textContent = report.speed === null ? '—' : report.speed.toFixed(1);
      el('speed-note').textContent = report.speed !== null && report.speed < .5 && ['Moored', 'At anchor'].includes(report.navigation)
        ? 'Tiny speeds at rest can reflect AIS position noise. This is the last reported reading.'
        : 'Speed from the last AIS report, not a live estimate.';
      el('kid-movement').textContent = facts.movement;
      el('kid-latitude').textContent = facts.latitude;
      el('distance-guelph').textContent = distanceText(distanceKm(report.position, GUELPH_REFERENCE));
      el('distance-pole').textContent = distanceText(distanceKm(report.position, NORTH_POLE));
    },
    setMap(value) {
      map = value;
      el('overview').disabled = false;
    }
  };
}
