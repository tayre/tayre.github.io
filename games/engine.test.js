import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, CAPITALS, makeGame, chooseAnswer, flipCard, nextTurn } from './engine.js';
import { FACTS } from '../grade4/facts-data.js';
test('picture and counting rounds always offer unique choices including the answer', () => {
  for (const id of GAMES.filter(game => game.grade === 1).map(game => game.id)) {
    for (let n = 0; n < 50; n++) {
      const game = makeGame(id);
      assert.equal(new Set(game.questions.map(q => q.answer)).size, 6);
      for (const q of game.questions) { assert.equal(new Set(q.choices).size, 3); assert.ok(q.choices.includes(q.answer)); }
    }
  }
});
test('retrying never advances a question; correct answers can only complete once', () => {
  const game = makeGame('word-pictures');
  for (let i = 0; i < 6; i++) {
    const q = game.questions[i];
    assert.equal(nextTurn(game), false);
    assert.equal(chooseAnswer(game, q.choices.find(c => c !== q.answer)), 'retry');
    assert.equal(game.index, i);
    assert.equal(chooseAnswer(game, q.answer), 'correct');
    assert.equal(chooseAnswer(game, q.answer), 'ignored');
    assert.equal(nextTurn(game), true);
  }
  assert.equal(game.complete, true); assert.equal(nextTurn(game), false);
});
test('multiplication boards have four unambiguous pairs from tables 1–10', () => {
  for (let n = 0; n < 100; n++) {
    const game = makeGame('multiplication-pairs');
    assert.equal(game.cards.length, 8); assert.equal(new Set(game.cards.map(c => c.text)).size, 8);
    for (let i = 0; i < 4; i++) {
      const pair = game.cards.filter(c => c.pairId === i);
      const [a, b] = pair.find(c => c.label === 'FACT').text.split(' × ').map(Number);
      assert.ok(a >= 1 && a <= 10 && b >= 1 && b <= 10);
      assert.equal(Number(pair.find(c => c.label === 'ANSWER').text), a * b);
    }
  }
});
test('flipping cannot match a card to itself or reveal a third card', () => {
  const game = makeGame('capital-pairs');
  assert.equal(flipCard(game, 0), 'first'); assert.equal(flipCard(game, 0), 'ignored');
  const different = game.cards.findIndex(c => c.pairId !== game.cards[0].pairId);
  assert.equal(flipCard(game, different), 'retry'); assert.equal(flipCard(game, 7), 'ignored');
  assert.equal(game.matched.length, 0); nextTurn(game); assert.deepEqual(game.selected, []);
  for (let pairId = 0; pairId < 4; pairId++) {
    const pair = game.cards.map((c, i) => c.pairId === pairId ? i : -1).filter(i => i >= 0);
    assert.equal(flipCard(game, pair[0]), 'first'); assert.equal(flipCard(game, pair[1]), 'match');
    nextTurn(game); assert.equal(flipCard(game, pair[0]), 'ignored');
  }
  assert.equal(game.complete, true); assert.equal(game.turns, 5);
});
test('province capitals agree with the sourced Grade 4 lessons', () => {
  assert.equal(CAPITALS.length, 10);
  const normalize = s => s.replace(/[’']/g, '').toLowerCase();
  for (const [province, capital] of CAPITALS) {
    const fact = FACTS.find(f => f.region === 'canada-provinces' && f.question.includes(province));
    assert.ok(fact, province); assert.equal(normalize(fact.answer), normalize(capital));
  }
  assert.equal(makeGame('bad-link'), null);
});
