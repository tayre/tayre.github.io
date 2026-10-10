import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFielder, fieldingNotation, fieldingDescription } from './positions.js';
import { newGame, derive, validateEvent } from './engine.js';

test('position names build a groundout sequence that records in the scorecard', () => {
  let selected = selectFielder([], 6, 'sequence');
  selected = selectFielder(selected, 3, 'sequence');
  assert.equal(fieldingDescription(selected), 'Shortstop → First base');
  const event = { kind: 'plate', code: fieldingNotation(selected, 'sequence'), moves: [{ from: 'batter', to: 0 }] };
  const game = newGame();
  assert.equal(validateEvent(derive(game), event), '');
  game.events.push(event);
  assert.equal(derive(game).appearances[0].code, '6-3');
  assert.equal(derive(game).outs, 1);
});

test('single-fielder modes replace the selection instead of appending', () => {
  assert.equal(fieldingNotation(selectFielder([8], 7, 'fly'), 'fly'), 'F7');
  assert.equal(fieldingNotation(selectFielder([6], 5, 'error'), 'error'), 'E5');
});

test('unassisted outs and double plays retain standard notation', () => {
  assert.equal(fieldingNotation([3], 'sequence'), '3U');
  assert.equal(fieldingNotation([6, 4, 3], 'double'), '6-4-3 DP');
  assert.equal(fieldingNotation([3], 'double'), '3U DP');
});

test('empty selection, invalid positions, and double taps cannot produce a bogus sequence', () => {
  assert.equal(fieldingNotation([], 'sequence'), '');
  assert.deepEqual(selectFielder([6], 6, 'sequence'), [6]);
  assert.deepEqual(selectFielder([6], 10, 'sequence'), [6]);
});

test('return throws remain possible and undo returns the previous notation', () => {
  const selected = selectFielder([1, 3], 1, 'sequence');
  assert.equal(fieldingNotation(selected, 'sequence'), '1-3-1');
  assert.equal(fieldingNotation(selected.slice(0, -1), 'sequence'), '1-3');
});
