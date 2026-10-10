import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_AT_MS, REVEAL_AT_MS, FULL_REVEAL_AT_MS, getPacing } from './pacing.js';

test('hint and reveal stages activate exactly at their thresholds', () => {
  assert.equal(HINT_AT_MS, 5000);
  assert.equal(REVEAL_AT_MS, 10000);
  assert.equal(FULL_REVEAL_AT_MS, 15000);
  assert.deepEqual(getPacing(0), { hintDue: false, answerDue: false, answerOpacity: 0, fullyRevealed: false, points: 100 });
  assert.equal(getPacing(HINT_AT_MS - 1).hintDue, false);
  assert.equal(getPacing(HINT_AT_MS).hintDue, true);
  assert.equal(getPacing(HINT_AT_MS).points, 60);
  assert.equal(getPacing(REVEAL_AT_MS - 1).answerDue, false);
  assert.deepEqual(getPacing(REVEAL_AT_MS), { hintDue: true, answerDue: true, answerOpacity: 0, fullyRevealed: false, points: 40 });
  assert.equal(getPacing(FULL_REVEAL_AT_MS - 1).fullyRevealed, false);
  assert.deepEqual(getPacing(FULL_REVEAL_AT_MS), { hintDue: true, answerDue: true, answerOpacity: 1, fullyRevealed: true, points: 20 });
});

test('the answer fades in linearly and stops fully visible', () => {
  assert.equal(getPacing(9999).answerOpacity, 0);
  assert.equal(getPacing(11250).answerOpacity, 0.25);
  assert.equal(getPacing(12500).answerOpacity, 0.5);
  assert.equal(getPacing(13750).answerOpacity, 0.75);
  assert.equal(getPacing(15001).answerOpacity, 1);
  assert.equal(getPacing(Number.MAX_VALUE).answerOpacity, 1);
});

test('points drop with time, remain whole numbers, and settle at 20', () => {
  assert.equal(getPacing(1).points, 100);
  assert.equal(getPacing(1500).points, 100);
  assert.equal(getPacing(2000).points, 100);
  assert.equal(getPacing(2162).points, 100);
  assert.equal(getPacing(2163).points, 99);
  assert.equal(getPacing(3300).points, 92);
  assert.equal(getPacing(14250).points, 25);
  assert.equal(getPacing(60000).points, 20);
  for (const options of [{}, { hintUsed: true }, { misses: 1 }, { misses: 3 }, { answerRevealed: true }]) {
    let previous = 100;
    for (let elapsed = 0; elapsed <= 20000; elapsed += 1) {
      const { points } = getPacing(elapsed, options);
      assert.ok(Number.isInteger(points));
      assert.ok(points <= previous);
      assert.ok(points >= 10 && points <= 100);
      previous = points;
    }
  }
});

test('manual help applies its cap immediately without changing timer stages', () => {
  assert.equal(getPacing(0, { hintUsed: true }).points, 60);
  assert.equal(getPacing(0, { answerRevealed: true }).points, 20);
  assert.equal(getPacing(0, { hintUsed: true, answerRevealed: true }).points, 20);
  assert.equal(getPacing(11000, { hintUsed: true }).points, 40);
  assert.deepEqual(getPacing(0, { answerRevealed: true }), { hintDue: false, answerDue: false, answerOpacity: 0, fullyRevealed: false, points: 20 });
});

test('wrong attempts deduct points after help caps, with a minimum of 10', () => {
  assert.equal(getPacing(0, { misses: 1 }).points, 80);
  assert.equal(getPacing(0, { misses: 2 }).points, 60);
  assert.equal(getPacing(0, { hintUsed: true, misses: 1 }).points, 40);
  assert.equal(getPacing(10000, { misses: 1 }).points, 20);
  assert.equal(getPacing(0, { answerRevealed: true, misses: 1 }).points, 10);
  assert.equal(getPacing(0, { misses: 999999 }).points, 10);
  assert.equal(getPacing(15000, { misses: 1 }).points, 10);
});

test('malformed elapsed times and miss counts remain bounded', () => {
  for (const elapsed of [undefined, null, NaN, -1000, -Infinity, '15000', {}, []]) {
    assert.deepEqual(getPacing(elapsed), getPacing(0));
  }
  assert.deepEqual(getPacing(Infinity), getPacing(15000));
  for (const misses of [undefined, null, NaN, -2, -Infinity, '3', {}, []]) {
    assert.equal(getPacing(0, { misses }).points, 100);
  }
  assert.equal(getPacing(0, { misses: 1.9 }).points, 80);
  assert.equal(getPacing(0, { misses: Infinity }).points, 10);
});
