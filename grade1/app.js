import { CARDS, TOPICS, WORD_PACKS, WORD_GROUPS, LEARNING_PACKS } from './data.js';
import { normalizeProgress, recordVisit, getStats, makeDeck } from './engine.js';
import { escapeHTML, numberFrames, renderVisual } from './visuals.js';

const STORAGE_KEY = 'grade1.flashcards.v1';
const SETTINGS_KEY = 'grade1.flashcards.settings.v1';
const $ = (selector) => document.querySelector(selector);
const readSaved = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const progress = normalizeProgress(readSaved(STORAGE_KEY));
const savedSettings = readSaved(SETTINGS_KEY);
const numberRanges = Array.from({ length: 10 }, (_, index) => `${index * 10 + 1}-${index * 10 + 10}`);
const wordCount = CARDS.filter(({ topic }) => topic === 'words').length;
const selections = {};
for (const { id } of TOPICS) {
  const choices = id === 'numbers' ? numberRanges : id === 'words' ? WORD_PACKS.map(pack => pack.id) : LEARNING_PACKS.filter(pack => pack.topic === id).map(pack => pack.id);
  const saved = savedSettings?.[id];
  selections[id] = saved === 'all' || choices.includes(saved) ? saved : choices[0] || 'all';
}
let topic = 'alphabet';
let deck = [];
let index = 0;
let view = 'home';
let lastTopicButton = null;

function save(key = STORAGE_KEY, value = progress) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    $('#save-status').textContent = 'Practice saved on this device.';
  } catch { $('#save-status').textContent = 'Practice lasts for this visit. Device storage is unavailable.'; }
}

function renderHome() {
  const categories = [...new Set(TOPICS.map(item => item.category))];
  $('#topic-groups').innerHTML = categories.map((category, groupIndex) => `<section class="topic-group" aria-labelledby="group-${groupIndex}"><h2 id="group-${groupIndex}">${escapeHTML(category)}</h2><div class="topic-grid">${TOPICS.filter(item => item.category === category).map(({ id, title, description, icon, theme }) => {
    const stats = getStats(progress, id);
    const packs = LEARNING_PACKS.filter(pack => pack.topic === id).length;
    const count = id === 'words' ? `${wordCount} school words` : id === 'numbers' ? '1 to 100' : id === 'alphabet' ? '26 letters' : `${packs} little sets`;
    return `<button class="topic-card theme-${theme}" data-topic="${id}"><span class="topic-top"><span class="topic-icon${id === 'alphabet' || id === 'numbers' ? ' type-icon' : ''}" aria-hidden="true">${icon}</span><span class="topic-arrow" aria-hidden="true">↗</span></span><span class="topic-title">${escapeHTML(title)}</span><span class="topic-description">${escapeHTML(description)}</span><span class="topic-detail">${stats.seen ? `${stats.seen} of ${stats.total} explored` : count}</span></button>`;
  }).join('')}</div></section>`).join('');
}

function showView(name) {
  view = name;
  document.body.classList.toggle('cards-open', name === 'cards');
  document.querySelectorAll('.view').forEach(element => { element.hidden = element.id !== `${name}-view`; });
  const homeButton = $('[data-home]');
  if (name === 'home') homeButton.setAttribute('aria-current', 'page'); else homeButton.removeAttribute('aria-current');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'home') {
    renderHome();
    const target = lastTopicButton ? $(`[data-topic="${lastTopicButton}"]`) : $('#home-title');
    target.focus({ preventScroll: !lastTopicButton });
  }
}

function renderSelection() {
  const topicInfo = TOPICS.find(item => item.id === topic);
  $('#lesson-title').textContent = topicInfo.title;
  $('#selection-control').hidden = topic === 'alphabet';
  $('#selection-label').textContent = `Choose a ${topicInfo.title.toLowerCase()} set`;
  if (topic === 'words') {
    $('#deck-selection').innerHTML = WORD_GROUPS.map(group => `<optgroup label="${escapeHTML(group.title)}">${WORD_PACKS.filter(pack => pack.groupId === group.id).map(({ id, title, ids }) => `<option value="${id}">${escapeHTML(title)} · ${ids.length} words</option>`).join('')}</optgroup>`).join('') + `<option value="all">All ${wordCount} words</option>`;
  } else if (topic === 'numbers') {
    $('#deck-selection').innerHTML = numberRanges.map(range => `<option value="${range}">Numbers ${range.replace('-', '–')}</option>`).join('') + '<option value="all">All 1–100</option>';
  } else {
    $('#deck-selection').innerHTML = LEARNING_PACKS.filter(pack => pack.topic === topic).map(({ id, title, ids }) => `<option value="${id}">${escapeHTML(title)} · ${ids.length} cards</option>`).join('') + '<option value="all">All cards in this topic</option>';
  }
  $('#deck-selection').value = selections[topic];
}

function startTopic(nextTopic) {
  if (!TOPICS.some(({ id }) => id === nextTopic)) return;
  topic = nextTopic;
  lastTopicButton = topic;
  renderSelection();
  startDeck();
  $('#lesson-title').focus({ preventScroll: true });
}

function startDeck() {
  deck = makeDeck({ topic, selection: selections[topic] });
  index = 0;
  if (!deck.length) return;
  showView('cards');
  renderCard();
}

function renderCard(wrapped = false) {
  const card = deck[index];
  const topicInfo = TOPICS.find(item => item.id === topic);
  $('#flashcard').className = `flashcard theme-${topicInfo.theme} card-${topic}${card.visual ? ` visual-${card.visual.type}` : ''}`;
  $('#card-prompt').textContent = topicInfo.prompt;
  $('#card-face').innerHTML = topic === 'alphabet' ? `${escapeHTML(card.front.split(' ')[0])}<span>${escapeHTML(card.front.split(' ')[1])}</span>` : card.wordParts ? `<span>${escapeHTML(card.wordParts[0])}</span><span class="word-ending">${escapeHTML(card.wordParts[1])}</span>` : escapeHTML(card.front);
  $('#card-face').setAttribute('aria-label', topic === 'alphabet' ? `Uppercase ${card.front[0]} and lowercase ${card.front[0].toLowerCase()}` : card.front);
  $('#card-count').textContent = `${index + 1} / ${deck.length}`;
  $('#card-announcement').textContent = `${wrapped ? 'Set complete. Let’s look again. ' : ''}Card ${index + 1} of ${deck.length}. ${card.front}. ${card.back}${!['alphabet', 'words'].includes(topic) ? ` ${card.example}` : ''}`;
  $('#card-example').textContent = card.back;
  $('#card-picture').hidden = !card.picture;
  $('#card-picture').textContent = card.picture || '';
  const visual = $('#card-visual');
  visual.hidden = !card.visual && topic !== 'numbers';
  visual.className = topic === 'numbers' ? 'card-visual number-frames' : 'card-visual';
  visual.innerHTML = topic === 'numbers' ? numberFrames(card.number) : renderVisual(card.visual);
  $('#card-note').hidden = ['alphabet', 'words'].includes(topic);
  $('#card-note').textContent = card.example;
  $('#set-message').textContent = wrapped ? 'Set explored! Let’s look again.' : 'Look. Say it. Take your time.';
}

function nextCard() {
  if (view !== 'cards') return;
  recordVisit(progress, { id: deck[index].id });
  save();
  index = (index + 1) % deck.length;
  renderCard(index === 0);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-home')) showView('home');
  else if (button.dataset.topic) startTopic(button.dataset.topic);
});
$('.brand').addEventListener('click', event => { event.preventDefault(); showView('home'); });
$('#deck-selection').addEventListener('change', () => {
  selections[topic] = $('#deck-selection').value;
  save(SETTINGS_KEY, selections);
  startDeck();
});
$('#next-card').addEventListener('click', nextCard);
renderHome();
save();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* Cards still work online. */ });
