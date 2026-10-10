import { PLAYS, newGame, derive, suggestedMoves, validateEvent } from './engine.js';
import { POSITIONS, selectFielder, fieldingNotation, fieldingDescription, fieldArtwork } from './positions.js';

const $ = (selector) => document.querySelector(selector);
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'fieldnotes-game-v1';
let game = newGame(), storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.version === 1 && saved.teams?.length === 2 && saved.lineups?.every(l => l.length === 9) && Array.isArray(saved.events)) {
    derive(saved); game = saved;
  }
} catch { storageAvailable = false; }
let state = derive(game), cardSide = state.side, draft;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(game)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#save-status').textContent = storageAvailable ? 'Saved locally' : 'Not saved · Export';
}
function inningName(s = state) { return `${s.side === 0 ? 'Top' : 'Bottom'} ${s.inning}`; }
function runnerName(r) { return game.lineups[r.side][r.slot]; }
function total(side) { return state.runs[side].reduce((sum, r) => sum + r, 0); }
function innings() { return Math.max(9, state.inning); }

function field(positions = false) {
  const base = (x, y, i) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${x} ${y})" fill="${!positions && state.bases[i] ? '#b4512d' : '#fffdf4'}" stroke="#78896c" stroke-width="1"/>`;
  const labels = [[150, 157, '1'], [150, 225, '2'], [218, 155, '3'], [184, 108, '4'], [82, 155, '5'], [116, 108, '6'], [62, 67, '7'], [150, 44, '8'], [238, 67, '9']];
  return `<svg class="field-svg" viewBox="0 0 300 260" role="img" aria-label="${positions ? 'Baseball field showing the nine numbered defensive positions' : 'Baseball diamond with occupied bases in orange'}"><path d="M150 225 30 105 Q25 20 150 12 Q275 20 270 105Z" fill="#d5dfc8"/><path d="M150 225 50 125 Q45 50 150 42 Q255 50 250 125Z" fill="#cad8b9"/><path d="M150 225 72 147 Q65 77 150 70 Q235 77 228 147Z" fill="#e7d8b9"/><path d="M150 211 86 147 150 83 214 147Z" fill="#adc59e" stroke="#f8f6e8" stroke-width="1"/><path d="M23 98 150 225 277 98" fill="none" stroke="#fcfaee" stroke-width="1.5"/><path d="M150 218 155 218 155 223 150 227 145 223 145 218Z" fill="#fffdf4"/><circle cx="150" cy="153" r="11" fill="#e7d8b9"/><path d="M146 152h8" stroke="#fffdf4" stroke-width="2"/>${base(214,147,0)}${base(150,83,1)}${base(86,147,2)}${positions ? labels.map(([x,y,n]) => `<circle cx="${x}" cy="${y}" r="12" fill="#183f35"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="#fffdf4" font-family="monospace" font-size="11">${n}</text>`).join('') : `<text x="235" y="151" font-size="9" fill="#6f7d64">1B</text><text x="145" y="64" font-size="9" fill="#6f7d64">2B</text><text x="49" y="151" font-size="9" fill="#6f7d64">3B</text>`}</svg>`;
}
function scoreBox(a) {
  const points = [[23,42],[42,23],[23,4],[4,23],[23,42]];
  const path = points.slice(0, a.maxBase + 1).map(p => p.join(',')).join(' ');
  return `<span class="score-box" title="${escape(`${game.lineups[a.side][a.slot]}: ${a.code}${a.scored ? ', scored' : ''}${a.out ? ', out' : ''}`)}"><svg viewBox="0 0 46 46" aria-hidden="true"><path d="M23 42 42 23 23 4 4 23Z" fill="${a.scored ? '#dce7d2' : 'none'}" stroke="#dfe4d7" stroke-width="1"/><polyline points="${path}" fill="none" stroke="#557e52" stroke-width="2"/></svg><span class="score-code ${a.code.length > 5 ? 'long' : ''}">${escape(a.code)}</span>${a.out ? `<span class="score-out">${a.outNumber}</span>` : ''}</span>`;
}
function scorecard(side) {
  return `<thead><tr><th>BATTING ORDER</th>${Array.from({length: innings()}, (_,i) => `<th>${i+1}</th>`).join('')}</tr></thead><tbody>${game.lineups[side].map((name, slot) => `<tr class="${!game.finished && side === state.side && slot === state.next[side] ? 'current' : ''}"><td><span class="slot">${slot+1}</span>${escape(name)}</td>${Array.from({length: innings()}, (_,i) => {
    const apps = state.appearances.filter(a => a.side === side && a.slot === slot && a.inning === i+1);
    return `<td class="${i+1 === state.inning && side === state.side ? 'active-inning' : ''}">${apps.length ? apps.map(scoreBox).join('') : '<span class="empty-diamond" aria-hidden="true">◇</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`;
}
function render() {
  state = derive(game);
  $('#game-status').textContent = game.finished ? 'FINAL' : `${inningName().toUpperCase()} · ${state.outs} ${state.outs === 1 ? 'OUT' : 'OUTS'}`;
  $('#game-date').textContent = game.date || '';
  $('#mobile-score').innerHTML = game.teams.map((team, side) => `<span>${escape(team)}<b>${total(side)}</b></span>`).join('');
  $('#linescore').innerHTML = `<thead><tr><th>TEAM</th>${Array.from({length: innings()},(_,i)=>`<th>${i+1}</th>`).join('')}<th class="total">R</th><th>H</th><th>E</th></tr></thead><tbody>${game.teams.map((team,side)=>`<tr><td>${!game.finished && side === state.side ? '▸ ' : ''}${escape(team)}</td>${Array.from({length: innings()},(_,i)=> {
    const played = !game.finished && (i+1 < state.inning || (i+1 === state.inning && side <= state.side));
    return `<td>${state.runs[side][i] ?? (played ? 0 : '–')}</td>`;
  }).join('')}<td class="total">${total(side)}</td><td>${state.hits[side]}</td><td>${state.errors[side]}</td></tr>`).join('')}</tbody>`;
  $('#batter-name').textContent = game.finished ? 'Game final' : game.lineups[state.side][state.next[state.side]];
  $('#batting-context').textContent = game.finished ? 'Reopen to continue scoring.' : `${game.teams[state.side]} · ${state.next[state.side] + 1}${['st','nd','rd'][state.next[state.side]] || 'th'} in order`;
  $('#out-indicator').innerHTML = `${[0,1,2].map(i=>`<span class="out-dot ${i<state.outs?'filled':''}"></span>`).join('')} <span>${state.outs} OUT${state.outs===1?'':'S'}</span>`;
  $('#play-buttons').innerHTML = PLAYS.map(p => {
    const disabled = game.finished || (p.code === 'DP' && (state.outs > 1 || !state.bases.some(Boolean)));
    return `<button class="play-button ${p.hit ? 'hit' : ''} ${p.base === 0 ? 'out' : ''} ${p.picker ? 'field-play' : ''}" data-play="${p.code}" ${disabled ? 'disabled' : ''}><strong>${p.label}</strong><span>${p.picker ? 'Field ↗' : p.code === 'OTHER' ? '＋' : p.code}</span></button>`;
  }).join('');
  $('#team-switch').innerHTML = game.teams.map((t,i)=>`<button class="${cardSide===i?'active':''}" data-side="${i}" aria-pressed="${cardSide===i}">${escape(t)}</button>`).join('');
  $('#scorecard').innerHTML = scorecard(cardSide);
  $('#field-inning').textContent = game.finished ? 'FINAL' : inningName();
  $('#live-field').innerHTML = field();
  $('#base-summary').textContent = state.bases.filter(Boolean).length ? state.bases.flatMap((r,i)=>r?[`${runnerName(r)} on ${['first','second','third'][i]}`]:[]).join(' · ') : 'Bases empty';
  $('#play-count').textContent = `${game.events.length} ${game.events.length === 1 ? 'PLAY' : 'PLAYS'}`;
  $('#game-log').innerHTML = state.log.length ? state.log.slice().reverse().map(e=>`<li><small>${e.side === 0 ? 'TOP' : 'BOT'} ${e.inning} · ${escape(game.teams[e.side])}</small><b>${escape(e.code)}</b> · ${escape(e.kind === 'plate' ? game.lineups[e.side][e.slot] : 'Runners')}${e.note ? `<br>${escape(e.note)}` : ''}</li>`).join('') : '<li class="empty-log">No plays yet.</li>';
  $('#undo').disabled = !game.events.length;
  $('#runner-play').disabled = game.finished || !state.bases.some(Boolean);
  $('#finish').disabled = !game.events.length;
  $('#finish').textContent = game.finished ? 'Reopen game' : 'Finish game';
  save();
}

function openPlay(code, kind = 'plate') {
  if (game.finished) return;
  const play = kind === 'runner' ? {code:'SB',label:'Runner play',notation:true,tip:'Choose the play and set the destinations.'} : PLAYS.find(p=>p.code===code);
  draft = { kind, play, fielders: [], moves: suggestedMoves(state, play, kind), manualNotation: false };
  if (code === 'DP') {
    const runner = draft.moves.find(m => m.from === '1') || draft.moves.find(m => m.from !== 'batter');
    if (runner) runner.to = 0;
  }
  $('#play-title').textContent = play.label;
  $('#play-tip').textContent = play.tip;
  $('#notation').value = code === 'OTHER' || play.picker ? '' : play.code;
  $('#notation').readOnly = !play.notation;
  $('#notation-details').open = code === 'OTHER';
  $('#notation-details summary').textContent = play.notation ? 'Edit notation' : `Notation: ${play.code}`;
  $('#fielder-picker').hidden = !play.picker;
  if (play.picker) renderPicker();
  $('#runner-types').hidden = kind !== 'runner';
  if (kind === 'runner') renderRunnerTypes('SB');
  $('#is-hit').checked = !!play.hit;
  $('#is-error').checked = !!play.error;
  $('#custom-flags').hidden = !(play.notation);
  $('#is-hit').parentElement.hidden = kind === 'runner';
  $('#count-runs').checked = false;
  $('#play-note').value = '';
  $('#note-details').open = false;
  $('#play-error').textContent = '';
  $('#runner-destinations').innerHTML = draft.moves.map((move,i)=> {
    const batter = move.from === 'batter';
    const name = batter ? game.lineups[state.side][state.next[state.side]] : runnerName(state.bases[Number(move.from)-1]);
    return `<div class="runner-row"><label for="destination-${i}">${escape(name)}<small>${batter?'At the plate':`From ${['first','second','third'][Number(move.from)-1]} base`}</small></label><select id="destination-${i}" data-from="${move.from}">${[[0,'Out'],[1,'First base'],[2,'Second base'],[3,'Third base'],[4,'Home · run']].filter(([v])=>batter||v===0||v>=Number(move.from)).map(([v,label])=>`<option value="${v}" ${move.to===v?'selected':''}>${label}</option>`).join('')}</select></div>`;
  }).join('');
  updateThirdOut();
  $('#play-dialog').showModal();
  $('#play-dialog').scrollTop = 0;
}

function renderPicker() {
  const { fielders, play, manualNotation } = draft;
  const generated = fieldingNotation(fielders, play.picker);
  if (!manualNotation) $('#notation').value = generated;
  // Keep the position buttons mounted so keyboard focus survives each selection.
  if (!$('#picker-field').children.length) {
    $('#picker-field').innerHTML = `${fieldArtwork()}<svg class="picker-lines" viewBox="0 0 400 340" aria-hidden="true"></svg>${POSITIONS.map(p => `<button type="button" class="fielder" style="--x:${p.x}%;--y:${p.y}%" data-fielder="${p.number}" aria-label="${p.name}, position ${p.number}" aria-pressed="false"><span>${p.name}</span><b>${p.number}</b></button>`).join('')}`;
  }
  const points = fielders.map(n => POSITIONS.find(p => p.number === n)).map(p => `${p.x * 4},${p.y * 3.4}`).join(' ');
  $('.picker-lines').innerHTML = `<polyline points="${points}" stroke="#b7773f" stroke-width="3" stroke-dasharray="5 4" fill="none"/>`;
  document.querySelectorAll('[data-fielder]').forEach(b => {
    const selected = fielders.includes(Number(b.dataset.fielder));
    b.classList.toggle('selected', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
  $('#picker-code').textContent = manualNotation ? $('#notation').value || '—' : generated || '—';
  $('#picker-description').textContent = manualNotation ? 'Manual notation' : fieldingDescription(fielders) || 'Choose a fielder';
  $('#picker-undo').disabled = !fielders.length;
  $('#picker-clear').disabled = !fielders.length && !$('#notation').value;
}

$('#picker-field').addEventListener('click', e => {
  const button = e.target.closest('[data-fielder]');
  if (!button) return;
  draft.fielders = selectFielder(draft.fielders, Number(button.dataset.fielder), draft.play.picker);
  draft.manualNotation = false;
  $('#play-error').textContent = '';
  renderPicker();
});
$('#picker-undo').addEventListener('click', () => {
  draft.fielders = draft.fielders.slice(0, -1);
  draft.manualNotation = false;
  renderPicker();
});
$('#picker-clear').addEventListener('click', () => {
  draft.fielders = [];
  draft.manualNotation = false;
  renderPicker();
});
$('#notation').addEventListener('input', () => {
  if (!draft?.play.picker) return;
  draft.manualNotation = true;
  draft.fielders = [];
  renderPicker();
});

const runnerTypes = [['SB', 'Stolen base'], ['CS', 'Caught stealing'], ['WP', 'Wild pitch'], ['PB', 'Passed ball']];
function renderRunnerTypes(code) {
  $('#runner-types').innerHTML = runnerTypes.map(([c, label]) => `<button type="button" data-runner-type="${c}" class="${code === c ? 'active' : ''}" aria-pressed="${code === c}">${label}</button>`).join('');
}
$('#runner-types').addEventListener('click', e => {
  const button = e.target.closest('[data-runner-type]');
  if (!button) return;
  $('#notation').value = button.dataset.runnerType;
  renderRunnerTypes(button.dataset.runnerType);
});
function getMoves() { return [...document.querySelectorAll('#runner-destinations select')].map(el=>({from:el.dataset.from,to:Number(el.value)})); }
function updateThirdOut() {
  const moves = getMoves();
  const third = state.outs + moves.filter(m=>m.to===0).length >= 3 && moves.some(m=>m.to===4);
  $('#third-out-note').hidden = !third;
}
$('#runner-destinations').addEventListener('change', updateThirdOut);
$('#toggle-linescore').addEventListener('click', () => {
  const expanded = $('#toggle-linescore').getAttribute('aria-expanded') !== 'true';
  $('#toggle-linescore').setAttribute('aria-expanded', String(expanded));
  $('#toggle-linescore').textContent = expanded ? 'Hide innings ⌃' : 'Innings & totals ⌄';
  $('#linescore-wrap').classList.toggle('expanded', expanded);
});
$('#play-buttons').addEventListener('click', e=> {const b=e.target.closest('[data-play]');if(b)openPlay(b.dataset.play);});
$('#runner-play').addEventListener('click',()=>openPlay('SB','runner'));
$('#play-form').addEventListener('submit',e=> {
  e.preventDefault();
  const event = {kind:draft.kind,code:$('#notation').value.trim(),moves:getMoves(),hit:$('#is-hit').checked,error:$('#is-error').checked,note:$('#play-note').value.trim(),countRuns:$('#third-out-note').hidden || $('#count-runs').checked};
  const error = validateEvent(state,event);
  if(error){$('#play-error').textContent = !event.code && draft.play.picker ? 'Choose a fielder to record this play.' : error;return;}
  if (draft.play.code === 'DP' && event.moves.filter(m => m.to === 0).length !== 2) {
    $('#play-error').textContent = 'A double play needs two runners marked Out.';
    return;
  }
  game.events.push(event);cardSide=derive(game).side;
  $('#play-dialog').close();render();
});
$('#team-switch').addEventListener('click',e=>{const b=e.target.closest('[data-side]');if(b){cardSide=Number(b.dataset.side);render();}});
$('#undo').addEventListener('click',()=>{game.events.pop();game.finished=false;cardSide=derive(game).side;render();});
$('#new-game').addEventListener('click',()=>$('#setup-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));
$('#setup-form').addEventListener('submit',e=>{
  e.preventDefault();
  const lineups = ['away','home'].map(side=>{
    const names=$(`#${side}-lineup`).value.split('\n').map(s=>s.trim().replace(/^\d+[.)]\s*/,''));
    return Array.from({length:9},(_,i)=>(names[i]||`Batter ${i+1}`).slice(0,40));
  });
  game=newGame($('#away-name').value.trim()||'Visitors',$('#home-name').value.trim()||'Home',lineups);
  game.date=new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}).toUpperCase();
  cardSide=0;$('#setup-dialog').close();location.hash='score';render();
});
$('#finish').addEventListener('click',()=>{game.finished=!game.finished;render();});
$('#export').addEventListener('click',()=>{
  const data={...game,summary:{runs:[total(0),total(1)],hits:state.hits,errors:state.errors},journal:state.log};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`fieldnotes-${game.teams.join('-vs-').replace(/[^a-z0-9-]/gi,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
let printClone;
window.addEventListener('beforeprint',()=>{
  if(printClone)return;
  printClone=document.createElement('section');printClone.className='panel scorecard-panel print-team';printClone.hidden=true;
  printClone.innerHTML=`<div class="section-heading"><h2>${escape(game.teams[1-cardSide])} scorecard</h2></div><table>${scorecard(1-cardSide)}</table>`;
  $('.scoring-main').append(printClone);
  $('.scorecard-panel h2').textContent=`${game.teams[cardSide]} scorecard`;
});
window.addEventListener('afterprint',()=>{printClone?.remove();printClone=null;$('.scorecard-panel h2').textContent='Scorecard';});
$('#print').addEventListener('click',()=>window.print());
function showTab(){const tab=['score','learn','reference'].includes(location.hash.slice(1))?location.hash.slice(1):'score';document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==tab);document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active',a.dataset.tab===tab);if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
window.addEventListener('hashchange',showTab);

$('#position-field').innerHTML = `<div class="picker-field">${fieldArtwork()}${POSITIONS.map(p => `<span class="fielder" style="--x:${p.x}%;--y:${p.y}%"><span>${p.name}</span><b>${p.number}</b></span>`).join('')}</div>`;
$('#position-list').innerHTML=POSITIONS.map(p=>`<span><b>${p.number}</b>${p.short}</span>`).join('');
const notations=[['1B / 2B','Single / double'],['3B / HR','Triple / home run'],['BB / HBP','Walk / hit by pitch'],['K / ꓘ','Strikeout swinging / looking'],['6-3','Groundout, shortstop to first'],['F8','Flyout to center field'],['E6','Error charged to the shortstop'],['FC','Fielder’s choice'],['SB / CS','Stolen base / caught stealing'],['SF / SH','Sacrifice fly / sacrifice bunt'],['DP','Double play'],['WP / PB','Wild pitch / passed ball']];
$('#notation-list').innerHTML=notations.map(([code,label])=>`<div><dt>${code}</dt><dd>${label}</dd></div>`).join('');
const questions=[
  {q:'The batter swings through strike three. What goes in the box?',options:['BB','K','F8'],answer:'K',why:'K records a swinging strikeout. A backward K is commonly used for a called third strike.'},
  {q:'A ground ball goes to the shortstop, who throws to first for the out.',options:['6-3','4-3','F6'],answer:'6-3',why:'Shortstop is position 6; first base is 3. Write the fielders in the order they handled the ball.'},
  {q:'The batter takes four balls and heads to first base.',options:['1B','HBP','BB'],answer:'BB',why:'BB means base on balls: a walk. The batter reaches first, but it does not count as a hit.'},
  {q:'The center fielder catches a fly ball. How would you mark the batter’s out?',options:['F7','F8','8-3'],answer:'F8',why:'F identifies a flyout, and 8 is the center fielder’s position number.'},
  {q:'A runner steals second between pitches. Which notation describes the advance?',options:['2B','FC','SB'],answer:'SB',why:'SB marks a stolen base. Trace first to second on the runner’s diamond; no new batter result is recorded.'}
];
let quizIndex=0,answered=false,quizDone=false;
function renderQuiz(){const q=questions[quizIndex];answered=false;$('#quiz-count').textContent=`PLAY ${quizIndex+1} OF ${questions.length}`;$('#quiz-question').textContent=q.q;$('#quiz-options').innerHTML=q.options.map(o=>`<button data-answer="${o}">${o}</button>`).join('');$('#quiz-feedback').textContent='';$('#quiz-next').hidden=true;$('#quiz-next').textContent=quizIndex===questions.length-1?'Finish':'Next →';$('#quiz-progress').innerHTML=questions.map((_,i)=>`<span class="${i<quizIndex?'done':''}"></span>`).join('');}
$('#quiz-options').addEventListener('click',e=>{const b=e.target.closest('[data-answer]');if(!b||answered)return;const q=questions[quizIndex];if(b.dataset.answer!==q.answer){b.classList.add('incorrect');b.disabled=true;$('#quiz-feedback').textContent='Try again.';return;}answered=true;b.classList.add('correct');$('#quiz-feedback').textContent=`${q.why}`;$('#quiz-next').hidden=false;document.querySelectorAll('#quiz-options button').forEach(b=>b.disabled=true);});
$('#quiz-next').addEventListener('click',()=>{
  if(quizDone){quizDone=false;quizIndex=0;renderQuiz();return;}
  if(quizIndex<questions.length-1){quizIndex++;renderQuiz();return;}
  quizDone=true;$('#quiz-count').textContent='PRACTICE COMPLETE';$('#quiz-question').textContent='Practice complete';$('#quiz-options').innerHTML='';$('#quiz-feedback').textContent='5 plays completed.';$('#quiz-next').textContent='Practice again ↻';document.querySelectorAll('#quiz-progress span').forEach(s=>s.classList.add('done'));
});
render();showTab();renderQuiz();
