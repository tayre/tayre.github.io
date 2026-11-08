'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {validateSong, prepareSong, readLibrary, buildPlan, writePlan, importSong} = require('../tools/songbook.cjs');
const {compileSong} = require('../song-model.js');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'guitar-import-test-'));
const fixture = {
  schemaVersion:1, id:'test-exercise', title:'Test exercise', tempo:80, beatsPerBar:3,
  tuning:[64,59,55,50,45,40], capo:2,
  rawBars:[['2:1:1 2:0:1 3:2:1','C','An original phrase.'],['2:1:1 2:0:1 3:2:1','Am','Same notes, different chord.'],['r:1 1:2:2'],['1:2:3:t'],['1:0:3']],
  sections:[{letter:'A',name:'First steps',start:1,end:2},{letter:'B',name:'Ending',start:3,end:5}],
  accompaniment:'Suggested accompaniment: one gentle strum per bar.',
  source:{description:'An original three-beat exercise for import checks; not a photographed song.'},
  transcription:{rhythm:'user-specified',chords:'suggested',unresolved:[]}
};
const draftPath = path.join(temporary,'input.json');
const writeDraft = draft => fs.writeFileSync(draftPath,JSON.stringify(draft));
const snapshot = directory => {
  const files = new Map();
  function visit(folder) {
    for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
      const target = path.join(folder,entry.name);
      if (entry.isDirectory()) visit(target);
      else files.set(path.relative(directory,target),fs.readFileSync(target).toString('base64'));
    }
  }
  visit(directory);
  return files;
};
try {
  // Build an isolated copy; never add a fixture to the real song menu.
  const book = path.join(temporary,'book');
  fs.mkdirSync(book);
  for (const file of ['index.html','styles.css','script.js','song-model.js','notation.js','playback.js','acoustic-guitar.js','photo-to-song-prompt.txt']) fs.copyFileSync(path.join(root,file),path.join(book,file));
  fs.cpSync(path.join(root,'songs/data'),path.join(book,'songs/data'),{recursive:true});
  fs.mkdirSync(path.join(book,'assets'),{recursive:true});
  fs.copyFileSync(path.join(root,'assets/original-tab.jpg'),path.join(book,'assets/original-tab.jpg'));
  writePlan(book,buildPlan(book,readLibrary(book)));
  const originalSong = fs.readFileSync(path.join(book,'songs/jingle-bell-rock.js'));
  const originalCatalog = fs.readFileSync(path.join(book,'songs/catalog.js'),'utf8');
  const originalHTML = fs.readFileSync(path.join(book,'index.html'),'utf8');

  writeDraft(fixture);
  const imported = importSong(book,draftPath,{photo:path.join(root,'assets/original-tab.jpg')});
  assert.equal(imported.bars.length,5);
  assert.equal(imported.song.rawBars[1][0],1,'Find matching notes and rhythm automatically');
  assert.equal(imported.song.rawBars[1][1],'Am','A repeated melody retains its own chord');
  assert.equal(compileSong(imported.song)[1].hint,'Same notes, different chord.','Custom repeat hint survives');
  assert.equal(imported.song.repeatSummary,'2 = 1');
  assert.ok(fs.readFileSync(path.join(book,imported.song.source.image)).equals(fs.readFileSync(path.join(root,'assets/original-tab.jpg'))));
  assert.ok(fs.readFileSync(path.join(book,'songs/jingle-bell-rock.js')).equals(originalSong),'Adding a song leaves the existing arrangement unchanged');
  assert.notEqual(fs.readFileSync(path.join(book,'songs/catalog.js'),'utf8'),originalCatalog);
  assert.notEqual(fs.readFileSync(path.join(book,'index.html'),'utf8'),originalHTML,'Catalog revision changes when adding a song');
  assert.deepEqual(writePlan(book,buildPlan(book,readLibrary(book)),true),[],'Build is deterministic');

  const context = vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(book,'songs/catalog.js'),'utf8'),context);
  const entries = context.window.GuitarSongbook.catalog;
  assert.equal(entries.length,2);
  for (const entry of entries) {
    assert.match(entry.file,/\?v=[a-f0-9]{16}$/);
    vm.runInContext(fs.readFileSync(path.join(book,entry.file.split('?')[0]),'utf8'),context);
    assert.equal(context.window.GuitarSongbook.songs[entry.id].title,entry.title);
    assert.ok(compileSong(context.window.GuitarSongbook.songs[entry.id]).length);
  }
  assert.equal(compileSong(context.window.GuitarSongbook.songs['test-exercise']).length,5);

  const prior = snapshot(book);
  assert.throws(()=>importSong(book,draftPath),/already exists/);
  assert.deepEqual(snapshot(book),prior,'Duplicate import makes no partial changes');
  const firstURL = entries.find(entry=>entry.id==='test-exercise').file;
  writeDraft({...fixture,title:'Updated exercise',tempo:90});
  importSong(book,draftPath,{replace:true,photo:path.join(root,'assets/original-tab.jpg')});
  const updated = vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(book,'songs/catalog.js'),'utf8'),updated);
  assert.equal(updated.window.GuitarSongbook.catalog.length,2);
  assert.notEqual(updated.window.GuitarSongbook.catalog.find(entry=>entry.id==='test-exercise').file,firstURL,'Updating a song refreshes its URL revision');

  const unchanged = snapshot(book);
  writeDraft({...fixture,id:'unresolved',transcription:{...fixture.transcription,unresolved:['Bar 2 fret is unreadable.']}});
  assert.throws(()=>importSong(book,draftPath),/Bar 2 fret is unreadable/);
  assert.deepEqual(snapshot(book),unchanged,'Unresolved transcription never enters the library');
  writeDraft({...fixture,id:'missing-photo',source:{description:'Photo missing.',image:'assets/missing.jpg'}});
  assert.throws(()=>importSong(book,draftPath),/source image is missing/);
  assert.deepEqual(snapshot(book),unchanged,'Missing photo fails before any writes');

  for (const image of ['../secret.jpg','assets/../../secret.jpg','https://example.com/a.jpg','javascript:alert(1)','assets/a.svg']) {
    assert.throws(()=>validateSong({...fixture,source:{description:'Invalid photo path.',image}}),/local JPG/);
  }
  assert.throws(()=>validateSong({...fixture,id:'../../outside'}),/URL-safe/);
  assert.throws(()=>validateSong({...fixture,schemaVersion:2}),/schemaVersion/);
  assert.throws(()=>validateSong({...fixture,rawBar:fixture.rawBars}),/Unknown field/);
  assert.throws(()=>validateSong({...fixture,rawBars:[['2:1:2']]}),/expected 3/);
  assert.throws(()=>validateSong({...fixture,rawBars:[['2:1:3:t']]}),/Tie/);
  assert.throws(()=>validateSong({...fixture,rawBars:[[2],[1]]}),/earlier bar/);
  assert.throws(()=>validateSong({...fixture,sections:[{name:'Bad',start:1,end:9}]}),/range/);
  assert.throws(()=>validateSong({...fixture,accompaniment:'Official chords.'}),/Label suggested/);
  assert.throws(()=>validateSong({...fixture,transcription:{...fixture.transcription,chords:'none'}}),/Declare where/);
  assert.throws(()=>validateSong(JSON.parse(fs.readFileSync(path.join(root,'song-template.json'),'utf8'))),/Resolve before import/);
  const near = prepareSong({...fixture,sections:[],rawBars:[['2:1:1 2:0:1 3:2:1'],['2:1:.5 2:0:1.5 3:2:1'],['2:1:1 2:0:1 3:3:1']]});
  assert.equal(near.repeats.length,0,'Rhythm changes and different endings are not exact repeats');

  fs.appendFileSync(path.join(book,'script.js'),'\n// changed player asset\n');
  assert.throws(()=>writePlan(book,buildPlan(book,readLibrary(book)),true),/out of date/);
  assert.deepEqual(writePlan(book,buildPlan(book,readLibrary(book))),['index.html']);
  fs.appendFileSync(path.join(book,'songs/test-exercise.js'),'\n// accidental manual edit\n');
  assert.throws(()=>writePlan(book,buildPlan(book,readLibrary(book)),true),/out of date/);
  writePlan(book,buildPlan(book,readLibrary(book)));
  console.log('PASS: isolated multi-song import, source photo, exact repeats, replacement, cache revisions, and invalid-draft protection.');
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
