(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const model = SoloModel;
  let context, master, timer, frame;
  let running = false;
  let revision = 0;
  let beatIndex = -4;
  let nextTime = 0;
  let displayedBar = -1;
  let queue = [];
  const voices = new Set();
  const configuration = () => ({ key: model.KEYS[Number($('solo-key').value)], shape: Number($('solo-shape').value), changes: $('solo-backing').value === 'changes', answer: $('solo-mode').value === 'answer', seconds: 60 / Number($('solo-tempo').value) });
  function node(tag, className, text = '') {
    const result = document.createElement(tag); result.className = className; result.textContent = text; return result;
  }
  function silence() {
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch { /* The oscillator may have ended. */ }
      voice.gain.disconnect();
    }
    voices.clear();
  }
  function stop() {
    revision++;
    running = false;
    clearInterval(timer); cancelAnimationFrame(frame); queue = [];
    silence();
    $('solo-start').textContent = 'Start groove';
    $('solo-start').setAttribute('aria-pressed', 'false');
    $('solo-turn').textContent = 'Ready when you are';
    $('solo-status').textContent = 'Start gives you four count-in clicks. Stop at any time with the same button.';
    document.querySelectorAll('.solo-beats .on').forEach(dot => dot.classList.remove('on'));
    document.querySelectorAll('#solo-board .sounding').forEach(dot => dot.classList.remove('sounding'));
  }
  async function audio() {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio isn’t supported here. You can still use the fretboard and lick labels.');
      context = new Audio();
      master = context.createGain();
      master.gain.value = Number($('solo-volume').value) / 100;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') throw new Error('Your browser paused the audio. Press Start again.');
  }
  function sound(midi, time, duration, level = 0.12, type = 'triangle') {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = Chordbook.frequency(midi);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.03, duration));
    oscillator.connect(gain).connect(master);
    const voice = { oscillator, gain }; voices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices.delete(voice); };
    oscillator.start(time); oscillator.stop(time + duration + 0.03);
  }
  function renderHarmony(bar = 0) {
    const config = configuration();
    const harmony = model.chord(config.key, bar, config.changes);
    $('solo-chord').textContent = harmony.label;
    $('solo-targets').textContent = `Land on ${harmony.targets.map(tone => tone.name).join(' or ')}. These scale notes belong to ${harmony.label}.`;
    document.querySelectorAll('#solo-board button').forEach(button => {
      const target = harmony.targets.some(tone => tone.pitch === Number(button.dataset.pitch));
      button.classList.toggle('landing-note', target);
      button.setAttribute('aria-label', button.dataset.description + (target ? ` Chord tone of ${harmony.label}: a landing note.` : ''));
    });
    const lick = model.lick(config.key, config.shape, harmony);
    $('solo-lick').replaceChildren(...lick.map((note, index) => {
      const item = node('span', 'solo-lick-note');
      item.append(node('small', '', `beat ${['1', '1 &', '2 &', '3', '4'][index]}`), node('strong', '', note.name), node('small', '', `str ${note.number} · fret ${note.fret}`));
      return item;
    }));
    return harmony;
  }
  function render() {
    const config = configuration();
    const notes = model.shape(config.key, config.shape);
    const min = Math.min(...notes.map(note => note.fret));
    const max = Math.max(...notes.map(note => note.fret));
    $('solo-map-title').textContent = `${config.key.name} minor · shape ${config.shape + 1} · frets ${min}–${max}`;
    $('solo-scale-notes').textContent = model.tones(config.key).map(tone => `${tone.name} (${tone.degree})`).join(' · ');
    const board = $('solo-board');
    board.style.setProperty('--solo-frets', max - min + 1);
    const elements = [node('span', 'solo-fret-label', 'fret')];
    for (let fret = min; fret <= max; fret++) elements.push(node('span', 'solo-fret-label', fret === 0 ? 'open' : fret));
    for (let string = 5; string >= 0; string--) {
      elements.push(node('span', 'solo-string-label', `${Chordbook.STRINGS[string]} · ${6 - string}`));
      for (let fret = min; fret <= max; fret++) {
        const cell = node('span', 'solo-cell');
        const note = notes.find(note => note.string === string && note.fret === fret);
        if (note) {
          const button = node('button', `solo-note${note.degree === '1' ? ' root' : ''}`, $('solo-degrees').checked ? note.degree : note.name);
          button.type = 'button'; button.dataset.pitch = note.pitch; button.dataset.midi = note.midi;
          button.dataset.description = `${note.name}, interval ${note.degree}, string ${note.number}, ${fret === 0 ? 'open' : `fret ${fret}`}.`;
          button.addEventListener('click', async () => {
            const version = revision;
            try { await audio(); if (revision === version) sound(note.midi, context.currentTime + 0.01, 0.8, 0.22); }
            catch (error) { $('solo-status').textContent = error.message; }
          });
          cell.append(button);
        }
        elements.push(cell);
      }
    }
    board.replaceChildren(...elements);
    renderHarmony();
  }
  function schedule() {
    if (!running || context.state !== 'running') return;
    const config = configuration();
    // Use the audio clock; the short timer only fills a look-ahead buffer.
    while (nextTime < context.currentTime + 0.12) {
      const index = beatIndex++;
      const beat = ((index % 4) + 4) % 4;
      const bar = Math.floor(index / 4);
      if (index < 0 || $('solo-click').checked) sound(beat === 0 ? 88 : 81, nextTime, 0.04, 0.1, 'sine');
      if (index >= 0) {
        const harmony = model.chord(config.key, bar, config.changes);
        if (beat === 0) {
          harmony.midi.forEach((midi, i) => sound(midi, nextTime + i * 0.016, config.seconds * 3.2, 0.065));
          if (config.answer && bar % 2 === 0) {
            for (const note of model.lick(config.key, config.shape, harmony)) {
              const time = nextTime + note.beat * config.seconds;
              sound(note.midi, time, note.length * config.seconds, 0.24);
              queue.push({ time, midi: note.midi });
            }
          }
        }
        if (beat === 0 || beat === 2) sound(harmony.bass, nextTime, config.seconds * 1.3, 0.2, 'sine');
      }
      queue.push({ time: nextTime, index, beat, bar });
      nextTime += config.seconds;
    }
    queue.sort((a, b) => a.time - b.time || Number(a.midi !== undefined) - Number(b.midi !== undefined));
  }
  function paint() {
    if (!running) return;
    const config = configuration();
    while (queue.length && queue[0].time <= context.currentTime) {
      const event = queue.shift();
      if (event.midi !== undefined) {
        document.querySelectorAll('#solo-board button').forEach(button => button.classList.toggle('sounding', Number(button.dataset.midi) === event.midi));
        continue;
      }
      document.querySelectorAll('.solo-beats span').forEach((dot, index) => dot.classList.toggle('on', index === event.beat));
      if (event.index < 0) $('solo-turn').textContent = `Count in · ${event.beat + 1} of 4`;
      else if (displayedBar !== event.bar) {
        displayedBar = event.bar;
        renderHarmony(event.bar);
        document.querySelectorAll('#solo-board .sounding').forEach(dot => dot.classList.remove('sounding'));
        const cue = config.answer ? event.bar % 2 === 0 ? 'Listen to the lick' : 'Your turn · answer it' : 'Your turn · make a phrase';
        $('solo-turn').textContent = cue;
        $('solo-status').textContent = `Bar ${event.bar + 1} · ${$('solo-chord').textContent}. ${cue}.`;
      }
    }
    frame = requestAnimationFrame(paint);
  }
  async function start() {
    stop(); ChordbookAudio.stop();
    const version = revision;
    $('solo-start').textContent = 'Stop groove';
    $('solo-start').setAttribute('aria-pressed', 'true');
    $('solo-status').textContent = 'Starting the count-in…';
    try {
      await audio(); if (version !== revision) return;
      running = true; beatIndex = -4; displayedBar = -1;
      renderHarmony(); nextTime = context.currentTime + 0.08;
      schedule(); timer = setInterval(schedule, 25); frame = requestAnimationFrame(paint);
    } catch (error) { if (version === revision) { stop(); $('solo-status').textContent = error.message; } }
  }
  $('solo-key').replaceChildren(...model.KEYS.map((key, index) => {
    const option = node('option', '', `${key.name} minor`); option.value = index; return option;
  }));
  $('solo-start').addEventListener('click', () => $('solo-start').getAttribute('aria-pressed') === 'true' ? stop() : start());
  for (const id of ['solo-key', 'solo-shape', 'solo-backing', 'solo-mode']) $(id).addEventListener('change', () => { stop(); render(); });
  $('solo-tempo').addEventListener('input', () => { stop(); $('solo-bpm').value = `${$('solo-tempo').value} BPM`; });
  $('solo-volume').addEventListener('input', () => { if (master) master.gain.setTargetAtTime(Number($('solo-volume').value) / 100, context.currentTime, 0.02); });
  $('solo-degrees').addEventListener('change', () => {
    const notes = model.tones(configuration().key);
    document.querySelectorAll('#solo-board button').forEach(button => {
      const tone = notes.find(note => note.pitch === Number(button.dataset.pitch));
      button.textContent = $('solo-degrees').checked ? tone.degree : tone.name;
    });
  });
  $('solo-demo').addEventListener('click', async () => {
    stop(); ChordbookAudio.stop();
    const version = revision;
    const config = configuration();
    try {
      await audio(); if (version !== revision) return;
      const harmony = renderHarmony();
      for (const note of model.lick(config.key, config.shape, harmony)) sound(note.midi, context.currentTime + 0.05 + note.beat * config.seconds, note.length * config.seconds, 0.24);
      $('solo-status').textContent = `Example lick in ${config.key.name} minor. Try repeating its rhythm, then change one note.`;
    } catch (error) { if (version === revision) $('solo-status').textContent = error.message; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); context?.suspend().catch(() => {}); } });
  window.addEventListener('pagehide', stop);
  window.ChordbookSolo = { stop };
  render();
})();
