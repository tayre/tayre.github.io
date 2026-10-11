import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, CARDS, WORD_PACKS, WORD_GROUPS } from './data.js';

test('all cards have unique stable IDs, valid topics, and readable content', () => {
  assert.deepEqual(TOPICS.map(({ id }) => id), ['alphabet', 'words', 'numbers']);
  assert.equal(CARDS.length, 244);
  assert.equal(new Set(CARDS.map(({ id }) => id)).size, CARDS.length);
  for (const card of CARDS) {
    assert.ok(TOPICS.some(({ id }) => id === card.topic));
    assert.match(card.id, /^[a-z]+-[a-z0-9]+$/);
    for (const field of ['front', 'back', 'example', 'speech']) {
      assert.equal(typeof card[field], 'string');
      assert.ok(card[field].trim().length > 0);
    }
  }
});

test('the alphabet has every upper and lower case pair with letter-name speech', () => {
  const cards = CARDS.filter(({ topic }) => topic === 'alphabet');
  assert.equal(cards.length, 26);
  assert.deepEqual(cards.map(({ front }) => front), [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `${letter} ${letter.toLowerCase()}`));
  for (const card of cards) {
    const letter = card.front[0];
    assert.equal(card.id, `letter-${letter.toLowerCase()}`);
    assert.ok(card.back.startsWith(`${letter} is for `));
    assert.ok(card.speech.includes(`the letter ${letter}.`));
    assert.ok(card.speech.includes(card.example));
    assert.ok(card.picture.length > 0);
  }
});

test('school categories match the supplied worksheets in reading order', () => {
  const expected = [
    ['short-words', 'I a at am an as it in if on up us has can ran had big did his him sit six not got hot run but cut red get yes let ten yet and'],
    ['doubling', 'all will call fall off well tell'],
    ['open-syllables', 'go no so we be he me she'],
    ['digraphs', 'she wish much three with that this then them both thank think those these when which why white sing know going'],
    ['blends', 'jump went must stop best cold help just its fast'],
    ['bossy-e', 'make came ate made gave take like ride white five live write those use these here'],
    ['heart-words', 'do to as said the was for is of are from look book your want go no so goes says she we he they there their were talk walk wash where what'],
  ];
  assert.equal(WORD_GROUPS.length, 7);
  for (const [id, words] of expected) assert.deepEqual(WORD_GROUPS.find(group => group.id === id)?.words, words.split(' '));
  const expectedWords = new Set(expected.flatMap(([, words]) => words.split(' ')));
  assert.equal(expectedWords.size, 118);
  assert.deepEqual(new Set(CARDS.filter(card => card.topic === 'words').map(card => card.front)), expectedWords);
});

test('small packs retain category order and share stable cards for repeated words', () => {
  const words = CARDS.filter(({ topic }) => topic === 'words');
  assert.equal(words.length, 118);
  assert.equal(WORD_PACKS.length, 16);
  assert.equal(new Set(WORD_PACKS.map(({ id }) => id)).size, WORD_PACKS.length);
  assert.deepEqual(new Set(WORD_PACKS.flatMap(({ ids }) => ids)), new Set(words.map(({ id }) => id)));
  for (const group of WORD_GROUPS) assert.deepEqual(WORD_PACKS.filter(pack => pack.groupId === group.id).flatMap(pack => pack.ids), group.words.map(word => `word-${word.toLowerCase()}`));
  for (const pack of WORD_PACKS) {
    assert.ok(pack.ids.length >= 5 && pack.ids.length <= 10);
    assert.equal(new Set(pack.ids).size, pack.ids.length);
  }
  assert.equal(words.filter(card => card.id === 'word-she').length, 1);
  for (const card of words) {
    assert.ok(card.back.split(/\s+/).length <= 7);
    assert.ok(card.back.toLowerCase().split(/[^a-z]+/).includes(card.front.toLowerCase()), card.id);
    assert.equal(card.back, card.example);
    assert.equal(card.speech, card.front);
  }
});

test('numbers cover 1 through 100 with correct names, hyphens, and place-value grammar', () => {
  const numbers = CARDS.filter(({ topic }) => topic === 'numbers');
  assert.equal(numbers.length, 100);
  assert.deepEqual(numbers.map(({ number }) => number), Array.from({ length: 100 }, (_, index) => index + 1));
  const find = (number) => numbers.find((card) => card.number === number);
  for (const [number, name] of [[1, 'one'], [8, 'eight'], [11, 'eleven'], [12, 'twelve'], [13, 'thirteen'], [15, 'fifteen'], [18, 'eighteen'], [20, 'twenty'], [21, 'twenty-one'], [30, 'thirty'], [40, 'forty'], [42, 'forty-two'], [50, 'fifty'], [60, 'sixty'], [70, 'seventy'], [80, 'eighty'], [90, 'ninety'], [99, 'ninety-nine'], [100, 'one hundred']]) {
    assert.equal(find(number).back, name);
    assert.equal(find(number).speech, name);
  }
  for (const card of numbers) {
    assert.equal(card.front, String(card.number));
    assert.equal(card.id, `number-${card.number}`);
    if (card.number > 20 && card.number < 100 && card.number % 10 !== 0) assert.match(card.back, /^[a-z]+-[a-z]+$/);
    else assert.ok(!card.back.includes('-'));
  }
  assert.equal(find(1).example, '1 one');
  assert.equal(find(2).example, '2 ones');
  assert.equal(find(10).example, '1 ten and 0 ones');
  assert.equal(find(11).example, '1 ten and 1 one');
  assert.equal(find(21).example, '2 tens and 1 one');
  assert.equal(find(23).example, '2 tens and 3 ones');
  assert.equal(find(100).example, '1 hundred');
});
