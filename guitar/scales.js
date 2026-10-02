(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./chords.js') : root.Chordbook);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChordbookScales = api;
})(typeof window === 'undefined' ? globalThis : window, function (chordbook) {
  'use strict';
  const { TUNING, STRINGS } = chordbook;
  // Every pair runs low E to high E. All five shapes stay in A minor.
  const SHAPES = [
    { frets: [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]], tip: 'Start here if these patterns are new to you. Use your index at fret 5, ring finger at fret 7 and pinky at fret 8. Find the A notes on low E, D and high E.' },
    { frets: [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]], tip: 'This shape starts on C on the low E string. It is still A minor: the root is A, not the first note of the pattern. Find A on the D string at fret 7 and the B string at fret 10.' },
    { frets: [[10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12]], tip: 'Watch the B string: its higher note is at fret 13. Shift your hand when needed instead of trying to hold a five-fret stretch. Find A on the A string at fret 12 and the B string at fret 10.' },
    { frets: [[12, 15], [12, 15], [12, 14], [12, 14], [13, 15], [12, 15]], tip: 'Fret 12 repeats the open-string note names an octave higher. Find A on the A string at fret 12 and the G string at fret 14. Play slowly across the change in fingering on the B string.' },
    { frets: [[15, 17], [15, 17], [14, 17], [14, 17], [15, 17], [15, 17]], tip: 'Find A at fret 17 on both E strings and fret 14 on G. You can also play this same shape 12 frets lower, at frets 2–5. That lower version joins the first shape at fret 5.' }
  ].map((shape, index) => ({ ...shape, number: index + 1, min: Math.min(...shape.frets.flat()), max: Math.max(...shape.frets.flat()) }));
  const PITCHES = { 9: 'A', 0: 'C', 2: 'D', 4: 'E', 7: 'G' };
  const BRIDGES = [
    [[3, 5], [3, 7], [3, 9], [4, 8], [4, 10]],
    [[3, 7], [3, 9], [3, 12], [4, 10]],
    [[4, 10], [4, 13], [4, 15], [3, 14]],
    [[2, 12], [2, 14], [2, 17], [3, 14]],
    [[2, 14], [2, 17], [2, 19]]
  ];
  function note(string, fret) {
    const midi = TUNING[string] + fret;
    return { string, fret, midi, name: PITCHES[midi % 12], tuning: STRINGS[string], number: 6 - string };
  }
  function nextShape(index) {
    if (index < 4) return SHAPES[index + 1];
    return { ...SHAPES[0], min: 17, max: 20, frets: SHAPES[0].frets.map(frets => frets.map(fret => fret + 12)) };
  }
  function notes(index, connected = false) {
    const shape = SHAPES[index];
    const next = nextShape(index);
    return shape.frets.flatMap((frets, string) => {
      const positions = connected ? [...new Set([...frets, ...next.frets[string]])].sort((a, b) => a - b) : frets;
      return positions.map(fret => note(string, fret));
    });
  }
  function phrase(index, connected = false) {
    if (connected) return BRIDGES[index].map(([string, fret]) => note(string, fret));
    const ascending = notes(index).sort((a, b) => a.midi - b.midi);
    const rootIndex = ascending.findIndex(item => item.name === 'A' && item.midi >= 57);
    const [a, c, d] = ascending.slice(rootIndex, rootIndex + 3);
    return [a, c, d, c, a];
  }
  const WALK = [5, 8, 10, 13, 15, 17].map(fret => note(4, fret));
  const NECK_SHAPES = [...SHAPES, nextShape(4)];
  function neckNotes() {
    const positions = new Map();
    NECK_SHAPES.forEach((shape, index) => shape.frets.forEach((frets, string) => frets.forEach(fret => {
      const key = `${string}:${fret}`;
      if (!positions.has(key)) positions.set(key, { ...note(string, fret), shapes: [] });
      positions.get(key).shapes.push(index);
    })));
    return [...positions.values()];
  }
  const NECK_PHRASE = [...WALK, note(4, 20), note(5, 17)];
  return { SHAPES, nextShape, note, notes, phrase, WALK, NECK_SHAPES, neckNotes, NECK_PHRASE };
});
