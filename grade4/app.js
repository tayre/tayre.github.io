import { createProgress, normalizeProgress, factKey, makeRound, recordAttempt, getStats, getTableStats, getHint } from './engine.js';

const STORAGE_KEY = 'grade4.multiplication.v1';
const SETTINGS_KEY = 'grade4.multiplication.tables.v1';
const $ = (selector) => document.querySelector(selector);
const allTables = Array.from({ length: 10 }, (_, i) => i + 1);
let storageAvailable = true;

function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

let progress = normalizeProgress(readSaved(STORAGE_KEY));
const savedTables = readSaved(SETTINGS_KEY);
let selected = new Set(Array.isArray(savedTables) ? savedTables.filter((n) => allTables.includes(n)) : [2, 5, 10]);
if (!selected.size) selected = new Set([2, 5, 10]);
let view = 'home';
let round = null;
let reviewFacts = [];
let explored = { a: 3, b: 4 };

function save(key = STORAGE_KEY, value = progress) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  $('#save-status').innerHTML = storageAvailable
    ? '<span class="save-dot" aria-hidden="true"></span>Progress saved on this device'
    : 'Progress lasts for this visit · device storage unavailable';
}

function showView(name, { focus = true } = {}) {
  view = name;
  document.querySelectorAll('.view').forEach((element) => { element.hidden = element.id !== `${name}-view`; });
  document.querySelectorAll('.nav-link').forEach((button) => {
    const current = button.dataset.view === name || (button.dataset.view === 'home' && ['practice', 'results'].includes(name));
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (name === 'home' || name === 'progress') renderProgress();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (focus) {
    const heading = $(`#${name}-view h1`);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
}

let pendingView = 'home';
function navigate(name) {
  if (view === 'practice' && round) {
    pendingView = name;
    $('#break-dialog').showModal();
  } else showView(name);
}

function renderPicker() {
  $('#table-picker').innerHTML = allTables.map((n) => `<button data-table="${n}" aria-label="${n} times table" aria-pressed="${selected.has(n)}">${n}</button>`).join('');
  updatePicker();
}

function updatePicker() {
  document.querySelectorAll('[data-table]').forEach((button) => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.table)))));
  $('#start-round').disabled = !selected.size;
  $('#all-tables').textContent = selected.size === 10 ? 'Clear selection' : 'Choose all';
  $('#selection-note').textContent = !selected.size ? 'Pick at least one table to get going.'
    : selected.size === 10 ? 'The whole crew! A mix of tables from 1 to 10.'
      : [...selected].sort((a, b) => a - b).join(', ') === '2, 5, 10' ? 'A friendly place to start.'
        : selected.size === 1 ? `All 10 facts in the ${[...selected][0]} times table.`
          : `A little mix of your ${selected.size} chosen tables.`;
}

function chooseTables(tables) {
  selected = new Set(tables);
  updatePicker();
  save(SETTINGS_KEY, [...selected]);
}

function renderProgress() {
  const stats = getStats(progress);
  $('#mastered-count').textContent = `${stats.mastered} / 100`;
  $('#known-count').textContent = stats.known;
  $('#rounds-count').textContent = progress.completedRounds;
  $('#home-tables').innerHTML = allTables.map((n) => {
    const table = getTableStats(progress, n);
    return `<button class="table-tile" data-start-table="${n}" aria-label="Practice ${n} times table, ${table.mastered} of 10 facts with a star"><strong><span>×</span>${n}</strong><div class="mini-track" aria-hidden="true"><span style="width:${table.mastered * 10}%"></span></div><small>${table.mastered ? `${table.mastered}/10 stars` : table.attempts ? 'Keep going' : 'Let’s begin'}</small></button>`;
  }).join('');
  $('#progress-tables').innerHTML = allTables.map((a) => {
    const stats = getTableStats(progress, a);
    const dots = allTables.map((b) => {
      const history = progress.facts[factKey(a, b)];
      const streak = Math.min(3, history?.streak || 0);
      const state = streak >= 3 ? 'mastered' : history?.attempts ? 'learning' : '';
      return `<button class="${state}" data-explore-a="${a}" data-explore-b="${b}" aria-label="${a} times ${b}: ${streak} of 3 toward a star. Explore this fact.">${streak >= 3 ? '★' : b}</button>`;
    }).join('');
    return `<article class="progress-table"><header><h2>The ${a}s</h2><button class="text-button" data-start-table="${a}">Practice ↗</button></header><div class="fact-dots">${dots}</div><p>${stats.mastered} of 10 stars · Purple means you’ve practiced it</p></article>`;
  }).join('');
}

function startRound(facts = null) {
  const questions = makeRound({ tables: [...selected], progress, reviewFacts: facts });
  if (!questions.length) return;
  round = { questions, index: 0, results: [], input: '', solved: false, assisted: false, misses: 0, scored: false };
  showView('practice', { focus: false });
  renderQuestion();
}

function renderQuestion() {
  const { a, b } = round.questions[round.index];
  Object.assign(round, { input: '', solved: false, assisted: false, misses: 0, scored: false, replaceInput: false });
  $('#round-count').textContent = `${round.index + 1} of ${round.questions.length}`;
  $('#round-track').innerHTML = round.questions.map((_, i) => `<span class="${i < round.index ? 'done' : i === round.index ? 'current' : ''}"></span>`).join('');
  $('#round-track').setAttribute('aria-label', `${round.index} of ${round.questions.length} questions completed`);
  $('#equation').innerHTML = `${a} <span class="times" aria-hidden="true">×</span> ${b}`;
  $('#equation').setAttribute('aria-label', `${a} times ${b}`);
  $('#answer').value = '';
  $('#answer').classList.remove('correct');
  $('#answer').setAttribute('aria-label', `Your answer to ${a} times ${b}`);
  $('#feedback').textContent = 'Think it through. There’s no rush.';
  $('#feedback').className = 'feedback';
  $('#question-label').textContent = 'TAKE YOUR TIME';
  $('#hint-panel').hidden = true;
  $('#show-hint').hidden = false;
  $('#show-hint').disabled = false;
  $('#check-answer').hidden = false;
  $('#next-question').hidden = true;
  $('#next-question').innerHTML = `${round.index + 1 === round.questions.length ? 'See how you did' : 'Next one'} <span aria-hidden="true">→</span>`;
  $('#keypad').querySelectorAll('button').forEach((button) => { button.disabled = false; });
  $('#answer').focus({ preventScroll: true });
}

function drawDots(element, a, b) {
  element.style.setProperty('--cols', b);
  element.innerHTML = '<i></i>'.repeat(a * b);
}

function showHint() {
  if (!round || round.solved) return;
  round.assisted = true;
  const { a, b } = round.questions[round.index];
  $('#hint-panel').hidden = false;
  $('#hint-text').textContent = getHint(a, b);
  $('#array-caption').textContent = `${a} ${a === 1 ? 'row' : 'rows'} of ${b}. Count by ${b}s to find the total.`;
  drawDots($('#dot-array'), a, b);
  $('#show-hint').hidden = true;
}

function inputKey(key) {
  if (!round || round.solved) return;
  if (key === 'check') return checkAnswer();
  if (key === 'backspace') {
    round.input = round.replaceInput ? '' : round.input.slice(0, -1);
    round.replaceInput = false;
  } else if (/^\d$/.test(key)) {
    if (round.replaceInput) { round.input = ''; round.replaceInput = false; }
    if (round.input.length < 3) round.input = round.input === '0' ? key : round.input + key;
  }
  $('#answer').value = round.input;
}

function checkAnswer() {
  if (!round || round.solved) return;
  if (round.input === '') {
    $('#feedback').textContent = 'Tap a number to try your answer.';
    return;
  }
  const { a, b } = round.questions[round.index];
  const correct = Number(round.input) === a * b;
  // Score the first submitted answer once. Retrying never inflates the history.
  if (!round.scored) {
    recordAttempt(progress, { a, b, correct, assisted: round.assisted });
    save();
    round.scored = true;
  }
  if (!correct) {
    round.misses += 1;
    round.replaceInput = true;
    $('#feedback').className = 'feedback retry';
    $('#feedback').textContent = round.misses === 1 ? 'Not quite yet. Try the hint below — you can do this.' : `Let’s learn it together: ${a} × ${b} = ${a * b}. Type ${a * b} to try it.`;
    showHint();
    return;
  }
  round.solved = true;
  const clean = !round.assisted && round.misses === 0;
  round.results.push({ a, b, clean });
  $('#answer').classList.add('correct');
  $('#question-label').textContent = 'LOOK AT YOU GO';
  $('#feedback').className = 'feedback success';
  const cheers = ['You’ve got it!', 'Yes! Nicely done.', 'That’s it. High-five!', 'One more fact in your pocket.'];
  $('#feedback').textContent = `${clean ? cheers[round.index % cheers.length] : 'You stuck with it. That’s how we learn!'} ${a} × ${b} = ${a * b}.`;
  $('#show-hint').hidden = true;
  $('#check-answer').hidden = true;
  $('#next-question').hidden = false;
  $('#keypad').querySelectorAll('button').forEach((button) => { button.disabled = true; });
  $('#next-question').focus({ preventScroll: true });
}

function nextQuestion() {
  if (!round?.solved) return;
  if (round.index + 1 === round.questions.length) return finishRound();
  round.index += 1;
  renderQuestion();
}

function finishRound() {
  const clean = round.results.filter((fact) => fact.clean).length;
  const total = round.questions.length;
  reviewFacts = round.results.filter((fact) => !fact.clean).map(({ a, b }) => ({ a, b }));
  progress.completedRounds += 1;
  save();
  $('#result-clean').textContent = clean;
  $('#result-learning').textContent = total - clean;
  $('#result-total').textContent = total;
  $('#results-title').textContent = clean === total ? 'That’s a round of high-fives!' : 'Your brain just got some practice.';
  $('#results-message').textContent = clean === total ? 'You found every answer on your own. Look at you go!' : 'Every try helps it stick. Be proud of showing up and sticking with it.';
  $('#review-section').hidden = !reviewFacts.length;
  $('#review-round').hidden = !reviewFacts.length;
  $('#review-round').textContent = `Practice ${reviewFacts.length === 1 ? 'this fact' : `these ${reviewFacts.length} facts`} again`;
  $('#review-facts').innerHTML = reviewFacts.map(({ a, b }) => `<span>${a} × ${b} = ${a * b}</span>`).join('');
  round = null;
  showView('results');
}

function renderExplore() {
  $('#times-grid').innerHTML = `<thead><tr><th scope="col" aria-label="times">×</th>${allTables.map((n) => `<th scope="col" data-column="${n}">${n}</th>`).join('')}</tr></thead><tbody>${allTables.map((a) => `<tr><th scope="row" data-row="${a}">${a}</th>${allTables.map((b) => `<td><button data-explore-a="${a}" data-explore-b="${b}" class="${a === b ? 'diagonal' : ''}" aria-label="${a} times ${b} equals ${a * b}" aria-pressed="false">${a * b}</button></td>`).join('')}</tr>`).join('')}</tbody>`;
  selectExplore(3, 4);
}

function selectExplore(a, b) {
  explored = { a, b };
  $('#explore-equation').textContent = `${a} × ${b} = ${a * b}`;
  $('#explore-flip').textContent = `${b} × ${a} = ${a * b}, too!`;
  $('#explore-caption').textContent = `${a} ${a === 1 ? 'row' : 'rows'} of ${b} ${a === 1 ? 'makes' : 'make'} ${a * b}.`;
  $('#practice-explored').innerHTML = `Practice the ${a}s <span aria-hidden="true">↗</span>`;
  drawDots($('#explore-dots'), a, b);
  $('#times-grid').querySelectorAll('[data-explore-a]').forEach((button) => {
    const match = Number(button.dataset.exploreA) === a && Number(button.dataset.exploreB) === b;
    button.classList.toggle('selected', match);
    button.setAttribute('aria-pressed', String(match));
  });
  $('#times-grid').querySelectorAll('th').forEach((cell) => cell.classList.toggle('highlight', Number(cell.dataset.row) === a || Number(cell.dataset.column) === b));
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.view) navigate(button.dataset.view);
  if (button.dataset.table) {
    const n = Number(button.dataset.table);
    if (selected.has(n)) selected.delete(n); else selected.add(n);
    updatePicker();
    save(SETTINGS_KEY, [...selected]);
  }
  if (button.dataset.startTable) {
    chooseTables([Number(button.dataset.startTable)]);
    startRound();
  }
  if (button.dataset.key) inputKey(button.dataset.key);
  if (button.dataset.exploreA) {
    selectExplore(Number(button.dataset.exploreA), Number(button.dataset.exploreB));
    if (view !== 'explore') showView('explore');
  }
});

$('#easy-tables').addEventListener('click', () => chooseTables([2, 5, 10]));
$('#all-tables').addEventListener('click', () => chooseTables(selected.size === 10 ? [] : allTables));
$('#start-round').addEventListener('click', () => startRound());
$('#check-answer').addEventListener('click', checkAnswer);
$('#next-question').addEventListener('click', nextQuestion);
$('#show-hint').addEventListener('click', () => {
  showHint();
  $('#hint-panel').focus();
});
$('#leave-round').addEventListener('click', () => navigate('home'));
$('.brand').addEventListener('click', (event) => { event.preventDefault(); navigate('home'); });
$('#keep-playing').addEventListener('click', () => $('#break-dialog').close());
$('#confirm-break').addEventListener('click', () => { $('#break-dialog').close(); round = null; showView(pendingView); });
$('#practice-again').addEventListener('click', () => startRound());
$('#review-round').addEventListener('click', () => startRound(reviewFacts));
$('#practice-explored').addEventListener('click', () => { chooseTables([explored.a]); startRound(); });
$('#reset-progress').addEventListener('click', () => $('#reset-dialog').showModal());
$('#cancel-reset').addEventListener('click', () => $('#reset-dialog').close());
$('#confirm-reset').addEventListener('click', () => {
  progress = createProgress();
  save();
  renderProgress();
  $('#reset-dialog').close();
});

document.addEventListener('keydown', (event) => {
  if (view !== 'practice' || !round || $('dialog[open]') || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (/^\d$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    inputKey(event.key === 'Backspace' || event.key === 'Delete' ? 'backspace' : event.key);
  } else if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    if (round.solved) nextQuestion(); else checkAnswer();
  }
});

renderPicker();
renderProgress();
renderExplore();
// Check that storage is writable without requiring a first answer.
save();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* Online practice works without offline caching. */ });
}
