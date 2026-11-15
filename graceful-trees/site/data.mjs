// Presentation invariants, not a replacement for the independent evidence audit.
export const FEED_URL = 'https://raw.githubusercontent.com/tayre/tayre.github.io/graceful-progress/campaigns/nightly-v1.json';
export const OUTCOMES = ['verified_graceful', 'unknown', 'solver_infeasible', 'errors'];
export const EXAMPLE_LABELS = [0, 5, 1, 2, 4, 3];
export const EXAMPLE_EDGES = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5]];
export const complement = labels => labels.map(label => labels.length - 1 - label);

function requireThat(condition, message) { if (!condition) throw new Error(message); }
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const seconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const STUDIES = ['pendant', 'matching', 'residual'];
const MATCHING_STRATA = ['natural_prufer', 'natural_recursive', 'natural_lobster', 'matching_rich', 'no_matching_control'];
const PAIR_COUNTS = ['records', 'complete_pairs', 'incomplete_pairs', 'both_verified', 'matching_only', 'baseline_only', 'neither_verified'];
const PLACEMENT_OUTCOMES = ['supported', 'certified_restricted_counterexample', 'ordinary_witness_required', 'uncertified', 'incomplete', 'outside_scope', 'integrity_error'];

function matchingCounts(row, includeStrata = true) {
  requireThat(object(row) && PAIR_COUNTS.every(key => integer(row[key])), 'Invalid focused matching counts');
  requireThat(row.records === row.complete_pairs + row.incomplete_pairs && row.complete_pairs === row.both_verified + row.matching_only + row.baseline_only + row.neither_verified, 'Focused matching pairs disagree');
  requireThat(object(row.status_counts), 'Missing focused matching statuses');
  for (const variant of ['baseline', 'matching_first']) {
    const status = row.status_counts[variant];
    requireThat(object(status) && Object.entries(status).every(([key, value]) => ['verified_graceful', 'unknown'].includes(key) && integer(value)), 'Invalid focused matching status');
    const positive = row.both_verified + row[variant === 'baseline' ? 'baseline_only' : 'matching_only'];
    const unresolved = row.complete_pairs - positive;
    requireThat((status.verified_graceful ?? 0) >= positive && (status.verified_graceful ?? 0) <= positive + row.incomplete_pairs && (status.unknown ?? 0) >= unresolved && (status.unknown ?? 0) <= unresolved + row.incomplete_pairs && Object.values(status).reduce((sum, count) => sum + count, 0) <= row.records, 'Focused matching statuses disagree with paired outcomes');
  }
  const times = row.fully_solved_times;
  requireThat(object(times) && integer(times.pairs) && times.pairs <= row.both_verified, 'Invalid focused timing sample');
  for (const variant of ['baseline', 'matching_first']) {
    const timing = times[variant];
    requireThat(object(timing) && seconds(timing.total_seconds) && (times.pairs === 0 ? timing.total_seconds === 0 && timing.median_seconds === null : seconds(timing.median_seconds) && timing.median_seconds <= timing.total_seconds), 'Invalid focused matching time');
  }
  if (includeStrata) {
    requireThat(object(row.by_stratum) && Object.keys(row.by_stratum).every(key => MATCHING_STRATA.includes(key)), 'Invalid focused matching strata');
    Object.values(row.by_stratum).forEach(stratum => matchingCounts(stratum, false));
    for (const key of PAIR_COUNTS) requireThat(Object.values(row.by_stratum).reduce((sum, stratum) => sum + stratum[key], 0) === row[key], 'Focused strata and paired totals disagree');
  }
}

function validateFocusedStudies(studies, runIds) {
  requireThat(object(studies) && Object.keys(studies).every(key => STUDIES.includes(key)), 'Invalid focused studies');
  for (const [study, entry] of Object.entries(studies)) {
    requireThat(object(entry) && typeof entry.run_id === 'string' && runIds.has(entry.run_id) && object(entry.summary), 'Invalid focused study run or summary');
    const row = entry.summary;
    if (study === 'pendant') {
      requireThat(integer(row.trees_reviewed) && integer(row.targets) && row.targets <= row.trees_reviewed && object(row.outcomes), 'Invalid focused placement counts');
      requireThat(Object.entries(row.outcomes).every(([key, value]) => PLACEMENT_OUTCOMES.includes(key) && integer(value)) && Object.values(row.outcomes).reduce((sum, value) => sum + value, 0) === row.trees_reviewed, 'Focused placement outcomes disagree');
    } else if (study === 'matching') {
      requireThat(integer(row.pairs_started) && integer(row.pairs_completed) && row.pairs_completed <= row.pairs_started, 'Invalid focused matching sample');
      matchingCounts(row.comparison);
      requireThat(row.comparison.complete_pairs === row.pairs_completed && row.comparison.records <= row.pairs_started, 'Focused comparison and sample disagree');
    } else {
      const keys = ['trace_inputs', 'unknown_trace_inputs', 'unclassified_snapshots', 'residuals', 'completable', 'impossible_partial', 'locally_feasible_but_incompatible', 'congruence_certificates', 'relaxation_certificates', 'whole_tree_infeasibility_claims'];
      requireThat(integer(row.residuals) && keys.every(key => !(key in row) || integer(row[key])), 'Invalid focused residual counts');
      requireThat((row.unknown_trace_inputs ?? 0) <= (row.trace_inputs ?? 0), 'Focused residual trace counts disagree');
      if ('completable' in row || 'impossible_partial' in row) requireThat(integer(row.completable) && integer(row.impossible_partial) && row.completable + row.impossible_partial === row.residuals, 'Focused residual classifications disagree');
      if ('locally_feasible_but_incompatible' in row) requireThat(row.locally_feasible_but_incompatible <= row.impossible_partial, 'Focused residual incompatibilities exceed failures');
      if ('congruence_certificates' in row) requireThat(row.congruence_certificates <= row.impossible_partial, 'Focused residual congruences exceed failures');
      requireThat((row.whole_tree_infeasibility_claims ?? 0) === 0 && (!('novelty_claimed' in row) || row.novelty_claimed === false), 'Unsupported focused residual claim');
    }
  }
}

function counts(row) {
  requireThat(row && integer(row.trees) && OUTCOMES.every(key => integer(row[key])), 'Missing or invalid tree counts');
  requireThat(OUTCOMES.reduce((sum, key) => sum + row[key], 0) === row.trees, 'Outcomes must partition distinct trees');
}

export function validateFeed(data) {
  requireThat(data?.schema_version === 1 && data.source === 'github-actions', 'Unsupported source');
  requireThat(data.repository === 'tayre/tayre.github.io' && data.campaign === 'nightly-v1', 'Unexpected campaign');
  requireThat(data.audit?.passed === true, 'Unsupported audit or proof claim');
  if (data.proof_evidence_schema_version === 1) {
    const p = data.proof_counts;
    requireThat(p && ['unrestricted_attempts', 'restricted_attempts', 'total_attempts'].every(key => integer(p[key])) && integer(data.certificate_verified_infeasible), 'Invalid proof counts');
    requireThat(p.total_attempts === p.unrestricted_attempts + p.restricted_attempts && p.total_attempts === data.audit.infeasibility_proofs_checked, 'Proof counts disagree with audit');
    requireThat(data.certificate_verified_infeasible <= data.cumulative?.solver_infeasible && data.certificate_verified_infeasible <= p.unrestricted_attempts && (p.unrestricted_attempts === 0) === (data.certificate_verified_infeasible === 0) && p.unrestricted_attempts <= data.cumulative?.unrestricted_attempts && p.restricted_attempts <= data.cumulative?.restricted_solver_infeasible, 'Proof scopes disagree');
  } else {
    requireThat(data.proof_evidence_schema_version == null && data.proof_counts == null && data.certificate_verified_infeasible === 0 && data.audit.infeasibility_proofs_checked === 0, 'Unsupported audit or proof claim');
  }
  requireThat(date(data.started_at) && date(data.finished_at), 'Invalid publication dates');
  requireThat(Date.parse(data.started_at) <= Date.parse(data.finished_at), 'Publication precedes research');
  requireThat(/^[a-f0-9]{40}$/.test(data.source_commit), 'Invalid source revision');
  requireThat(integer(data.workflow?.run_id) && integer(data.workflow.attempt), 'Invalid workflow identity');
  const runUrl = `https://github.com/${data.repository}/actions/runs/${data.workflow.run_id}`;
  const artifactPrefix = `${runUrl}/artifacts/`;
  requireThat(data.workflow.url === runUrl && typeof data.workflow.artifact_url === 'string' && data.workflow.artifact_url.startsWith(artifactPrefix) && /^[0-9]+$/.test(data.workflow.artifact_url.slice(artifactPrefix.length)), 'Invalid evidence links');
  for (const row of [data.cumulative, data.current_run]) {
    counts(row);
    requireThat(['attempts', 'unrestricted_attempts', 'restricted_attempts', 'timeout_attempts'].every(key => integer(row[key])), 'Invalid attempt counts');
    requireThat(row.attempts === row.unrestricted_attempts + row.restricted_attempts && row.timeout_attempts <= row.attempts && row.trees <= row.unrestricted_attempts, 'Attempt counts disagree');
  }
  requireThat(Array.isArray(data.history) && data.history.length > 0 && data.history.length === data.cumulative.runs, 'Invalid run history');
  const ids = new Set();
  for (const [i, row] of data.history.entries()) {
    counts(row);
    requireThat(row.run === i + 1 && date(row.started_at) && typeof row.run_id === 'string' && !ids.has(row.run_id), 'Invalid run identity');
    requireThat(integer(row.new_trees) && integer(row.new_verified), 'Invalid run deltas');
    const previous = data.history[i - 1];
    requireThat(row.trees - (previous?.trees ?? 0) === row.new_trees && row.verified_graceful - (previous?.verified_graceful ?? 0) === row.new_verified, 'History deltas disagree');
    ids.add(row.run_id);
  }
  const last = data.history.at(-1);
  requireThat(last.run_id === data.run_id && ['trees', ...OUTCOMES].every(key => last[key] === data.cumulative[key]), 'History and totals disagree');
  for (const group of ['sizes', 'families']) {
    requireThat(Array.isArray(data[group]), 'Missing coverage');
    data[group].forEach(counts);
    requireThat(data[group].every(row => group === 'sizes' ? integer(row.n) && row.n > 0 : typeof row.family === 'string'), 'Invalid coverage labels');
    for (const key of ['trees', ...OUTCOMES]) requireThat(data[group].reduce((sum, row) => sum + row[key], 0) === data.cumulative[key], 'Coverage and totals disagree');
  }
  for (const group of ['coverage', 'findings', 'suggestions', 'difficult']) requireThat(Array.isArray(data[group]), 'Missing observations');
  requireThat(data.findings.every(row => ['title', 'kind', 'significance', 'next_step'].every(key => typeof row[key] === 'string')), 'Invalid finding text');
  requireThat(data.suggestions.every(row => ['statement', 'kind', 'status', 'test'].every(key => typeof row[key] === 'string')), 'Invalid suggestion text');
  const statuses = ['verified_graceful', 'unknown', 'solver_infeasible', 'error', 'model_invalid', 'invalid_solution', 'integrity_error'];
  requireThat(data.difficult.every(row => /^[a-f0-9]{64}$/.test(row.tree_id) && typeof row.family === 'string' && integer(row.n) && row.n > 0 && integer(row.attempt_id) && statuses.includes(row.status) && (row.wall_seconds == null || Number.isFinite(row.wall_seconds) && row.wall_seconds >= 0) && (row.branches == null || integer(row.branches))), 'Invalid difficult cases');
  requireThat(Number.isFinite(data.elapsed_seconds) && data.elapsed_seconds >= 0 && Number.isFinite(data.config?.budget_seconds) && data.config.budget_seconds > 0, 'Invalid research budget');
  requireThat(integer(data.config.seed) && typeof data.stop_reason === 'string', 'Invalid run configuration');
  requireThat(typeof data.versions?.networkx === 'string' && typeof data.versions?.ortools === 'string', 'Missing software versions');
  if ('focused_studies' in data) validateFocusedStudies(data.focused_studies, ids);
  return data;
}

export function focusedStudyRows(data) {
  const count = value => new Intl.NumberFormat('en').format(value);
  return STUDIES.filter(study => data.focused_studies?.[study]).map(study => {
    const entry = data.focused_studies[study], row = entry.summary;
    const run = data.history.find(item => item.run_id === entry.run_id);
    const result = { study, run_id: entry.run_id, run: run.run, started_at: run.started_at };
    if (study === 'pendant') {
      const outcome = row.outcomes;
      const unfinished = (outcome.incomplete ?? 0) + (outcome.uncertified ?? 0) + (outcome.ordinary_witness_required ?? 0);
      return { ...result, title: 'Pendant-edge placement', outcome: `${count(row.trees_reviewed)} cases reviewed (${count(row.targets)} target cases). Verified largest-difference pendant placements: ${count(outcome.supported ?? 0)}; cases with all pendant placements excluded by checked proofs: ${count(outcome.certified_restricted_counterexample ?? 0)}; unresolved cases: ${count(unfinished)}.${outcome.outside_scope ? ` Outside the selected scope: ${count(outcome.outside_scope)}.` : ''}${outcome.integrity_error ? ` Requiring operational review: ${count(outcome.integrity_error)}.` : ''}`, scope: 'Targets are non-caterpillar lobsters with matching deficiency at least two. Exclusions concern pendant-edge placement, not gracefulness of the tree.' };
    }
    if (study === 'matching') {
      const paired = row.comparison, times = paired.fully_solved_times;
      return { ...result, title: 'Matching-contraction comparison', outcome: `${count(row.pairs_completed)} of ${count(row.pairs_started)} paired trials complete: both routes verified ${count(paired.both_verified)}; matching-first only ${count(paired.matching_only)}; baseline only ${count(paired.baseline_only)}; neither within budget ${count(paired.neither_verified)}.`, timing: times.pairs ? `Median elapsed time among pairs where both succeeded (n = ${count(times.pairs)}): baseline ${times.baseline.median_seconds.toFixed(2)} s; matching-first ${times.matching_first.median_seconds.toFixed(2)} s.` : '', scope: 'Same inputs, seeds and allowances. Unsuccessful trials remain unresolved; these measurements do not establish a general speed advantage.' };
    }
    const classified = 'completable' in row ? ` ${count(row.completable)} can be completed; ${count(row.impossible_partial)} cannot be completed with their saved labels.` : '';
    return { ...result, title: 'Residual obstructions', outcome: `${count(row.residuals)} partial labelings checked from ${count(row.trace_inputs ?? 0)} search traces.${classified}${'locally_feasible_but_incompatible' in row ? ` In ${count(row.locally_feasible_but_incompatible)} failures, every branch has a local option but their resources are incompatible.` : ''} Unclassified snapshots: ${count(row.unclassified_snapshots ?? 0)}; unfinished traces: ${count(row.unknown_trace_inputs ?? 0)}.`, scope: 'Each failure fixes a partial labeling; it does not exclude a graceful labeling of the whole tree.' };
  });
}

export function freshness(finished, now = Date.now()) {
  const age = (now - Date.parse(finished)) / 3600000;
  if (age < -1) return { state: 'stale', label: 'Check the timestamp' };
  return age > 48 ? { state: 'stale', label: 'Snapshot over 48h old' } : { state: 'fresh', label: 'Audited cloud snapshot' };
}

export function chartGeometry(history, range = '30', width = 740) {
  const rows = range === 'all' ? history : history.slice(-30);
  const peak = Math.max(1, ...rows.map(row => row.trees));
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4));
  const step = Math.max(1, [1, 2, 5, 10].map(x => x * magnitude).find(x => x >= peak / 4));
  const top = Math.ceil(peak / step) * step;
  const left = 48, right = width - 18;
  const x = index => rows.length === 1 ? (left + right) / 2 : left + index / (rows.length - 1) * (right - left);
  const y = value => 220 - value / top * 195;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const series = Object.fromEntries(['trees', 'verified_graceful', 'unknown'].map(key => [key,
    rows.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ')
  ]));
  return { rows, top, ticks, x, y, series, width, left, right };
}

export function coverageThrough(coverage) {
  let through = 0;
  for (;;) {
    const row = coverage.find(item => item.n === through + 1);
    if (!row || row.generator_exhausted !== true || !integer(row.enumerated_count) || row.enumerated_count === 0 || row.classes_with_witness !== row.enumerated_count || row.catalogued_classes !== row.enumerated_count) break;
    through++;
  }
  return through;
}

export function historyCSV(history) {
  const keys = ['run', 'run_id', 'started_at', 'trees', 'verified_graceful', 'unknown', 'solver_infeasible', 'errors', 'new_trees', 'new_verified', 'run_attempts', 'timeout_attempts'];
  const cell = value => {
    const raw = String(value ?? '');
    // Defense for future free-text fields when opened by a spreadsheet application.
    return `"${(/^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""')}"`;
  };
  return [keys.join(','), ...history.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}

export const familyName = name => ({ binary_heap: 'Binary heap', double_star: 'Double star', prufer: 'Prüfer random', recursive: 'Recursive random', exhaustive: 'Exhaustive' }[name] ?? String(name).replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()));
