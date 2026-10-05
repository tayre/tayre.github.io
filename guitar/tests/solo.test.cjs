const test = require('node:test');
const assert = require('node:assert/strict');
const { KEYS, tones, shape, chord, lick } = require('../solo-model.js');

test('A minor progression and landing notes match the actual chords', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(bar => chord(KEYS[0], bar, true).label), ['Am', 'F', 'G', 'Am', 'Am']);
  assert.deepEqual([0, 1, 2].map(bar => chord(KEYS[0], bar, true).targets.map(t => t.name)), [['A', 'C', 'E'], ['A', 'C'], ['D', 'G']]);
  assert.deepEqual(tones(KEYS[8]).map(t => t.name), ['F', 'A♭', 'B♭', 'C', 'E♭']);
});
for (const key of KEYS) {
  test(`${key.name} minor: five accurate playable shapes and chord-resolving phrases`, () => {
    const scale = tones(key);
    assert.deepEqual(scale.map(t => (t.pitch - key.pitch + 12) % 12), [0, 3, 5, 7, 10]);
    for (let index = 0; index < 5; index++) {
      const notes = shape(key, index);
      assert.equal(notes.length, 12);
      assert.equal(new Set(notes.map(n => `${n.string}:${n.fret}`)).size, 12);
      for (const n of notes) {
        assert.ok(n.fret >= 0 && n.fret <= 24);
        assert.equal(n.midi, [40, 45, 50, 55, 59, 64][n.string] + n.fret);
        assert.equal(n.pitch, n.midi % 12);
        assert.ok(scale.some(t => t.name === n.name && t.degree === n.degree));
      }
      for (let bar = 0; bar < 8; bar++) {
        assert.equal(chord(key, bar, false).label, key.name + 'm');
        const harmony = chord(key, bar, true);
        const targetPitches = harmony.targets.map(n => n.pitch);
        assert.ok(targetPitches.length >= 2);
        assert.deepEqual(targetPitches, scale.filter(t => harmony.midi.some(m => m % 12 === t.pitch)).map(t => t.pitch));
        const phrase = lick(key, index, harmony);
        assert.ok(targetPitches.includes(phrase.at(-1).pitch));
        for (const n of phrase) {
          assert.ok(notes.some(p => p.string === n.string && p.fret === n.fret));
          assert.ok(n.beat >= 0 && n.beat + n.length <= 4);
        }
      }
    }
  });
}
