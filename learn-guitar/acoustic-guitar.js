"use strict";

// Recorded acoustic guitar; provenance and CC BY 3.0 attribution live beside the samples.
const GUITAR_SAMPLES = [
  [40,'E2'],[43,'G2'],[45,'A2'],[48,'C3'],[50,'D3'],[52,'E3'],[53,'F3'],
  [55,'G3'],[56,'Gs3'],[57,'A3'],[59,'B3'],[60,'C4'],[62,'D4'],
  [64,'E4'],[67,'G4'],[71,'B4'],[74,'D5']
];
class AcousticGuitar {
  constructor(context) {
    this.context=context;this.buffers=new Map();
    this.input=context.createGain();
    const body=context.createBiquadFilter();body.type='highpass';body.frequency.value=65;body.Q.value=.5;
    const air=context.createBiquadFilter();air.type='lowpass';air.frequency.value=8200;air.Q.value=.5;
    const compressor=context.createDynamicsCompressor();
    compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=2;
    compressor.attack.value=.008;compressor.release.value=.18;
    this.output=context.createGain();this.output.gain.value=.75;
    this.input.connect(body);body.connect(air);air.connect(compressor);
    compressor.connect(this.output);this.output.connect(context.destination);
    // Small, quiet stereo room; the recorded attack and body stay mostly dry.
    const room=context.createConvolver(),wet=context.createGain();wet.gain.value=.075;
    const impulse=context.createBuffer(2,Math.ceil(context.sampleRate*.38),context.sampleRate);
    let seed=13;
    for(let c=0;c<2;c++) {
      const data=impulse.getChannelData(c);
      for(let i=0;i<data.length;i++) {
        seed=(seed*16807)%2147483647;
        data[i]=i<context.sampleRate*.012?0:(seed/2147483647*2-1)*Math.pow(1-i/data.length,3.2);
      }
    }
    room.buffer=impulse;air.connect(room);room.connect(wet);wet.connect(compressor);
  }
  setVolume(value) {
    this.output.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),this.context.currentTime,.015);
  }
  sampleFor(midi) {
    return GUITAR_SAMPLES.reduce((best,sample)=>Math.abs(sample[0]-midi)<Math.abs(best[0]-midi)?sample:best);
  }
  async prepare(pitches) {
    const roots=[...new Set(pitches.map(pitch=>this.sampleFor(pitch)[0]))];
    await Promise.all(roots.map(async root=>{
      if(!this.buffers.has(root)) {
        const name=GUITAR_SAMPLES.find(sample=>sample[0]===root)[1];
        const promise=(async()=>{
          const controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),15000);
          try {
            const response=await fetch(`assets/audio/acoustic-guitar/${name}.mp3`,{signal:controller.signal});
            if(!response.ok)throw new Error(`Could not load guitar sample ${name}.`);
            const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
            const data=buffer.getChannelData(0);
            let peak=0;
            for(const value of data)peak=Math.max(peak,Math.abs(value));
            let first=0;
            while(first<data.length && Math.abs(data[first])<peak*.006)first++;
            return {buffer,offset:Math.max(0,(first-64)/buffer.sampleRate),gain:Math.min(1.3,.75/Math.max(.1,peak))};
          } finally {clearTimeout(timeout);}
        })();
        this.buffers.set(root,promise);
        promise.catch(()=>this.buffers.delete(root));
      }
      const sample=await this.buffers.get(root);
      this.buffers.set(root,sample);
    }));
  }
  playNote(midi,when,end,velocity=.8,elapsed=0) {
    const [root]=this.sampleFor(midi),sample=this.buffers.get(root);
    const source=this.context.createBufferSource();source.buffer=sample.buffer;
    source.playbackRate.value=Math.pow(2,(midi-root)/12);
    const envelope=this.context.createGain(),level=velocity*sample.gain;
    const start=Math.max(when,this.context.currentTime);
    envelope.gain.setValueAtTime(0,start);
    envelope.gain.linearRampToValueAtTime(level,start+.004);
    source.connect(envelope);envelope.connect(this.input);
    const offset=sample.offset+elapsed*source.playbackRate.value;
    if(offset>=sample.buffer.duration) {
      source.disconnect();envelope.disconnect();
      return {when:start,ended:true,releaseAt(){},cancel(){}};
    }
    source.start(start,offset);
    const voice=this.voice(source,envelope,start,level);
    voice.releaseAt(end);
    return voice;
  }
  voice(source,envelope,when,level) {
    const context=this.context;
    const voice={when,ended:false,end:Infinity,release:.085,
      releaseAt(end) {
        if(this.ended)return;
        const now=context.currentTime;
        // Retiming changes only the release; sample rate (and pitch) stays fixed.
        const hold=Math.max(when+.005,now);
        envelope.gain.cancelScheduledValues(hold);
        envelope.gain.setValueAtTime(level,hold);
        this.end=Math.max(end,hold);
        envelope.gain.setValueAtTime(level,this.end);
        envelope.gain.linearRampToValueAtTime(0,this.end+this.release);
        source.stop(this.end+this.release+.01);
      },
      cancel() {
        if(this.ended)return;
        this.ended=true;
        const now=context.currentTime;
        if(when>now) {source.stop(now);return;}
        if(typeof envelope.gain.cancelAndHoldAtTime==='function')envelope.gain.cancelAndHoldAtTime(now);
        else {
          const attack=Math.max(0,Math.min(1,(now-when)/.004));
          const release=Math.max(0,Math.min(1,(this.end+this.release-now)/this.release));
          envelope.gain.cancelScheduledValues(now);
          envelope.gain.setValueAtTime(level*attack*release,now);
        }
        envelope.gain.setTargetAtTime(0,now,.008);
        source.stop(now+.045);
      }
    };
    source.onended=()=>{voice.ended=true;source.disconnect();envelope.disconnect();};
    return voice;
  }
  click(when,downbeat) {
    const source=this.context.createOscillator(),envelope=this.context.createGain();
    const start=Math.max(when,this.context.currentTime);
    source.type='sine';source.frequency.setValueAtTime(downbeat?950:650,start);
    source.frequency.exponentialRampToValueAtTime(downbeat?500:350,start+.03);
    envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.09,start+.002);
    envelope.gain.exponentialRampToValueAtTime(.0001,start+.045);
    source.connect(envelope);envelope.connect(this.output);
    source.start(start);source.stop(start+.05);
    return this.voice(source,envelope,start,.09);
  }
}
