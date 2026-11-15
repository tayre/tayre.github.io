// Synthetic UI test data only. Never a fallback or production data source.
export function fixture(runs = 3) {
  const history = Array.from({ length: runs }, (_, i) => ({
    run: i + 1, run_id: `synthetic-ui-test-${i + 1}`,
    started_at: new Date(Date.UTC(2026, 8, 1 + i, 6, 23)).toISOString(),
    trees: (i + 1) * 10, verified_graceful: (i + 1) * 10 - 2, unknown: 2,
    solver_infeasible: 0, errors: 0, new_trees: 10, new_verified: i ? 10 : 8,
    attempts: (i + 1) * 15, unrestricted_attempts: (i + 1) * 10,
    restricted_attempts: (i + 1) * 5, timeout_attempts: (i + 1) * 2,
    run_attempts: 15, restricted_solver_infeasible: i + 1, stop_reason: 'compute_budget',
  }));
  const last = history.at(-1);
  const counts = { trees: last.trees, verified_graceful: last.verified_graceful, unknown: 2, solver_infeasible: 0, errors: 0 };
  return {
    schema_version: 1, source: 'github-actions', repository: 'tayre/tayre.github.io', campaign: 'nightly-v1',
    run_id: last.run_id, source_commit: 'a'.repeat(40), started_at: last.started_at,
    finished_at: new Date(Date.parse(last.started_at) + 120000).toISOString(), elapsed_seconds: 120,
    stop_reason: 'compute_budget', basis: 'Synthetic UI test counts only.',
    workflow: { run_id: 123, attempt: 1, url: 'https://github.com/tayre/tayre.github.io/actions/runs/123', artifact_url: 'https://github.com/tayre/tayre.github.io/actions/runs/123/artifacts/456' },
    config: { seed: 1, budget_seconds: 120, exhaustive_sizes: [1, 2], sample_sizes: [35, 75], families: ['prufer'] },
    versions: { networkx: '3.5', ortools: '9.14.6206' },
    audit: { passed: true, certificates_checked: 13, cumulative_labelings_checked: 13 * runs, infeasibility_proofs_checked: 0 },
    certificate_verified_infeasible: 0, cumulative: { ...last, runs, catalogued_trees: last.trees },
    current_run: { ...counts, trees: 10, verified_graceful: 8, attempts: 15, unrestricted_attempts: 10, restricted_attempts: 5, timeout_attempts: 2 },
    history, sizes: [{ n: 35, ...counts }], families: [{ family: 'prufer', ...counts }],
    family_sizes: [], coverage: [], findings: [],
    difficult: [{ tree_id: 'b'.repeat(64), attempt_id: 1, n: 35, family: 'prufer', status: 'unknown', timed_out: true, wall_seconds: 5.04, branches: 1592 }],
    suggestions: [{ kind: 'experiment', statement: 'Repeat unresolved inputs with logged seeds.', status: 'Algorithm benchmark; not a mathematical conjecture.', test: 'Match size, model, and CPU, and report censored attempts.' }],
  };
}

export function focusedFixture() {
  const data = fixture();
  const paired = {
    records: 3, complete_pairs: 3, incomplete_pairs: 0,
    both_verified: 1, matching_only: 1, baseline_only: 0, neither_verified: 1,
    status_counts: { baseline: { verified_graceful: 1, unknown: 2 }, matching_first: { verified_graceful: 2, unknown: 1 } },
    fully_solved_times: { pairs: 1, baseline: { total_seconds: 2, median_seconds: 2 }, matching_first: { total_seconds: 0.5, median_seconds: 0.5 } },
  };
  data.focused_studies = {
    pendant: { run_id: data.history[0].run_id, summary: { trees_reviewed: 4, targets: 3, outcomes: { supported: 2, certified_restricted_counterexample: 1, incomplete: 1 } } },
    matching: { run_id: data.history[1].run_id, summary: { pairs_started: 4, pairs_completed: 3, comparison: { ...structuredClone(paired), by_stratum: { matching_rich: structuredClone(paired) } } } },
    residual: { run_id: data.history[2].run_id, summary: { trace_inputs: 3, unknown_trace_inputs: 1, unclassified_snapshots: 2, residuals: 4, completable: 1, impossible_partial: 3, locally_feasible_but_incompatible: 2, congruence_certificates: 2, relaxation_certificates: 4, whole_tree_infeasibility_claims: 0, novelty_claimed: false } },
  };
  return data;
}
