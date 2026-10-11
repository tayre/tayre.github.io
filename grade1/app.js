import { CARDS, TOPICS, WORD_PACKS, WORD_GROUPS } from './data.js';
import { normalizeProgress, recordVisit, getStats, makeDeck } from './engine.js';

const STORAGE_KEY = 'grade1.flashcards.v1';
const SETTINGS_KEY = 'grade1.flashcards.settings.v1';
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const readSaved = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let progress = normalizeProgress(readSaved(STORAGE_KEY));
const savedSettings = readSaved(SETTINGS_KEY);
const numberRanges = Array.from({ length: 10 }, (_, index) => `${index * 10 + 1}-${index * 10 + 10}`);
const wordCount = CARDS.filter(({ topic }) => topic === 'words').length;
const selections = {
  alphabet: 'all',
  words: savedSettings?.words === 'all' || WORD_PACKS.some(({ id }) => id === savedSettings?.words) ? savedSettings.words : WORD_PACKS[0].id,
  numbers: [...numberRanges, 'all'].includes(savedSettings?.numbers) ? savedSettings.numbers : '1-10',
};
let topic = 'alphabet';
let deck = [];
let index = 0;
let view = 'home';
const descriptions = {
  alphabet: { title: 'Letters', prompt: 'SAY THE LETTER. NAME THE PICTURE.' },
  words: { title: 'Popcorn words', prompt: 'SAY THE WORD. READ IT TOGETHER.' },
  numbers: { title: 'Numbers', prompt: 'SAY THE NUMBER. COUNT THE DOTS.' },
};

function save(key = STORAGE_KEY, value = progress) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    $('#save-status').textContent = 'Practice saved on this device.';
  } catch { $('#save-status').textContent = 'Practice lasts for this visit. Device storage is unavailable.'; }
}

function showView(name) {
  view = name;
  document.body.classList.toggle('cards-open', name === 'cards');
  document.querySelectorAll('.view').forEach((element) => { element.hidden = element.id !== `${name}-view`; });
  document.querySelectorAll('.nav-link').forEach((button) => {
    const active = name === 'home' ? button.hasAttribute('data-home') : button.dataset.topic === topic;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'home') {
    renderProgress();
    $('#home-title').setAttribute('tabindex', '-1');
    $('#home-title').focus({ preventScroll: true });
  }
}

function renderProgress() {
  for (const { id } of TOPICS) {
    const stats = getStats(progress, id);
    $(`#${id}-progress`).textContent = stats.seen ? `${stats.seen} of ${stats.total} cards explored` : 'A fresh little adventure.';
  }
  $('#word-count').textContent = `${wordCount} school words`;
}

function renderSelection() {
  $('#lesson-title').textContent = descriptions[topic].title;
  $('#selection-control').hidden = topic === 'alphabet';
  $('#selection-label').textContent = topic === 'words' ? 'Word set' : 'Number set';
  if (topic === 'words') {
    $('#deck-selection').innerHTML = WORD_GROUPS.map((group) => `<optgroup label="${escapeHTML(group.title)}">${WORD_PACKS.filter((pack) => pack.groupId === group.id).map(({ id, title, ids }) => `<option value="${id}">${escapeHTML(title)} · ${ids.length} words</option>`).join('')}</optgroup>`).join('') + `<option value="all">All ${wordCount} words</option>`;
  } else if (topic === 'numbers') {
    $('#deck-selection').innerHTML = numberRanges.map((range) => `<option value="${range}">Numbers ${range.replace('-', '–')}</option>`).join('') + '<option value="all">All 1–100</option>';
  }
  $('#deck-selection').value = selections[topic];
}

function startTopic(nextTopic) {
  if (!TOPICS.some(({ id }) => id === nextTopic)) return;
  topic = nextTopic;
  renderSelection();
  startDeck();
}

function startDeck() {
  deck = makeDeck({ topic, selection: selections[topic] });
  index = 0;
  if (!deck.length) return;
  showView('cards');
  renderCard();
}

function drawNumber(number) {
  $('#counting-picture').innerHTML = Array.from({ length: Math.ceil(number / 10) }, (_, frame) => `<span class="ten-frame">${Array.from({ length: 10 }, (_, dot) => `<i${frame * 10 + dot < number ? ' class="filled"' : ''}></i>`).join('')}</span>`).join('');
}

function renderCard(wrapped = false) {
  const card = deck[index];
  $('#flashcard').className = `flashcard ${topic}-theme`;
  $('#card-prompt').textContent = descriptions[topic].prompt;
  $('#card-face').innerHTML = topic === 'alphabet' ? `${escapeHTML(card.front.split(' ')[0])} <span>${escapeHTML(card.front.split(' ')[1])}</span>` : escapeHTML(card.front);
  $('#card-face').setAttribute('aria-label', topic === 'alphabet' ? `Uppercase ${card.front[0]} and lowercase ${card.front[0].toLowerCase()}` : card.front);
  $('#card-count').textContent = `${index + 1} / ${deck.length}`;
  $('#card-announcement').textContent = `${wrapped ? 'Set complete. Let’s look again. ' : ''}Card ${index + 1} of ${deck.length}. ${card.front}. ${card.back}`;
  $('#card-example').textContent = card.back;
  $('#letter-picture').hidden = topic !== 'alphabet';
  $('#letter-picture').textContent = card.picture || '';
  $('#counting-picture').hidden = topic !== 'numbers';
  $('#number-groups').hidden = topic !== 'numbers';
  $('#number-groups').textContent = topic === 'numbers' ? card.example : '';
  if (topic === 'numbers') drawNumber(card.number);
}

function nextCard() {
  if (view !== 'cards') return;
  recordVisit(progress, { id: deck[index].id });
  save();
  index = (index + 1) % deck.length;
  renderCard(index === 0);
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
$('#next-card').addEventListener('click', nextCard);
renderProgress();
save();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* Cards still work online. */ });
