# Focused nightly investigations

The nightly campaign keeps its **06:23 UTC** schedule and **3,600-second research
budget**. Half of its search window now asks one specific question, rotating
between a restricted labeling property, a controlled algorithm comparison, and
small unfinished labelings encountered during real search. These studies produce
evidence to review; they do not assert a new theorem, a speedup, or an improved
exhaustive verification bound.

## Budget and continuation

The 120-second finalization reserve leaves at most 3,480 seconds for research,
less startup already spent inside the budget. The configured shares are:

| Work | Share of the search window | Approximate maximum before startup overhead |
| --- | ---: | ---: |
| Retry previously unresolved trees | 25% | 870 seconds |
| One focused investigation | 50% | 1,740 seconds |
| Ordinary maximum-difference edge probes | 5% | 174 seconds |
| Explore new trees | At least 20% | 696 seconds initially |

Retries run first, followed by the focused investigation, new trees, and ordinary
edge probes. Unused retry or focused time becomes available to new trees. With
`fill_unused_budget=true`, new-tree exploration also resumes if ordinary probes
finish early. Case limits, finite input sources, cancellation, and the global
deadline still apply. No phase waits just to consume its allowance. Setup, the
subsequent independent audit, and uploads are separate workflow overhead.

The checkpoint stores a rotation cursor and a separate input cursor for each
study. The order is **pendant → matching → residual → pendant**. Rotation advances
only when at least one focused record was saved and the configured run budget is
at least 600 seconds. A two-minute configuration-push check can preserve evidence
and advance an input cursor, but does not consume a turn in this rotation. A run
that stops before saving a record leaves the rotation unchanged. Resume the
checkpoint to retain these cursors; a new campaign starts them from zero.

## The three questions

### Can a lobster put its largest edge difference on a leaf edge?

The proposed property is: every non-caterpillar lobster with matching deficiency
at least two admits a graceful labeling whose difference `n−1` lies on a pendant
(leaf) edge. Matching deficiency is `n−2ν(T)`, where `ν(T)` is the size of a maximum
matching. This is a research question with unestablished priority, not a theorem
or a claim of novelty.

The study revisits eligible catalogued trees and generates reproducible lobster
samples of orders 13, 14, 16, 18 and 20. Caterpillars and lobsters of matching
deficiency at most one are retained as separately tagged controls. Controls and
targets must be compared separately; neither generator samples uniformly from
unlabeled trees.

Matching deficiency at least two does **not** exclude every known construction.
For example, [Barrientos (2019), Theorem 4.2, pp.8–9](https://dergipark.org.tr/en/download/article-file/675268)
joins the centers of identical diameter-four caterpillars in a path. The paragraph
following the theorem states that its labeling assigns zero to a leaf. The edge
of maximum difference must therefore be incident to that leaf. This family
includes examples with deficiency at least two. The current `target` tag records
the structural filter, not absence from the literature; recognize applicable
construction families separately when interpreting individual successes.

A checked graceful witness with a pendant maximum edge supports the property for
that input. A negative profile requires **an ordinary graceful witness and checked
SAT refutations for every pendant-edge orbit**. Orbits are recomputed from the
actual graph, and certificates are independently rechecked for the original
numbered input and the exact edge restriction. An unchecked infeasibility answer,
a missing orbit, or an expired proof-check allowance leaves the profile unsettled.

`certified_restricted_counterexample` therefore means “this graceful tree cannot
place its maximum difference on any leaf edge.” It cannot mean a counterexample
to the Graceful Tree Conjecture. Such a result becomes a review candidate requiring
an independent mathematical explanation and a literature check.

### Does a matching construction improve the existing search route?

For each input, the coordinator schedules **three paired replicates**, with a new
logged seed for each pair. Both variants use that pair's identical numbered input,
seed and five-second total allowance. Execution order alternates between pairs.
An incomplete set of replicates continues from its saved cursor on a later visit.

The baseline uses the configured campaign solver. `matching_first` first tries
the known perfect-matching contraction/lifting construction, then gives the same
solver its remaining time. The matching stage receives at most 0.5 seconds or
10% of the total allowance, whichever is smaller. Matching detection, contraction,
search, reconstruction and verification consume this allowance; they are not
free preprocessing added to the baseline's five seconds. The campaign's ordinary
solver defaults are unchanged by the comparison.

Inputs cover orders 20, 36, 50 and 74, with Prüfer, recursive and lobster samples,
constructed examples with perfect matchings, and controls without a perfect
matching. Save and compare these strata separately. Three replicates of the same
input are repeated measurements, not three independently sampled trees; generated
isomorphism classes can also repeat. The first stage is based on established
constructions, not a new labeling theorem.

Compare paired verified-success counts first. Unknown trials remain censored;
they are not assigned invented solve times. Time summaries for pairs where both
variants succeeded describe that selected subset only. The parent process enforces
the outer deadline, and actual dispatch and worker elapsed times are retained:
native solver shutdown and verification can exceed a cooperative solver limit.
One night's timings are insufficient to establish a general speedup or justify
changing the default algorithm.

### Why do small partial labelings fail to extend?

Fresh Prüfer, recursive, lobster and spider inputs of orders 12, 16, 20 and 24 feed
the connected descending-difference candidate search. The observer saves the
first four distinct eligible states before learning their outcomes. An eligible
state has at most eight unassigned vertices, with each remaining connected
component containing at most three vertices and attached to one assigned parent.

Each snapshot preserves the full numbered tree, partial labels, seed, starting
vertex, search-node number, unused labels, unused differences and component maps.
The exact signature join is compared with an independent oracle that tries
permutations of unused labels on the original unassigned vertices—at most `8!`
assignments. The verifier reconstructs the residual from the full input, regenerates
local options, and checks any modular or relaxation certificates independently.
It reruns the oracle instead of trusting a saved exhaustion flag.

Every negative result fixes **that entire partial labeling**. It may expose branches
that each work alone but compete for the same labels or differences when combined.
It does not exclude other partial labelings of the same tree. Modular and separating
certificates can explain impossibility; an integer or fractional relaxation cover
does not establish a graceful completion. Failure to find a certificate within
its search bounds is inconclusive.

The worker verifies completed snapshots before returning. A parent-enforced
timeout returns unknown without residual conclusions. Snapshots collected but
not classified before the soft study deadline are retained separately as unknown.
A completed trace can contain zero eligible snapshots. Encounter order is a
search-dependent sample, not a uniform or representative sample of residual states.
The saved source metadata records provenance; the mathematical verifier checks
the state and its conclusions, not a replay proof of its historical node number.
The older synthetic 102-state experiment remains a separate control study.

## Evidence and review

| Location | Contents |
| --- | --- |
| `manifest.json` → `phase_summary.focused_study` | Elapsed phase time and ledger solver attempts, unrestricted or scoped; matching and residual records have separate counts |
| `manifest.json` → `focused_study`, `focused/summary.json` | Question, chosen study, rotation status, input cursors, stop reason, current-run record IDs and summary |
| `focused/records/ID.json` | Current-run evidence, including input, study metadata, paired trials or fixed-partial results |
| `focused/work/` | Saved requests and worker files when produced before termination |
| `research.sqlite` → `focused_records` and metadata | Cumulative study records and continuation cursors |
| `progress.json` → `focused_studies` | The latest available summary and run ID for each study, not a sum across all runs |
| `findings.json` | Conservative review candidates, including a checked failure of the target pendant property |

`graceful-research audit` rechecks the cumulative focused evidence. It reconstructs
pendant profiles, verifies matching witnesses and paired allowances, and reruns
the residual oracle and certificate checks. Runtime measurements remain
measurements, not mathematical facts established by an audit. Matching trials
and residual snapshots stay outside ordinary distinct-tree coverage counts;
pendant studies use ordinary and restricted attempts in the existing ledger.

The small publication bundle carries byte-identical audited metadata and a
checksum index for dashboard and notification transport. It is not a replacement
for the complete results artifact. Dashboard and alert links retain the full
artifact containing inputs, witnesses, certificates, source and ledger. Reading
the public feed or checking its schema is not independently re-auditing that
artifact. Download significant evidence before GitHub's artifact retention expires.

## Configure and reproduce

The nightly JSON enables:

```json
{
  "focused_study": "rotate",
  "focused_budget_fraction": 0.5,
  "focused_max_cases": 200,
  "focused_attempt_seconds": 5
}
```

`focused_study` accepts `none`, `rotate`, `pendant`, `matching` or `residual`.
`none` requires a zero focused fraction; an enabled study requires a positive one.
The retry, probe and focused fractions must sum to less than 0.9. The 200-record
cap counts profiled trees for pendant, paired replicates for matching, and trace
inputs for residual. It is not a promise that the time budget will permit 200.
Pendant restricted probes use `probe_seconds` (15 seconds nightly), clipped to
the phase deadline; the five-second focused allowance applies to its ordinary
witness attempt, each matching variant, or each residual trace investigation.

From the `graceful-trees/` directory, create a small local configuration and run
the installed CLI in the pinned environment:

```sh
python - <<'PY'
import json
from pathlib import Path

config = json.loads(Path("configs/nightly.json").read_text())
config.update(campaign="focused-local-residual", focused_study="residual",
              budget_seconds=120, finalize_reserve_seconds=12, focused_max_cases=8)
Path("results").mkdir(exist_ok=True)
Path("results/focused-local-config.json").write_text(json.dumps(config, indent=2) + "\n")
PY
graceful-research run --config results/focused-local-config.json --output results/focused-local
graceful-research audit results/focused-local
```

Choose `pendant` or `matching` in the same configuration to isolate those studies,
using a new campaign/output for each. Resume an existing study with the same
generation settings and seed using `--resume PREVIOUS/research.sqlite`; use a new
empty output directory. Use saved source snapshots and exact dependency versions
for historical reproduction. Seeds reproduce input generation, not elapsed times
or the number of states reached before a wall-clock cutoff. Changing focused
options does not by itself reset ordinary generation cursors.

Useful next experiments are a structural explanation for any checked pendant
failure, matching comparisons on held-out inputs with complete paired replicates,
and minimal verified residual obstructions beyond simple missing-resource cases.
Check each precise claim against prior work before calling it new. In particular,
the five-edge symmetric-spider result is a
[consequence of established constructions](spider-priority-review.md), not a new
discovery to be reported again.
