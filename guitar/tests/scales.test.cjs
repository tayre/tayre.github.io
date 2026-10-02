const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SHAPES, nextShape, notes, phrase, WALK, NECK_SHAPES, neckNotes, NECK_PHRASE } = require('../scales.js');
const pitches = new Set([9, 0, 2, 4, 7]);

for (let index = 0; index < SHAPES.length; index++) {
  test(`pentatonic shape ${index + 1}: playable notes, roots and a complete scale`, () => {
    const played = notes(index);
    assert.equal(played.length, 12);
    assert.deepEqual(new Set(played.map(note => note.midi % 12)), pitches);
    assert.ok(played.filter(note => note.name === 'A').length >= 2);
    for (let string = 0; string < 6; string++) {
      const pair = played.filter(note => note.string === string);
      assert.equal(pair.length, 2);
      assert.ok(pair[0].fret < pair[1].fret);
      assert.ok(pair.every(note => note.fret >= SHAPES[index].min && note.fret <= SHAPES[index].max));
    }
    assert.deepEqual(phrase(index).map(note => note.name), ['A', 'C', 'D', 'C', 'A']);
  });
  test(`pentatonic shapes ${index + 1} → ${nextShape(index).number}: overlap and a phrase crossing positions`, () => {
    const selected = notes(index);
    const connected = notes(index, true);
    const keys = new Set(selected.map(note => `${note.string}:${note.fret}`));
    assert.equal(connected.length, 18);
    assert.equal(connected.filter(note => !keys.has(`${note.string}:${note.fret}`)).length, 6);
    const allKeys = new Set(connected.map(note => `${note.string}:${note.fret}`));
    const example = phrase(index, true);
    assert.ok(example.every(note => allKeys.has(`${note.string}:${note.fret}`)), 'the phrase fits the two displayed shapes');
    assert.ok(example.some(note => !keys.has(`${note.string}:${note.fret}`)), 'the phrase reaches the next shape');
    assert.equal(example.at(-1).name, 'A', 'the phrase ends on the root');
  });
}

test('shape 1 repeats after shape 5, exactly one octave higher', () => {
  assert.deepEqual(nextShape(4).frets, SHAPES[0].frets.map(pair => pair.map(fret => fret + 12)));
  const all = new Set(SHAPES.flatMap((_, index) => notes(index).map(note => `${note.string}:${note.fret}`)));
  const tuning = [40, 45, 50, 55, 59, 64];
  for (let string = 0; string < 6; string++) {
    const min = SHAPES[0].frets[string][0];
    const max = SHAPES[4].frets[string][1];
    for (let fret = min; fret <= max; fret++) {
      assert.equal(all.has(`${string}:${fret}`), pitches.has((tuning[string] + fret) % 12), 'the five patterns cover every scale note between their boundaries');
    }
  }
});

test('the B string route follows the same scale across positions', () => {
  assert.deepEqual(WALK.map(note => note.name), ['E', 'G', 'A', 'C', 'D', 'E']);
  assert.ok(WALK.every(note => note.string === 4));
  assert.equal(WALK.at(-1).midi - WALK[0].midi, 12);
});

test('the continuous fretboard contains every position once and records overlapping shapes', () => {
  const full = neckNotes();
  const keys = new Set(full.map(note => `${note.string}:${note.fret}`));
  assert.equal(full.length, 42);
  assert.equal(keys.size, full.length);
  for (const note of full) {
    assert.ok(pitches.has(note.midi % 12));
    assert.deepEqual(note.shapes, NECK_SHAPES.flatMap((shape, index) => shape.frets[note.string].includes(note.fret) ? [index] : []));
  }
  assert.ok(NECK_PHRASE.every(note => keys.has(`${note.string}:${note.fret}`)));
  assert.equal(NECK_PHRASE.at(-1).name, 'A');
});
