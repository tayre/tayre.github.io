import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLE_LABELS, EXAMPLE_EDGES, complement, validateFeed, freshness, chartGeometry, coverageThrough, historyCSV, focusedStudyRows } from '../data.mjs';
import { fixture, focusedFixture } from './fixtures.mjs';

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

function withRestrictedProofs() {
  const data = fixture();
  data.proof_evidence_schema_version = 1;
  data.proof_counts = { unrestricted_attempts: 0, restricted_attempts: 2, total_attempts: 2 };
  data.audit.infeasibility_proofs_checked = 2;
  return data;
}

test('checked restricted proofs never become unrestricted negative trees', () => {
  const data = validateFeed(withRestrictedProofs());
  assert.equal(data.certificate_verified_infeasible, 0);
  assert.equal(data.proof_counts.restricted_attempts, 2);
});

test('an audited unrestricted proof is displayed separately from restricted proofs', () => {
  const data = withRestrictedProofs();
  data.certificate_verified_infeasible = 1;
  data.proof_counts.unrestricted_attempts = 1;
  data.proof_counts.total_attempts = 3;
  data.audit.infeasibility_proofs_checked = 3;
  for (const row of [data.cumulative, data.current_run, data.history.at(-1), ...data.sizes, ...data.families]) {
    row.unknown = 1; row.solver_infeasible = 1;
  }
  assert.equal(validateFeed(data).certificate_verified_infeasible, 1);
});

for (const [name, mutate] of [
  ['proof total exceeds audit', data => data.proof_counts.total_attempts++],
  ['restricted proof is promoted to a negative tree', data => data.certificate_verified_infeasible++],
  ['proof exceeds excluded restricted attempts', data => data.cumulative.restricted_solver_infeasible = 1],
  ['unknown proof schema', data => data.proof_evidence_schema_version = 2],
  ['fractional proof counts', data => data.proof_counts.restricted_attempts = 1.5],
]) test(`${name} is rejected`, () => {
  const data = withRestrictedProofs(); mutate(data); assert.throws(() => validateFeed(data));
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

test('older feeds and an empty study map retain compatibility without invented outcomes', () => {
  const old = validateFeed(fixture());
  assert.deepEqual(focusedStudyRows(old), []);
  old.focused_studies = {};
  assert.deepEqual(focusedStudyRows(validateFeed(old)), []);
});

test('latest study rows retain separate runs and narrowly scoped negative outcomes', () => {
  const data = validateFeed(focusedFixture());
  const [placement, matching, residual] = focusedStudyRows(data);
  assert.deepEqual([placement.run, matching.run, residual.run], [1, 2, 3]);
  assert.match(placement.outcome, /Verified largest-difference pendant placements: 2/);
  assert.match(placement.outcome, /cases with all pendant placements excluded by checked proofs: 1/);
  assert.match(placement.scope, /not gracefulness of the tree/);
  assert.match(matching.outcome, /3 of 4 paired trials complete/);
  assert.match(matching.outcome, /matching-first only 1; baseline only 0; neither within budget 1/);
  assert.match(matching.timing, /pairs where both succeeded \(n = 1\)/);
  assert.match(matching.timing, /baseline 2.00 s; matching-first 0.50 s/);
  assert.match(matching.scope, /do not establish a general speed advantage/);
  assert.match(residual.outcome, /1 can be completed; 3 cannot be completed with their saved labels/);
  assert.match(residual.outcome, /Unclassified snapshots: 2; unfinished traces: 1/);
  assert.match(residual.scope, /does not exclude a graceful labeling of the whole tree/);
  assert.equal(data.cumulative.solver_infeasible, 0);
  assert.equal(data.certificate_verified_infeasible, 0);
});

test('a study can finish without classified residuals or successful timing pairs', () => {
  const data = focusedFixture();
  data.focused_studies = {
    residual: { run_id: data.run_id, summary: { residuals: 0, completable: 0, impossible_partial: 0, whole_tree_infeasibility_claims: 0, novelty_claimed: false } },
  };
  const [row] = focusedStudyRows(validateFeed(data));
  assert.match(row.outcome, /0 partial labelings checked from 0 search traces/);
  const empty = { records: 0, complete_pairs: 0, incomplete_pairs: 0, both_verified: 0, matching_only: 0, baseline_only: 0, neither_verified: 0, status_counts: { baseline: {}, matching_first: {} }, fully_solved_times: { pairs: 0, baseline: { total_seconds: 0, median_seconds: null }, matching_first: { total_seconds: 0, median_seconds: null } }, by_stratum: {} };
  data.focused_studies = { matching: { run_id: data.run_id, summary: { pairs_started: 1, pairs_completed: 0, comparison: empty } } };
  assert.equal(focusedStudyRows(validateFeed(data))[0].timing, '');
});

for (const [name, mutate] of [
  ['null optional map', data => data.focused_studies = null],
  ['unknown study', data => data.focused_studies.unsupported = {}],
  ['unrecorded study run', data => data.focused_studies.pendant.run_id = 'another-campaign-run'],
  ['HTML in study identity', data => data.focused_studies.pendant.run_id = '<img src=x>'],
  ['placement totals disagree', data => data.focused_studies.pendant.summary.outcomes.supported++],
  ['placement targets exceed cases', data => data.focused_studies.pendant.summary.targets = 5],
  ['placement status invents tree infeasibility', data => data.focused_studies.pendant.summary.outcomes.nongraceful = 0],
  ['matching pairs disagree', data => data.focused_studies.matching.summary.comparison.matching_only++],
  ['matching strata disagree', data => data.focused_studies.matching.summary.comparison.by_stratum = {}],
  ['matching statuses disagree', data => data.focused_studies.matching.summary.comparison.status_counts.baseline.unknown = 0],
  ['matching time is not finite', data => data.focused_studies.matching.summary.comparison.fully_solved_times.baseline.median_seconds = Infinity],
  ['censored observations enter successful timing sample', data => data.focused_studies.matching.summary.comparison.fully_solved_times.pairs = 2],
  ['residual classification totals disagree', data => data.focused_studies.residual.summary.completable++],
  ['residual count is fractional', data => data.focused_studies.residual.summary.unclassified_snapshots = 0.5],
  ['unfinished traces exceed attempted traces', data => data.focused_studies.residual.summary.unknown_trace_inputs = 4],
  ['local incompatibilities exceed impossible partials', data => data.focused_studies.residual.summary.locally_feasible_but_incompatible = 4],
  ['residual claims whole-tree infeasibility', data => data.focused_studies.residual.summary.whole_tree_infeasibility_claims = 1],
  ['residual claims novelty', data => data.focused_studies.residual.summary.novelty_claimed = true],
]) test(`focused evidence rejects ${name}`, () => {
  const data = focusedFixture(); mutate(data); assert.throws(() => validateFeed(data));
});
