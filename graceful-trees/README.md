# Autonomous graceful tree research

A CPU-only, reproducible research system for the Graceful Tree Conjecture. It finds
and independently verifies positive labeling witnesses, keeps inconclusive searches
unresolved, and carries a cumulative research ledger between nightly GitHub Actions
runs. No LLM, personal API key, or paid compute service is required.

**[Watch the public research dashboard →](https://tayre.github.io/graceful-trees/)**

The project page shows the nightly campaign's cumulative progress, run history,
coverage by family and size, notable review items, and the latest evidence download.
It explains the conjecture and the project's goals, including the limits of numerical
evidence. Data updates automatically after a successful cloud audit. See
[how the public dashboard works](docs/public-dashboard.md) for publication,
maintenance, and browser checks.

The [site index](https://tayre.github.io/) links to this project and the Hellinger
research note.

This is research software, not a proof of the conjecture. Fang's 2010 paper reports
exhaustive verification through 35 vertices; his 2012 author announcement reports
39. Our small exhaustive runs validate the implementation; they do not improve
either bound. Read the [research summary and references](docs/research.md) before
interpreting results. The [deep literature review](docs/research.md#deep-review-and-experiment-priorities)
ranks practical improvements and precisely scoped mathematical experiments,
with established methods separated from unverified research proposals.

The [initial validation record](docs/validation.md) includes actual experiment
counts and downloadable, reproducible run archives.

**Current mathematical result:** an [explicit construction](docs/spider_formula_five.md)
puts zero at either interior position on a symmetric spider with five edges per
leg, for any number of legs. Together with Rofa's known remaining positions,
this gives zero at any chosen vertex. Lean checks the new formula's exact label
and difference permutations for every positive leg count. The literature search
found no matching result, but novelty remains unconfirmed; this does not settle
the general conjecture.

Three [parallel follow-up experiments](docs/validation.md#parallel-follow-up-experiments--8-november-2026)
now test a known perfect-matching construction, prescribed zero labels on symmetric
spiders, and independently checkable parity obstructions for fixed residual
problems. Their results and source snapshots are downloadable; they are separate
from the nightly campaign and carry no claim of a new theorem or speedup.

Selected mathematical safeguards now have [Lean proofs](formal/README.md), checked
in CI with a pinned toolchain and an audit of their assumptions. These cover the
complement symmetry reduction, difference-sum constraint, a restricted negative
control, the local arithmetic of the caterpillar construction, completeness
of the SAT clause schema, necessary bounds used in candidate search, and a fixed
rooted-branch obstruction, plus the arithmetic implication of modular resource
certificates and universal five-edge spider formula certificates.
They do not formalize the whole Python program or prove
the conjecture.

Every run also produces an **offline visual progress report** (`report.html`),
SVG charts, a PNG overview, and audited chart data (`progress.json`). It shows
cumulative progress across resumed runs and clearly distinguishes verified
labelings from unresolved searches and uncertified solver conclusions.

[Download an audited example visual report](examples/visual-progress.zip) and open
`report.html` after extraction. This is a saved local validation campaign, not a
live display of the cloud campaign.

![Example: cumulative research progress and search outcomes](examples/visual-progress.png)

Cloud execution is active in [GitHub Actions](https://github.com/tayre/tayre.github.io/actions/workflows/graceful-research.yml).
The [first hosted research run](https://github.com/tayre/tayre.github.io/actions/runs/42497916313)
completed successfully, including independent auditing and checkpoint/report uploads.
Nightly runs use a 30-minute budget; configuration pushes run a two-minute check.

**Usage review:** Technical activation does not establish GitHub approval of an
ongoing mathematical discovery campaign. Before increasing hosted research runs,
see the [GitHub Actions purpose and usage review](docs/github-actions-usage.md).
Software CI and sustained discovery compute have different purposes.

## Quick start

Use **CPython 3.12.14**, matching the cloud workflow. Python 3.11–3.13 is allowed by
the package, but the checked-in dependency lock and CI are tested on 3.12.

```sh
cd graceful-trees
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install --no-deps --no-build-isolation -e .
python -m pip check
python -m pytest -q

graceful-research run --config configs/smoke.json --output results/smoke
graceful-research audit results/smoke
```

Every run requires a new, empty output directory. Existing evidence is never
overwritten. Continue a campaign by copying its checkpoint into a new run:

```sh
graceful-research run --config configs/nightly.json --output results/night-2 \
  --resume results/night-1/research.sqlite
```

Available configurations:

| Configuration | Purpose |
| --- | --- |
| `smoke.json` | One-minute mixed-family trial; small trees and sampled orders 12 and 20 |
| `exhaustive-small.json` | All 95 non-isomorphic trees of orders 1–9, plus bounded edge probes |
| `nightly.json` | 30-minute budget; oldest unresolved cases first, exact edge-placement probes through order 12, and new samples at orders 20, 35, 50 and 75 |
| `edge-profiles.json` | Small exhaustive inputs with more compute reserved for prescribed maximum-difference edge experiments |
| `sat-certificates.json` | Pure SAT validation through order 7, with scoped, independently checked UNSAT proofs for negative edge controls |
| `leaf-tail.json` | Opt-in exact two-parent leaf completion experiment |
| `swap-search.json` | Opt-in v3/swap portfolio with targeted proposals; main search and scoped SAT controls |

`--budget-seconds`, `--max-cases`, `--seed` and `--backend` override JSON settings. Decreasing the
budget also reduces the finalization reserve to at most 10% of the budget.
Generation settings, the NetworkX version and the master seed must match a restored checkpoint. Change
the campaign and start fresh when changing the generator's input space. Solver
budgets, retry quotas and probe settings may change on resume.

`constructive_search` (default `true`) labels caterpillars directly using a known
construction. For other unrestricted CP-SAT attempts, `frontier_search` (default
`true`) first tries bounded descending-difference witness searches. The default
portfolio uses at most `frontier_max_nodes` (40,000) visited nodes in total, at most
20,000 per method and four starting vertices per method. Both methods share one
wall allowance of 0.1 seconds or 10% of the attempt allowance, whichever is smaller.
It only supplies candidate labelings; an unsuccessful search falls back to the
unchanged exact model with the remaining allowance. SAT and restricted probes skip
this prepass. Nightly runs use CP-SAT for the main search and proof-logging SAT for
restricted probes. Set **both** options to `false` for exact-solver-only comparisons.
These settings may change on resume without resetting the campaign. Each attempt
records its method, seed and work limits. Old saved requests without these options
replay the original exact route.

`frontier_algorithm` selects `bitset-portfolio-v6` by default: try the endpoint-
filtered version of `descending-frontier-v1`, then `memo-frontier-v2` if time and
nodes remain. Filtering skips impossible endpoints while preserving the original
recursive traversal under work limits. On 64 unseen shapes it retained all 55
successes and reduced median complete-route time by about 1.3%; see the
[measurements and limitations](docs/performance.md#endpoint-filtering-and-sibling-orbits).
The second method remembers equivalent failed residual forests, rejects branches
with too few eligible unused labels, and tries central roots first. Both individual
methods and the original `portfolio-frontier-v3` remain selectable; old saved
frontier requests without this field retain v1. The cache stores only fully
explored failures within the heuristic's restricted search,
never a cutoff or a proof about the whole tree. See the
[technique review, correctness arguments and benchmarks](docs/techniques.md).

`leaf-portfolio-v4` is an opt-in experiment that finishes residual leaves attached
to at most two assigned parents using an exact count-and-parity rule. It passed
independent exhaustive checks and has conditional Lean proofs, but regressed on
the fresh-tree benchmark, so it remains experimental. Run
`graceful-research run --config configs/leaf-tail.json --output results/leaf-tail`
or select `leaf-tail` in the manual GitHub workflow. See the
[completion argument, proof boundary and retained negative measurements](docs/leaf-tail.md).
The separate `scripts/experiment_residual_signatures.py --output results/signatures`
experiment constructs exact compatibility tables for branches of at most three
vertices and at most eight remaining vertices, with an independent permutation
oracle. These bounded research tables do not change the nightly search.

`label-swap-v1` searches label permutations; `swap-portfolio-v5` combines v3 with
swaps within the same candidate time allowance. Set `swap_objective` to
`missing_sum` or `missing_count`, and `swap_proposal_policy` to `uniform` or
`missing_difference`. The latter targets a missing difference with probability
3/4 per proposal. Defaults for saved requests are `missing_sum` and `uniform`.
The example below explicitly selects the targeted policy and an 80,000-operation
cap (40,000 v3 nodes plus 40,000 swap proposals):

```sh
graceful-research run --config configs/swap-search.json --output results/swap-search
graceful-research audit results/swap-search
```

Select `swap-search` in the manual GitHub research workflow to run the same
experiment in the cloud. The [swap-search methods and benchmark protocol](docs/techniques.md#label-swapping-and-a-complementary-portfolio)
explain limits, replay and independent verification. See the
[measured comparison and deployment decision](docs/performance.md).

The endpoint filter has a reproducible small campaign in `configs/bitset-search.json`.
`orbit-portfolio-v6` additionally skips interchangeable sibling-subtree choices.
Although mathematically justified, its bookkeeping lost a case near the time limit
in one holdout repetition; it remains opt-in via `configs/orbit-search.json`.
Both `bitset-search` and `orbit-search` are available in the manual GitHub workflow.
Neither optimization changes the exact model or interprets a search cutoff as a
negative result. A separate database optimization preselects eligible retry cases
before decoding their full records; all cumulative audits still run.

The separate mathematical experiment
`python scripts/experiment_rooted_pairings.py --output results/rooted-pairings`
classifies up to four two-vertex branches with fixed parent labels and separate
internal/attachment differences. It checks every result against an independent
permutation oracle. The [results and a concrete obstruction](docs/leaf-tail.md#rooted-two-vertex-branch-experiment)
are scoped to partial assignments, not whole-tree counterexamples. CI runs both
new experiments and uploads their evidence alongside the existing checks.

## Mathematical model and verification

For each vertex `v`, CP-SAT assigns `x[v]` in `0..n-1`. All vertex labels are
different. For each edge `uv`, it assigns `d[uv] = abs(x[u]-x[v])` in `1..n-1`, and
all differences are different. This is precisely the definition for a tree.
The singleton is handled explicitly by the empty edge set.

Two optional, justified reductions are used: the implied difference-sum equation,
and choosing `x[0] < x[1]` from each complement pair. The proof and the scope of
this symmetry reduction are in [research.md](docs/research.md). No arbitrary
root-zero or extreme-edge location restriction is added to the unrestricted exact model.
The solver uses one search worker, a logged seed, and `symmetry_level=0`.
The caterpillar construction and the incomplete frontier search are documented in
the same research note. Their witnesses undergo the same checks as solver-produced
witnesses; neither reports infeasibility. Solver time and branch medians exclude
these witnesses, whose total processing time is recorded separately in `wall_seconds`.
Frontier work is saved in `frontier.json` and the attempt result. Choosing roots
inside this candidate search is not claimed to preserve every solution; no such
choice constrains the exact fallback.

Every returned labeling is checked in the worker **and again in the parent** by
[`verify.py`](src/graceful_research/verify.py). It uses only the Python standard
library and checks connectivity, simplicity, edge count, the exact vertex-label
permutation, the exact difference permutation, and any declared probe restriction.
It can be run without installing NetworkX or OR-Tools:

```sh
python3 -S results/smoke/verify.py results/smoke/certificates
```

| Status | Meaning |
| --- | --- |
| `verified_graceful` | A positive witness passed the independent verifier; restricted attempts also satisfy their declared restriction |
| `solver_infeasible` | Exact solver reported infeasibility; `proof_certificate_verified` separately states whether an independent UNSAT proof check passed |
| `unknown` | No conclusion, including timeouts, cancellation, or solver UNKNOWN |
| `model_invalid`, `invalid_solution`, `error`, `integrity_error` | An implementation/operational problem; the run fails and retains evidence |

CP-SAT does **not** export a checkable infeasibility proof. The optional SAT backend
does: it saves a canonical CNF and DRUP refutation, independently reconstructs the
encoding, and verifies each proof step. Its translation, trust boundary, limits,
and standalone commands are documented in [SAT certificates](docs/sat-certificates.md).
Unrestricted infeasible inputs receive priority for a SAT retry when eligible;
both optional reductions are disabled. Restricted proofs are counted separately.
No result is automatically called a counterexample.
Contradictory positive and infeasible results for the same scoped input fail the run.

The secondary experiment computes partial information about
`E_max(T) = {uv : a graceful labeling can put difference n-1 on uv}`.
One representative per exact edge orbit is tested. An infeasible prescribed edge
does not imply an infeasible tree. The central edge of the four-vertex path is an
intentional negative control, not a discovery or a counterexample to the conjecture.

For reproducible performance comparisons, run:

```sh
python scripts/benchmark.py --output results/benchmark --attempt-seconds 1 --repeats 3
python scripts/benchmark_frontier.py --output results/frontier-benchmark --attempt-seconds 1 --repeats 3
python scripts/benchmark_techniques.py --output results/techniques-benchmark --attempt-seconds 1 --repeats 3
python scripts/benchmark_portfolio.py --output results/portfolio-benchmark --attempt-seconds 1 --repeats 3
```

The first compares direct caterpillar construction plus exact fallback with CP-SAT
alone, and compares two-sweep with all-pairs diameters. The second measures the
additional frontier prepass and graph-copy-free structural features. Both use the
same saved inputs and seeds for each paired comparison, alternate execution order,
and independently check every positive result. The third compares v1 and v2 on
reference and separately generated held-out inputs, and saves seven component
ablations on the reference corpus. That replacement regressed on the subset of
previously unseen shapes. The fourth evaluates the resulting portfolio on 48
unique trees, excluding every shape in the earlier corpora. Run without concurrent tests.
The output retains requests, witnesses, source snapshots and exact versions. These
are bounded benchmark results, not a campaign checkpoint; unknowns remain
censored observations. See the [optimization measurements](docs/performance.md).

## Cloud execution

The workflows live at the repository root:

- [graceful-research.yml](../.github/workflows/graceful-research.yml): nightly at
  **06:23 UTC**, plus manual **Run workflow** with experiment and budget inputs.
  Changes to this workflow or `configs/nightly.json` on `master` also start a
  **two-minute** validation run using the nightly campaign and its checkpoint.
- [graceful-ci.yml](../.github/workflows/graceful-ci.yml): tests on changes to this
  project and its workflows, including an installed-CLI experiment and audit.
- [graceful-experiments.yml](../.github/workflows/graceful-experiments.yml): three
  independent functional experiments on manual dispatch or changes to their code.
  A matrix runs matching contraction, prescribed-root spiders and residual
  congruence certificates concurrently, each with its own artifact and a ten-minute
  job limit (at most 30 job-minutes across the matrix, including setup). It has
  read-only repository permissions, no schedule, and does not update the campaign
  ledger. Concurrent timings are not used to claim performance improvements.

To activate the configured workflow, put these files and this project on the
repository's **default branch**, enable GitHub Actions under **Settings → Actions**,
and allow the pinned official `actions/checkout`, `setup-python`, and
`upload-artifact` actions. The initial push to `master` starts the two-minute
validation run automatically. **Actions → Graceful tree research → Run workflow**
can start another run with the selected budget. Local creation of these files does
not activate the schedule; a pushed default-branch workflow is required. If using
a default branch other than `master`, update the push branch filter as well.

Each job uses a standard `ubuntu-24.04` CPU runner, installs exact dependencies,
runs the tests, restores the latest successful checkpoint for that campaign and
branch, performs the experiment, audits the evidence, and uploads:

- `graceful-results-RUN_ID-ATTEMPT`: complete report, current-run evidence, source
  snapshot, metadata, cumulative SQLite ledger, and offline visual report with
  exportable figures. Attempted even after failure.
- `graceful-checkpoint-CAMPAIGN`: ledger and checksum metadata, uploaded only after
  successful execution and audit. The next run restores it automatically.

The automatic short-lived `GITHUB_TOKEN` reads previous artifacts;
no secret setup or personal access token is needed. Permissions are `contents: read`
and `actions: read` for the research job. A separate notification job also has
`issues: write`, solely to report new review items to the repository owner.
A separate publication job has `contents: write` to update JSON statistics on the
`graceful-progress` data branch after a successful nightly-campaign audit. It does
not modify `master`, trigger extra research runs, or require another credential.
Successful push-triggered checkpoints are eligible for the
next nightly run, so initial progress is retained. Research runs for the same
branch are serialized. Dispatch
values are validated as data, not interpolated into shell commands. Workflow inputs
allow 1–30 compute minutes; the enclosing job limit is 45 minutes to allow setup,
tests, finalization and artifact uploads. The 30-minute research budget includes
generation, worker startup, solver work and a finalization reserve, not package
installation or the separate validation suite.

Standard hosted runners are [free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Private repositories consume included allowances; artifact storage is subject to
the account's limits. This project does not enable paid spending. Both research
artifacts retain **14 days** to bound repeated checkpoint storage. Each new
checkpoint contains all earlier inputs, attempts and witnesses, so history is carried
forward while runs continue. Download important artifacts for permanent archiving.
After a gap longer than retention, restore an archived ledger manually; artifacts
are not permanent storage. Monitor artifact size and account quotas as the ledger grows.

GitHub may delay scheduled jobs and [disable public-repository schedules after
60 days without repository activity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
Enable the workflow again if that occurs. A nightly schedule is not a guarantee
that a job ran; check Actions history. Automatic commits contain public summary
data only, on the separate `graceful-progress` branch. Code is never rewritten by a run.

## Scheduled notifications

After each research run, including the nightly **06:23 UTC** schedule, a separate
cloud job reviews the audited artifact and opens a GitHub issue mentioning the
repository owner only when it finds an unreported item worth attention. For this
repository the recipient is **@tayre**. Alerts link to the run, the visual report,
and reproducible evidence. Your computer can be off. Email and push delivery follow
your GitHub notification settings.

The initial deterministic rules report:

- Unrestricted solver infeasibility, explicitly labeled an uncertified result
  requiring independent investigation, never a confirmed counterexample.
- A newly checked unrestricted UNSAT certificate, with a separate alert requesting
  independent mathematical review of the input, translation, and proof.
- A valid labeling for a tree of at least 20 vertices after at least three
  inconclusive unrestricted attempts spanning at least two runs. This is an
  algorithm-performance observation, not a claim of mathematical novelty.
- A new completed exhaustive validation milestone through at least order 10,
  requiring contiguous exhausted orders with matching enumeration and witness
  counts. These are implementation milestones, not new literature bounds.
- Failed evidence audits or failed research runs, clearly labeled operational
  problems rather than mathematical findings.

Ordinary timeouts, restricted-edge infeasibility, and repeated stock hypotheses
do not trigger alerts. Previously reported items are suppressed using markers in
bot-created issues, including closed issues. Keep those issues and their markers
for reliable deduplication. Up to 100 new items are grouped per issue. Findings
retained in successful checkpoints remain eligible for delivery on later runs if
a notification request fails. Notification problems do not invalidate a valid
research checkpoint; their status is visible under **Review notable findings**.

No personal token or LLM is required. The isolated notification job uses GitHub's
automatic token and the standard library. Set the repository Actions variable
`GRACEFUL_ALERT_RECIPIENT` to a different GitHub username if needed; otherwise it
uses the repository owner. The existing research schedule and budget are unchanged.
To disable these alerts, remove or disable the workflow's `notify` job.

## How budgets, progress and priorities work

The parent process owns a monotonic deadline. Each exact backend gets an individual time limit,
and a separate process supervisor enforces the outer limit even if native solver
code stalls. A persistent worker amortizes imports. SIGINT/SIGTERM stops new work,
terminates the worker and writes the report. A hard OS kill can prevent finalization,
but already committed SQLite transactions remain; workflow artifacts are still
attempted where GitHub permits them.

The nightly configuration keeps the **1,800-second budget** and reserves 60 seconds
for finalization. Of the remaining search window, up to 60% is available for
unresolved retries and 25% is reserved for restricted edge-placement experiments;
at least 15% remains for new trees. Unused retry time is available to new trees.
If the probe queue or probe-attempt cap finishes early, `fill_unused_budget` allows
new-tree exploration to resume against the same original deadline and counters.

Nightly retries use `retry_policy="oldest_unresolved"`: pending cases and reported
infeasibility come first, followed by unresolved cases with the oldest last attempt.
This policy reopens cases that reached the former four-attempt lifetime ceiling.
The initial queue is frozen, with at most one retry per tree per run, at most 64
retries total, and up to 90 seconds per retry. Verified trees are excluded.
Seeds are derived from the continuing attempt number and retained in each request.
Other configurations default to the original `bounded` retry policy, preserving
its lifetime ceiling and ordering. Restricted probes retain their own lifetime cap.

The per-run limits are now 20,000 unrestricted cases (including retries) and
200,000 generation attempts. Exact SAT probes examine maximum-difference edge
placements through order 12, with up to 2,000 probes and 15 seconds each, always
clipped to the remaining global time. This extends the earlier order-10 atlas;
it is a restricted experiment, not a larger exhaustive gracefulness bound.
`probe_seconds=null` preserves the older behavior of using `attempt_seconds`.

The Markdown report and manifest record elapsed time and attempts for each phase;
attempt JSON/CSV records identify the phase. The audited public JSON feed also
exports these phase totals, the initial retry-queue size and the active budget
settings, so later progress reviews can check where the time went.
Generation settings and fingerprints
are unchanged, so the existing cloud checkpoint continues. The run can still finish
early when its case/generation limits or finite sources are exhausted; it never
waits idly just to fill the budget. Setup, independent audit and artifact upload
are separate workflow overhead. The nightly frequency and 30-minute allowance
have not increased; the existing [Actions usage review](docs/github-actions-usage.md)
still applies and does not establish GitHub approval of discovery workloads.

Generators are interleaved round-robin. Enumeration uses NetworkX's free-tree
generator with a special singleton case. Larger sources include uniform labeled
Prüfer trees, recursive trees, paths, stars, binary heap trees, spiders, caterpillars,
lobsters, brooms and double stars. Families overlap. Exact center/root tree encodings
deduplicate them, with a full encoding comparison to detect a hash collision.
The saved graph's vertex numbers remain the witness's vertex numbers.

Sampling labeled Prüfer trees is **not** uniform over isomorphism classes; rejection
of duplicate classes does not repair that bias. Structured samples have their own
biases. Enumeration is guarded at order 16 and sampled trees at order 256 to keep
preprocessing manageable. Runtime cutoffs make completed samples machine dependent,
even though each individual generated input and solver seed is reproducible.

## Reviewing and reproducing evidence

In the Actions run summary, use **Download the complete results artifact**, extract
the ZIP, and open **`report.html`** in a browser. It works offline without a server,
API key, CDN, or external font. A snapshot is generated after each run; it is not a
live view of a running solver. Keep the extracted files together to follow links to
the audit, inputs, CSV, and written report.

The visual report includes:

- Cumulative distinct trees and verified witnesses across the checkpoint's runs.
- Stacked outcomes by tree size and first introducing generator.
- Every unrestricted attempt's observed runtime in the current run, including
  unresolved observations and retries.
- A family-and-size filter for the cumulative comparison table, difficult current
  cases, and exact run-history counts.

Retries do not count as new trees. A verified witness is retained if a later retry
is unresolved. Restricted probes stay separate from unrestricted tree outcomes.
There is no percentage-complete indicator for an infinite conjecture. The audit
reconstructs `progress.json` directly from the cumulative ledger, and checksums
cover the HTML and figures. Matplotlib renders CPU-only SVG and PNG files with no
GUI. A reusable temporary font cache avoids rescanning fonts during shutdown.

Read `report.md`, then `analysis.json` for the full scientific context. The latter explicitly separates
observations and proposed experiments/hypotheses. The analyzer's `mathematical_proofs`
list remains empty: scoped SAT certificates are separate solver evidence, not
proofs of its suggested hypotheses. The rule-based analyzer groups by family **and order**, flags large
branch-count outliers within an order, and exposes censored searches. Its solved-only
runtime medians are not unbiased population estimates or significance tests.

Useful files in every run:

| File | Contents |
| --- | --- |
| `report.html` | Offline visual report with embedded charts and family/size filters |
| `progress.json` | Audited cumulative counts, run history, chart series and current-run runtime points |
| `findings.json` | Cumulative deterministic review candidates; independently reconstructed from the ledger by the run audit |
| `figures/*.svg`, `figures/overview.png` | Standalone exportable charts and a combined PNG overview |
| `manifest.json`, `config.json`, `dependencies.txt` | Exact Python/dependency versions, OS/CPU, Git revision and dirty status, actual source hashes, configuration, seeds and cursors |
| `inputs/ID.json` | Original numbered edge list, exact isomorphism encoding, generator index/seed and structural features |
| `attempts.jsonl`, `attempts.csv` | All attempts in this run, scope, seeds, model options, results, runtime, branches/conflicts and verifier output |
| `attempts/NNNNNN/` | Request, result, CP model, explicit solver parameters, and response protobuf text when available |
| `certificates/` | Independently checkable positive labelings from this run |
| `unsat-certificates/` | Checked scoped SAT refutations; CNF, DRUP and parameters also remain in the attempt directory |
| `research.sqlite` | Cumulative cases, generation cursors, run provenance, attempts, witnesses and UNSAT proof text across resumed runs |
| `source/`, `verify.py`, `proof_verify.py` | Actual source snapshot and standalone positive/negative verifiers |
| `checksums.json`, `checkpoint.json` | Transport-integrity hashes, not mathematical proof certificates |
| `audit.json` | Result of a subsequent audit |

Reproduce an exact saved attempt, or give it a longer limit:

```sh
graceful-research replay results/smoke/attempts/000001/result.json --output results/replay
graceful-research replay results/smoke/attempts/000001/result.json --output results/retry --seconds 120
```

Use the original `source/` snapshot and locked environment to replay old results.
Single-worker search and seeds improve reproducibility; wall times and time-limited
outcomes can change with CPU, OS, solver version, or surrounding load. OR-Tools
defaults are determined by the recorded exact version; all overridden parameters
are saved. Model text is an input artifact, not an UNSAT certificate.

`graceful-research audit` also reverifies every historical positive labeling and every
claimed checked UNSAT certificate in
the cumulative ledger, including witnesses from earlier nightly runs.

Inspect cumulative evidence with SQLite, for example:

```sql
SELECT scope, status, COUNT(*) FROM attempts GROUP BY scope, status;
SELECT tree_id, n, family FROM cases ORDER BY n DESC LIMIT 20;
SELECT data FROM attempts WHERE scope = 'graceful' AND status = 'solver_infeasible';
```

On a suspected unrestricted infeasible result: first check the numbered input and
model domains, rerun without reductions and with a fresh seed, compare an independent
SMT/backtracking implementation, then replay using `--backend sat` and independently
validate its certificate with a separate checker. Preserve the original evidence.
Publish a counterexample claim only after independent mathematical investigation.

## Architecture and extension points

```text
configs → TreeStream → exact deduplication → SQLite inputs/cursors
                         ↓                       ↑
                   budgeted scheduler → isolated witness search / exact solver
                         ↓                       ↓
                   parent verifiers ← witness or scoped UNSAT certificate
                         ↓
             attempts + certificates → rule-based analysis → Markdown/JSON/CSV
                         ↓
                audit → GitHub artifact → next night's checkpoint
```

`config.py` validates experiments; `trees.py` generates and identifies trees;
`constructive.py` implements known-family witnesses; `frontier.py` retains the v1
candidate search, `frontier_memo.py` adds residual-state reuse, and
`frontier_portfolio.py` retains the v3 portfolio. `frontier_fast.py` filters impossible
endpoints, and `frontier_accelerated.py` shares the allowance between the filtered
first stage and the original second stage by default. Its optional sibling-orbit
stage lives in `frontier_memo_fast.py`. `solver.py` owns the exact
model and fallback; `worker.py` enforces process deadlines; `verify.py`
checks witnesses independently; `storage.py` owns transactional persistence;
`runner.py` schedules work; `analysis.py` reports; `audit.py` checks exported evidence.
`progress.py` derives visual data from the ledger; `visuals.py` renders the offline
report and Matplotlib figures.
`formal/` contains Lean model lemmas; `scripts/check_proofs.py` rebuilds them and
saves a versioned axiom-audit report. Research source snapshots include the proofs.
`findings.py` identifies conservative review candidates; `scripts/notify_findings.py`
validates the exported artifact and deduplicates GitHub notifications.
The small scripts under `scripts/` adapt the same CLI to GitHub.

Standalone experimental modules `matching_lift.py`, `rooted_spiders.py` and
`residual_congruence.py` each have a corresponding `scripts/experiment_*.py` and
independent checks. The congruence checker is a separate standard-library file
that runs with `python -S`. Reproduce the three tracks into distinct directories:

```sh
python scripts/experiment_matching_lift.py --output results/matching-lift
python scripts/experiment_spider_roots.py --output results/spider-roots
python scripts/experiment_residual_congruence.py --output results/residual-congruence
```

These can run concurrently for functional validation. Keep timed algorithm
comparisons isolated from other CPU-intensive jobs. The
[saved archive](examples/parallel-experiments.zip) includes a report for each track;
[the validation record](docs/validation.md) explains the observations and limits.

The formula and relaxation follow-ups also run independently:

```sh
python scripts/experiment_spider_construction.py --output results/spider-construction
python scripts/experiment_residual_relaxations.py --output results/residual-relaxations
python -S results/residual-relaxations/residual_relaxations_verify.py results/residual-relaxations/certificates
```

`spider_construction.py` produces complete labeled trees without search;
`residual_relaxations.py` discovers bounded algebraic certificates, and the
separate `residual_relaxations_verify.py` checks them using exact standard-library
arithmetic. Their reports distinguish a general proved formula, finite witness
validation, relaxation feasibility and fixed-residual impossibility.

`HypothesisProvider` is a typed interface for future optional LLM assistance. Such a
provider consumes the analysis summary and proposes questions; it must never modify
evidence classifications or be required by nightly execution. The default is fully
deterministic and makes no novelty claims.

For longer compute, run the same CLI with a larger `--budget-seconds` and durable
volume on a CPU VM or batch job. Add deterministic input shards and a central ledger
before distributing workers; do not let multiple jobs mutate one SQLite file or
independently advance the same cursor. For a solver upgrade, benchmark identical
saved inputs and retain both environments. For generator or canonical-encoding
changes, increment their schema version and start/migrate a campaign explicitly.

Useful next research work is controlled algorithm comparison, complete small
extreme-edge profiles with independent UNSAT certification, and precisely stated
family-specific extension properties. Check the literature before describing any
pattern as novel. Numerical coverage, however large, is not a universal proof.

## Validation

```sh
python -m ruff check src tests scripts
python -m ruff format --check src tests scripts
python -m pytest -q
graceful-research run --config configs/exhaustive-small.json --output results/exhaustive
graceful-research audit results/exhaustive
```

Tests compare the exact model against independent permutation enumeration through
order six, with both optional reductions enabled/disabled and all edge-orbit probes.
They compare tree/edge encodings with relabelings and explicit automorphisms, reject
malformed witnesses, exercise checkpoint continuation, audit tampering, deadlines,
worker failures and signal termination, and validate the cloud workflow contracts.
