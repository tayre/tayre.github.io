import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_CARDS, EXTRA_TOPICS } from './extra-data.js';

const byId = (id) => {
  const found = EXTRA_CARDS.find((card) => card.id === id);
  assert.ok(found, `Missing card: ${id}`);
  return found;
};
const byTopic = (topic) => EXTRA_CARDS.filter((card) => card.topic === topic);
const fractionValue = (value) => {
  const [numerator, denominator] = value.split('/').map(Number);
  return numerator / denominator;
};
const cents = (value) => value.endsWith('¢') ? Number(value.slice(0, -1)) : Math.round(Number(value.slice(1)) * 100);

test('six populated lessons have complete cards with one unambiguous answer choice', () => {
  const counts = { division: 100, fractions: 12, 'time-money': 12, french: 26, reading: 9, 'science-plus': 15 };
  assert.deepEqual(new Set(EXTRA_TOPICS.map(({ id }) => id)), new Set(Object.keys(counts)));
  assert.equal(new Set(EXTRA_TOPICS.map(({ id }) => id)).size, EXTRA_TOPICS.length);
  for (const topic of EXTRA_TOPICS) {
    for (const key of ['id', 'title', 'icon', 'description', 'color', 'studyTip']) assert.ok(topic[key].trim(), `${topic.id}: ${key}`);
    assert.equal(byTopic(topic.id).length, counts[topic.id]);
  }
  assert.equal(new Set(EXTRA_CARDS.map(({ id }) => id)).size, EXTRA_CARDS.length);
  for (const card of EXTRA_CARDS) {
    assert.match(card.id, /^[a-z0-9-]+$/);
    assert.ok(Object.hasOwn(counts, card.topic), card.id);
    for (const key of ['question', 'answer', 'hint', 'explanation']) assert.ok(typeof card[key] === 'string' && card[key].trim(), `${card.id}: ${key}`);
    assert.ok(card.study.title.trim() && card.study.text.trim(), card.id);
    assert.equal(card.choices.length, 4, card.id);
    assert.equal(new Set(card.choices).size, 4, card.id);
    assert.ok(card.choices.every((choice) => typeof choice === 'string' && choice.trim()), card.id);
    assert.equal(card.choices.filter((choice) => choice === card.answer).length, 1, card.id);
    if (card.source) {
      assert.ok(card.source.title.trim(), card.id);
      assert.equal(new URL(card.source.url).protocol, 'https:', card.id);
    }
  }
});

test('division covers every inverse multiplication fact from 1 through 10', () => {
  for (let divisor = 1; divisor <= 10; divisor += 1) {
    for (let quotient = 1; quotient <= 10; quotient += 1) {
      const dividend = divisor * quotient;
      const card = byId(`div-${dividend}-by-${divisor}`);
      assert.equal(card.question, `What is ${dividend} ÷ ${divisor}?`);
      assert.equal(Number(card.answer), dividend / divisor);
      assert.deepEqual(card.visual, { type: 'groups', groups: divisor, each: quotient });
      assert.ok(card.choices.every((choice) => Number.isInteger(Number(choice)) && Number(choice) >= 1 && Number(choice) <= 10));
    }
  }
});

test('fraction diagrams, equivalence and comparisons agree with their answers', () => {
  for (const id of ['frac-one-half', 'frac-three-fourths', 'frac-two-fifths', 'frac-whole-fourths']) {
    const { answer, visual } = byId(id);
    assert.equal(fractionValue(answer), visual.numerator / visual.denominator);
  }
  for (const id of ['frac-half-equivalent', 'frac-third-equivalent', 'frac-three-fourths-equivalent', 'frac-two-fifths-equivalent']) {
    const { answer, choices, visual } = byId(id);
    const shown = visual.numerator / visual.denominator;
    assert.equal(fractionValue(answer), shown);
    assert.equal(visual.compareNumerator / visual.compareDenominator, shown);
    assert.equal(choices.filter((choice) => fractionValue(choice) === shown).length, 1);
  }
  for (const id of ['frac-compare-unit', 'frac-compare-sixths']) {
    const { answer, visual } = byId(id);
    assert.ok(visual.numerator / visual.denominator > visual.compareNumerator / visual.compareDenominator);
    assert.equal(fractionValue(answer), visual.numerator / visual.denominator);
  }
  const sorted = byId('frac-order-fourths').answer.split(', ').map(fractionValue);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));
  const remaining = byId('frac-complete-whole');
  assert.equal(fractionValue(remaining.answer), (remaining.visual.denominator - remaining.visual.numerator) / remaining.visual.denominator);
});

test('clock times and Canadian coin arithmetic have correct answers', () => {
  for (const card of byTopic('time-money').filter(({ id }) => ['time-quarter-past-three', 'time-half-past-seven', 'time-quarter-to-ten'].includes(id))) {
    const { hour, minute } = card.visual;
    assert.equal(card.answer, `${hour}:${String(minute).padStart(2, '0')}`);
  }
  assert.equal(byId('time-add-thirty').answer, '2:50 p.m.');
  assert.equal(byId('time-cross-hour').answer, '11:15 a.m.');
  assert.equal(byId('time-elapsed-forty').answer, '40 minutes');
  for (const card of byTopic('time-money').filter(({ visual }) => visual?.type === 'coins')) {
    assert.equal(cents(card.answer), card.visual.values.reduce((sum, value) => sum + value, 0), card.id);
  }
  assert.equal(cents(byId('money-change-seventy-five').answer), 200 - 125);
  assert.equal(cents(byId('money-two-prices').answer), 50 + 225);
  assert.equal(cents(byId('money-change-one-sixty').answer), 500 - 340);
});

test('French covers five vocabulary groups and keeps accents and optional speech', () => {
  const translations = {
    bonjour: ['Bonjour', 'Hello'], merci: ['Merci', 'Thank you'], 'au-revoir': ['Au revoir', 'Goodbye'], 'sil-vous-plait': ['S’il vous plaît', 'Please'],
    rouge: ['rouge', 'Red'], bleu: ['bleu', 'Blue'], vert: ['vert', 'Green'], jaune: ['jaune', 'Yellow'],
    un: ['un', 'One'], deux: ['deux', 'Two'], trois: ['trois', 'Three'], quatre: ['quatre', 'Four'], cinq: ['cinq', 'Five'],
    six: ['six', 'Six'], sept: ['sept', 'Seven'], huit: ['huit', 'Eight'], neuf: ['neuf', 'Nine'], dix: ['dix', 'Ten'],
    chat: ['un chat', 'A cat'], chien: ['un chien', 'A dog'], poisson: ['un poisson', 'A fish'], oiseau: ['un oiseau', 'A bird'],
    livre: ['un livre', 'A book'], crayon: ['un crayon', 'A pencil'], chaise: ['une chaise', 'A chair'], ecole: ['une école', 'A school'],
  };
  for (const [id, [word, meaning]] of Object.entries(translations)) {
    const card = byId(`fr-${id}`);
    assert.equal(card.answer, meaning);
    assert.equal(card.study.title, word);
    assert.deepEqual(card.speech, { text: word, lang: 'fr-CA' });
    assert.ok(typeof card.picture === 'string' && card.picture.trim(), id);
    assert.equal(new URL(card.source.url).hostname, 'www.larousse.fr');
  }
  assert.ok(byTopic('french').every((card) => card.picture && card.speech && card.source));
  assert.ok(EXTRA_CARDS.filter(({ topic }) => topic !== 'french').every((card) => !card.speech));
});

test('French study pictures include the complete counting sequence and distinct colours', () => {
  const numbers = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
  const pictures = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  assert.deepEqual(numbers.map((id) => byId(`fr-${id}`).picture), pictures);
  assert.deepEqual(['rouge', 'bleu', 'vert', 'jaune'].map((id) => byId(`fr-${id}`).picture), ['🔴', '🔵', '🟢', '🟡']);
  assert.match(byId('fr-neuf').question, /When counting/);
});

test('reading offers three original passages with three distinct questions each', () => {
  const passages = [...new Set(byTopic('reading').map(({ passage }) => passage))];
  assert.equal(passages.length, 3);
  for (const passage of passages) {
    const words = passage.split(/\s+/).length;
    assert.ok(words >= 60 && words <= 120);
    const questions = byTopic('reading').filter((card) => card.passage === passage);
    assert.equal(questions.length, 3);
    assert.equal(new Set(questions.map(({ question }) => question)).size, 3);
    assert.ok(questions.every(({ study }) => study.text === passage));
  }
  assert.equal(byId('read-garden-same').answer, 'The amount of water');
  assert.equal(byId('read-library-return').answer, 'The different book about space');
  assert.ok(EXTRA_CARDS.filter(({ topic }) => topic !== 'reading').every((card) => !card.passage));
});

test('science lessons include each promised area with named primary sources', () => {
  const keyAnswers = {
    'sci-producer': 'Grass', 'sci-consumer': 'Consumer', 'sci-decomposer': 'Break down dead plants and animals',
    'sci-habitat-needs': 'Food, water, shelter, and space', 'sci-shadow': 'It blocks the light',
    'sci-reflection': 'It bounces off the mirror', 'sci-lens': 'Bend the light', 'sci-sound-vibration': 'Vibrations',
    'sci-eardrum': 'Eardrum', 'sci-igneous': 'Igneous rock', 'sci-sedimentary': 'Sedimentary rock',
    'sci-metamorphic': 'Metamorphic rock', 'sci-mineral-quartz': 'Quartz',
  };
  for (const [id, expected] of Object.entries(keyAnswers)) assert.equal(byId(id).answer, expected);
  for (const card of byTopic('science-plus')) {
    assert.ok(card.source, card.id);
    assert.match(new URL(card.source.url).hostname, /(^|\.)(nps\.gov|nasa\.gov|usgs\.gov|nidcd\.nih\.gov|exploratorium\.edu)$/);
  }
  assert.match(byId('sci-metamorphic').question, /without melting/);
});

test('every optional visual fits the supported renderer schema', () => {
  for (const { id, visual } of EXTRA_CARDS.filter((card) => card.visual)) {
    assert.ok(['fraction', 'groups', 'clock', 'coins', 'foodchain'].includes(visual.type), id);
    if (visual.type === 'fraction') {
      for (const [numerator, denominator] of [[visual.numerator, visual.denominator], ...(visual.compareDenominator ? [[visual.compareNumerator, visual.compareDenominator]] : [])]) {
        assert.ok(Number.isInteger(numerator) && Number.isInteger(denominator));
        assert.ok(denominator >= 1 && denominator <= 10 && numerator >= 0 && numerator <= denominator);
      }
    }
    if (visual.type === 'groups') assert.ok(visual.groups >= 1 && visual.groups <= 10 && visual.each >= 1 && visual.each <= 10);
    if (visual.type === 'clock') assert.ok(Number.isInteger(visual.hour) && visual.hour >= 1 && visual.hour <= 12 && Number.isInteger(visual.minute) && visual.minute >= 0 && visual.minute < 60);
    if (visual.type === 'coins') assert.ok(visual.values.length && visual.values.every((value) => [5, 10, 25, 50, 100, 200].includes(value)));
    if (visual.type === 'foodchain') assert.ok(visual.items.length >= 2 && visual.items.every((item) => typeof item === 'string' && item.trim()));
  }
});
