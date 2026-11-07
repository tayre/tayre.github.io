"use strict";

const stringNames = ['e','B','G','D','A','E'];
let currentSong, bars = [], sections = [], chordShapes = [], midiOpen = [];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const $ = id => document.getElementById(id);
let selected = 'all';
let audio, timer, nextTime, eventIndex, playing = false, runId = 0, uiTimers = [];
let events = [], activeVoices = new Set();
function tabSVG(bar) {
  const x = beat => 38 + beat * (244/currentSong.beatsPerBar);
  const y = string => 31 + (string-1)*18;
  const spoken = bar.notes.map(n => n.rest ? `rest ${n.duration} beats` : `${n.tied ? 'hold tied' : 'play'} ${stringNames[n.string-1]} string fret ${n.fret} for ${n.duration} beats`).join('; ');
  let svg = `<svg class="tab-svg" viewBox="0 0 292 155" role="img" aria-label="Bar ${bar.number}: ${spoken}">`;
  stringNames.forEach((name,i) => {
    svg += `<line class="string-line ${!bars.some(b=>b.notes.some(n=>n.string===i+1))?'unused-string':''}" x1="0" x2="292" y1="${y(i+1)}" y2="${y(i+1)}"/><g class="string-label"><rect class="fret-bg" x="0" y="${y(i+1)-9}" width="25" height="18"/><text class="string-name" x="8" y="${y(i+1)+3}">${name}</text></g>`;
  });
  for(let beat=0;beat<currentSong.beatsPerBar;beat+=.5) svg += `<text class="beat" text-anchor="middle" x="${x(beat)}" y="145">${Number.isInteger(beat)?beat+1:'&'}</text>`;
  bar.notes.forEach((n,i) => {
    const nx=x(n.beat);
    if(n.rest){svg+=`<g class="note" id="note-${bar.number}-${i}"><text class="rest" text-anchor="middle" x="${nx}" y="17">rest</text><line class="note-held" x1="${nx}" x2="${Math.min(280,x(n.beat+n.duration)-10)}" y1="22" y2="22"/></g>`;return;}
    const ny=y(n.string);
    if(n.duration>0.5) svg+=`<line class="note-held" x1="${nx+10}" x2="${Math.min(280,x(n.beat+n.duration)-10)}" y1="${ny}" y2="${ny}"/>`;
    if(n.tied){const prev=bar.notes[i-1];const start=prev?x(prev.beat):25;svg+=`<path class="tie" d="M ${start} ${ny-11} Q ${(start+nx)/2} ${ny-25} ${nx} ${ny-11}"/>`;}
    svg+=`<g class="note" id="note-${bar.number}-${i}"><rect class="fret-bg" x="${nx-9}" y="${ny-11}" width="18" height="22" rx="5"/><text class="fret" text-anchor="middle" x="${nx}" y="${ny+6}">${n.fret}</text></g>`;
  });
  return svg+'</svg>';
}
function render(){
  $('score').innerHTML = `<div class="sheet-scroll"><div class="tab-sheet">${Array.from({length:Math.ceil(bars.length/4)},(_,row)=>`<div class="sheet-row">${bars.slice(row*4,row*4+4).map(b=>`<article class="bar" id="bar-${b.number}" title="${escapeHTML(b.hint)}"><div class="bar-header"><span class="bar-number">${b.number}${b.repeat?` <span class="repeat-ref">= ${b.repeat}</span>`:''}</span><span class="chord-label" title="Suggested accompaniment">${escapeHTML(b.chord)}</span></div>${tabSVG(b)}</article>`).join('')}</div>`).join('')}</div></div>`;
}
function drawChords(){
  $('chord-library').innerHTML=chordShapes.map(([name,shape])=>{
    let svg=`<svg viewBox="0 0 90 100" role="img" aria-label="${escapeHTML(name)}: ${shape.map((f,i)=>`${['low E','A','D','G','B','high e'][i]} ${f<0?'muted':f===0?'open':`fret ${f}`}`).join(', ')}">`;
    for(let i=0;i<5;i++)svg+=`<line x1="15" x2="75" y1="${24+i*15}" y2="${24+i*15}" stroke="#84907d" stroke-width="${i===0?3:1}"/>`;
    shape.forEach((f,i)=>{const x=15+i*12;svg+=`<line x1="${x}" x2="${x}" y1="24" y2="84" stroke="#84907d"/>`;svg+=f<=0?`<text x="${x}" y="16" text-anchor="middle" font-size="12" fill="#53684f">${f<0?'×':'○'}</text>`:`<circle cx="${x}" cy="${24+(f-.5)*15}" r="4.5" fill="#283b33"/>`;});
    return `<div class="chord-card"><h3>${escapeHTML(name)}</h3>${svg}</svg><span class="chord-shape">${shape.map(f=>f<0?'×':f).join('')}</span></div>`;
  }).join('');
}
function chooseSection(value){
  stop();selected=value;$('section-select').value=value;
  $('play-status').textContent=value==='all'?`All ${bars.length} bars are on the sheet.`:`Playback: bars ${sections[Number(value)].start}–${sections[Number(value)].end}. The complete sheet stays visible. Turn on Loop to repeat this passage.`;
  saveSettings();
}
function saveSettings(){try{localStorage.setItem(`learn-guitar:${currentSong.id}:settings`,JSON.stringify({tempo:$('tempo').value,chords:$('show-chords').checked,loop:$('loop').checked,click:$('click').checked,section:selected}));}catch{ /* Practice works when browser storage is unavailable. */ }}
function restoreSettings(){try{const s=JSON.parse(localStorage.getItem(`learn-guitar:${currentSong.id}:settings`)||'null');if(!s)return;if(Number(s.tempo)>=40&&Number(s.tempo)<=140)$('tempo').value=s.tempo;for(const [key,id] of [['chords','show-chords'],['loop','loop'],['click','click']])if(typeof s[key]==='boolean')$(id).checked=s[key];if((s.section==='all'||sections.some((_,i)=>String(i)===s.section)))chooseSection(s.section);}catch{}}
function buildEvents(){
  const range=selected==='all'?{start:1,end:bars.length}:sections[Number(selected)];
  const list=[];
  bars.slice(range.start-1,range.end).forEach(bar=>bar.notes.forEach((note,i)=>list.push({...note,bar:bar.number,index:i,at:(bar.number-range.start)*currentSong.beatsPerBar+note.beat})));
  return {list,length:(range.end-range.start+1)*currentSong.beatsPerBar,range};
}
let instrumentBus;
function setupInstrument(){
  if(instrumentBus)return;
  instrumentBus=audio.createGain();instrumentBus.gain.value=.8;
  const warmth=audio.createBiquadFilter();warmth.type='lowpass';warmth.frequency.value=3600;warmth.Q.value=.5;
  const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-14;compressor.ratio.value=3;
  instrumentBus.connect(warmth);warmth.connect(compressor);compressor.connect(audio.destination);
  // A quiet, short room reflection gives the pluck space without blurring the tab.
  const room=audio.createConvolver(),wet=audio.createGain();wet.gain.value=.10;
  const impulse=audio.createBuffer(2,Math.ceil(audio.sampleRate*.24),audio.sampleRate);
  for(let c=0;c<2;c++){const channel=impulse.getChannelData(c);for(let i=0;i<channel.length;i++)channel[i]=(Math.random()*2-1)*Math.pow(1-i/channel.length,3);}
  room.buffer=impulse;warmth.connect(room);room.connect(wet);wet.connect(compressor);
}
function pluckedSamples(frequency,duration,sampleRate){
  const samples=new Float32Array(Math.ceil(sampleRate*(duration+.08)));
  // Karplus–Strong string: a gently excited delay line loses its bright harmonics
  // naturally. Fractional delay compensates for the averaging filter's half sample.
  const delay=sampleRate/frequency-.5,size=Math.ceil(delay)+2,line=new Float32Array(size);
  let seed=137,previous=0;
  for(let i=0;i<size;i++){seed=(seed*16807)%2147483647;line[i]=(seed/2147483647*2-1)*.7;}
  for(let i=0;i<samples.length;i++){
    const write=i%size,position=(write-delay+size)%size,lo=Math.floor(position),fraction=position-lo;
    const current=line[lo]*(1-fraction)+line[(lo+1)%size]*fraction;
    line[write]=.996*(current+previous)*.5;previous=current;
    const attack=Math.min(1,i/(sampleRate*.006));
    const release=Math.min(1,Math.max(0,(duration+.06-i/sampleRate)/.06));
    samples[i]=current*attack*release;
  }
  return samples;
}
function tone(frequency,start,duration,volume=.65,click=false){
  setupInstrument();
  const gain=audio.createGain();let voice;
  if(click){
    voice=audio.createOscillator();voice.type='sine';voice.frequency.setValueAtTime(frequency*.65,start);
    voice.frequency.exponentialRampToValueAtTime(frequency*.35,start+.025);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume*.5,start+.003);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  }else{
    voice=audio.createBufferSource();const samples=pluckedSamples(frequency,duration,audio.sampleRate);
    const buffer=audio.createBuffer(1,samples.length,audio.sampleRate);buffer.copyToChannel(samples,0);voice.buffer=buffer;gain.gain.value=volume;
  }
  voice.envelope=gain;voice.connect(gain);gain.connect(instrumentBus);voice.start(start);voice.stop(start+duration+.08);activeVoices.add(voice);
  voice.onended=()=>{activeVoices.delete(voice);voice.disconnect();gain.disconnect();};
}
function scheduleUI(fn,time){const id=setTimeout(()=>{uiTimers=uiTimers.filter(item=>item!==id);fn();},Math.max(0,(time-audio.currentTime)*1000));uiTimers.push(id);}
function keepBarVisible(el) {
  const rect=el.getBoundingClientRect();
  const toolbar=document.querySelector('.practice-toolbar').getBoundingClientRect();
  const viewport=window.visualViewport;
  const top=(viewport?.offsetTop||0)+Math.max(0,toolbar.bottom)+12;
  const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-16;
  // Scroll below the sticky controls, including after a phone/tablet rotation.
  if(rect.top<top || rect.bottom>bottom) {
    window.scrollBy({top:rect.top-top,behavior:'auto'});
  }
}
function highlight(event){
  document.querySelector('.note.playing')?.classList.remove('playing');
  $(`note-${event.bar}-${event.index}`)?.classList.add('playing');
  const el=$(`bar-${event.bar}`);
  if(!el.classList.contains('active')){
    document.querySelector('.bar.active')?.classList.remove('active');
    el.classList.add('active');keepBarVisible(el);
    $('play-status').textContent=`Playing bar ${event.bar} of ${bars.length} · ${$('tempo').value} BPM`;
  }
}
function scheduleCycle(){
  const seconds=60/Number($('tempo').value);
  const currentRun=runId;
  while(eventIndex<events.length&&nextTime+events[eventIndex].at*seconds<audio.currentTime+.15){
    const event=events[eventIndex],at=nextTime+event.at*seconds;
    // Re-articulate a tie only when practice starts in the middle of it.
    if(!event.rest&&(!event.tied||eventIndex===0)){
      let beats=event.duration;
      for(let j=eventIndex+1;j<events.length&&events[j].tied;j++)beats+=events[j].duration;
      tone(440*Math.pow(2,(midiOpen[event.string-1]+event.fret-69)/12),at,beats*seconds*.96);
    }
    if($('click').checked&&event.click)tone(event.downbeat?1100:800,at,.035,.07,true);
    if(!event.clickOnly)scheduleUI(()=>{if(playing&&runId===currentRun)highlight(event);},at);
    eventIndex++;
  }
  if(eventIndex===events.length){
    clearInterval(timer);const end=nextTime+buildEvents().length*seconds;
    scheduleUI(()=>{if(!playing||currentRun!==runId)return;if($('loop').checked){nextTime=end;eventIndex=0;timer=setInterval(scheduleCycle,25);scheduleCycle();}else{stop();$('play-status').textContent='Nicely done. Try it again, or choose a smaller section.';}},end);
  }
}
async function start(){
  if(playing){stop();return;}
  const request=++runId;
  $('player-settings').open=false;
  $('song-error').hidden=true;
  try{
    const AudioClass=window.AudioContext||window.webkitAudioContext;if(!AudioClass)throw new Error('No audio support');
    if(!audio || audio.state==='closed') {
      audio=new AudioClass();instrumentBus=undefined;
      audio.addEventListener('statechange',()=>{
        if(playing && audio.state!=='running') {
          stop();$('play-status').textContent='Audio paused. Tap Play to start again.';
        }
      });
    }
    await audio.resume();if(request!==runId)return;
    const data=buildEvents();events=data.list;
    // Add a click at every quarter beat without changing the melody's event times.
    for(let beat=0;beat<data.length;beat++){
      const match=events.find(e=>e.at===beat);
      if(match){match.click=true;match.downbeat=beat%currentSong.beatsPerBar===0;}
      else events.push({at:beat,click:true,clickOnly:true,rest:true,downbeat:beat%currentSong.beatsPerBar===0});
    }
    events.sort((a,b)=>a.at-b.at);playing=true;eventIndex=0;nextTime=audio.currentTime+.08;
    $('play').innerHTML='<span aria-hidden="true">■</span> Stop';$('play').setAttribute('aria-pressed','true');
    $('tempo').disabled=true;
    timer=setInterval(scheduleCycle,25);scheduleCycle();
  }catch{stop();$('song-error').textContent='Audio could not start. Tap Play to try again.';$('song-error').hidden=false;}
}
function stop(){
  playing=false;runId++;clearInterval(timer);uiTimers.forEach(clearTimeout);uiTimers=[];
  activeVoices.forEach(voice=>{try{voice.envelope.gain.cancelScheduledValues(audio.currentTime);voice.envelope.gain.setTargetAtTime(0,audio.currentTime,.008);voice.stop(audio.currentTime+.04);}catch{}});activeVoices.clear();
  document.querySelector('.note.playing')?.classList.remove('playing');document.querySelector('.bar.active')?.classList.remove('active');
  $('play').innerHTML='<span aria-hidden="true">▶</span> Play';$('play').setAttribute('aria-pressed','false');$('tempo').disabled=false;
  $('play-status').textContent='Stopped. Play starts this selection from the beginning.';
}

$('play').addEventListener('click',start);
$('section-select').addEventListener('change',e=>chooseSection(e.target.value));
$('reset').addEventListener('click',()=>{stop();$('play-status').textContent='Back to the beginning of this selection. Ready when you are.';});
$('tempo').addEventListener('input',()=>{$('tempo-value').textContent=$('tempo').value;saveSettings();});
for(const id of ['loop','click','show-chords'])$(id).addEventListener('change',()=>{document.body.classList.toggle('hide-chords',!$('show-chords').checked);saveSettings();});
$('print').addEventListener('click',()=>{stop();window.print();});
window.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop();});

const catalog = window.GuitarSongbook.catalog;
const songLoads = new Map();
let songRequest = 0;
function readSong(entry) {
  if (!songLoads.has(entry.id)) {
    const pending = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = entry.file;
      script.onload = () => {
        const song = window.GuitarSongbook.songs[entry.id];
        if (song?.id === entry.id) resolve(song);
        else reject(new Error('The song file did not register its catalog ID.'));
      };
      script.onerror = () => { script.remove(); reject(new Error('The song file could not be loaded.')); };
      document.head.append(script);
    }).catch(error => { songLoads.delete(entry.id); throw error; });
    songLoads.set(entry.id,pending);
  }
  return songLoads.get(entry.id);
}
function setReady(ready) {
  for (const id of ['play','tempo','section-select','reset','print']) $(id).disabled=!ready;
  $('score').setAttribute('aria-busy',String(!ready));
}
function drawSongDetails() {
  $('song-title').textContent=currentSong.title;
  document.title=`${currentSong.title} · Learn Guitar`;
  $('section-select').replaceChildren(new Option('Whole song','all'),...sections.map((s,i)=>new Option(`${s.letter ? s.letter+' · ' : ''}${s.name}`,String(i))));
  $('song-facts').textContent=`${bars.length} bars · ${currentSong.beatsPerBar}/4 · ${currentSong.tuningLabel || 'Custom tuning'} · ${currentSong.capo ? 'Capo '+currentSong.capo : 'No capo'}`;
  $('repeat-summary').textContent=currentSong.repeatSummary ? `Repeat shortcuts: ${currentSong.repeatSummary}` : '';
  $('repeat-summary').hidden=!currentSong.repeatSummary;
  $('accompaniment-note').textContent=currentSong.accompaniment || '';
  $('play-together').hidden=!chordShapes.length;
  $('practice-notes').innerHTML=(currentSong.tips || []).map(([title,body])=>`<div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(body)}</p></div>`).join('');
  const source=currentSong.source;
  $('source').hidden=!source;
  $('source-description').textContent=source?.description || '';
  $('source-link').hidden=!source?.image;
  $('source-image').hidden=!source?.image;
  if(source?.image){
    $('source-link').href=source.image;
    $('source-image').src=source.image;
    $('source-image').alt=`Original ${currentSong.title} guitar tab`;
  }else{
    $('source-link').removeAttribute('href');
    $('source-image').removeAttribute('src');
  }
}
async function loadSong(id, historyMode='push') {
  const entry=catalog.find(song=>song.id===id)||catalog[0];
  const request=++songRequest;
  stop();setReady(false);$('song-error').hidden=true;
  if (!entry) {
    $('song-error').textContent='No songs are available yet.';
    $('song-error').hidden=false;
    return;
  }
  $('song-select').value=entry.id;
  try {
    const song=await readSong(entry);
    const parsed=compileSong(song);
    if(request!==songRequest)return;
    currentSong=song;bars=parsed;sections=song.sections||[];chordShapes=song.chordShapes||[];
    midiOpen=song.tuning.map(pitch=>pitch+song.capo);selected='all';
    $('tempo').value=song.tempo;$('loop').checked=false;$('click').checked=false;$('show-chords').checked=true;
    drawSongDetails();render();drawChords();restoreSettings();
    $('tempo-value').textContent=$('tempo').value;
    document.body.classList.toggle('hide-chords',!$('show-chords').checked);
    $('play-status').textContent=`${song.title} ready. ${bars.length} bars.`;
    try {
      const url=new URL(location.href);url.searchParams.set('song',song.id);
      if(historyMode==='replace')history.replaceState(null,'',url);
      else if(historyMode==='push'&&url.href!==location.href)history.pushState(null,'',url);
    } catch { /* Local file previews can restrict history; song selection still works. */ }
  }catch(error){
    if(request!==songRequest)return;
    $('song-error').textContent=`Could not open ${entry.title}. ${error.message}`;
    $('song-error').hidden=false;
    if(currentSong)$('song-select').value=currentSong.id;
  }finally{
    if(request===songRequest)setReady(Boolean(currentSong));
  }
}
$('song-select').replaceChildren(...catalog.map(song=>new Option(song.title,song.id)));
$('song-select').addEventListener('change',e=>loadSong(e.target.value));
window.addEventListener('popstate',()=>loadSong(new URLSearchParams(location.search).get('song'),'none'));
loadSong(new URLSearchParams(location.search).get('song'),'replace');

let viewportFrame;
window.addEventListener('resize',()=>{
  cancelAnimationFrame(viewportFrame);
  viewportFrame=requestAnimationFrame(()=>{
    const active=document.querySelector('.bar.active');
    if(playing&&active)keepBarVisible(active);
  });
});
document.addEventListener('pointerdown',event=>{
  if(!$('player-settings').contains(event.target))$('player-settings').open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('player-settings').open){
    $('player-settings').open=false;$('player-settings').querySelector('summary').focus();
  }
});
