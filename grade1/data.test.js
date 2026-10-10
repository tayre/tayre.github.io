import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, CARDS, WORD_PACKS } from './data.js';

test('all cards have unique stable IDs, valid topics, and readable content', () => {
  assert.deepEqual(TOPICS.map(({ id }) => id), ['alphabet', 'words', 'numbers']);
  assert.equal(CARDS.length, 156);
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

test('three word packs cover thirty distinct common words with short examples', () => {
  const words = CARDS.filter(({ topic }) => topic === 'words');
  assert.equal(words.length, 30);
  assert.equal(WORD_PACKS.length, 3);
  assert.equal(new Set(WORD_PACKS.map(({ id }) => id)).size, 3);
  const assigned = WORD_PACKS.flatMap(({ ids }) => ids);
  assert.equal(assigned.length, 30);
  assert.equal(new Set(assigned).size, 30);
  assert.deepEqual(new Set(assigned), new Set(words.map(({ id }) => id)));
  for (const pack of WORD_PACKS) assert.equal(pack.ids.length, 10);
  for (const card of words) {
    assert.ok(card.back.split(/\s+/).length <= 6);
    assert.match(card.back, new RegExp(`\\b${card.front}\\b`, 'i'));
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
