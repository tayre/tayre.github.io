import { Map, Marker, NavigationControl, ScaleControl, AttributionControl, Popup, setWorkerUrl } from './vendor/maplibre-gl.mjs';
import { createStyle, trackGeoJSON } from './map-style.mjs?v=20261005.1';
import { distanceKm } from './explorer-data.mjs?v=20261005.1';

setWorkerUrl(new URL('./vendor/maplibre-gl-worker.mjs', import.meta.url).href);

export function createShipMap({ onError, onReady }) {
  const map = new Map({
    container: 'map', style: createStyle(), center: [18, 68.5], zoom: 4,
    minZoom: 2, maxZoom: 16, attributionControl: false,
    dragRotate: false, touchPitch: false, pitchWithRotate: false,
    scrollZoom: false, maxPitch: 0,
    canvasContextAttributes: { antialias: true }
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
  map.addControl(new AttributionControl({ compact: false }), 'bottom-right');
  map.getCanvas().setAttribute('aria-label', 'Interactive WebGL map of MS Trollfjord');

  let latest = null;
  let marker = null;
  let loaded = false;
  let stale = false;
  let contextLost = false;
  let mapFailed = false;
  let explored = false;
  const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
  const element = document.createElement('div');
  element.className = 'ship-icon';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'MS Trollfjord — last reported position');
  element.innerHTML = '<img src="ship.svg" alt="" aria-hidden="true"><span class="ship-point"></span><span class="ship-label"><strong>MS Trollfjord</strong><span class="ship-reading"></span></span>';

  function overview(animate = true) {
    const lon = latest?.position[1] ?? 26;
    const lat = latest?.position[0] ?? 71;
    map.fitBounds([[Math.min(3.5, lon - 1), Math.min(58, lat - 1)], [Math.max(31.5, lon + 1), Math.max(71.5, lat + .8)]],
      { padding: { top: 85, bottom: 75, left: 40, right: 60 }, duration: animate ? motion() : 0 });
  }
  overview(false);

  function drawReport() {
    if (!latest) return;
    const [lat, lon] = latest.position;
    element.classList.toggle('is-old', stale);
    const speed = latest.speed === null ? 'Speed unavailable' : `${latest.speed.toFixed(1)} kn · ${(latest.speed * 1.852).toFixed(1)} km/h`;
    element.querySelector('.ship-reading').textContent = speed;
    element.setAttribute('aria-label', `MS Trollfjord, ${speed}, ${latest.navigation}. Last reported position.`);
    if (!marker) {
      marker = new Marker({ element, anchor: 'bottom', offset: [0, 4] }).setLngLat([lon, lat]).addTo(map);
      if (!explored) overview(false);
    } else marker.setLngLat([lon, lat]);
    if (loaded) {
      map.getSource('ship-track').setData(trackGeoJSON(latest));
      map.setPaintProperty('ship-trail', 'line-opacity', stale ? .3 : .65);
    }
  }

  map.on('load', () => { loaded = true; drawReport(); });
  map.on('resize', () => { if (!explored) overview(false); });
  map.on('mouseenter', 'places', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'places', () => { map.getCanvas().style.cursor = ''; });
  map.on('click', 'places', event => {
    const place = event.features?.[0];
    if (place?.geometry.type !== 'Point') return;
    const [lon, lat] = place.geometry.coordinates;
    const name = place.properties['name:en'] || place.properties['name:latin'] || place.properties.name;
    const content = document.createElement('div');
    content.className = 'place-card';
    const title = document.createElement('strong');
    title.textContent = name;
    const detail = document.createElement('p');
    detail.textContent = latest
      ? `About ${Math.round(distanceKm(latest.position, [lat, lon])).toLocaleString('en-CA')} km from the ship’s last position.`
      : 'A geographic reference point. Ship distance will appear once an AIS report is available.';
    content.append(title, detail);
    new Popup({ maxWidth: '230px', offset: 12 }).setLngLat([lon, lat]).setDOMContent(content).addTo(map);
  });
  map.on('error', () => {
    mapFailed = true;
    onError('Some map details could not load. Ship data is still available below.');
  });
  map.on('idle', () => { if (!contextLost && !mapFailed) onReady(); });
  map.on('movestart', event => { mapFailed = false; if (event.originalEvent) explored = true; });
  map.on('webglcontextlost', () => { contextLost = true; onError('The map graphics were interrupted. Ship data continues to update below.'); });
  map.on('webglcontextrestored', () => { contextLost = false; mapFailed = false; drawReport(); });

  return {
    setReport(report) { latest = report; drawReport(); },
    setStale(value) {
      stale = value;
      element.classList.toggle('is-old', stale);
      if (loaded) map.setPaintProperty('ship-trail', 'line-opacity', stale ? .3 : .65);
    },
    locate() {
      explored = true;
      if (latest) {
        map.easeTo({ center: [latest.position[1], latest.position[0]], zoom: 10, duration: motion() });
      }
    },
    overview() { explored = true; overview(); }
  };
}
