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
3. Inspect full evidence when accessible. A feed's audit claim and presentation
   checks are not a new independent audit of the artifacts. Record unavailable
   inputs explicitly. Integrity failures and contradictory evidence take priority.
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

## Records and findings

Keep working state under ignored `results/deep-review/`: the last examined run
and artifact identity, snapshot hash, audit level actually checked, question,
sources already read, evidence paths, results and next step. Retain copies of
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

## Initial questions

- Build an α-path seed atlas, using the known ten-edge seed as a control before
  trying fourteen-edge paths for seven-edge spider legs. Require midpoint zero
  and state the desired interior positions precisely. A successful seed gives a
  specialization of established amalgamation. A checked infeasibility result can
  exclude the specified seed model, not spider gracefulness; a timeout or failure
  to find a seed leaves it unresolved.
- Examine the existing pendant-maximum-edge question for non-caterpillar lobsters.
  A negative answer for one tree requires checking every relevant pendant-edge
  orbit, with appropriate independent certificates.
- Benchmark unresolved trees on frozen inputs, matched seeds and equal budgets.
  Solver difficulty is an algorithmic observation, not evidence of nongracefulness.

## Setup check, 14 November 2026

The public feed for [run 43554476166](https://github.com/tayre/tayre.github.io/actions/runs/43554476166)
passed `validateFeed` during setup. It reports 11,051 distinct trees, 11,041 verified
graceful, 10 unknown and zero unrestricted solver-infeasible trees. Its reported
audit passed; setup did not download and independently re-audit the full artifact.
The feed SHA-256 is
`7f406d5a41dd423d94cfc3668d10d1b136aca677247769936ee92605a8ae88d2`.
This is a baseline input check, not a completed deeper review or a new result.
