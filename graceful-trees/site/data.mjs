// Presentation invariants, not a replacement for the independent evidence audit.
export const FEED_URL = 'https://raw.githubusercontent.com/tayre/tayre.github.io/graceful-progress/campaigns/nightly-v1.json';
export const OUTCOMES = ['verified_graceful', 'unknown', 'solver_infeasible', 'errors'];
export const EXAMPLE_LABELS = [0, 5, 1, 2, 4, 3];
export const EXAMPLE_EDGES = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5]];
export const complement = labels => labels.map(label => labels.length - 1 - label);

function requireThat(condition, message) { if (!condition) throw new Error(message); }
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function counts(row) {
  requireThat(row && integer(row.trees) && OUTCOMES.every(key => integer(row[key])), 'Missing or invalid tree counts');
  requireThat(OUTCOMES.reduce((sum, key) => sum + row[key], 0) === row.trees, 'Outcomes must partition distinct trees');
}

export function validateFeed(data) {
  requireThat(data?.schema_version === 1 && data.source === 'github-actions', 'Unsupported source');
  requireThat(data.repository === 'tayre/tayre.github.io' && data.campaign === 'nightly-v1', 'Unexpected campaign');
  requireThat(data.audit?.passed === true && data.certificate_verified_infeasible === 0 && data.audit.infeasibility_proofs_checked === 0, 'Unsupported audit or proof claim');
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
  return data;
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
