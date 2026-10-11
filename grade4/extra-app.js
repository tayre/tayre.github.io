import { EXTRA_TOPICS } from './extra-data.js';
import { createExtraProgress, normalizeExtraProgress, makeExtraLesson, recordExtraAttempt, getExtraStats } from './extra-engine.js';
import { renderVisual, escapeHTML as esc } from './extra-visuals.js';
import { getPacing } from './pacing.js';

const KEY = 'grade4.discovery.v1';
const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const baseTopics = [
  { title: 'Multiplication', icon: '×', description: 'Picture the groups. Learn a trick. Make it stick.', color: 'yellow', action: 'data-view="home"', tag: 'MATH · 1 TO 10' },
  { title: 'Capital cities', icon: '🌎', description: 'Canada’s provinces and a trip around the world.', color: 'mint', action: 'data-start-facts="geography"', tag: 'GEOGRAPHY' },
  { title: 'Canadian history', icon: '🍁', description: 'First peoples, Confederation, and Canada through time.', color: 'peach', action: 'data-start-facts="history"', tag: 'OUR PAST' },
  { title: 'Everyday science', icon: '🔬', description: 'Get curious about space and the world around you.', color: 'lilac', action: 'data-start-facts="science"', tag: 'BIG QUESTIONS' },
];
const colors = ['mint', 'lilac', 'peach', 'yellow', 'blue', 'mint'];

export function createExtraApp({ showView, readSaved, save }) {
  let progress = normalizeExtraProgress(readSaved(KEY));
  let session = null;
  let timer = null;
  let visible = false;
  let currentTopic = '';
  let reviewIds = [];
  function persist() { save(KEY, progress); }
  function renderHub() {
    const extraTopics = EXTRA_TOPICS.map((topic, index) => ({ ...topic, color: colors[index], action: `data-extra-topic="${esc(topic.id)}"`, tag: topic.id === 'reading' ? 'READ & THINK' : 'LOOK · LEARN · TRY' }));
    const topics = [baseTopics[0], ...extraTopics.slice(0, 3), ...extraTopics.slice(3, 5), baseTopics[1], baseTopics[2], baseTopics[3], ...extraTopics.slice(5)];
    $('#lesson-hub').innerHTML = topics.map((topic) => `<button class="hub-tile ${topic.color}" ${topic.action}><span class="hub-tile-top"><span class="hub-icon" aria-hidden="true">${esc(topic.icon)}</span><span aria-hidden="true">↗</span></span><span class="eyebrow">${esc(topic.tag)}</span><strong>${esc(topic.title)}</strong><span class="hub-description">${esc(topic.description)}</span><span class="hub-bottom">${topic.id ? 'A short lesson, then a little practice' : topic.title === 'Multiplication' ? 'Learn 3 facts at a time' : '10 questions with helpful hints'}<span aria-hidden="true">→</span></span></button>`).join('');
  }
  function renderProgress() {
    $('#extra-progress-grid').innerHTML = EXTRA_TOPICS.map((topic, i) => {
      const stats = getExtraStats(progress, topic.id);
      return `<button class="extra-progress-item ${colors[i]}" data-extra-topic="${esc(topic.id)}"><span aria-hidden="true">${esc(topic.icon)}</span><strong>${esc(topic.title)}</strong><span>${stats.seen} explored · ${stats.mastered} stars</span><small>${stats.total} discoveries in this topic →</small></button>`;
    }).join('');
  }
  function elapsed() { return session ? session.elapsed + (session.started === null ? 0 : performance.now() - session.started) : 0; }
  function pause() {
    clearInterval(timer); timer = null;
    if (session && session.started !== null) { session.elapsed = elapsed(); session.started = null; }
  }
  function resume() {
    if (!visible || !session || session.mode !== 'practice' || session.solved || session.reading || document.hidden || $('dialog[open]')) return;
    if (session.started === null) session.started = performance.now();
    tick();
    if (!timer) timer = setInterval(tick, 100);
  }
  function hint() {
    if (!session || session.solved) return;
    session.assisted = true;
    session.hintShown = true;
    $('#extra-hint').textContent = session.cards[session.index].hint;
    $('#extra-hint').classList.add('shown');
    $('#extra-hint-button').hidden = true;
  }
  function tick() {
    if (!session || session.mode !== 'practice' || session.solved || session.reading) return;
    const time = elapsed();
    const pace = getPacing(time / 2, { hintUsed: session.assisted, misses: session.misses });
    session.points = pace.points;
    if (pace.hintDue && !session.hintShown) hint();
    $('#extra-points').textContent = `${pace.points} points available`;
    $('#extra-pacing').textContent = pace.fullyRevealed ? 'The answer is here to help.' : pace.answerDue ? 'The answer is appearing…' : `Hint at 10s · answer appears at 20s`;
    if (pace.answerDue) {
      session.assisted = true;
      $('#extra-reveal').textContent = session.cards[session.index].answer;
      $('#extra-reveal').style.opacity = reducedMotion.matches ? Number(pace.fullyRevealed) : pace.answerOpacity;
      if (!session.announced && (!reducedMotion.matches || pace.fullyRevealed)) {
        $('#extra-announcement').textContent = `The answer is ${session.cards[session.index].answer}. Tap it to keep learning.`;
        session.announced = true;
      }
    }
  }
  function start(topic, ids = null) {
    const lesson = makeExtraLesson(topic, { reviewIds: ids });
    if (!lesson.cards.length) return;
    pause();
    window.speechSynthesis?.cancel();
    currentTopic = topic;
    session = { cards: lesson.cards, topic: EXTRA_TOPICS.find((item) => item.id === topic), index: 0, mode: 'study', results: [], elapsed: 0, started: null };
    showView('extra', { focus: false });
    render();
  }
  function setPhase(phase) {
    session.mode = phase;
    session.index = 0;
    render();
  }
  function render() {
    pause();
    window.speechSynthesis?.cancel();
    const card = session.cards[session.index];
    const study = session.mode === 'study';
    const topic = session.topic;
    $('#extra-view').classList.toggle('is-studying', study);
    $('#extra-view').classList.toggle('is-reading', Boolean(card.passage));
    $('#extra-card').hidden = false;
    $('#extra-card').dataset.cardId = card.id;
    $('#extra-results').hidden = true;
    $('.extra-actions').hidden = false;
    $('#extra-title').textContent = topic.title;
    $('#extra-count').textContent = study && card.passage ? 'Read · take your time' : `${study ? 'Learn' : 'Try'} ${session.index + 1} / ${session.cards.length}`;
    $('#extra-track').innerHTML = session.cards.map((_, i) => `<span class="${i < session.index ? 'done' : i === session.index ? 'current' : ''}"></span>`).join('');
    $('#extra-track').setAttribute('aria-label', `${session.index + 1} of ${session.cards.length}`);
    $('#extra-phase').textContent = study ? 'LOOK FIRST · TAKE YOUR TIME' : 'YOUR TURN · GIVE IT A GO';
    $('#extra-question').textContent = study ? card.passage ? 'Read a little story.' : card.study.title : card.question;
    $('#extra-study-text').hidden = !study;
    $('#extra-study-text').textContent = card.passage ? `Picture what is happening. Then try ${session.cards.length} ${session.cards.length === 1 ? 'question' : 'questions'} about the story.` : card.study.text;
    $('#extra-passage').hidden = !card.passage;
    $('#extra-passage').textContent = card.passage || '';
    $('#extra-picture').innerHTML = renderVisual(card.visual, study ? card.picture || topic.icon : topic.icon);
    $('#extra-picture').hidden = Boolean(card.passage);
    $('#extra-card').classList.toggle('has-passage', Boolean(card.passage));
    $('#extra-source').hidden = !study || !card.source;
    if (card.source) { $('#extra-source').href = card.source.url; $('#extra-source').textContent = `${card.source.title} ↗`; }
    $('#extra-practice').hidden = study;
    $('#extra-back').hidden = !study || Boolean(card.passage);
    $('#extra-back').disabled = session.index === 0;
    $('#extra-next').hidden = false;
    $('#extra-next').textContent = study ? card.passage || session.index + 1 === session.cards.length ? 'Ready? Try it! →' : 'Next card →' : 'Next question →';
    document.querySelector('#extra-listen')?.remove();
    if (study && card.speech && 'speechSynthesis' in window) {
      const listen = document.createElement('button'); listen.id = 'extra-listen'; listen.className = 'button secondary'; listen.textContent = '♪ Hear the French';
      listen.addEventListener('click', () => { speechSynthesis.cancel(); const voice = new SpeechSynthesisUtterance(card.speech.text); voice.lang = card.speech.lang; voice.rate = .8; speechSynthesis.speak(voice); });
      $('.extra-copy').append(listen);
    }
    if (!study) {
      Object.assign(session, { solved: false, assisted: false, hintShown: false, misses: 0, scored: false, elapsed: 0, started: null, announced: false, points: 100, reading: Boolean(card.passage) });
      $('#extra-choices').innerHTML = card.choices.map((choice, i) => `<button class="extra-choice" data-extra-choice="${i}"><span>${i + 1}</span>${esc(choice)}<b aria-hidden="true"></b></button>`).join('');
      $('#extra-choices').hidden = session.reading;
      $('#extra-hint').textContent = session.reading ? 'Read at your own pace. Tap “I’m ready” when you want to answer.' : 'A hint will be here if you need one.';
      $('#extra-hint').classList.remove('shown');
      $('#extra-hint-button').hidden = session.reading;
      $('#extra-feedback').textContent = '';
      $('#extra-reveal').textContent = '';
      $('#extra-reveal').style.opacity = 0;
      $('#extra-announcement').textContent = '';
      $('#extra-points').textContent = '100 points available';
      $('#extra-pacing').textContent = session.reading ? 'No timer while you read' : 'Hint at 10s · answer appears at 20s';
      $('#extra-next').hidden = !session.reading;
      $('#extra-next').textContent = session.reading ? 'I’m ready →' : 'Next question →';
      resume();
    }
    $('#extra-question').focus({ preventScroll: true });
  }
  function answer(index) {
    if (!session || session.mode !== 'practice' || session.solved || session.reading) return;
    const card = session.cards[session.index];
    const button = $(`[data-extra-choice="${index}"]`);
    if (!button || button.disabled) return;
    tick();
    const correct = card.choices[index] === card.answer;
    if (!session.scored) {
      recordExtraAttempt(progress, { id: card.id, correct, assisted: session.assisted });
      session.scored = true;
      persist();
    }
    if (!correct) {
      session.misses += 1;
      button.disabled = true; button.classList.add('wrong'); button.querySelector('b').textContent = '×';
      $('#extra-feedback').textContent = 'Not quite yet. Try the hint — you can do this.';
      hint(); tick(); return;
    }
    pause(); session.solved = true;
    const clean = !session.assisted && session.misses === 0;
    session.results.push({ id: card.id, points: session.points, clean });
    progress.totalPoints = Math.min(Number.MAX_SAFE_INTEGER, progress.totalPoints + session.points);
    persist();
    $('#extra-choices').querySelectorAll('button').forEach((item, i) => { item.disabled = true; if (card.choices[i] === card.answer) { item.classList.add('correct'); item.querySelector('b').textContent = '✓'; } });
    $('#extra-feedback').textContent = `${clean ? 'You’ve got it!' : 'You stuck with it!'} +${session.points} points.`;
    $('#extra-points').textContent = `+${session.points} points!`;
    $('#extra-pacing').textContent = 'Another little discovery ✦';
    $('#extra-hint').textContent = card.explanation;
    $('#extra-hint').classList.add('shown');
    $('#extra-hint-button').hidden = true;
    $('#extra-reveal').textContent = card.answer;
    $('#extra-reveal').style.opacity = 1;
    $('#extra-next').hidden = false;
    $('#extra-next').textContent = session.index + 1 === session.cards.length ? 'See how you did →' : 'Next question →';
    $('#extra-next').focus({ preventScroll: true });
  }
  function finish() {
    pause(); session.mode = 'results';
    const clean = session.results.filter((item) => item.clean).length;
    const points = session.results.reduce((sum, item) => sum + item.points, 0);
    reviewIds = session.results.filter((item) => !item.clean).map((item) => item.id);
    progress.completedLessons += 1; persist(); renderProgress();
    $('#extra-card').hidden = true; $('#extra-practice').hidden = true; $('.extra-actions').hidden = true;
    $('#extra-results').hidden = false;
    $('#extra-count').textContent = 'Lesson complete ✦';
    $('#extra-track').querySelectorAll('span').forEach((el) => { el.className = 'done'; });
    $('#extra-result-message').textContent = `You explored ${session.cards.length} little ideas in ${session.topic.title.toLowerCase()}. Come back another day to help them stick!`;
    $('#extra-result-stats').innerHTML = `<div><strong>${points}</strong><span>points earned</span></div><div><strong>${clean} / ${session.cards.length}</strong><span>on your own</span></div>`;
    $('#extra-review').hidden = !reviewIds.length;
    $('#extra-again').focus({ preventScroll: true });
  }
  function next() {
    if (!session) return;
    window.speechSynthesis?.cancel();
    if (session.mode === 'study' && session.cards[session.index].passage) return setPhase('practice');
    if (session.mode === 'practice' && session.reading) {
      session.reading = false;
      $('#extra-choices').hidden = false; $('#extra-next').hidden = true; $('#extra-hint-button').hidden = false;
      $('#extra-hint').textContent = 'A hint will be here if you need one.';
      resume(); return;
    }
    if (session.mode === 'practice' && !session.solved) return;
    if (session.index + 1 === session.cards.length) return session.mode === 'study' ? setPhase('practice') : finish();
    session.index += 1; render();
  }
  function leave() { pause(); session = null; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.extraTopic) start(button.dataset.extraTopic);
    if (button.dataset.extraChoice !== undefined) answer(Number(button.dataset.extraChoice));
  });
  $('#extra-next').addEventListener('click', next);
  $('#extra-back').addEventListener('click', () => { if (session?.mode === 'study' && session.index > 0) { session.index -= 1; render(); } });
  $('#extra-hint-button').addEventListener('click', () => { hint(); tick(); });
  $('#extra-again').addEventListener('click', () => start(currentTopic));
  $('#extra-review').addEventListener('click', () => start(currentTopic, reviewIds));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); window.speechSynthesis?.cancel(); } else resume(); });
  window.addEventListener('pagehide', () => { pause(); window.speechSynthesis?.cancel(); }); window.addEventListener('pageshow', resume);
  document.addEventListener('keydown', (event) => {
    if (!visible || $('dialog[open]') || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^[1-4]$/.test(event.key) && session?.mode === 'practice') { event.preventDefault(); answer(Number(event.key) - 1); }
  });
  renderHub(); renderProgress();
  return { pause, resume, leave, renderProgress, isPracticing: () => visible && session?.mode === 'practice',
    onView(name) { visible = name === 'extra'; if (!visible) { pause(); window.speechSynthesis?.cancel(); } else resume(); },
    reset() { leave(); progress = createExtraProgress(); persist(); renderProgress(); } };
}
