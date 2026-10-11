import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVisual } from './extra-visuals.js';

test('fraction bars keep whole sizes and shade the requested equal parts', () => {
  const html = renderVisual({ type: 'fraction', numerator: 1, denominator: 2, compareNumerator: 2, compareDenominator: 4 });
  assert.equal((html.match(/class="filled"/g) || []).length, 3);
  assert.equal((html.match(/<i /g) || []).length, 6);
  assert.match(html, /1 of 2 equal parts shaded/);
  assert.match(html, /2 of 4 equal parts shaded/);
});

test('group diagram shows the stated number of equal groups and dots', () => {
  const html = renderVisual({ type: 'groups', groups: 4, each: 6 });
  assert.equal((html.match(/class="equal-group"/g) || []).length, 4);
  assert.equal((html.match(/<i><\/i>/g) || []).length, 24);
  assert.match(html, /4 equal groups · 24 altogether/);
});

test('clock hands include the hour hand movement as minutes pass', () => {
  const html = renderVisual({ type: 'clock', hour: 3, minute: 30 });
  assert.match(html, /rotate\(105 100 100\)/);
  assert.match(html, /rotate\(180 100 100\)/);
  assert.match(html, /Clock showing 3:30/);
});

test('coin labels preserve cent and dollar values and content is escaped', () => {
  const html = renderVisual({ type: 'coins', values: [200, 100, 25, 10, 5] });
  for (const label of ['$2', '$1', '25¢', '10¢', '5¢']) assert.ok(html.includes(label));
  assert.ok(!renderVisual({ type: 'foodchain', items: ['<script>'] }).includes('<script>'));
});
