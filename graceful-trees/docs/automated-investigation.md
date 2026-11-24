# Recurring deeper investigation

The numerical campaign runs on GitHub Actions. A separate Codex scheduled review
continues the investigation in the existing project chat at **12:00 noon,
America/Toronto, daily**. This later review time allows for delayed GitHub runs;
it is not a guarantee that a new run has finished.

The Codex review needs the computer on, the desktop app running, and this checkout
available. It uses the existing Codex account and tools. It is not an LLM job in
GitHub Actions and does not make the deeper investigation independent of the
computer. See the [scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).
The nightly cloud computation and its existing GitHub alerts remain independent.

The schedule is named **Investigate graceful-tree results** in Codex's
**Scheduled** view; this document does not create or update it.
Each review targets at most 30 minutes of work and one precise research question.
That is an instruction to the reviewer, not a scheduler-enforced timeout. Local
experiments must also use explicit solver and process time limits.

## Review procedure

1. Read the repository instructions, [findings](findings.md),
   [focused nightly studies](focused-nightly.md),
   [spider priority review](spider-priority-review.md), and the previous review
   record. The current priority review supersedes historical novelty metadata:
   five-edge symmetric-spider 0-rotatability and the interior-extreme property
   follow from established constructions. A different formula does not establish
   a new theorem.
2. Read the latest [campaign feed](https://raw.githubusercontent.com/tayre/tayre.github.io/graceful-progress/campaigns/nightly-v1.json)
   and linked workflow status. Compare run identity, source revision, outcomes,
   evidence hashes, coverage, difficult cases and findings with the previous
   review. Validate the feed with `site/data.mjs`'s `validateFeed`. If the raw feed
   appears stale, use GitHub's contents API on the `graceful-progress` branch.
   A failed run may not publish a feed, so inspect workflow status separately.
   Inspect the phase timings, selected focused study, saved cursors and rotation
   status. `focused_studies` reports the latest summary for each track; its entries
   may come from different runs and are not cumulative counts. A two-minute push
   check can save evidence without advancing the rotation. Do not count matching
   replicates or residual snapshots as new trees or exhaustive coverage.
3. Inspect full evidence when accessible. A feed's audit claim and presentation
   checks are not a new independent audit of the artifacts. Record unavailable
   inputs explicitly. Integrity failures and contradictory evidence take priority.
   For a focused claim, inspect `focused/records/`, the saved requests and the
   cumulative ledger. The small publication bundle supplies audited metadata for
   transport; it cannot substitute for the full results artifact or a fresh audit.
4. Choose one question with explicit quantifiers, graph family and restrictions.
   Search primary literature and read the applicable statements, checking older
   construction implications as well as recent papers. Record theorem/page/version
   references and access gaps. A search miss is not evidence of novelty.
5. Attempt the missing lemma or a small discriminating experiment. Preserve exact
   inputs, seeds, versions and budgets; independently verify witnesses. Distinguish
   unrestricted infeasibility, scoped infeasibility, certified results and unknown
   results. A restricted counterexample is not a counterexample to the Graceful
   Tree Conjecture. For a proof, state assumptions and imported theorems. Use Lean
   when it adds useful assurance, and claim formal verification only after the
   relevant file has compiled without proof placeholders or additional unproved
   axioms. Record an unavailable toolchain as unverified, not a successful check.
6. Save the result and next question. If no new nightly run exists, continue an
   unfinished question from the record rather than repeat completed searches.
   Separate observations, hypotheses, proved statements and priority assessments.

## Focused-study checks

- **Pendant maximum edges:** verify the ordinary graceful witness, recompute the
  target stratum and every pendant-edge orbit, and independently check the scoped
  proof for each excluded orbit. A negative profile is complete only when every
  such orbit is excluded. `certified_restricted_counterexample` refutes the stated
  placement property on that input; the ordinary witness confirms the tree itself
  is graceful. Keep known-class controls separate and check priority before any
  novelty claim. An isolated rejected edge or an unchecked solver answer does
  not settle this property.
- **Matching benchmark:** compare the saved input, seed, allowance and variant
  options within each pair. Account for three replicate pairs per input,
  alternating order, incomplete pairs and unknown trials. Compare verified-success
  counts by stratum before looking at times. Matching construction costs count
  against its own total allowance. Solved-pair timing summaries omit censored cases;
  they cannot establish a population speedup. Confirm promising gains on held-out
  inputs before proposing a default change.
- **Observed residuals:** rerun `focused_residual.verify_record` on each snapshot
  relevant to a claim. It reconstructs the partial problem from the original tree,
  enumerates the remaining assignments independently, and checks local tables and
  certificates. Each negative conclusion fixes the entire saved partial labeling.
  Prefer explaining a jointly impossible combination of individually feasible
  branches over merely counting empty local tables. Saved unknown snapshots and
  parent-terminated investigations make no negative claim. First-encounter sampling
  is not representative sampling, and these are fresh traces, not the older
  synthetic 102-state study relabeled as new evidence.

The nightly studies use known constructions and standard exact-enumeration and
certificate methods. A newly encountered example, a successful implementation,
and a new mathematical result are different claims. Report only what the saved
evidence and literature support.

## Records and findings

Keep working state under ignored `results/deep-review/`: the last examined run
and artifact identity, snapshot hash, audit level actually checked, question,
sources already read, evidence paths, focused record IDs and cursors, results and
next step. Retain copies of
examined public snapshots. Do not mark unavailable artifacts as inspected. This
local state is a convenience; it can be reconstructed from the chat and published
notes if lost.

Save substantive, reproducible findings under `docs/` with small supporting
evidence under `examples/`. Link each finding to its input and source revision.
Useful findings include a checked resolution of a precise restricted question,
a proved lemma with its literature status, a material priority correction,
an integrity problem, or a repeatable performance improvement on fixed inputs.
Routine count increases, ordinary timeouts and rediscovered constructions are
ledger entries, not discoveries. Use claim identity and evidence version to avoid
repeating the same finding.

Completed research changes may be committed and pushed under the owner's standing
authorization after relevant checks. Preserve unrelated local work; do not force
push. The review does not authorize increasing cloud budgets, changing nightly
solver defaults, using paid services, obtaining new credentials, or contacting
paper authors. Incomplete proofs remain explicitly incomplete.

## Current questions

- Complete the pendant-maximum-edge question for non-caterpillar lobsters of
  matching deficiency at least two. A negative answer requires an ordinary
  witness and independently checked exclusions of every pendant-edge orbit.
  Seek a structural explanation before extrapolating from samples.
  The [uniform two/three-branch diameter-five family](diameter-five-pendant-constructions.md)
  is covered by delta construction and star amalgamation; its high matching
  deficiency does not make it a new-result target. Check identical-copy
  constructions as well as transfer-table hypotheses for further candidates.
  The [nonuniform fixed-core follow-up](fixed-core-pendant-control.md) is also
  resolved. Before proposing another parameterized family, remove any variable
  star branch: if this leaves one fixed rooted core, a single positive seed and
  the existing attachment theorem suffice. Keep such controls separate from
  genuinely varying-core research questions.
- Test whether matching-first search improves verified successes on the same
  frozen inputs, seeds and total budgets. Examine naturally sampled trees and
  constructed controls separately, retaining unsuccessful and slower results.
- Explain a minimal real-search partial state whose branches each admit local
  assignments but cannot jointly use every required label and difference. Check
  whether a known parity or exact-cover obstruction already explains it.
- The [fourteen-edge seed question](seven-spider-amalgamation.md) was resolved on
  15 November: two checked seeds give all interior zero positions for seven-edge
  symmetric spiders by established amalgamation. Do not repeat it or treat it as
  a new theorem. Before extending the atlas, identify a precise placement question
  that the existing constructions do not already settle. A checked infeasibility
  result excludes only its specified seed model, not spider gracefulness; a timeout
  leaves even that seed question unresolved.

Solver difficulty is an algorithmic observation, not evidence of nongracefulness.

## Setup check, 14 November 2026

The public feed for [run 43554476166](https://github.com/tayre/tayre.github.io/actions/runs/43554476166)
passed `validateFeed` during setup. It reports 11,051 distinct trees, 11,041 verified
graceful, 10 unknown and zero unrestricted solver-infeasible trees. Its reported
audit passed; setup did not download and independently re-audit the full artifact.
The feed SHA-256 is
`7f406d5a41dd423d94cfc3668d10d1b136aca677247769936ee92605a8ae88d2`.
This is a baseline input check, not a completed deeper review or a new result.
