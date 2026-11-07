"use strict";

// Pure transcription validation, shared by the player and the data tests.
function compileSong(song) {
  const fail = message => { throw new Error(`${song?.id || 'Song'}: ${message}`); };
  if (!song || !song.id || !song.title) fail('id and title are required.');
  if (!Number.isInteger(song.beatsPerBar) || song.beatsPerBar < 1 || song.beatsPerBar > 6) fail('Use 1–6 quarter beats per bar.');
  if (!Array.isArray(song.tuning) || song.tuning.length !== 6 || song.tuning.some(n => !Number.isInteger(n) || n < 20 || n > 100)) fail('Provide six open-string MIDI pitches, high to low.');
  if (!Number.isInteger(song.capo) || song.capo < 0 || song.capo > 12) fail('Capo must be a fret from 0 to 12.');
  if (!Number.isFinite(song.tempo) || song.tempo < 40 || song.tempo > 140) fail('Tempo must be 40–140 BPM.');
  if (!Array.isArray(song.rawBars) || !song.rawBars.length) fail('At least one bar is required.');
  const bars = [];
  let previous;
  song.rawBars.forEach((raw, index) => {
    if (!Array.isArray(raw)) fail(`Bar ${index + 1} must be an array.`);
    const repeat = typeof raw[0] === 'number' ? raw[0] : null;
    if (repeat !== null && (!Number.isInteger(repeat) || repeat < 1 || repeat > index)) fail(`Bar ${index + 1} must repeat an earlier bar.`);
    let beat = 0;
    let notes;
    if (repeat !== null) {
      notes = bars[repeat - 1].notes.map(n => ({...n}));
      beat = notes.reduce((sum,n) => sum+n.duration,0);
    } else {
      if (typeof raw[0] !== 'string' || !raw[0].trim()) fail(`Bar ${index + 1} needs notes.`);
      notes = raw[0].trim().split(/\s+/).map(token => {
        if (!/^(?:r:(?:\d+(?:\.\d+)?|\.\d+)|[1-6]:\d+:(?:\d+(?:\.\d+)?|\.\d+)(?::t)?)$/.test(token)) fail(`Invalid token “${token}” in bar ${index + 1}.`);
        const parts = token.split(':'), rest = parts[0] === 'r';
        const duration = Number(parts[rest ? 1 : 2]);
        const note = {string:rest?null:Number(parts[0]), fret:rest?null:Number(parts[1]), rest, duration, beat, tied:parts[3]==='t'};
        if (duration <= 0 || duration % .5 !== 0 || (!rest && note.fret > 24)) fail(`Invalid fret or duration in bar ${index+1}. Use half-beat increments.`);
        beat += duration;
        return note;
      });
    }
    if (beat !== song.beatsPerBar) fail(`Bar ${index + 1} has ${beat} beats; expected ${song.beatsPerBar}.`);
    notes.forEach(note => {
      if (note.tied && (!previous || previous.rest || previous.string !== note.string || previous.fret !== note.fret)) fail(`Tie in bar ${index + 1} must continue the preceding pitch.`);
      previous = note;
    });
    bars.push({number:index+1, notes, chord:raw[1]||'', repeat, hint:repeat?`Same melody as bar ${repeat}`:(raw[2]||'')});
  });
  for (const section of song.sections || []) {
    if (!section.name || !Number.isInteger(section.start) || !Number.isInteger(section.end) || section.start < 1 || section.end < section.start || section.end > bars.length) fail('A playback section has an invalid range.');
  }
  for (const [name, shape] of song.chordShapes || []) {
    if (!name || !Array.isArray(shape) || shape.length !== 6 || shape.some(f => !Number.isInteger(f) || f < -1 || f > 4)) fail('Chord diagrams need six frets (-1 for muted, 0–4 supported).');
  }
  return bars;
}
