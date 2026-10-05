import { ARCTIC_LATITUDE } from './explorer-data.mjs?v=20261005.1';
const KEY = 'trollfjord-arctic-celebration-v1';

// Remember fresh positions seen while visible across visits, including earlier
// days. Celebrate only on a fresh north-side report in the visible app.
export function createCrossingWatcher({ storage, celebrate, now = Date.now,
  visible = () => !document.hidden,
  lock = fn => globalThis.navigator?.locks
    ? navigator.locks.request(KEY, fn) : Promise.resolve(fn()) }) {
  let generation = 0;
  const reset = () => { generation++; };
  const watch = async report => {
    if (!visible()) { reset(); return; }
    const latitude = report?.position?.[0];
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(report?.reportedAt) || now() - report.reportedAt > 20 * 60000
      || report.reportedAt > now() + 5 * 60000) return;
    const visit = generation;
    try {
      await lock(() => {
        if (!visible() || visit !== generation) { reset(); return; }
        let state;
        try { state = JSON.parse(storage.getItem(KEY)); } catch { state = null; }
        if (state?.celebrated || report.reportedAt <= (state?.lastAt || 0)) return;
        const crossing = Number.isFinite(state?.latitude)
          && state.latitude < ARCTIC_LATITUDE && latitude >= ARCTIC_LATITUDE;
        // Persist before displaying to avoid replay in another tab or visit.
        storage.setItem(KEY, JSON.stringify({ latitude, lastAt: report.reportedAt, celebrated: crossing }));
        if (crossing) celebrate();
      });
    } catch { /* Optional celebration must not interrupt tracking. */ }
  };
  watch.reset = reset;
  return watch;
}

export function celebrateArcticCrossing() {
  const banner = document.createElement('div');
  banner.className = 'arctic-celebration';
  const message = document.createElement('div');
  message.setAttribute('role', 'status');
  const title = document.createElement('strong');
  title.textContent = 'Welcome to the Arctic!';
  const text = document.createElement('span');
  text.textContent = 'MS Trollfjord has crossed north of the Arctic Circle.';
  message.append(title, text);
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss celebration');
  banner.append(message, close); document.body.append(banner);
  let canvas, frame, timer;
  const cleanup = () => { cancelAnimationFrame(frame); clearTimeout(timer); canvas?.remove(); banner.remove(); document.removeEventListener('visibilitychange', onVisibility); };
  const onVisibility = () => { if (document.hidden) cleanup(); };
  close.addEventListener('click', cleanup);
  document.addEventListener('visibilitychange', onVisibility);
  timer = setTimeout(cleanup, 7000);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  canvas = document.createElement('canvas');
  canvas.className = 'arctic-fireworks'; canvas.setAttribute('aria-hidden', 'true');
  const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio; canvas.height = height * ratio;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(ratio, ratio);
  const colors = ['#e6ac45', '#2c9a9a', '#d56e58', '#8c83bf'];
  const particles = Array.from({ length: 108 }, (_, i) => {
    const group = Math.floor(i / 36), angle = (i % 36) / 36 * Math.PI * 2;
    const speed = 45 + Math.random() * 90;
    return { x: width * [.25, .75, .5][group], y: height * [.3, .38, .23][group],
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, delay: group * .65, color: colors[i % colors.length] };
  });
  const start = performance.now();
  const draw = time => {
    const elapsed = (time - start) / 1000;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const age = elapsed - p.delay;
      if (age < 0 || age > 2) continue;
      ctx.globalAlpha = 1 - age / 2; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x + p.vx * age, p.y + p.vy * age + 35 * age * age, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (elapsed < 3.4) frame = requestAnimationFrame(draw);
    else canvas.remove();
  };
  frame = requestAnimationFrame(draw);
}
