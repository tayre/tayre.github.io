import { TARGET, MAX_PLAYERS, MODIFIERS, PROFILES, validEmoji, createGame, scoreEntry, totals, outcome, setDraft, commitRound, undoRound, restoreGame } from './engine.js';

const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORAGE_KEY = 'flip7.scorekeeper.v1';
const defaultPlayers = () => Array.from({ length: MAX_PLAYERS }, (_, i) => ({ name: '', emoji: PROFILES[i][0] }));
let setup = { count: 4, players: defaultPlayers() };
let game = null;
let scoreEdit = null;
let emojiIndex = null;
let currentRoute = '';
let confirmAction = null;
let toastTimer;

function storageWarning(message) {
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = false;
  $('#save-status').textContent = 'Not saved';
}

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw new Error('Unknown save version');
    if (saved.setup && Number.isInteger(saved.setup.count) && saved.setup.count >= 1 && saved.setup.count <= MAX_PLAYERS && Array.isArray(saved.setup.players)) {
      setup.count = saved.setup.count;
      setup.players = setup.players.map((p, i) => ({ name: typeof saved.setup.players[i]?.name === 'string' ? saved.setup.players[i].name.slice(0, 24) : p.name, emoji: validEmoji(saved.setup.players[i]?.emoji) ? saved.setup.players[i].emoji : p.emoji }));
    }
    game = saved.game ? restoreGame(saved.game) : null;
    if (saved.game && !game) throw new Error('Invalid saved game');
    $('#save-status').innerHTML = '<i></i>Saved on this device';
  }
} catch {
  storageWarning('The saved game could not be opened. You can still start a new game.');
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, setup, game }));
    $('#save-status').innerHTML = '<i></i>Saved on this device';
    $('#storage-warning').hidden = true;
  } catch {
    storageWarning('This browser cannot save right now. Keep this tab open to keep your scores.');
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

function navigate(hash, replace = false) {
  if (hash === currentRoute) return;
  const overlay = /^#(score\/|emoji\/|rules)/.test(hash);
  const returnHash = hash.startsWith('#emoji/') ? '#setup' : hash.startsWith('#score/') ? '#game' : currentRoute === '#setup' ? '#setup' : game ? '#game' : '#setup';
  history[replace ? 'replaceState' : 'pushState']({ flip7: true, overlay: overlay && !replace, returnHash }, '', hash);
  renderRoute();
}

function closeOverlay() {
  if (history.state?.flip7 && history.state.overlay) history.back();
  else navigate(currentRoute.startsWith('#emoji/') ? '#setup' : history.state?.returnHash || (game ? '#game' : '#setup'), true);
}

function renderRoute() {
  let route = location.hash || (game ? '#game' : '#setup');
  const scoreId = route.match(/^#score\/(p\d+)$/)?.[1];
  const pickerIndex = route.match(/^#emoji\/(\d+)$/)?.[1];
  if ((route === '#game' || scoreId) && !game) route = '#setup';
  if (scoreId && game && (!game.players.some(p => p.id === scoreId) || outcome(game).type === 'won')) route = '#game';
  if (pickerIndex !== undefined && Number(pickerIndex) >= setup.count) route = '#setup';
  if (!['#setup', '#game', '#rules'].includes(route) && !/^#score\/p\d+$/.test(route) && !/^#emoji\/\d+$/.test(route)) route = game ? '#game' : '#setup';
  if (route !== location.hash) history.replaceState({ flip7: true, overlay: false }, '', route);
  const previous = currentRoute;
  currentRoute = route;
  if ($('#confirm-dialog').open) { $('#confirm-dialog').close(); confirmAction = null; }
  const setupVisible = route === '#setup' || route.startsWith('#emoji/') || (route === '#rules' && (history.state?.returnHash === '#setup' || !game));
  $('#setup-view').hidden = !setupVisible;
  $('#game-view').hidden = setupVisible;
  if (setupVisible) renderSetup(); else renderGame();
  const dialogId = route.startsWith('#score/') ? 'score-dialog' : route.startsWith('#emoji/') ? 'emoji-dialog' : route === '#rules' ? 'rules-dialog' : null;
  for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog.id !== dialogId) dialog.close();
  if (dialogId === 'score-dialog') {
    const index = game.players.findIndex(p => p.id === scoreId);
    if (previous !== route || !scoreEdit) beginScore(index);
  } else scoreEdit = null;
  if (dialogId === 'emoji-dialog') {
    emojiIndex = Number(pickerIndex);
    renderEmojiPicker();
  }
  if (dialogId && !$(`#${dialogId}`).open) $(`#${dialogId}`).showModal();
  if (previous.startsWith('#score/') && route === '#game') document.querySelector(`[data-score="${previous.slice(7)}"]`)?.focus({ preventScroll: true });
  if (previous.startsWith('#emoji/') && route === '#setup') document.querySelector(`[data-emoji="${previous.slice(7)}"]`)?.focus({ preventScroll: true });
}

function renderSetup() {
  $('#player-count').value = String(setup.count);
  $('#fewer-players').disabled = setup.count === 1;
  $('#more-players').disabled = setup.count === MAX_PLAYERS;
  $('#player-fields').innerHTML = setup.players.slice(0, setup.count).map((p, i) => `<div class="player-field" style="--player-color:var(--player-${i % 6})"><button type="button" class="profile-button" data-emoji="${i}" aria-label="Choose emoji for player ${i + 1}"><span aria-hidden="true">${p.emoji}</span><small aria-hidden="true">⌄</small></button><label for="player-name-${i}">PLAYER ${i + 1}<input id="player-name-${i}" data-name="${i}" value="${escapeHTML(p.name)}" placeholder="Player ${i + 1}" maxlength="24" autocomplete="off" autocapitalize="words" spellcheck="false"></label></div>`).join('');
  $('#resume-game').hidden = !game;
  $('#start-game').innerHTML = `${game ? 'Start new game' : 'Let’s play'} <span aria-hidden="true">→</span>`;
}

function renderEmojiPicker() {
  const player = setup.players[emojiIndex];
  $('#emoji-title').textContent = player.name.trim() ? `An emoji for ${player.name.trim()}` : `Player ${emojiIndex + 1}’s emoji`;
  $('#emoji-grid').innerHTML = PROFILES.map(([emoji, label]) => `<button data-profile="${emoji}" aria-label="${label}" aria-pressed="${player.emoji === emoji}"><span aria-hidden="true">${emoji}</span></button>`).join('');
}

function renderGame() {
  if (!game) return;
  const scores = totals(game);
  const result = outcome(game);
  const won = result.type === 'won';
  const ready = game.draft.filter(entry => entry !== null).length;
  const round = game.rounds.length + 1;
  $('#game-title').innerHTML = `${won ? 'What a game' : `Round ${round}`}<span>.</span>`;
  $('#game-eyebrow').textContent = won ? `${game.rounds.length} ROUNDS · ONE GREAT TABLE` : 'THE RACE TO 200';
  $('#recorded-count').textContent = won ? 'Final scores' : `${ready} / ${game.players.length} ready`;
  $('#round-instruction').textContent = won ? 'The scores are in. Time for a rematch?' : 'Tap a player to add their round score.';
  $('#scoreboard').innerHTML = game.players.map((p, i) => {
    const entry = game.draft[i];
    const rank = scores.filter(score => score > scores[i]).length + 1;
    const leading = game.rounds.length > 0 && result.leaders.includes(i);
    const entryScore = entry === null ? null : scoreEntry(entry);
    return `<article class="player-card${entry !== null ? ' is-ready' : ''}${won && leading ? ' is-winner' : ''}" style="--player-color:var(--player-${i % 6})"><div class="player-card-heading"><span class="avatar" aria-hidden="true">${p.emoji}</span><h2>${escapeHTML(p.name)}</h2>${leading ? `<span class="leader-badge">${won ? 'WINNER' : 'LEADING'}</span>` : `<span class="rank-label">${game.rounds.length ? `#${rank}` : 'LET’S GO'}</span>`}</div><div class="total-line"><strong class="player-total">${scores[i]}</strong><span>total points</span></div><div class="race-track" aria-hidden="true"><i style="width:${Math.min(100, scores[i] / TARGET * 100)}%"></i></div><div class="card-score-actions">${won ? `<span class="final-label">${leading ? '✦ Nicely played.' : 'Thanks for a great game.'}</span>` : `<button class="round-score${entry !== null ? ' entered' : ''}" data-score="${p.id}" aria-label="${entry !== null ? 'Edit' : 'Add'} round score for ${escapeHTML(p.name)}">${entry?.kind === 'bust' ? '<span>Bust <small>0 pts</small></span><span aria-hidden="true">↗</span>' : entry !== null ? `<span>+${entryScore} <small>this round</small></span><span aria-hidden="true">↗</span>` : '<span><span class="wide-label">Add </span>score</span><span aria-hidden="true">+</span>'}</button>${entry === null ? `<button class="quick-bust" data-bust="${p.id}" aria-label="Mark ${escapeHTML(p.name)} as busted">Bust</button>` : ''}`}</div></article>`;
  }).join('');
  $('#save-round').hidden = won;
  $('#save-round').disabled = ready !== game.players.length;
  $('#play-again').hidden = !won;
  $('#round-bar-title').textContent = won ? 'Another round of rivalry?' : ready === game.players.length ? 'All scores are in.' : `${game.players.length - ready} ${game.players.length - ready === 1 ? 'player' : 'players'} to go.`;
  $('#round-bar-note').textContent = won ? 'Start fresh with the same names and emojis.' : ready === game.players.length ? 'Save them together and deal the next round.' : 'Enter a score or mark a bust for each player.';
  $('#undo-round').disabled = game.rounds.length === 0;
  $('#result-banner').hidden = result.type === 'playing';
  if (won) {
    const winner = game.players[result.leaders[0]];
    $('#result-banner').innerHTML = `<span class="result-spark" aria-hidden="true">✦</span><div><p class="eyebrow">WINNER, WINNER</p><strong>${escapeHTML(winner.name)} takes the table!</strong><p>${result.top} points. A little luck, a lot to celebrate.</p></div><span class="winner-emoji" aria-hidden="true">${winner.emoji}</span>`;
  } else if (result.type === 'tie') {
    $('#result-banner').innerHTML = `<span class="result-spark" aria-hidden="true">=</span><div><strong>It’s a tie at ${result.top}!</strong><p>Everyone plays another round to find a winner.</p></div>`;
  }
  renderHistory(scores);
}

function renderHistory(scores) {
  if (!game.rounds.length) {
    $('#round-history').innerHTML = '<p class="empty-history"><span aria-hidden="true">↗</span> Your first round is waiting to happen.</p>';
    return;
  }
  $('#round-history').innerHTML = `<div class="history-scroll" role="region" aria-label="Round scores, scroll sideways for more players" tabindex="0"><table><caption class="sr-only">Saved round scores for every player</caption><thead><tr><th scope="col">Round</th>${game.players.map(p => `<th scope="col"><span aria-hidden="true">${p.emoji}</span> ${escapeHTML(p.name)}</th>`).join('')}</tr></thead><tbody>${game.rounds.map((round, index) => ({ round, index })).reverse().map(({ round, index }) => `<tr><th scope="row">${String(index + 1).padStart(2, '0')}</th>${round.map(entry => `<td>${entry.kind === 'bust' ? '<span class="history-bust">Bust · 0</span>' : `${scoreEntry(entry)}${entry.kind === 'cards' && entry.numbers.length === 7 ? '<small class="history-seven">FLIP 7</small>' : ''}`}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th>${scores.map(score => `<td>${score}</td>`).join('')}</tr></tfoot></table></div>`;
}

function beginScore(index) {
  const entry = game.draft[index];
  scoreEdit = {
    index, mode: entry?.kind === 'cards' ? 'cards' : 'manual',
    manual: entry === null ? '' : String(scoreEntry(entry)),
    numbers: entry?.kind === 'cards' ? [...entry.numbers] : [],
    modifiers: entry?.kind === 'cards' ? [...entry.modifiers] : [],
    double: entry?.kind === 'cards' ? entry.double : false,
    replace: entry !== null,
  };
  const player = game.players[index];
  $('#score-title').textContent = player.name;
  $('#score-emoji').textContent = player.emoji;
  $('#score-emoji').style.backgroundColor = `var(--player-${index % 6})`;
  $('#score-round-label').textContent = `ROUND ${game.rounds.length + 1} · ${totals(game)[index]} TOTAL POINTS`;
  $('#score-error').hidden = true;
  renderScoreEditor();
}

function cardEntry() {
  return { kind: 'cards', numbers: [...scoreEdit.numbers], modifiers: [...scoreEdit.modifiers], double: scoreEdit.double };
}

function renderScoreEditor() {
  const edit = scoreEdit;
  $('#manual-entry').hidden = edit.mode !== 'manual';
  $('#cards-entry').hidden = edit.mode !== 'cards';
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === edit.mode)));
  $('#manual-score').value = edit.manual;
  $('#use-score').disabled = edit.mode === 'manual' && edit.manual === '';
  if (edit.mode !== 'cards') return;
  $('#number-cards').innerHTML = Array.from({ length: 13 }, (_, n) => `<button class="number-card" data-number="${n}" aria-label="Number ${n}" aria-pressed="${edit.numbers.includes(n)}" ${edit.numbers.length === 7 && !edit.numbers.includes(n) ? 'disabled' : ''}>${n}</button>`).join('');
  $('#modifier-cards').innerHTML = MODIFIERS.map(n => `<button data-modifier="${n}" aria-pressed="${edit.modifiers.includes(n)}">+${n}</button>`).join('') + `<button class="double-card" data-double aria-pressed="${edit.double}">×2</button>`;
  $('#number-count').textContent = `${edit.numbers.length} of 7`;
  $('#flip-bonus').classList.toggle('earned', edit.numbers.length === 7);
  $('#flip-bonus').textContent = edit.numbers.length === 7 ? '✦ Flip 7! You earned 15 bonus points.' : 'Seven different numbers = 15 extra points.';
  const numberSum = edit.numbers.reduce((sum, n) => sum + n, 0);
  const modifiers = edit.modifiers.reduce((sum, n) => sum + n, 0);
  $('#score-equation').textContent = `${numberSum}${edit.double ? ' × 2' : ''} + ${modifiers} bonus${edit.numbers.length === 7 ? ' + 15 Flip 7' : ''}`;
  $('#card-total').value = String(scoreEntry(cardEntry()));
}

function keypress(key) {
  if (!scoreEdit || scoreEdit.mode !== 'manual') return;
  if (key === 'clear') scoreEdit.manual = '';
  else if (key === 'backspace') scoreEdit.manual = scoreEdit.manual.slice(0, -1);
  else if (/^\d$/.test(key)) {
    if (scoreEdit.replace || scoreEdit.manual === '0') scoreEdit.manual = '';
    if (scoreEdit.manual.length < 3) scoreEdit.manual += key;
  }
  scoreEdit.replace = false;
  renderScoreEditor();
}

function useScore(bust = false) {
  if (!scoreEdit || (!bust && scoreEdit.mode === 'manual' && scoreEdit.manual === '')) return;
  try {
    const entry = bust ? { kind: 'bust' } : scoreEdit.mode === 'cards' ? cardEntry() : { kind: 'manual', value: Number(scoreEdit.manual) };
    game = setDraft(game, scoreEdit.index, entry);
    save();
    closeOverlay();
  } catch (error) {
    $('#score-error').textContent = error.message;
    $('#score-error').hidden = false;
  }
}

function confirmChange(title, message, label, action) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-action').textContent = label;
  confirmAction = action;
  $('#confirm-dialog').showModal();
}

function startGame() {
  clearTimeout(toastTimer); $('#toast').hidden = true;
  game = createGame(setup.players.slice(0, setup.count));
  save();
  navigate('#game');
  window.scrollTo(0, 0);
  $('#game-title').focus({ preventScroll: true });
}

$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  if (game && (game.rounds.length || game.draft.some(Boolean))) confirmChange('A fresh start?', 'Starting this game replaces the current scores. Your chosen names and emojis are ready to go.', 'Start new game', startGame);
  else startGame();
});
$('#player-fields').addEventListener('input', event => {
  if (event.target.matches('[data-name]')) { setup.players[Number(event.target.dataset.name)].name = event.target.value; save(); }
});
$('#fewer-players').addEventListener('click', () => { if (setup.count > 1) { setup.count--; save(); renderSetup(); } });
$('#more-players').addEventListener('click', () => { if (setup.count < MAX_PLAYERS) { setup.count++; save(); renderSetup(); } });
$('#resume-game').addEventListener('click', () => navigate('#game'));
$('#new-game').addEventListener('click', () => {
  setup.count = game.players.length;
  game.players.forEach((p, i) => { setup.players[i] = { name: p.name, emoji: p.emoji }; });
  save(); navigate('#setup'); window.scrollTo(0, 0);
});
$('#play-again').addEventListener('click', () => confirmChange('Run it back?', 'Start a fresh game with the same players. This game’s scores will be replaced.', 'Play again', () => {
  clearTimeout(toastTimer); $('#toast').hidden = true;
  game = createGame(game.players); save(); renderGame(); window.scrollTo(0, 0); $('#game-title').focus({ preventScroll: true });
}));
$('#save-round').addEventListener('click', () => {
  try {
    const round = game.rounds.length + 1;
    game = commitRound(game); save(); renderGame();
    toast(`Round ${round} saved. ${outcome(game).type === 'won' ? 'We have a winner!' : 'Deal the next round.'}`);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('#game-title').focus({ preventScroll: true });
  } catch (error) { toast(error.message); }
});
$('#undo-round').addEventListener('click', () => {
  const undo = () => { game = undoRound(game); save(); renderGame(); toast('Round reopened. Edit the scores, then save again.'); window.scrollTo(0, 0); };
  if (game.draft.some(Boolean)) confirmChange('Reopen the last round?', 'The scores entered for this new round will be replaced by the last saved round, ready to edit.', 'Reopen round', undo);
  else undo();
});
$('#use-score').addEventListener('click', () => useScore());
$('#mark-bust').addEventListener('click', () => useScore(true));
$('#confirm-action').addEventListener('click', () => {
  const action = confirmAction; confirmAction = null; $('#confirm-dialog').close(); action?.();
});
document.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => { confirmAction = null; $('#confirm-dialog').close(); }));
document.querySelectorAll('dialog:not(#confirm-dialog)').forEach(dialog => dialog.addEventListener('cancel', event => { event.preventDefault(); closeOverlay(); }));
$('#score-dialog').addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || scoreEdit?.mode !== 'manual') return;
  if (/^\d$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault(); keypress(event.key === 'Backspace' ? 'backspace' : event.key === 'Delete' ? 'clear' : event.key);
  } else if (event.key === 'Enter' && event.target === $('#manual-score')) { event.preventDefault(); useScore(); }
});
$('.keypad').innerHTML = ['1','2','3','4','5','6','7','8','9','clear','0','backspace'].map(key => `<button data-key="${key}"${key === 'clear' ? ' aria-label="Clear score"' : key === 'backspace' ? ' aria-label="Delete last digit"' : ''}>${key === 'clear' ? 'C' : key === 'backspace' ? '⌫' : key}</button>`).join('');

document.addEventListener('click', event => {
  const button = event.target.closest('button, a[href^="#"]');
  if (!button) return;
  if (button.matches('a[href^="#"]')) { event.preventDefault(); navigate(button.hash); }
  else if (button.hasAttribute('data-close')) closeOverlay();
  else if (button.hasAttribute('data-emoji')) navigate(`#emoji/${button.dataset.emoji}`);
  else if (button.hasAttribute('data-profile')) { setup.players[emojiIndex].emoji = button.dataset.profile; save(); closeOverlay(); }
  else if (button.hasAttribute('data-score')) navigate(`#score/${button.dataset.score}`);
  else if (button.hasAttribute('data-bust')) {
    const index = game.players.findIndex(p => p.id === button.dataset.bust);
    game = setDraft(game, index, { kind: 'bust' }); save(); renderGame();
    toast(`${game.players[index].name}: bust, 0 points. Tap the score to change it.`);
  } else if (button.hasAttribute('data-mode')) { scoreEdit.mode = button.dataset.mode; renderScoreEditor(); }
  else if (button.hasAttribute('data-key')) keypress(button.dataset.key);
  else if (button.hasAttribute('data-number')) {
    const number = Number(button.dataset.number);
    scoreEdit.numbers = scoreEdit.numbers.includes(number) ? scoreEdit.numbers.filter(n => n !== number) : scoreEdit.numbers.length < 7 ? [...scoreEdit.numbers, number] : scoreEdit.numbers;
    renderScoreEditor(); $('#number-cards').querySelector(`[data-number="${number}"]`)?.focus({ preventScroll: true });
  } else if (button.hasAttribute('data-modifier')) {
    const number = Number(button.dataset.modifier);
    scoreEdit.modifiers = scoreEdit.modifiers.includes(number) ? scoreEdit.modifiers.filter(n => n !== number) : [...scoreEdit.modifiers, number];
    renderScoreEditor(); $('#modifier-cards').querySelector(`[data-modifier="${number}"]`)?.focus({ preventScroll: true });
  } else if (button.hasAttribute('data-double')) { scoreEdit.double = !scoreEdit.double; renderScoreEditor(); $('[data-double]').focus({ preventScroll: true }); }
});
window.addEventListener('popstate', renderRoute);
window.addEventListener('hashchange', () => { if (location.hash !== currentRoute) renderRoute(); });
renderRoute();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('#offline-status').textContent = 'Ready for offline game nights.';
  }).catch(() => { /* The scorekeeper still works online. */ });
}
