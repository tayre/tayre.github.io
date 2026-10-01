// Pure chord definitions and note arithmetic, shared by the page and tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chordbook = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const TUNING = [40, 45, 50, 55, 59, 64]; // MIDI, low E to high E.
  const STRINGS = ['E', 'A', 'D', 'G', 'B', 'E'];
  const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const FAMILIES = [{ id: 'major', name: 'Major' }, { id: 'minor', name: 'Minor' }, { id: 'seventh', name: 'Sevenths' }, { id: 'suspended', name: 'Suspended' }];
  const QUALITIES = {
    major: { name: 'major', family: 'major', degrees: [1, 3, 5], offsets: [0, 0, 0], roles: ['Root', 'Major third', 'Perfect fifth'], description: 'Three notes, built from the 1st, 3rd and 5th notes of the major scale. A clear, settled starting point.' },
    minor: { name: 'minor', family: 'minor', degrees: [1, 3, 5], offsets: [0, -1, 0], roles: ['Root', 'Minor third', 'Perfect fifth'], description: 'Start with a major chord, then lower its third by one semitone. One small change gives the same root a different character.' },
    dominant7: { name: 'dominant seventh', family: 'seventh', degrees: [1, 3, 5, 7], offsets: [0, 0, 0, -1], roles: ['Root', 'Major third', 'Perfect fifth', 'Minor seventh'], description: 'A major chord with a lowered seventh added. That extra note brings tension, often pulling toward another chord.' },
    major7: { name: 'major seventh', family: 'seventh', degrees: [1, 3, 5, 7], offsets: [0, 0, 0, 0], roles: ['Root', 'Major third', 'Perfect fifth', 'Major seventh'], description: 'A major chord with the 7th note of its major scale added. Four distinct notes, with a close, shimmering edge.' },
    sus2: { name: 'suspended second', family: 'suspended', degrees: [1, 2, 5], offsets: [0, 0, 0], roles: ['Root', 'Major second', 'Perfect fifth'], description: 'Replace the third with the second. With no third, the chord is neither major nor minor—it leaves a little space in the sound.' },
    sus4: { name: 'suspended fourth', family: 'suspended', degrees: [1, 4, 5], offsets: [0, 0, 0], roles: ['Root', 'Perfect fourth', 'Perfect fifth'], description: 'Replace the third with the fourth. Try moving that fourth down to the third to hear the suspension resolve.' }
  };
  // Frets/fingers always run from string 6 to string 1. null means muted.
  const CHORDS = [
    { id: 'C', root: 'C', quality: 'major', frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, 0, 1, 0], tip: 'Start your strum on the A string. Keep your fingers arched so the open G and high E can ring.' },
    { id: 'G', root: 'G', quality: 'major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], tip: 'Play all six strings. This three-finger G is one common option; other fingerings make some chord changes easier.' },
    { id: 'D', root: 'D', quality: 'major', frets: [null, null, 0, 2, 3, 2], fingers: [null, null, 0, 1, 3, 2], tip: 'Start on the open D string and play just the four thinnest strings.' },
    { id: 'A', root: 'A', quality: 'major', frets: [null, 0, 2, 2, 2, 0], fingers: [null, 0, 1, 2, 3, 0], tip: 'Fit three fingertips into the second fret. Skip the low E and let the high E ring open.' },
    { id: 'E', root: 'E', quality: 'major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], tip: 'All six strings belong. Your index finger on the G string makes the major third, G♯.' },
    { id: 'F', root: 'F', quality: 'major', frets: [null, null, 3, 2, 1, 1], fingers: [null, null, 3, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 }, tip: 'A four-string F: lay your index finger across B and high E at fret 1. Skip both bass strings. This is a small barre, not the full six-string shape.' },
    { id: 'Am', root: 'A', quality: 'minor', frets: [null, 0, 2, 2, 1, 0], fingers: [null, 0, 2, 3, 1, 0], tip: 'Start on the A string. Compared with A major, the B-string note moves from fret 2 to fret 1: C♯ becomes C.' },
    { id: 'Em', root: 'E', quality: 'minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], tip: 'Two fingers, all six strings. Lift the index finger from an E major shape to hear G♯ become G.' },
    { id: 'Dm', root: 'D', quality: 'minor', frets: [null, null, 0, 2, 3, 1], fingers: [null, null, 0, 2, 3, 1], tip: 'Play only the top four strings. The first-fret F on the high E gives this shape its minor third.' },
    { id: 'Bm', root: 'B', quality: 'minor', frets: [null, 2, 4, 4, 3, 2], fingers: [null, 1, 3, 4, 2, 1], barre: { fret: 2, from: 1, to: 5 }, tip: 'A step up in difficulty: your index bars five strings at fret 2. Add the other fingers, leave out low E, and use only as much pressure as needed.' },
    { id: 'Cmaj7', root: 'C', quality: 'major7', frets: [null, 3, 2, 0, 0, 0], fingers: [null, 3, 2, 0, 0, 0], tip: 'Start with C major and lift your index finger. The open B is the added major seventh.' },
    { id: 'G7', root: 'G', quality: 'dominant7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], tip: 'Play all six strings. The first-fret F on high E is the lowered seventh. Try G7 followed by C.' },
    { id: 'A7', root: 'A', quality: 'dominant7', frets: [null, 0, 2, 0, 2, 0], fingers: [null, 0, 1, 0, 2, 0], tip: 'Leave the G string open—it supplies the lowered seventh. Start your strum on A.' },
    { id: 'E7', root: 'E', quality: 'dominant7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], tip: 'The open D string adds the lowered seventh to E major. All six strings can ring.' },
    { id: 'D7', root: 'D', quality: 'dominant7', frets: [null, null, 0, 2, 1, 2], fingers: [null, null, 0, 2, 1, 3], tip: 'Play the four thinnest strings. The first-fret C on the B string is the lowered seventh.' },
    { id: 'Asus2', root: 'A', quality: 'sus2', frets: [null, 0, 2, 2, 0, 0], fingers: [null, 0, 1, 2, 0, 0], tip: 'Let the B string ring open. Try Asus2, then A: B rises to C♯ when the third returns.' },
    { id: 'Dsus4', root: 'D', quality: 'sus4', frets: [null, null, 0, 2, 3, 3], fingers: [null, null, 0, 1, 3, 4], tip: 'Add your pinky at fret 3 on high E. Move that G down one fret to F♯ for D major.' }
  ];
  const mod = number => ((number % 12) + 12) % 12;
  function spell(root, degree, semitones) {
    const letters = Object.keys(NATURAL);
    const letter = letters[(letters.indexOf(root) + degree - 1) % 7];
    let accidental = mod(NATURAL[root] + semitones - NATURAL[letter]);
    if (accidental > 6) accidental -= 12;
    return letter + (accidental < 0 ? '♭'.repeat(-accidental) : '♯'.repeat(accidental));
  }
  function tones(chord) {
    const quality = QUALITIES[chord.quality];
    return quality.degrees.map((degree, index) => {
      const semitones = SCALE[degree - 1] + quality.offsets[index];
      return { name: spell(chord.root, degree, semitones), degree: `${quality.offsets[index] === -1 ? '♭' : ''}${degree}`,
        role: quality.roles[index], semitones, pitch: mod(NATURAL[chord.root] + semitones), index };
    });
  }
  function strings(chord) {
    const chordTones = tones(chord);
    return chord.frets.map((fret, index) => {
      const midi = fret === null ? null : TUNING[index] + fret;
      return { number: 6 - index, tuning: STRINGS[index], fret, finger: chord.fingers[index], midi,
        tone: midi === null ? null : chordTones.find(tone => tone.pitch === mod(midi)) };
    });
  }
  function majorScale(root) { return SCALE.map((semitones, index) => spell(root, index + 1, semitones)); }
  function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
  return { TUNING, STRINGS, NATURAL, FAMILIES, QUALITIES, CHORDS, tones, strings, majorScale, frequency };
});
