import { CARDS, TOPICS, WORD_PACKS } from './data.js';
import { createProgress, normalizeProgress, recordCard, getStats, makeDeck } from './engine.js';

const STORAGE_KEY = 'grade1.flashcards.v1';
const SETTINGS_KEY = 'grade1.flashcards.settings.v1';
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const readSaved = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let progress = normalizeProgress(readSaved(STORAGE_KEY));
const savedSettings = readSaved(SETTINGS_KEY);
const numberRanges = Array.from({ length: 10 }, (_, index) => `${index * 10 + 1}-${index * 10 + 10}`);
const selections = {
  alphabet: 'all',
  words: savedSettings?.words === 'all' || WORD_PACKS.some(({ id }) => id === savedSettings?.words) ? savedSettings.words : WORD_PACKS[0].id,
  numbers: [...numberRanges, 'all'].includes(savedSettings?.numbers) ? savedSettings.numbers : '1-10',
};
let topic = 'alphabet';
let shuffled = false;
let deck = [];
let index = 0;
let turned = false;
let results = [];
let review = [];
let view = 'home';
const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let speechGeneration = 0;
const descriptions = {
  alphabet: { title: 'The alphabet', note: 'Big and little letters belong together.', prompt: 'CAN YOU SAY THIS LETTER?', nudge: 'Look at the big letter and the little letter.', backNudge: 'Say the letter, then say the picture word.' },
  words: { title: 'Popcorn words', note: 'Little words you see again and again.', prompt: 'CAN YOU READ THIS WORD?', nudge: 'Try saying the word. Then turn the card.', backNudge: 'Can you find your word in the sentence?' },
  numbers: { title: 'Let’s count', note: 'Start with ten numbers. Try more when you’re ready.', prompt: 'WHAT NUMBER IS THIS?', nudge: 'Say the number. Then count the dots.', backNudge: 'Each full frame has ten dots.' },
};

function save(key = STORAGE_KEY, value = progress) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    $('#save-status').textContent = 'Progress saved on this device.';
  } catch { $('#save-status').textContent = 'Progress lasts for this visit. Device storage is unavailable.'; }
}

function stopSpeech() {
  speechGeneration += 1;
  if (canSpeak) window.speechSynthesis.cancel();
}

function showView(name) {
  stopSpeech();
  view = name;
  document.querySelectorAll('.view').forEach((element) => { element.hidden = element.id !== `${name}-view`; });
  document.querySelectorAll('.nav-link').forEach((button) => {
    const active = name === 'home' ? button.hasAttribute('data-home') : button.dataset.topic === topic;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = $(`#${name}-view h1`);
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  if (name === 'home') renderProgress();
}

function renderProgress() {
  for (const { id } of TOPICS) {
    const stats = getStats(progress, id);
    $(`#${id}-progress`).textContent = stats.seen ? `${stats.known} of ${stats.total} marked “I know it”` : 'A fresh little adventure.';
  }
}

function renderSelection() {
  const details = descriptions[topic];
  $('#lesson-title').textContent = details.title;
  $('#deck-note').textContent = details.note;
  $('#selection-control').hidden = topic === 'alphabet';
  $('#selection-label').textContent = topic === 'words' ? 'Word set' : 'Number set';
  if (topic === 'words') {
    $('#deck-selection').innerHTML = WORD_PACKS.map(({ id, title }) => `<option value="${id}">${escapeHTML(title)} · 10 words</option>`).join('') + '<option value="all">All 30 words</option>';
  } else if (topic === 'numbers') {
    $('#deck-selection').innerHTML = numberRanges.map((range) => `<option value="${range}">Numbers ${range.replace('-', '–')}</option>`).join('') + '<option value="all">All 1–100</option>';
  }
  $('#deck-selection').value = selections[topic];
  $('#shuffle-cards').setAttribute('aria-pressed', String(shuffled));
  $('#shuffle-cards').innerHTML = `<span aria-hidden="true">⇄</span> ${shuffled ? 'Mixed up · put in order' : 'Mix the cards'}`;
}

function startTopic(nextTopic) {
  if (!TOPICS.some(({ id }) => id === nextTopic)) return;
  topic = nextTopic;
  shuffled = false;
  renderSelection();
  startDeck();
}

function startDeck(cards = makeDeck({ topic, selection: selections[topic], shuffle: shuffled })) {
  if (!cards.length) return;
  deck = [...cards];
  index = 0;
  results = [];
  showView('cards');
  renderCard();
}

function drawNumber(number) {
  const frames = Math.ceil(number / 10);
  $('#counting-picture').innerHTML = Array.from({ length: frames }, (_, frame) => `<span class="ten-frame">${Array.from({ length: 10 }, (_, dot) => `<i${frame * 10 + dot < number ? ' class="filled"' : ''}></i>`).join('')}</span>`).join('');
}

function renderCard() {
  stopSpeech();
  turned = false;
  const card = deck[index];
  const details = descriptions[topic];
  $('#flashcard').className = `flashcard ${topic}-theme`;
  $('#card-prompt').textContent = details.prompt;
  $('#card-face').innerHTML = topic === 'alphabet' ? `${escapeHTML(card.front.split(' ')[0])} <span>${escapeHTML(card.front.split(' ')[1])}</span>` : escapeHTML(card.front);
  $('#card-face').setAttribute('aria-label', topic === 'alphabet' ? `Uppercase ${card.front[0]} and lowercase ${card.front[0].toLowerCase()}` : card.front);
  $('#card-count').textContent = `Card ${index + 1} of ${deck.length}`;
  $('#session-known').textContent = results.length ? `${results.filter(({ known }) => known).length} marked “I know it”` : 'Let’s give it a go.';
  $('#session-fill').style.width = `${index / deck.length * 100}%`;
  $('.session-track').setAttribute('aria-valuemax', deck.length);
  $('.session-track').setAttribute('aria-valuenow', index);
  $('#card-example').textContent = card.back;
  $('#letter-picture').hidden = topic !== 'alphabet';
  $('#letter-picture').textContent = card.picture || '';
  $('#counting-picture').hidden = topic !== 'numbers';
  $('#number-groups').hidden = topic !== 'numbers';
  $('#number-groups').textContent = topic === 'numbers' ? card.example : '';
  if (topic === 'numbers') drawNumber(card.number);
  $('#card-back').hidden = true;
  $('#card-nudge').textContent = details.nudge;
  $('#answer-actions').hidden = true;
  $('#flip-card').innerHTML = 'Turn the card <span aria-hidden="true">↻</span>';
  $('#flip-card').setAttribute('aria-expanded', 'false');
  $('#speech-status').textContent = '';
  $('#card-face').focus({ preventScroll: true });
}

function flipCard() {
  if (view !== 'cards') return;
  stopSpeech();
  turned = !turned;
  $('#flashcard').classList.toggle('turned', turned);
  $('#card-back').hidden = !turned;
  $('#answer-actions').hidden = !turned;
  $('#card-nudge').textContent = descriptions[topic][turned ? 'backNudge' : 'nudge'];
  $('#flip-card').innerHTML = `${turned ? 'Look at the front' : 'Turn the card'} <span aria-hidden="true">↻</span>`;
  $('#flip-card').setAttribute('aria-expanded', String(turned));
  $('#card-example').setAttribute('aria-live', turned ? 'polite' : 'off');
}

function markCard(known) {
  if (view !== 'cards' || !turned) return;
  const card = deck[index];
  recordCard(progress, { id: card.id, known });
  results.push({ id: card.id, known });
  save();
  if (index + 1 === deck.length) return finishDeck();
  index += 1;
  renderCard();
}

function finishDeck() {
  const known = results.filter((result) => result.known).length;
  review = results.filter((result) => !result.known).map(({ id }) => CARDS.find((card) => card.id === id));
  $('#result-known').textContent = known;
  $('#result-again').textContent = review.length;
  const noun = topic === 'alphabet' ? 'letter' : topic === 'words' ? 'word' : 'number';
  $('#results-message').textContent = `You tried ${deck.length} ${noun}${deck.length === 1 ? '' : 's'}. ${review.length ? 'A little practice helps the tricky ones feel familiar.' : 'Well done! Come back another day and try them again.'}`;
  $('#review-list').innerHTML = review.map((card) => `<span>${escapeHTML(card.front)}</span>`).join('');
  $('#review-cards').hidden = !review.length;
  showView('results');
}

function listen() {
  if (!canSpeak || view !== 'cards') return;
  stopSpeech();
  const generation = speechGeneration;
  const card = deck[index];
  const text = topic === 'alphabet' ? (turned ? card.back : card.front[0]) : topic === 'words' && turned ? card.example : card.speech;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((item) => item.lang === 'en-CA' && item.localService) || voices.find((item) => /^en[-_]/.test(item.lang) && item.localService);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-CA';
  utterance.rate = 0.8;
  utterance.onerror = (event) => {
    if (generation !== speechGeneration || ['canceled', 'interrupted'].includes(event.error)) return;
    $('#speech-status').textContent = 'The voice isn’t ready on this device. You can read it together.';
  };
  window.speechSynthesis.speak(utterance);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-home')) showView('home');
  else if (button.dataset.topic) startTopic(button.dataset.topic);
});
$('.brand').addEventListener('click', (event) => { event.preventDefault(); showView('home'); });
$('#deck-selection').addEventListener('change', () => {
  selections[topic] = $('#deck-selection').value;
  save(SETTINGS_KEY, selections);
  startDeck();
});
$('#shuffle-cards').addEventListener('click', () => { shuffled = !shuffled; renderSelection(); startDeck(); });
$('#flip-card').addEventListener('click', flipCard);
$('#flip-card').setAttribute('aria-controls', 'card-back');
$('#know-card').addEventListener('click', () => markCard(true));
$('#try-again').addEventListener('click', () => markCard(false));
$('#review-cards').addEventListener('click', () => startDeck(review));
$('#restart-deck').addEventListener('click', () => startDeck());
$('#listen').hidden = !canSpeak;
$('#listen').addEventListener('click', listen);
$('#reset-progress').addEventListener('click', () => { stopSpeech(); $('#reset-dialog').showModal(); });
$('#cancel-reset').addEventListener('click', () => $('#reset-dialog').close());
$('#confirm-reset').addEventListener('click', () => { progress = createProgress(); save(); $('#reset-dialog').close(); showView('home'); });
window.addEventListener('pagehide', stopSpeech);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeech(); });
renderProgress();
save();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* Flashcards still work online. */ });
