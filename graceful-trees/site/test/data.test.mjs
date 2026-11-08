import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLE_LABELS, EXAMPLE_EDGES, complement, validateFeed, freshness, chartGeometry, coverageThrough, historyCSV } from '../data.mjs';
import { fixture } from './fixtures.mjs';

test('the illustrated tree and its complement are both graceful', () => {
  for (const labels of [EXAMPLE_LABELS, complement(EXAMPLE_LABELS)]) {
    assert.deepEqual([...labels].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(EXAMPLE_EDGES.map(([a, b]) => Math.abs(labels[a] - labels[b])).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  }
});

test('valid histories preserve unresolved cases separately from negative claims', () => {
  const data = validateFeed(fixture());
  assert.equal(data.cumulative.unknown, 2);
  assert.equal(data.cumulative.solver_infeasible, 0);
  assert.equal(data.certificate_verified_infeasible, 0);
});

for (const [name, mutate] of [
  ['missing total', data => delete data.cumulative.trees],
  ['contradictory counts', data => data.cumulative.verified_graceful++],
  ['failed audit', data => data.audit.passed = false],
  ['unimplemented proof claim', data => data.certificate_verified_infeasible = 1],
  ['wrong campaign', data => data.campaign = 'smoke-v1'],
  ['executable evidence link', data => data.workflow.url = 'javascript:alert(1)'],
  ['lookalike evidence host', data => data.workflow.artifact_url = data.workflow.artifact_url.replace('github.com', 'githubXcom')],
  ['invalid publication time', data => data.finished_at = '2000-01-01T00:00:00Z'],
  ['incomplete finding', data => data.findings.push({ title: 'Missing evidence' })],
  ['missing coverage', data => data.sizes = []],
  ['rewritten run order', data => data.history[0].run = 2],
  ['wrong new tree count', data => data.history[0].new_trees = 200],
  ['repeated run identity', data => data.history[1].run_id = data.history[0].run_id],
]) test(`${name} cannot be presented as a valid cloud result`, () => {
  const data = fixture(); mutate(data); assert.throws(() => validateFeed(data));
});

test('stale and future timestamps are visible, not described as live', () => {
  const time = Date.parse('2026-11-08T00:00:00Z');
  assert.equal(freshness('2026-11-07T06:23:00Z', time).state, 'fresh');
  assert.equal(freshness('2026-11-01T06:23:00Z', time).state, 'stale');
  assert.equal(freshness('2026-12-01T06:23:00Z', time).state, 'stale');
});

test('the chart handles one point, zero trees, and more than thirty runs', () => {
  const many = fixture(45).history;
  const recent = chartGeometry(many);
  assert.equal(recent.rows.length, 30); assert.equal(recent.rows[0].run, 16);
  assert.equal(chartGeometry(many, 'all').rows.length, 45);
  const empty = chartGeometry([{ trees: 0, verified_graceful: 0, unknown: 0 }]);
  assert.ok(empty.x(0) > empty.left && empty.x(0) < empty.right);
  assert.ok(Number.isFinite(empty.y(0)));
  assert.ok(!empty.series.trees.includes('NaN'));
  assert.ok(recent.ticks.every(Number.isInteger));
  const mobile = chartGeometry(many, '30', 284);
  assert.ok(mobile.rows.every((row, i) => mobile.x(i) >= 0 && mobile.x(i) < 284));
  assert.equal(mobile.rows.at(-1).trees, recent.rows.at(-1).trees);
});

test('exhaustive coverage requires every smaller order to be fully verified', () => {
  const rows = [1, 2, 3].map(n => ({ n, generator_exhausted: true, enumerated_count: 1, catalogued_classes: 1, classes_with_witness: 1 }));
  assert.equal(coverageThrough(rows), 3);
  rows[1].generator_exhausted = false;
  assert.equal(coverageThrough(rows), 1);
});

test('CSV exports exact unresolved counts and neutralizes spreadsheet formulas', () => {
  const data = fixture().history;
  data[0].run_id = '=UNTRUSTED()';
  const csv = historyCSV(data);
  assert.ok(csv.includes('unknown,solver_infeasible'));
  assert.ok(csv.includes('"\'=UNTRUSTED()"'));
  assert.equal(csv.trim().split('\r\n').length, 4);
});
