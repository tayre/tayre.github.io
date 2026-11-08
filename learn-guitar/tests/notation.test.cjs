'use strict';
const assert=require('node:assert/strict');
const {compileSong}=require('../song-model.js');
const {planRhythm,rhythmSVG}=require('../notation.js');
const song=require('../songs/data/jingle-bell-rock.json');
const bars=compileSong(song);
const x=beat=>40+beat*70;
const opening=planRhythm(bars[0]);
assert.deepEqual(opening.symbols.map(symbol=>symbol.duration),[.5,.5,1,.5,.5,1]);
assert.deepEqual(opening.beams,[[0,1],[3,4]],'Photo bar 1 has two pairs of eighths');

const dotted=planRhythm(bars[17]);
assert.deepEqual(dotted.symbols.map(({beat,duration,rest,dotted})=>({beat,duration,rest,dotted})),[
  {beat:0,duration:1.5,rest:false,dotted:true},
  {beat:1.5,duration:.5,rest:false,dotted:false},
  {beat:2,duration:1.5,rest:true,dotted:true},
  {beat:3.5,duration:.5,rest:false,dotted:false}
],'Photo bar 18 includes a dotted quarter rest, not an ordinary quarter rest');
assert.equal(dotted.beams.length,0,'The separated eighths keep their flags');
const dottedSVG=rhythmSVG(bars[17],x,208);
assert.match(dottedSVG.notes[2],/rhythm-quarter-rest/);
assert.match(dottedSVG.notes[2],/rhythm-dot/);
assert.match(dottedSVG.notes[1],/rhythm-flag/);

assert.deepEqual(planRhythm(bars[22]).beams,[[3,4],[5,6]],'Photo bar 23 starts with an eighth rest, then two later beamed pairs');
const held=planRhythm(bars[19]);
assert.equal(held.symbols[0].tied,true);
assert.equal(held.symbols[0].base,2);
assert.equal(held.symbols[0].dotted,true,'Photo bar 20 continues a dotted half note');
assert.match(rhythmSVG(bars[18],x,208,1,bars[19],332).connections,/rhythm-tie/,'Show the outgoing half of the bar-line tie');
assert.match(rhythmSVG(bars[19],x,208).connections,/rhythm-tie/,'Show the incoming half of the bar-line tie');
assert.equal(planRhythm(bars[29]).symbols[4].tied,true,'Photo bar 30 holds its final B-string fret 3');
for(const number of [28,32]) {
  const symbols=planRhythm(bars[number-1]).symbols;
  assert.equal(symbols[0].base,4);
  const svg=rhythmSVG(bars[number-1],x,208).notes[0];
  assert.match(svg,/rhythm-open-head/);
  assert.doesNotMatch(svg,/rhythm-stroke/,'A whole note has no stem');
}

// Future half-beat durations must stay accurate even when they need tied symbols.
const unusual={notes:[{beat:0,duration:.5,rest:true},{beat:.5,duration:2.5},{beat:3,duration:1}]};
const split=planRhythm(unusual).symbols;
assert.deepEqual(split.map(symbol=>[symbol.index,symbol.beat,symbol.duration,symbol.tied]),[[0,0,.5,false],[1,.5,2,false],[1,2.5,.5,true],[2,3,1,false]]);
assert.equal(split.reduce((sum,symbol)=>sum+symbol.duration,0),4);
assert.equal(planRhythm({notes:[{beat:0,duration:2.5,rest:true}]}).symbols.some(symbol=>symbol.tied),false,'Separate rests never get a tie');
for(const bar of bars) {
  const symbols=planRhythm(bar).symbols;
  assert.equal(symbols.reduce((sum,symbol)=>sum+symbol.duration,0),4);
  for(const [index,note] of bar.notes.entries())assert.equal(symbols.filter(symbol=>symbol.index===index).reduce((sum,symbol)=>sum+symbol.duration,0),note.duration,'Notation and playback must use identical durations');
}
console.log('PASS: photo rhythm, dotted rest, eighth-note beaming, whole notes, cross-bar ties, and notation/playback duration agreement.');
