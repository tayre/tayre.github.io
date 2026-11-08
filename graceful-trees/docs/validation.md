# Initial validation record

## Public homepage validation — 8 November 2026

The public dashboard addition passed **249 Python tests** and **19 Node tests**.
The new Python integration fixture executes five real unrestricted tree searches,
independently audits their evidence, and exports the audited statistics through
the same function used by the cloud publisher. All five witnesses passed.
Publication tests reject altered statistics, failed audits, wrong workflow
provenance, public-history rewrites, and unsafe Git ref updates.

Headless Chromium checks passed at desktop, tablet, and 390/320-pixel mobile widths:
no page overflow, working history slider and range controls, family/size grouping,
CSV download, the graceful-label complement demonstration, single-run history,
stale timestamps, offline cache, empty error state, safe text rendering, and a
JavaScript-free explanation. Browser scenarios use explicitly synthetic fixtures;
those numbers are never published as experimental results. The actual hosted feed
is supplied only by a successful cloud evidence audit.

Ruff lint and formatting checks passed. See [public-dashboard.md](public-dashboard.md)
for the data flow and commands to reproduce these checks.

The subsequent academic-layout revision passed the same **19 Node tests** and
the browser checks. Graph labels remain at least 11 CSS pixels at 320-, 390-, and
768-pixel viewport widths. Collapsible history and example sections, CSV export,
and cached/error states remain functional. This revision changes presentation
and responsive graph geometry, not the research model or published evidence.

## Original research-system validation

Local validation performed on 8 November 2026 using macOS ARM64, CPython 3.12.14,
NetworkX 3.5 and OR-Tools 9.14.6206. Exact environment details, source snapshots,
model parameters, input edge lists and seeds are in the run archives.

The final automated suite passed **211 tests**. Ruff checks and formatting checks
passed, and `pip check` found no broken requirements. Tests cover independent
permutation comparison through order six, all implemented generators, exact
isomorphism and edge-orbit keys, positive and negative verifier cases, scope-safe
status handling, interruption, hard process deadlines, checkpoint continuation,
historical-witness audits, corrupt artifacts, and the GitHub workflow contracts.

| Experiment | Unrestricted trees | Verified graceful | Unknown | Unrestricted solver infeasible | Restricted attempts | Restricted solver infeasible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exhaustive orders 1–9 | 95 | 95 | 0 | 0 | 60 | 5 |
| Mixed smoke, orders up to 20 | 100 | 100 | 0 | 0 | 25 | 4 |
| Nightly configuration, 45-second pilot | 74 | 70 | 4 | 0 | 40 | 4 |
| Resumed pilot, 20 unrestricted attempts | 20 | 18 | 2 | 0 | 40 | 3 |

The resumed run investigated 17 new trees and retried three old inputs. Its
cumulative ledger contains **91 distinct input trees and 174 attempts**. An
independent audit rechecked **161 positive labeling witnesses**, including earlier
runs' restricted witnesses. The previously unresolved 75-vertex caterpillar was
solved on its second attempt. This illustrates why unknown searches must stay
unknown: changing the search trajectory can find a witness quickly.

The general CP-SAT model timed out on a 75-vertex star in this short pilot. Stars
have an immediate constructive labeling (center 0, leaves 1 through n-1). Such a
timeout measures this encoding's search behavior, not mathematical difficulty or
evidence against gracefulness. Verified constructive hints for known families are
a useful next optimization and benchmark control.

All reported restricted infeasibility is **solver-reported**, not certified by an
independent UNSAT proof checker. It applies only to the prescribed edge. None of
these experiments supplies a counterexample to the Graceful Tree Conjecture, a new
verification bound, or a claimed novel theorem.

## Preserved examples

- [Exhaustive validation archive](../examples/exhaustive-validation.zip): complete
  output of a final rerun, including the report, ledger, models, source snapshot,
  checksums and independently verified labeling certificates.
- [Nightly pilot archive](../examples/nightly-pilot.zip): actual larger-tree run,
  including its four unresolved inputs.
- [Continuation archive](../examples/nightly-resume.zip): cumulative checkpoint and
  evidence showing retries and new-input progress.

Extract an archive into an empty directory, then run `graceful-research audit` on
the extracted run directory. The archives contain the exact source used for each
run; source hashes can differ as operational audit checks were strengthened during
development. All archived positive witnesses pass the final independent audit.
Archives are not substitutes for a literature review or independent UNSAT proofs.

## Cloud validation

The initial implementation was pushed to `master` as `0a68430`. The hosted
[GitHub test run](https://github.com/tayre/tayre.github.io/actions/runs/42496989161)
passed on Ubuntu, including the installed-CLI experiment and artifact upload.

After adding push-triggered validation and checkpoint support for those runs, the
expanded suite passed **213 tests** locally. The first complete
[hosted research run](https://github.com/tayre/tayre.github.io/actions/runs/42497916313)
at commit `185630a` then completed successfully on 8 November 2026 at 16:05 UTC.
It ran the tests, performed a two-minute bounded experiment, independently audited
the results, and uploaded these non-expired artifacts, confirmed through GitHub's API:

- `graceful-checkpoint-nightly-v1` — cumulative ledger and integrity metadata.
- `graceful-results-42497916313-1` — reports, verified witnesses, models and provenance.

The workflow is active on the default branch. Nightly runs at **06:23 UTC** use the
default **30-minute** compute budget and can restore the successful initial
checkpoint. Changes to the workflow or nightly configuration on `master` also
trigger a two-minute check. No personal API key or local computer is required.
See [README](../README.md#cloud-execution) for execution and artifact retention.

## Visual progress reports

On 8 November 2026, the reporting extension passed **219 automated tests** plus
Ruff lint and formatting checks. Tests cover cumulative accounting, repeated
attempts, preservation of positive witnesses after unknown retries, restricted
probe separation, empty charts, escaped HTML data, chart-count tampering after
rehashing, and preservation of solver evidence after a plotting failure. Existing
short-budget and SIGTERM finalization tests continue to pass.

An additional local run resumed the saved 91-tree pilot checkpoint with a
20-second budget and a limit of 12 unrestricted attempts. It made 52 attempts:
12 unrestricted and 40 restricted. It verified 11 of those 12 unrestricted
trees; the remaining tree was unresolved. The cumulative checkpoint now has
**102 distinct investigated trees, 99 verified graceful trees, 3 unresolved trees,
and 226 attempts across three runs**. No unrestricted solver infeasibility was
reported. The audit checked 51 current-run certificates and **212 cumulative
positive labelings**, and independently reconstructed the plotted counts.

The [complete visual report archive](../examples/visual-progress.zip) includes
`report.html`, chart data, SVG/PNG figures, the ledger, and all current-run evidence.
Its transport checksum is recorded in [archives.json](../examples/archives.json).
The [PNG overview](../examples/visual-progress.png) is a convenient static preview.
These examples describe this local validation campaign, not live cloud totals.

Headless Chromium checks at desktop (1440 pixels) and mobile (390 pixels) widths
confirmed four rendered charts, working family/size filters and empty states,
matching embedded chart data, 17 valid evidence/download links, no page-level
horizontal overflow, no browser errors, and no external network requests.
The GitHub workflow now links the complete artifact from its run summary; figures
are downloaded with the report rather than embedded as broken relative URLs in
GitHub's job-summary page.

## Scheduled finding review

The notification extension passed **232 automated tests** on 8 November 2026.
Coverage includes ordinary-timeout suppression, restricted-infeasibility
suppression, repeat-difficulty thresholds, independent validation of a recovered
witness, contiguous coverage milestones, reconstruction of alert candidates during
the audit, artifact identity/checksums, closed-issue deduplication, and ambiguous
delivery where GitHub accepts an issue but the response is lost.

A local bounded trial investigated 20 unrestricted trees and verified all 20.
It also made 25 restricted attempts, including three solver-infeasible restricted
cases. The independent audit verified 42 certificates. Its finding list was empty,
and a notification dry run made **no network calls and created no issues**. Synthetic
exceptional-result tests used mock GitHub APIs; they did not post pretend discoveries
or test messages to the live repository.

The cloud workflow's separate **Review notable findings** job uses an automatic
GitHub token with issue-write permission. The compute job retains read-only GitHub
permissions. Notification setup or delivery errors cannot invalidate a successfully
audited research checkpoint. See the [notification rules](../README.md#scheduled-notifications).
