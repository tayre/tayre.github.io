const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const root=resolve(__dirname,'..');
let now=0,nextId=1;
const jobs=new Map(),sounds=[];
const context={get currentTime(){return now;}};
const sandbox=vm.createContext({
  setInterval(fn,ms){const id=nextId++;jobs.set(id,{fn,time:now+ms/1000,interval:ms/1000});return id;},
  clearInterval(id){jobs.delete(id);},
  setTimeout(fn,ms){const id=nextId++;jobs.set(id,{fn,time:now+ms/1000});return id;},
  clearTimeout(id){jobs.delete(id);},window:{}
});
for(const file of ['song-model.js','songs/catalog.js','songs/jingle-bell-rock.js','playback.js'])vm.runInContext(readFileSync(resolve(root,file),'utf8'),sandbox);
const {BeatClock,PracticeTransport,buildTimeline}=vm.runInContext('({BeatClock,PracticeTransport,buildTimeline})',sandbox);
function advance(time){
  while(true){
    const ready=[...jobs.entries()].filter(([,job])=>job.time<=time).sort((a,b)=>a[1].time-b[1].time)[0];
    if(!ready)break;
    const [id,job]=ready;now=job.time;
    if(job.interval)job.time+=job.interval;else jobs.delete(id);
    job.fn();
  }
  now=time;
}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);}
const instrument={context,
  playNote(midi,when,end,velocity,elapsed=0){
    const voice={midi,when,end,velocity,elapsed,ended:false,cancelled:false,releaseAt(time){this.end=time;},cancel(){this.cancelled=true;this.ended=true;}};
    sounds.push(voice);return voice;
  },
  click(when){const voice={when,ended:false,cancel(){this.ended=true;}};return voice;}
};
const clock=new BeatClock(10,120);
close(clock.beatAt(11),2);clock.setTempo(60,11);close(clock.beatAt(11),2);close(clock.timeAt(3),12);
clock.setTempo(180,12);close(clock.beatAt(12),3);close(clock.timeAt(6),13);
const song=sandbox.window.GuitarSongbook.songs['jingle-bell-rock'];
const bars=sandbox.compileSong(song);
const middle=buildTimeline(bars,{start:19,end:20},4,song.tuning);
const held=middle.events.find(e=>e.at===3.5&&e.midi!==undefined);
assert.equal(held.midi,52);assert.equal(held.hold,3.5,'Cross-bar tie stays one sustained note');
assert.equal(middle.events.filter(e=>e.at===4&&e.midi!==undefined).length,0,'Do not pick a tied continuation');
const tieStart=buildTimeline(bars,{start:20,end:20},4,song.tuning);
assert.equal(tieStart.events.find(e=>e.at===0&&e.kind!=='click').midi,52,'Practising from a tied bar picks its first note');
const fixture=[{number:1,notes:[{beat:0,string:2,fret:1,duration:2},{beat:2,string:2,fret:0,duration:2}]}];
const timeline=buildTimeline(fixture,{start:1,end:1},4,song.tuning);
let finished=0;const highlights=[];
const player=new PracticeTransport(instrument,{onEvent:e=>highlights.push(e.midi),onEnd:()=>finished++});
player.start(timeline,120);
advance(.56);player.setTempo(60);
close(player.clock.beatAt(now),1);close(sounds[0].end,1.56);
advance(1.6);
const picked=sounds.filter(v=>!v.cancelled);
assert.deepEqual(picked.map(v=>v.midi),[60,59]);close(picked[1].when,1.56);
assert.deepEqual(highlights,[60,59]);
advance(3.6);assert.equal(finished,1);assert.equal(player.running,false);
// Changing tempo in the look-ahead window must cancel and replace future attacks.
now=0;jobs.clear();sounds.length=0;highlights.length=0;
player.start(timeline,120);advance(1);assert.ok(sounds.some(v=>v.when>now));
player.setTempo(60);advance(1.3);
assert.equal(sounds.filter(v=>v.midi===59&&!v.cancelled).length,1);
close(sounds.find(v=>v.midi===59&&!v.cancelled).when,1.12);
player.stop();advance(4);assert.equal(player.running,false);
// Loops keep the same beat clock; switching loop off ends at the next boundary.
now=0;jobs.clear();sounds.length=0;finished=0;
player.start(timeline,120,{loop:true});advance(2.1);
assert.ok(sounds.some(v=>v.midi===60&&v.when>2));
player.setTempo(60);player.setOptions({loop:false});advance(7);
assert.equal(finished,1);assert.equal(player.running,false);
console.log('PASS: live tempo continuity, rescheduled future attacks, unchanged pitches, tied releases, stop, and loop boundaries.');

// Pause freezes beat position and UI callbacks, then resumes within the same sample.
now=0;jobs.clear();sounds.length=0;highlights.length=0;
player.start(timeline,120);advance(.56);player.pause();
assert.equal(player.paused,true);assert.equal(player.running,false);close(player.pausedBeat,1);
const count=highlights.length;advance(5);assert.equal(highlights.length,count);
player.resume(60);assert.equal(player.running,true);assert.equal(player.paused,false);
const continued=sounds[sounds.length-1];assert.equal(continued.midi,60);close(continued.elapsed,.5);
close(continued.when,5.04);close(continued.end,6.04);
advance(6.1);assert.equal(highlights.at(-1),59);
player.stop();assert.equal(player.paused,false);
// A rapid second pause before the resume pre-roll must not lose the held sample.
now=0;jobs.clear();sounds.length=0;
player.start(timeline,120);advance(.56);player.pause();advance(1);
player.resume(120);advance(1.01);player.pause();close(player.pausedBeat,1);
advance(2);player.resume(120);close(sounds.at(-1).elapsed,.5);assert.equal(sounds.at(-1).midi,60);player.stop();
// Resting bars remain silent when resumed mid-rest.
now=0;jobs.clear();sounds.length=0;
const restTimeline=buildTimeline([{number:1,notes:[{beat:0,rest:true,duration:2},{beat:2,string:2,fret:1,duration:2}]}],{start:1,end:1},4,song.tuning);
player.start(restTimeline,120);advance(.56);player.pause();advance(3);player.resume(120);
assert.equal(sounds.filter(s=>!s.cancelled).length,0);advance(3.6);assert.equal(sounds.filter(s=>!s.cancelled).length,1);player.stop();
console.log('PASS: pause/resume preserves position and sample offset, rapid toggles, and silence during rests.');
