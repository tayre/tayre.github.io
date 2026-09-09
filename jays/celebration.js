// A short, silent, dependency-free win celebration. No canvas or animation
// work is allocated until a confirmed, previously unseen Toronto victory.
(() => {
  'use strict';

  window.JaysCelebration = function () {
    let storage;
    try { storage = window.sessionStorage; } catch { /* Storage may be blocked. */ }
    const tracker = JaysLogic.createWinTracker(storage);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup;

    function stop() {
      cleanup?.();
      cleanup = undefined;
    }

    function launch() {
      stop();
      const canvas = document.createElement('canvas');
      canvas.className = 'win-fireworks';
      canvas.setAttribute('aria-hidden', 'true');
      const context = canvas.getContext('2d');
      if (!context) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.scale(scale, scale);
      document.body.append(canvas);

      // Staggered blue bursts with red accents. No full-screen flashes,
      // backdrop, input interception, audio or additional network requests.
      const colors = ['#134a8e', '#2682c8', '#77bce6', '#dc3340'];
      const bursts = [
        { at: 0, x: .25, y: .32 },
        { at: .45, x: .74, y: .26 },
        { at: .95, x: .48, y: .4 },
        { at: 1.5, x: .2, y: .5 },
        { at: 1.95, x: .8, y: .43 }
      ];
      const particles = bursts.flatMap((burst, index) => Array.from({ length: 34 }, (_, i) => {
        const angle = Math.PI * 2 * i / 34 + index;
        const speed = (48 + Math.random() * 70) * Math.min(width / 500, 1);
        return {
          at: burst.at, x: width * burst.x, y: height * burst.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1.05 + Math.random() * .45, color: colors[i % colors.length]
        };
      }));
      const start = performance.now();
      let frame;
      let expiry;
      function tick(now) {
        const elapsed = (now - start) / 1000;
        if (elapsed >= 3.6) { stop(); return; }
        context.clearRect(0, 0, width, height);
        for (const particle of particles) {
          const age = elapsed - particle.at;
          if (age < 0 || age >= particle.life) continue;
          const distance = (1 - Math.exp(-1.8 * age)) / 1.8;
          const tail = (1 - Math.exp(-1.8 * Math.max(0, age - .08))) / 1.8;
          context.globalAlpha = Math.min(1, age * 12) * (1 - age / particle.life);
          context.strokeStyle = particle.color;
          context.lineWidth = 2;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(particle.x + particle.vx * tail, particle.y + particle.vy * tail + 24 * age * age);
          context.lineTo(particle.x + particle.vx * distance, particle.y + particle.vy * distance + 24 * age * age);
          context.stroke();
        }
        frame = requestAnimationFrame(tick);
      }
      function onVisibility() { if (document.hidden) stop(); }
      cleanup = () => {
        cancelAnimationFrame(frame);
        clearTimeout(expiry);
        canvas.remove();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', stop);
        window.removeEventListener('resize', stop);
        reducedMotion.removeEventListener('change', stop);
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', stop);
      window.addEventListener('resize', stop);
      reducedMotion.addEventListener('change', stop);
      expiry = setTimeout(stop, 3700); // Also clean up if animation frames stall.
      frame = requestAnimationFrame(tick);
    }

    return {
      show(games) {
        if (document.hidden) return;
        const wins = tracker.claim(games);
        if (wins.length && !reducedMotion.matches) {
          try { launch(); } catch { stop(); } // Cosmetics must never hide scores.
        }
      },
      stop
    };
  };
})();
