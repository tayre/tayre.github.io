import test from 'node:test';
import assert from 'node:assert/strict';
import { getMemoryStrategy } from './memory-strategies.js';

// A small arithmetic reader keeps the teaching equations testable without eval.
function evaluate(expression) {
  const tokens = expression.match(/\d+|[()+×÷−]/g) || [];
  assert.equal(tokens.join(''), expression.replace(/\s/g, ''));
  for (const token of tokens.filter((value) => /^\d+$/.test(value))) {
    assert.ok(Number(token) >= 1 && Number(token) <= 100, expression);
  }
  let position = 0;
  const bounded = (value) => {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 100, expression);
    return value;
  };
  const primary = () => {
    if (tokens[position] === '(') {
      position += 1;
      const value = sum();
      assert.equal(tokens[position++], ')', expression);
      return value;
    }
    assert.match(tokens[position] || '', /^\d+$/, expression);
    return Number(tokens[position++]);
  };
  const product = () => {
    let value = primary();
    while (tokens[position] === '×' || tokens[position] === '÷') {
      const operator = tokens[position++];
      const right = primary();
      value = bounded(operator === '×' ? value * right : value / right);
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (tokens[position] === '+' || tokens[position] === '−') {
      const operator = tokens[position++];
      const right = product();
      value = bounded(operator === '+' ? value + right : value - right);
    }
    return value;
  };
  const result = sum();
  assert.equal(position, tokens.length, expression);
  return result;
}

test('every fact has a short strategy and a numerically correct concrete equation', () => {
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const strategy = getMemoryStrategy(a, b);
      assert.ok(strategy.title.trim());
      assert.ok(strategy.summary.trim());
      assert.ok(strategy.steps.length >= 1 && strategy.steps.length <= 3);
      assert.ok(strategy.steps.every((step) => typeof step === 'string' && step.trim() && step.length <= 100));
      const sides = strategy.equation.split('=');
      assert.equal(sides.length, 2, strategy.equation);
      assert.equal(evaluate(sides[0]), a * b, strategy.equation);
      assert.equal(evaluate(sides[1]), a * b, strategy.equation);
      assert.equal(strategy.flip, `${b} × ${a} = ${a * b}`);
    }
  }
});

test('colored groups always partition a rows of b with no negative or empty chunks', () => {
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const { groups } = getMemoryStrategy(a, b);
      assert.ok(groups.length >= 1 && groups.length <= 2);
      assert.equal(groups.reduce((total, group) => total + group.rows, 0), a);
      assert.equal(groups.reduce((total, group) => total + group.rows * group.columns, 0), a * b);
      for (const group of groups) {
        assert.ok(Number.isInteger(group.rows) && group.rows >= 1 && group.rows <= 10);
        assert.equal(group.columns, b);
        assert.ok(group.label.trim());
      }
    }
  }
});

test('timed-hint summaries give the strategy without printing the numerical answer', () => {
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const { summary } = getMemoryStrategy(a, b);
      assert.ok(!new RegExp(`\\b${a * b}\\b`).test(summary), `${a} × ${b}: ${summary}`);
      assert.ok(!summary.includes('='), summary);
    }
  }
});

test('nines explain subtraction while picturing only the nine rows that remain', () => {
  const strategy = getMemoryStrategy(9, 7);
  assert.equal(strategy.equation, '10 × 7 − 7 = 63');
  assert.deepEqual(strategy.groups.map(({ rows }) => rows), [5, 4]);
  assert.ok(strategy.steps.some((step) => step.includes('9 rows left')));
});

test('five-table counting reads columns while its picture still contains five rows', () => {
  const counting = getMemoryStrategy(5, 3);
  assert.match(counting.summary, /column/);
  assert.equal(counting.equation, '5 + 5 + 5 = 15');
  assert.equal(counting.groups[0].rows, 5);
  assert.equal(counting.groups[0].columns, 3);
  assert.equal(getMemoryStrategy(5, 7).equation, '10 × 7 ÷ 2 = 35');
});

test('invalid operands are rejected and returned strategies do not share mutable arrays', () => {
  for (const invalid of [0, 11, -1, 1.5, NaN, Infinity, '2', null, undefined]) {
    assert.throws(() => getMemoryStrategy(invalid, 3), RangeError);
    assert.throws(() => getMemoryStrategy(3, invalid), RangeError);
  }
  const changed = getMemoryStrategy(4, 6);
  changed.groups[0].rows = 10;
  changed.steps.push('Changed');
  const fresh = getMemoryStrategy(4, 6);
  assert.equal(fresh.groups[0].rows, 2);
  assert.equal(fresh.steps.length, 2);
});
