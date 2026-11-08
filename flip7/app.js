import { TARGET, MAX_PLAYERS, MODIFIERS, PROFILES, validEmoji, createGame, firstRecipient, scoreEntry, totals, outcome, setDraft, commitRound, undoRound, restoreGame, restoreGameRecord, updateGameHistory } from './engine.js';

const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORAGE_KEY = 'flip7.scorekeeper.v1';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const defaultPlayers = () => Array.from({ length: MAX_PLAYERS }, (_, i) => ({ name: '', emoji: PROFILES[i][0] }));
let setup = { count: 4, players: defaultPlayers() };
let game = null;
let gameHistory = [];
let preferences = { applause: true };
let scoreEdit = null;
let emojiIndex = null;
let currentRoute = '';
let confirmAction = null;
let toastTimer;
let renderedGame;
let renderedRounds;
let renderedGameHistory;
let confettiLayer;
let confettiAnimations = [];

function storageWarning(message) {
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = false;
  $('#save-status').textContent = 'Not saved';
}

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (![1, 2].includes(saved.version)) throw new Error('Unknown save version');
    if (typeof saved.preferences?.applause === 'boolean') preferences.applause = saved.preferences.applause;
    if (saved.setup && Number.isInteger(saved.setup.count) && saved.setup.count >= 1 && saved.setup.count <= MAX_PLAYERS && Array.isArray(saved.setup.players)) {
      setup.count = saved.setup.count;
      setup.players = setup.players.map((p, i) => ({ name: typeof saved.setup.players[i]?.name === 'string' ? saved.setup.players[i].name.slice(0, 24) : p.name, emoji: validEmoji(saved.setup.players[i]?.emoji) ? saved.setup.players[i].emoji : p.emoji }));
    }
    const records = Array.isArray(saved.history) ? saved.history : [];
    const seen = new Set();
    gameHistory = records.map(restoreGameRecord).filter(record => {
      if (!record || seen.has(record.game.id)) return false;
      seen.add(record.game.id);
      return true;
    });
    const historyDamaged = (saved.history !== undefined && !Array.isArray(saved.history)) || gameHistory.length !== records.length;
    game = saved.game ? restoreGame(saved.game) : null;
    if (saved.game && !game) throw new Error('Invalid saved game');
    const missingResult = game && outcome(game).type === 'won' && !gameHistory.some(record => record.game.id === game.id);
    if (missingResult) gameHistory = updateGameHistory(gameHistory, game);
    $('#save-status').innerHTML = '<i></i>Saved on this device';
    if (historyDamaged) storageWarning('Some game history could not be opened. Your current game and readable history are still available.');
    else if (saved.version === 1 || (game && !saved.game.id) || missingResult) save();
  }
} catch {
  storageWarning('The saved game could not be opened. You can still start a new game.');
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, setup, game, history: gameHistory, preferences }));
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

function stopConfetti() {
  confettiAnimations.forEach(animation => animation.cancel());
  confettiAnimations = [];
  confettiLayer?.remove();
  confettiLayer = null;
}

function renderSoundPreference() {
  document.querySelectorAll('[data-sound-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(preferences.applause));
    button.title = preferences.applause ? 'Mute applause' : 'Enable applause';
    button.innerHTML = `<span aria-hidden="true">${preferences.applause ? '🔊' : '🔇'}</span> Applause ${preferences.applause ? 'on' : 'off'}`;
  });
}

function stopApplause() {
  const audio = $('#win-applause');
  audio.pause();
  audio.currentTime = 0;
}

function stopCelebration() {
  stopConfetti();
  stopApplause();
}

function playApplause() {
  $('#applause-hint').hidden = true;
  if (!preferences.applause) return;
  const audio = $('#win-applause');
  audio.volume = 0.6;
  // Called directly from Save round or Celebrate again so mobile browsers can
  // use the tap to allow sound. A blocked sound never interrupts scoring.
  audio.play()?.catch(error => {
    if (error.name === 'AbortError' || !preferences.applause || document.hidden || currentRoute !== '#game' || !audio.paused) return;
    const hint = $('#applause-hint');
    if (hint) {
      hint.textContent = 'Tap Celebrate again to hear the applause.';
      hint.hidden = false;
    }
  });
}

function celebrateWin() {
  stopCelebration();
  if (document.hidden || !game || outcome(game).type !== 'won') return;
  playApplause();
  if (motionPreference.matches || !Element.prototype.animate) return;
  const layer = document.createElement('div');
  layer.id = 'win-confetti';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  confettiLayer = layer;
  const colors = ['#3b8068', '#e8b74f', '#d77869', '#7294bd', '#b68ac2', '#71b9ad'];
  // Three waves from both sides, with only transforms and opacity animated.
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('i');
    const fromLeft = i % 2 === 0;
    const startY = innerHeight * (0.55 + Math.random() * 0.2);
    const travelX = (fromLeft ? 1 : -1) * innerWidth * (0.25 + Math.random() * 0.7);
    const rise = innerHeight * (0.35 + Math.random() * 0.35);
    const rotation = (fromLeft ? 1 : -1) * (360 + Math.random() * 720);
    piece.style.left = `${fromLeft ? -12 : innerWidth + 12}px`;
    piece.style.top = `${startY}px`;
    piece.style.width = `${6 + Math.random() * 6}px`;
    piece.style.height = `${9 + Math.random() * 8}px`;
    piece.style.borderRadius = i % 4 === 0 ? '50%' : '2px';
    piece.style.backgroundColor = colors[i % colors.length];
    layer.append(piece);
    confettiAnimations.push(piece.animate([
      { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 0, offset: 0 },
      { transform: `translate3d(${travelX * 0.65}px,${-rise}px,0) rotate(${rotation * 0.35}deg)`, opacity: 1, offset: 0.32, easing: 'cubic-bezier(.4,0,.8,.7)' },
      { transform: `translate3d(${travelX}px,${innerHeight - startY + 30}px,0) rotate(${rotation}deg)`, opacity: 0, offset: 1 }
    ], { duration: 3300 + Math.random() * 800, delay: Math.floor(i / 40) * 300 + Math.random() * 120, easing: 'cubic-bezier(.15,.6,.3,1)' }));
  }
  confettiAnimations.push($('#result-banner').animate([
    { transform: 'scale(.96)', opacity: 0.65 },
    { transform: 'scale(1.015)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1)', opacity: 1 }
  ], { duration: 650, easing: 'ease-out' }));
  confettiAnimations.push($('.winner-emoji').animate([
    { transform: 'translateY(0) rotate(-8deg)' },
    { transform: 'translateY(-10px) rotate(8deg)', offset: 0.45 },
    { transform: 'translateY(0) rotate(0deg)' }
  ], { duration: 900, easing: 'ease-out' }));
  Promise.all(confettiAnimations.map(animation => animation.finished)).then(() => {
    if (confettiLayer === layer) stopConfetti();
  }).catch(() => { /* Navigation or reduced motion cancelled the celebration. */ });
}

motionPreference.addEventListener('change', event => { if (event.matches) stopConfetti(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCelebration(); });
window.addEventListener('pagehide', stopCelebration);

function navigate(hash, replace = false) {
  if (hash === currentRoute) return;
  const overlay = /^#(score\/|emoji\/|rules)/.test(hash);
  const returnHash = hash.startsWith('#emoji/') ? '#setup' : hash.startsWith('#score/') ? '#game' : ['#setup', '#game', '#history'].includes(currentRoute) ? currentRoute : history.state?.returnHash || (game ? '#game' : '#setup');
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
  if (!['#setup', '#game', '#history', '#rules'].includes(route) && !/^#score\/p\d+$/.test(route) && !/^#emoji\/\d+$/.test(route)) route = game ? '#game' : '#setup';
  if (route !== location.hash) history.replaceState({ flip7: true, overlay: false }, '', route);
  const previous = currentRoute;
  currentRoute = route;
  if (route !== '#game') stopCelebration();
  if ($('#confirm-dialog').open) { $('#confirm-dialog').close(); confirmAction = null; }
  const baseRoute = route === '#rules' ? history.state?.returnHash || (game ? '#game' : '#setup') : route.startsWith('#emoji/') ? '#setup' : route.startsWith('#score/') ? '#game' : route;
  $('#setup-view').hidden = baseRoute !== '#setup';
  $('#game-view').hidden = baseRoute !== '#game';
  $('#history-view').hidden = baseRoute !== '#history';
  if (baseRoute === '#setup') renderSetup();
  else if (baseRoute === '#history') renderGameHistory();
  else renderGame();
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
  if (!game || renderedGame === game) return;
  renderedGame = game;
  const scores = totals(game);
  const result = outcome(game);
  const won = result.type === 'won';
  if (!won) stopCelebration();
  const ready = game.draft.filter(entry => entry !== null).length;
  const round = game.rounds.length + 1;
  $('#game-title').innerHTML = won ? 'Final scores' : `Round ${round}`;
  $('#game-eyebrow').textContent = won ? `${game.rounds.length} ROUNDS PLAYED` : 'FIRST TO 200';
  $('#recorded-count').textContent = won ? 'Final scores' : `${ready} / ${game.players.length} ready`;
  $('#round-instruction').textContent = won ? 'The scores are in. Time for a rematch?' : 'Bust or count your points.';
  const firstId = won ? null : firstRecipient(game).id;
  $('#scoreboard').innerHTML = game.players.map((p, i) => {
    const entry = game.draft[i];
    const rank = scores.filter(score => score > scores[i]).length + 1;
    const leading = game.rounds.length > 0 && result.leaders.includes(i);
    const entryScore = entry === null ? null : scoreEntry(entry);
    return `<article class="player-card${entry !== null ? ' is-ready' : ''}${won && leading ? ' is-winner' : ''}" style="--player-color:var(--player-${i % 6})"><div class="player-card-heading"><span class="avatar" aria-hidden="true">${p.emoji}</span><h2>${escapeHTML(p.name)}</h2>${p.id === firstId ? '<span class="first-card-badge" title="Gets the first card this round"><span aria-hidden="true">1st</span><span class="sr-only">Gets the first card this round</span></span>' : ''}${leading ? `<span class="leader-badge">${won ? 'WINNER' : 'LEADING'}</span>` : `<span class="rank-label">${game.rounds.length ? `#${rank}` : ''}</span>`}</div><div class="total-line"><strong class="player-total">${scores[i]}</strong><span>of ${TARGET}</span></div><progress class="score-progress" max="${TARGET}" value="${Math.min(scores[i], TARGET)}" aria-label="${escapeHTML(p.name)}’s progress to ${TARGET} points" aria-valuetext="${scores[i]} points out of ${TARGET}">${scores[i]} / ${TARGET}</progress><div class="card-score-actions">${won ? `<span class="final-label">${leading ? 'Winner ✨' : 'Well played'}</span>` : `<button class="quick-bust" data-bust="${p.id}" aria-label="Mark ${escapeHTML(p.name)} as busted" aria-pressed="${entry?.kind === 'bust'}">Bust</button><button class="round-score${entry !== null && entry.kind !== 'bust' ? ' entered' : ''}" data-score="${p.id}" aria-label="${entry !== null && entry.kind !== 'bust' ? 'Edit round score' : 'Count points'} for ${escapeHTML(p.name)}">${entry !== null && entry.kind !== 'bust' ? `<span>+${entryScore}</span><small>Edit points</small>` : '<span>Count</span><span>points</span>'}</button>`}</div></article>`;
  }).join('');
  $('#save-round').hidden = won;
  $('#save-round').disabled = ready !== game.players.length;
  $('#play-again').hidden = !won;
  $('#round-bar').classList.toggle('is-final', won);
  $('#round-bar-title').textContent = won ? 'Play again?' : ready === game.players.length ? 'All scores are in.' : `${game.players.length - ready} ${game.players.length - ready === 1 ? 'player' : 'players'} to go.`;
  $('#round-bar-note').textContent = won ? 'Start fresh with the same names and emojis.' : ready === game.players.length ? 'Save them together and deal the next round.' : 'Enter a score or mark a bust for each player.';
  $('#undo-round').disabled = game.rounds.length === 0;
  $('#result-banner').hidden = result.type === 'playing';
  $('#result-banner').classList.toggle('is-win', won);
  if (won) {
    const winner = game.players[result.leaders[0]];
    $('#result-banner').innerHTML = `<div class="winner-crown" aria-hidden="true">🏆</div><span class="winner-emoji" aria-hidden="true">${winner.emoji}</span><div class="winner-message"><p class="eyebrow">WE HAVE A WINNER!</p><strong>${escapeHTML(winner.name)} takes the table!</strong><p><b>${result.top} points</b> · ${game.rounds.length} ${game.rounds.length === 1 ? 'round' : 'rounds'} · What a game!</p></div><div class="winner-actions"><button class="quiet-button" data-celebrate><span aria-hidden="true">🎉</span> Celebrate again</button><button class="quiet-button sound-toggle" data-sound-toggle aria-label="Applause sound" aria-pressed="true">Applause on</button></div><p id="applause-hint" class="applause-hint" role="status" hidden></p>`;
    renderSoundPreference();
  } else if (result.type === 'tie') {
    $('#result-banner').innerHTML = `<span class="result-spark" aria-hidden="true">=</span><div><strong>It’s a tie at ${result.top}!</strong><p>Everyone plays another round to find a winner.</p></div>`;
  }
  renderHistory(scores);
}

function renderHistory(scores) {
  // Draft edits and dialog navigation do not change saved rounds.
  if (renderedRounds === game.rounds) return;
  renderedRounds = game.rounds;
  if (!game.rounds.length) {
    $('#round-history').innerHTML = '<p class="empty-history">No rounds saved yet.</p>';
    return;
  }
  $('#round-history').innerHTML = roundTable(game, scores);
}

function roundTable(savedGame, scores = totals(savedGame)) {
  return `<div class="history-scroll" role="region" aria-label="Round scores, scroll sideways for more players" tabindex="0"><table><caption class="sr-only">Saved round scores for every player</caption><thead><tr><th scope="col">Round</th>${savedGame.players.map(p => `<th scope="col"><span aria-hidden="true">${p.emoji}</span> ${escapeHTML(p.name)}</th>`).join('')}</tr></thead><tbody>${savedGame.rounds.map((round, index) => ({ round, index })).reverse().map(({ round, index }) => `<tr><th scope="row">${String(index + 1).padStart(2, '0')}<small class="history-first">First: ${escapeHTML(firstRecipient(savedGame, index).name)}</small></th>${round.map(entry => `<td>${entry.kind === 'bust' ? '<span class="history-bust">Bust · 0</span>' : `${scoreEntry(entry)}${entry.kind === 'cards' && entry.numbers.length === 7 ? '<small class="history-seven">FLIP 7</small>' : ''}`}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th>${scores.map(score => `<td>${score}</td>`).join('')}</tr></tfoot></table></div>`;
}

function renderGameHistory() {
  $('#history-return').href = game ? '#game' : '#setup';
  $('#history-return').textContent = game ? '← Current game' : '← Player setup';
  if (renderedGameHistory === gameHistory) return;
  renderedGameHistory = gameHistory;
  if (!gameHistory.length) {
    $('#game-history').innerHTML = '<p class="empty-history">Your games will appear here when they finish or you start a new one.</p>';
    return;
  }
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  $('#game-history').innerHTML = gameHistory.map(({ game: savedGame, savedAt }) => {
    const result = outcome(savedGame);
    const winner = result.type === 'won' ? savedGame.players[result.leaders[0]] : null;
    const scores = totals(savedGame);
    const pending = savedGame.draft.some(entry => entry !== null);
    return `<details class="saved-game"><summary><span class="saved-game-heading"><strong>${winner ? `${winner.emoji} ${escapeHTML(winner.name)} won · ${result.top} points` : 'Unfinished game'}</strong><span>${escapeHTML(dateFormat.format(new Date(savedAt)))} · ${savedGame.rounds.length} ${savedGame.rounds.length === 1 ? 'round' : 'rounds'} · ${savedGame.players.length} ${savedGame.players.length === 1 ? 'player' : 'players'}</span></span><span class="history-toggle" aria-hidden="true">⌄</span></summary><div class="saved-game-body"><ul class="saved-game-scores">${savedGame.players.map((player, i) => `<li><span>${player.emoji} ${escapeHTML(player.name)}${winner?.id === player.id ? '<small>Winner</small>' : ''}</span><strong>${scores[i]}</strong></li>`).join('')}</ul>${savedGame.rounds.length ? roundTable(savedGame, scores) : '<p class="history-note">No rounds were saved.</p>'}${pending ? `<div class="unfinished-round"><h3>Round ${savedGame.rounds.length + 1} was in progress</h3><p class="history-note">These entries are not included in the totals.</p><ul class="saved-game-scores">${savedGame.players.map((player, i) => `<li><span>${player.emoji} ${escapeHTML(player.name)}</span><strong>${savedGame.draft[i] === null ? 'Not entered' : savedGame.draft[i].kind === 'bust' ? 'Bust · 0' : scoreEntry(savedGame.draft[i])}</strong></li>`).join('')}</ul></div>` : ''}</div></details>`;
  }).join('');
}

function beginScore(index) {
  const entry = game.draft[index];
  scoreEdit = {
    index, mode: entry?.kind === 'manual' ? 'manual' : 'cards',
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
  numberButtons.forEach((button, n) => {
    const selected = edit.numbers.includes(n);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = edit.numbers.length === 7 && !selected;
  });
  modifierButtons.forEach(button => button.setAttribute('aria-pressed', String(edit.modifiers.includes(Number(button.dataset.modifier)))));
  doubleButton.setAttribute('aria-pressed', String(edit.double));
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
  if (game) gameHistory = updateGameHistory(gameHistory, game, true);
  game = createGame(setup.players.slice(0, setup.count));
  save();
  navigate('#game');
  window.scrollTo(0, 0);
  $('#game-title').focus({ preventScroll: true });
}

$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  if (game && (game.rounds.length || game.draft.some(Boolean))) confirmChange('A fresh start?', 'This game will stay in Game history. Your chosen names and emojis are ready for a new game, starting with the first player.', 'Start new game', startGame);
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
$('#play-again').addEventListener('click', () => confirmChange('Run it back?', 'Start a fresh game with the same players, dealing to the first player first. This game’s scores will stay in Game history.', 'Play again', () => {
  clearTimeout(toastTimer); $('#toast').hidden = true;
  gameHistory = updateGameHistory(gameHistory, game, true);
  game = createGame(game.players); save(); renderGame(); window.scrollTo(0, 0); $('#game-title').focus({ preventScroll: true });
}));
$('#save-round').addEventListener('click', () => {
  try {
    const round = game.rounds.length + 1;
    game = commitRound(game);
    gameHistory = updateGameHistory(gameHistory, game);
    save(); renderGame();
    const won = outcome(game).type === 'won';
    toast(`Round ${round} saved. ${won ? 'We have a winner!' : `Deal to ${firstRecipient(game).name} first.`}`);
    if (won) celebrateWin();
    window.scrollTo({ top: 0, behavior: motionPreference.matches ? 'instant' : 'smooth' });
    $('#game-title').focus({ preventScroll: true });
  } catch (error) { toast(error.message); }
});
$('#undo-round').addEventListener('click', () => {
  const undo = () => { game = undoRound(game); gameHistory = updateGameHistory(gameHistory, game); save(); renderGame(); toast('Round reopened. Edit the scores, then save again.'); window.scrollTo(0, 0); };
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
  else if (button.hasAttribute('data-celebrate')) celebrateWin();
  else if (button.hasAttribute('data-sound-toggle')) {
    preferences.applause = !preferences.applause;
    if (!preferences.applause) stopApplause();
    const hint = $('#applause-hint');
    if (hint) hint.hidden = true;
    save(); renderSoundPreference();
  }
  else if (button.hasAttribute('data-emoji')) navigate(`#emoji/${button.dataset.emoji}`);
  else if (button.hasAttribute('data-profile')) { setup.players[emojiIndex].emoji = button.dataset.profile; save(); closeOverlay(); }
  else if (button.hasAttribute('data-score')) navigate(`#score/${button.dataset.score}`);
  else if (button.hasAttribute('data-bust')) {
    const index = game.players.findIndex(p => p.id === button.dataset.bust);
    game = setDraft(game, index, { kind: 'bust' }); save(); renderGame();
    document.querySelector(`[data-bust="${button.dataset.bust}"]`)?.focus({ preventScroll: true });
    toast(`${game.players[index].name}: bust, 0 points. Count points to change it.`);
  } else if (button.hasAttribute('data-mode')) { scoreEdit.mode = button.dataset.mode; renderScoreEditor(); }
  else if (button.hasAttribute('data-key')) keypress(button.dataset.key);
  else if (button.hasAttribute('data-number')) {
    const number = Number(button.dataset.number);
    scoreEdit.numbers = scoreEdit.numbers.includes(number) ? scoreEdit.numbers.filter(n => n !== number) : scoreEdit.numbers.length < 7 ? [...scoreEdit.numbers, number] : scoreEdit.numbers;
    renderScoreEditor();
  } else if (button.hasAttribute('data-modifier')) {
    const number = Number(button.dataset.modifier);
    scoreEdit.modifiers = scoreEdit.modifiers.includes(number) ? scoreEdit.modifiers.filter(n => n !== number) : [...scoreEdit.modifiers, number];
    renderScoreEditor();
  } else if (button.hasAttribute('data-double')) { scoreEdit.double = !scoreEdit.double; renderScoreEditor(); }
});
// Keep card controls mounted so taps update state without rebuilding the picker.
$('#number-cards').innerHTML = Array.from({ length: 13 }, (_, n) => `<button data-number="${n}" aria-label="Number ${n}" aria-pressed="false">${n}</button>`).join('');
$('#modifier-cards').innerHTML = MODIFIERS.map(n => `<button data-modifier="${n}" aria-pressed="false">+${n}</button>`).join('') + '<button class="double-card" data-double aria-pressed="false">×2</button>';
const numberButtons = [...document.querySelectorAll('[data-number]')];
const modifierButtons = [...document.querySelectorAll('[data-modifier]')];
const doubleButton = $('[data-double]');
window.addEventListener('popstate', renderRoute);
window.addEventListener('hashchange', () => { if (location.hash !== currentRoute) renderRoute(); });
renderSoundPreference();
renderRoute();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('#offline-status').textContent = 'Available offline.';
  }).catch(() => { /* The scorekeeper still works online. */ });
}
