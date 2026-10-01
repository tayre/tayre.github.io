const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CHORDS, QUALITIES, FAMILIES, TUNING, tones, strings, majorScale, frequency } = require('../chords.js');

test('17 unique chords and all families are reachable', () => {
  assert.equal(CHORDS.length, 17);
  assert.equal(new Set(CHORDS.map(chord => chord.id)).size, 17);
  assert.deepEqual(new Set(CHORDS.map(chord => QUALITIES[chord.quality].family)), new Set(FAMILIES.map(family => family.id)));
});

for (const chord of CHORDS) {
  test(`${chord.id}: the fingering produces every required tone, and no others`, () => {
    const expected = tones(chord);
    const played = strings(chord).filter(string => string.midi !== null);
    assert.equal(chord.frets.length, 6);
    assert.equal(chord.fingers.length, 6);
    for (const string of played) {
      assert.ok(string.tone, `Unexpected pitch at string ${string.number}: MIDI ${string.midi}`);
      assert.equal(string.midi, TUNING[6 - string.number] + string.fret);
      assert.ok(string.fret >= 0 && string.fret <= 5);
      if (string.fret === 0) assert.equal(string.finger, 0);
      else assert.ok(string.finger >= 1 && string.finger <= 4);
    }
    assert.deepEqual(new Set(played.map(string => string.tone.name)), new Set(expected.map(tone => tone.name)));
    assert.equal(played[0].tone.name, chord.root, 'these introductory shapes all have the root in the bass');
    if (chord.barre) {
      for (let i = chord.barre.from; i <= chord.barre.to; i++) assert.ok(chord.frets[i] >= chord.barre.fret);
      assert.equal(chord.fingers[chord.barre.from], 1);
      assert.equal(chord.fingers[chord.barre.to], 1);
    }
  });
}

test('major, minor, seventh and suspended formulas have the correct intervals', () => {
  for (const [id, semitones] of Object.entries({ C: [0, 4, 7], Am: [0, 3, 7], G7: [0, 4, 7, 10], Cmaj7: [0, 4, 7, 11], Asus2: [0, 2, 7], Dsus4: [0, 5, 7] })) {
    assert.deepEqual(tones(CHORDS.find(chord => chord.id === id)).map(tone => tone.semitones), semitones);
  }
});

test('note names use the correct scale spelling, not arbitrary enharmonic names', () => {
  for (const [id, names] of Object.entries({ E: ['E', 'G♯', 'B'], D: ['D', 'F♯', 'A'], A: ['A', 'C♯', 'E'], Bm: ['B', 'D', 'F♯'], G7: ['G', 'B', 'D', 'F'], Cmaj7: ['C', 'E', 'G', 'B'] })) {
    assert.deepEqual(tones(CHORDS.find(chord => chord.id === id)).map(tone => tone.name), names);
  }
  assert.deepEqual(majorScale('F'), ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
  assert.deepEqual(majorScale('B'), ['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯']);
});

test('muted strings have no pitch and cannot accidentally play MIDI zero', () => {
  const c = strings(CHORDS.find(chord => chord.id === 'C'));
  assert.equal(c[0].midi, null);
  assert.equal(c[0].tone, null);
  assert.deepEqual(c.slice(1).map(string => string.midi), [48, 52, 55, 60, 64]);
});

test('audio frequencies follow concert pitch and equal temperament', () => {
  assert.equal(frequency(69), 440);
  assert.equal(frequency(57), 220);
  assert.ok(Math.abs(frequency(40) - 82.4069) < 0.0001);
});
