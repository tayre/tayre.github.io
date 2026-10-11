import { GAMES, makeGame, chooseAnswer, flipCard, nextTurn } from './engine.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const picture = (name, alt = '', className = '') => `<img class="${className}" src="./images/${name}.svg" width="200" height="200" alt="${esc(alt)}" decoding="async">`;
let grade = 1, game = null, visitId = 0, currentVisit = null;
const visitKey = `${Date.now()}-${Math.random()}`;
const visits = new Map();
function announce(message) { $('#announcement').textContent = message; }
function remember() {
  if (game && currentVisit !== null) visits.set(currentVisit, game);
  if (visits.size > 50) visits.delete(visits.keys().next().value);
}
function navigate(hash, fresh = false) {
  remember();
  if (fresh || hash !== location.hash) history.pushState({}, '', hash);
  restore(fresh);
}
function restore(fresh = false) {
  remember();
  const id = location.hash.slice(1), info = GAMES.find(item => item.id === id);
  if (info) {
    grade = info.grade;
    const stored = visits.get(history.state?.gameVisit);
    game = !fresh && stored?.id === id ? stored : makeGame(id);
    currentVisit = !fresh && stored?.id === id ? history.state.gameVisit : `${visitKey}-${++visitId}`;
    history.replaceState({ gameVisit: currentVisit }, '', `#${id}`);
  } else {
    grade = id === 'grade4' ? 4 : 1; game = null; currentVisit = null;
    history.replaceState({}, '', `#grade${grade}`);
  }
  document.body.classList.toggle('playing', Boolean(game));
  $('#grade-link').href = `../grade${grade}/`;
  $('#grade-link').innerHTML = `<span aria-hidden="true">←</span> Grade ${grade}`;
  $('#games-link').href = `#grade${grade}`;
  render();
  window.scrollTo(0, 0);
  $('#main h1').focus({ preventScroll: true });
}
function render() {
  if (!game) {
    document.title = `Grade ${grade} · Little learning games`;
    $('#main').innerHTML = `<section class="games-home"><p class="eyebrow">PLAY A LITTLE. LEARN A LITTLE.</p><h1 tabindex="-1">Ready, set…<br><span>let’s play!</span></h1><p class="intro">No timer. Take your time. Try again whenever you like.</p><div class="game-grid">${GAMES.filter(item => item.grade === grade).map(item => `<a class="game-tile ${item.color}" href="#${item.id}">${picture(item.picture)}<h2>${item.title}</h2><p>${item.description}</p><span class="start-label">Let’s play <b aria-hidden="true">→</b></span></a>`).join('')}</div><a class="other-grade" href="#grade${grade === 1 ? 4 : 1}">See Grade ${grade === 1 ? 4 : 1} games →</a></section>`;
    return;
  }
  const info = GAMES.find(item => item.id === game.id);
  document.title = `${info.title} · Grade ${grade}`;
  const count = game.kind === 'choose' ? `${game.index + 1} / ${game.questions.length}` : `${game.matched.length} / 4 pairs`;
  let content;
  if (game.complete) {
    content = `<section class="finish ${info.color}">${picture('star')}<p class="eyebrow">LOOK WHAT YOU DID!</p><h2>${game.kind === 'choose' ? 'Six little discoveries!' : 'You found every pair!'}</h2><p>${game.kind === 'choose' ? 'Look, think, try. Every turn helps you learn.' : `All 4 pairs in ${game.turns} turns. Say each pair together next time!`}</p><div class="finish-actions"><button class="primary" data-again>Play again ↗</button><a class="secondary" href="#grade${grade}">Pick a game →</a></div></section>`;
  } else if (game.kind === 'choose') {
    const question = game.questions[game.index], wordGame = game.id === 'word-pictures';
    const prompt = wordGame ? 'Which word goes with the picture?' : 'How many can you count?';
    content = `<section class="choose-game"><div class="picture-card ${info.color}"><p class="eyebrow">${prompt}</p><div class="${wordGame ? 'one-picture' : 'counting-pictures'}">${wordGame ? picture(question.picture, question.picture) : Array.from({ length: question.answer }, () => picture(question.picture, question.picture)).join('')}</div></div><div class="answer-choices">${question.choices.map((choice, i) => `<button data-answer="${i}" class="${question.solved && choice === question.answer ? 'correct' : question.wrong.includes(choice) ? 'tried' : ''}"${question.solved || question.wrong.includes(choice) ? ' disabled' : ''}>${esc(choice)}${question.solved && choice === question.answer ? '<span aria-hidden="true"> ✓</span>' : ''}</button>`).join('')}</div><div class="turn-footer"><p>${question.solved ? wordGame ? `Yes! ${question.answer}. Say the word out loud.` : `Yes! ${question.answer} ${question.picture === 'fish' ? 'fish' : question.answer === 1 ? question.picture : question.picture === 'leaf' ? 'leaves' : `${question.picture}s`}.` : question.wrong.length ? 'Have another look. You can try again.' : wordGame ? 'Say each sound. Blend the word.' : 'Point to each picture as you count.'}</p><button class="primary" data-next ${question.solved ? '' : 'hidden'}>${game.index === 5 ? 'See how you did' : 'Next picture'} →</button></div></section>`;
  } else {
    const pairReady = game.selected.length === 2;
    const matched = pairReady && game.cards[game.selected[0]].pairId === game.cards[game.selected[1]].pairId;
    const message = pairReady ? matched ? 'A pair! Say them together.' : 'Remember these. Try another pair.' : game.selected.length ? 'Now find its partner.' : 'Turn over two cards to find a pair.';
    content = `<section class="match-game"><p class="instructions">${info.description} Remember where each one hides.</p><div class="match-board">${game.cards.map((card, i) => {
      const done = game.matched.includes(card.pairId), faceUp = game.selected.includes(i) || done;
      return `<button data-flip="${i}" class="match-card ${faceUp ? 'face-up' : 'face-down'} ${done ? 'matched' : ''}" ${faceUp || pairReady ? 'disabled' : ''} aria-label="${esc(faceUp ? `${card.label}: ${card.text}${done ? ', matched' : ''}` : `Hidden card ${i + 1}`)}">${faceUp ? `<small>${card.label}</small><strong>${esc(card.text)}</strong><span aria-hidden="true">${done ? '✓' : '✦'}</span>` : `${picture(info.picture)}<span>${i + 1}</span>`}</button>`;
    }).join('')}</div><div class="turn-footer"><p>${message}</p><button class="primary" data-next ${pairReady ? '' : 'hidden'}>${game.matched.length === 4 ? 'See how you did' : matched ? 'Next pair' : 'Try another pair'} →</button></div></section>`;
  }
  $('#main').innerHTML = `<div class="game-toolbar"><h1 tabindex="-1">${info.title}</h1><span class="pill">${game.complete ? 'Well done! ✦' : count}</span></div>${content}`;
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link) { event.preventDefault(); navigate(link.getAttribute('href')); return; }
  const button = event.target.closest('button');
  if (!button || button.disabled || !game) return;
  if (button.hasAttribute('data-again')) return navigate(`#${game.id}`, true);
  let result;
  if (button.dataset.answer !== undefined) result = chooseAnswer(game, game.questions[game.index].choices[Number(button.dataset.answer)]);
  else if (button.dataset.flip !== undefined) result = flipCard(game, Number(button.dataset.flip));
  else if (button.hasAttribute('data-next')) { nextTurn(game); result = 'next'; }
  if (!result || result === 'ignored') return;
  render(); remember();
  const next = $('[data-next]:not([hidden])');
  if (next) next.focus({ preventScroll: true });
  else if (result === 'next') $('#main h1').focus({ preventScroll: true });
  else if (result === 'first') $('.match-card:not(:disabled)')?.focus({ preventScroll: true });
  else if (result === 'retry') $('[data-answer]:not(:disabled)')?.focus({ preventScroll: true });
  announce(game.complete ? 'Well done! You finished the game.' : $('.turn-footer p')?.textContent || '');
});
window.addEventListener('popstate', () => restore());
restore();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
