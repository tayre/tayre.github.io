(() => {
  'use strict';
  let context;
  let master;
  let generation = 0;
  const voices = new Set();
  function stop() {
    generation++;
    for (const voice of voices) {
      for (const oscillator of voice.oscillators) {
        try { oscillator.stop(); } catch { /* Already ended. */ }
      }
      voice.gain.disconnect();
    }
    voices.clear();
  }
  async function play(notes, spacing = 0.045) {
    stop();
    const current = generation;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio playback isn’t supported in this browser. The diagrams still work.');
    if (!context) {
      context = new Audio();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') await context.resume();
    if (current !== generation) return false;
    if (context.state !== 'running') throw new Error('Sound is paused by your browser. Try the play button again.');
    notes.forEach((midi, index) => {
      const start = context.currentTime + 0.025 + index * spacing;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.7);
      gain.connect(master);
      const voice = { gain, oscillators: [] };
      voices.add(voice);
      for (const [multiple, level] of [[1, 1], [2, 0.25], [3, 0.1]]) {
        const oscillator = context.createOscillator();
        const harmonic = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = Chordbook.frequency(midi) * multiple;
        harmonic.gain.value = level;
        oscillator.connect(harmonic).connect(gain);
        oscillator.onended = () => {
          oscillator.disconnect(); harmonic.disconnect();
          if (multiple === 1) { gain.disconnect(); voices.delete(voice); }
        };
        oscillator.start(start);
        oscillator.stop(start + 1.75);
        voice.oscillators.push(oscillator);
      }
    });
    return true;
  }
  window.ChordbookAudio = { play, stop };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); context?.suspend().catch(() => {}); }
  });
  window.addEventListener('pagehide', stop);
})();
