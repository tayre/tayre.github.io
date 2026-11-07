const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({window:{}});
const run = file => vm.runInContext(readFileSync(path.join(root,file),'utf8'),context,{filename:file});
run('songs/catalog.js');run('song-model.js');
const catalog = context.window.GuitarSongbook.catalog;
assert.equal(new Set(catalog.map(s=>s.id)).size,catalog.length,'Catalog IDs must be unique');
for(const entry of catalog){
  run(entry.file);
  const song = context.window.GuitarSongbook.songs[entry.id];
  assert.equal(song.id,entry.id);
  assert.equal(song.title,entry.title);
  const bars = context.compileSong(song);
  assert.ok(bars.length);
  if(entry.id==='jingle-bell-rock'){
    assert.equal(bars.length,32);
    for(const [copy,original] of [[9,1],[10,2],[11,3],[12,4],[13,5],[14,6],[21,17],[25,1],[26,2],[27,3]])assert.equal(JSON.stringify(bars[copy-1].notes),JSON.stringify(bars[original-1].notes));
  }
}
// A future song with a different meter, partial final row, and chained repeats.
const future = {id:'test-only', title:'Test', tempo:80, beatsPerBar:3, tuning:[64,59,55,50,45,40], capo:2, rawBars:[['1:0:3'],[1],[2],['r:1 1:2:2'],['1:2:3:t']], sections:[{name:'Ending',start:4,end:5}]};
const parsed=context.compileSong(future);
assert.equal(parsed.length,5);
assert.equal(parsed[2].notes[0].fret,0);
assert.notEqual(parsed[0].notes[0],parsed[1].notes[0],'Repeated notes must be independent objects');
assert.throws(()=>context.compileSong({...future,rawBars:[[1]]}),/earlier bar/);
assert.throws(()=>context.compileSong({...future,rawBars:[['1:0:2']]}),/expected 3/);
assert.throws(()=>context.compileSong({...future,rawBars:[['1:0:3:t']]}),/Tie/);
assert.throws(()=>context.compileSong({...future,rawBars:[['7:0:3']]}),/Invalid token/);
assert.throws(()=>context.compileSong({...future,sections:[{name:'Bad',start:1,end:6}]}),/range/);
console.log(`PASS: ${catalog.length} catalog song(s), exact repeat mappings, future-song meter/length, and invalid transcription checks.`);
