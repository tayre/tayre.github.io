(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./scales.js') : root.ChordbookScales);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SoloModel = api;
})(typeof window === 'undefined' ? globalThis : window, function (scales) {
  const KEYS = [{ name: 'A', pitch: 9 }, { name: 'B♭', pitch: 10 }, { name: 'B', pitch: 11 }, { name: 'C', pitch: 0 }, { name: 'C♯', pitch: 1 }, { name: 'D', pitch: 2 }, { name: 'E♭', pitch: 3 }, { name: 'E', pitch: 4 }, { name: 'F', pitch: 5 }, { name: 'F♯', pitch: 6 }, { name: 'G', pitch: 7 }, { name: 'A♭', pitch: 8 }];
  const TUNING = [40, 45, 50, 55, 59, 64];
  const STEPS = [0, 3, 5, 7, 10];
  const DEGREES = ['1', '♭3', '4', '5', '♭7'];
  const mod = n => ((n % 12) + 12) % 12;
  function name(key, semitones, letterStep) {
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const natural = [0, 2, 4, 5, 7, 9, 11];
    const index = (letters.indexOf(key.name[0]) + letterStep) % 7;
    let alteration = mod(key.pitch + semitones - natural[index]);
    if (alteration > 6) alteration -= 12;
    return letters[index] + (alteration < 0 ? '♭'.repeat(-alteration) : '♯'.repeat(alteration));
  }
  function tones(key) { return STEPS.map((step, index) => ({ pitch: mod(key.pitch + step), name: name(key, step, [0, 2, 3, 4, 6][index]), degree: DEGREES[index] })); }
  function shape(key, index) {
    const shift = mod(key.pitch - 4) - 5;
    const scale = tones(key);
    return scales.SHAPES[index].frets.flatMap((frets, string) => frets.map(original => {
      const fret = original + shift;
      const midi = TUNING[string] + fret;
      return { string, number: 6 - string, fret, midi, ...scale.find(tone => tone.pitch === mod(midi)) };
    }));
  }
  function chord(key, bar, changes) {
    const step = changes ? [0, 8, 10, 0][mod(bar) % 4] : 0;
    const label = name(key, step, step === 8 ? 5 : step === 10 ? 6 : 0) + (step === 0 ? 'm' : '');
    const root = 36 + key.pitch + step;
    const intervals = [0, step === 0 ? 3 : 4, 7];
    const pitches = intervals.map(interval => mod(root + interval));
    return { label, bass: root, midi: intervals.map(interval => root + 12 + interval), targets: tones(key).filter(tone => pitches.includes(tone.pitch)) };
  }
  function lick(key, index, harmony) {
    const notes = shape(key, index).filter(note => note.string >= 3).sort((a, b) => a.midi - b.midi);
    const target = notes.find(note => harmony.targets.some(tone => tone.pitch === note.pitch));
    return [notes[0], notes[1], notes[2], notes[1], target].map((note, index) => ({ ...note, beat: [0, 0.5, 1.5, 2, 3][index], length: [0.4, 0.7, 0.4, 0.7, 0.9][index] }));
  }
  function connection(key, index) {
    const left = Math.min(index, 3);
    const shift = mod(key.pitch - 4) - 5;
    const notes = [...shape(key, left), ...shape(key, left + 1)];
    const phrase = scales.phrase(left, true).map(note => notes.find(n => n.string === note.string && n.fret === note.fret + shift));
    return { indices: [left, left + 1], phrase };
  }
  function map(key, index, view) {
    const pair = connection(key, index).indices;
    const indices = view === 'single' ? [index] : view === 'pair' ? pair : [0, 1, 2, 3, 4];
    const positions = new Map();
    const spans = indices.map(i => {
      const notes = shape(key, i);
      notes.forEach(note => {
        const id = `${note.string}:${note.fret}`;
        if (!positions.has(id)) positions.set(id, { ...note, shapes: [] });
        positions.get(id).shapes.push(i);
      });
      return { index: i, min: Math.min(...notes.map(n => n.fret)), max: Math.max(...notes.map(n => n.fret)) };
    });
    return { spans, notes: [...positions.values()].map(note => ({ ...note, shared: pair.every(i => note.shapes.includes(i)) })) };
  }
  function transitions(key) {
    // A continuous B-string route plus spaced alternatives on E, G and D.
    const routes = [[0, 4], [1, 4], [2, 4], [3, 4], [1, 5], [3, 5], [0, 3], [2, 3], [1, 2], [3, 2]];
    return routes.map(([index, string]) => {
      const from = shape(key, index).filter(n => n.string === string).at(-1);
      const to = shape(key, index + 1).filter(n => n.string === string).at(-1);
      return { from, to, index };
    });
  }
  return { KEYS, tones, shape, chord, lick, connection, map, transitions };
});
