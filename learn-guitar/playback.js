"use strict";

// Quarter-note beat clock. Tempo changes preserve the current musical position.
class BeatClock {
  constructor(time, bpm) { this.anchorTime=time; this.anchorBeat=0; this.bpm=bpm; }
  beatAt(time) { return this.anchorBeat+(time-this.anchorTime)*this.bpm/60; }
  timeAt(beat) { return this.anchorTime+(beat-this.anchorBeat)*60/this.bpm; }
  setTempo(bpm,time) {
    this.anchorBeat=this.beatAt(time);this.anchorTime=time;this.bpm=bpm;
  }
}

function buildTimeline(bars,range,beatsPerBar,tuning) {
  const notes=bars.slice(range.start-1,range.end).flatMap(bar=>bar.notes.map((note,index)=>({
    ...note,index,bar:bar.number,at:(bar.number-range.start)*beatsPerBar+note.beat
  })));
  const events=notes.map((note,index)=>{
    const event={...note};
    // Resolve ties BEFORE adding metronome events, including cross-bar ties.
    if(!note.rest && (!note.tied || index===0)) {
      event.midi=tuning[note.string-1]+note.fret;
      event.hold=note.duration;
      for(let j=index+1;j<notes.length && notes[j].tied;j++)event.hold+=notes[j].duration;
      event.velocity=note.beat===0?.83:Number.isInteger(note.beat)?.77:.71;
    }
    return event;
  });
  const length=(range.end-range.start+1)*beatsPerBar;
  for(let beat=0;beat<length;beat++)events.push({at:beat,kind:'click',downbeat:beat%beatsPerBar===0});
  events.sort((a,b)=>a.at-b.at);
  events.push({at:length,kind:'end'});
  return {events,length};
}

class PracticeTransport {
  constructor(instrument,{onEvent=()=>{},onEnd=()=>{}}={}) {
    this.instrument=instrument;this.context=instrument.context;
    this.onEvent=onEvent;this.onEnd=onEnd;this.queued=[];this.voices=new Set();
    this.running=false;this.loop=false;this.click=false;
  }
  start(timeline,bpm,{loop=false,click=false}={}) {
    this.stop();this.timeline=timeline;this.loop=loop;this.click=click;
    this.clock=new BeatClock(this.context.currentTime+.06,bpm);
    this.cursor=0;this.finishing=false;this.running=true;
    this.interval=setInterval(()=>this.schedule(),20);this.schedule();
  }
  setTempo(bpm) {
    if(!this.running)return;
    const now=this.context.currentTime;
    this.clock.setTempo(bpm,now);
    this.reschedule(now);
    for(const item of this.voices) {
      if(!item.voice.ended && item.endBeat!==undefined && item.endBeat>this.clock.beatAt(now) && item.voice.when<=now)
        item.voice.releaseAt(this.clock.timeAt(item.endBeat));
    }
    this.schedule();
  }
  setOptions({loop=this.loop,click=this.click}) {
    this.loop=loop;this.click=click;
    if(this.running){this.reschedule(this.context.currentTime);this.schedule();}
  }
  reschedule(now) {
    // Discard only events that have not sounded; keep the current note ringing.
    for(const item of this.queued) {
      if(item.time>now) {
        this.cursor=Math.min(this.cursor,item.cursor);
        clearTimeout(item.timer);
        for(const voice of item.voices)voice.cancel();
      }
    }
    this.queued=this.queued.filter(item=>item.time<=now);
    this.finishing=false;
  }
  schedule() {
    if(!this.running)return;
    const now=this.context.currentTime;
    this.queued=this.queued.filter(item=>item.time>=now-.1);
    for(const item of this.voices)if(item.voice.ended)this.voices.delete(item);
    while(!this.finishing) {
      const {events,length}=this.timeline;
      const event=events[this.cursor%events.length];
      const beat=Math.floor(this.cursor/events.length)*length+event.at;
      const time=this.clock.timeAt(beat);
      if(time>now+.09)break;
      const record={cursor:this.cursor,time,voices:[],timer:null};
      this.queued.push(record);this.cursor++;
      if(event.kind==='end') {
        if(!this.loop) {
          this.finishing=true;
          record.timer=setTimeout(()=>{
            if(!this.running)return;
            this.stop();this.onEnd();
          },Math.max(0,(time-this.context.currentTime)*1000));
        }
        continue;
      }
      if(event.kind==='click') {
        if(this.click) {
          const voice=this.instrument.click(time,event.downbeat);
          record.voices.push(voice);this.voices.add({voice});
        }
      }else{
        if(event.midi!==undefined) {
          const endBeat=beat+event.hold;
          const voice=this.instrument.playNote(event.midi,time,this.clock.timeAt(endBeat),event.velocity);
          record.voices.push(voice);this.voices.add({voice,endBeat});
        }
        record.timer=setTimeout(()=>{if(this.running)this.onEvent(event);},Math.max(0,(time-this.context.currentTime)*1000));
      }
    }
  }
  stop() {
    this.running=false;clearInterval(this.interval);
    for(const item of this.queued)clearTimeout(item.timer);
    for(const {voice} of this.voices)voice.cancel();
    this.voices.clear();this.queued=[];
  }
}
