"use strict";

const stringNames = ['e','B','G','D','A','E'];
let currentSong, bars = [], sections = [], chordShapes = [], midiOpen = [];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const $ = id => document.getElementById(id);
let selected = 'all';
let audio, instrument, transport, playing = false, starting = false, runId = 0;
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
function saveSettings(){try{localStorage.setItem(`learn-guitar:${currentSong.id}:settings`,JSON.stringify({tempo:$('tempo').value,volume:$('volume').value,chords:$('show-chords').checked,loop:$('loop').checked,click:$('click').checked,section:selected}));}catch{ /* Practice works when browser storage is unavailable. */ }}
function restoreSettings(){try{const s=JSON.parse(localStorage.getItem(`learn-guitar:${currentSong.id}:settings`)||'null');if(!s)return;if(Number(s.tempo)>=40&&Number(s.tempo)<=200)$('tempo').value=s.tempo;if(Number(s.volume)>=0&&Number(s.volume)<=100)$('volume').value=s.volume;for(const [key,id] of [['chords','show-chords'],['loop','loop'],['click','click']])if(typeof s[key]==='boolean')$(id).checked=s[key];if((s.section==='all'||sections.some((_,i)=>String(i)===s.section)))chooseSection(s.section);}catch{}}
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
async function start(){
  if(playing || starting){stop();return;}
  const request=++runId;
  starting=true;$('player-settings').open=false;$('song-error').hidden=true;
  $('play').innerHTML='<span aria-hidden="true">■</span> Loading';
  $('play').setAttribute('aria-pressed','true');
  try{
    const AudioClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioClass)throw new Error('Web Audio is not available.');
    if(!audio || audio.state==='closed') {
      audio=new AudioClass();instrument=new AcousticGuitar(audio);
      transport=new PracticeTransport(instrument,{
        onEvent:highlight,
        onEnd:()=>{stop();$('play-status').textContent='Finished. Tap Play to practise again.';}
      });
      audio.addEventListener('statechange',()=>{
        if(playing && audio.state!=='running'){
          stop();$('play-status').textContent='Audio paused. Tap Play to start again.';
        }
      });
    }
    // Resume synchronously from the tap, before awaiting sample downloads (iOS).
    await audio.resume();if(request!==runId)return;
    const range=selected==='all'?{start:1,end:bars.length}:sections[Number(selected)];
    const timeline=buildTimeline(bars,range,currentSong.beatsPerBar,midiOpen);
    $('play-status').textContent='Loading acoustic guitar.';
    await instrument.prepare(timeline.events.filter(event=>event.midi!==undefined).map(event=>event.midi));
    if(request!==runId)return;
    instrument.setVolume(Number($('volume').value)/100);
    starting=false;playing=true;
    $('play').innerHTML='<span aria-hidden="true">■</span> Stop';
    transport.start(timeline,Number($('tempo').value),{loop:$('loop').checked,click:$('click').checked});
  }catch(error){
    if(request!==runId)return;
    stop();$('song-error').textContent='Could not load the guitar audio. Check your connection and tap Play to retry.';$('song-error').hidden=false;
  }
}
function stop(){
  playing=false;starting=false;runId++;transport?.stop();
  document.querySelector('.note.playing')?.classList.remove('playing');
  document.querySelector('.bar.active')?.classList.remove('active');
  $('play').innerHTML='<span aria-hidden="true">▶</span> Play';
  $('play').setAttribute('aria-pressed','false');
  $('play-status').textContent='Stopped. Play starts this selection from the beginning.';
}
function setTempo(value){
  const bpm=Math.max(40,Math.min(200,Math.round(Number(value))));
  if(!Number.isFinite(bpm))return;
  $('tempo').value=bpm;$('tempo-number').value=bpm;
  transport?.setTempo(bpm);
  if(playing)$('play-status').textContent=`Tempo changed to ${bpm} BPM. Playback continues.`;
  saveSettings();
}

$('play').addEventListener('click',start);
$('section-select').addEventListener('change',e=>chooseSection(e.target.value));
$('reset').addEventListener('click',()=>{stop();$('play-status').textContent='Back to the beginning of this selection. Ready when you are.';});
$('tempo').addEventListener('input',()=>setTempo($('tempo').value));
$('tempo-number').addEventListener('input',()=>{
  const value=Number($('tempo-number').value);
  if($('tempo-number').value!=='' && value>=40 && value<=200)setTempo(value);
});
$('tempo-number').addEventListener('change',()=>setTempo($('tempo-number').value || $('tempo').value));
$('tempo-number').addEventListener('keydown',event=>{if(event.key==='Enter')$('tempo-number').blur();});
$('volume').addEventListener('input',()=>{
  $('volume-value').textContent=`${$('volume').value}%`;
  instrument?.setVolume(Number($('volume').value)/100);saveSettings();
});
for(const id of ['loop','click','show-chords'])$(id).addEventListener('change',()=>{document.body.classList.toggle('hide-chords',!$('show-chords').checked);transport?.setOptions({loop:$('loop').checked,click:$('click').checked});saveSettings();});
$('print').addEventListener('click',()=>{stop();window.print();});
window.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(playing||starting))stop();});

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
  for (const id of ['play','tempo','tempo-number','section-select','reset','print']) $(id).disabled=!ready;
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
    $('tempo').value=song.tempo;$('volume').value=75;$('loop').checked=false;$('click').checked=false;$('show-chords').checked=true;
    drawSongDetails();render();drawChords();restoreSettings();
    $('tempo-number').value=$('tempo').value;$('volume-value').textContent=`${$('volume').value}%`;
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
