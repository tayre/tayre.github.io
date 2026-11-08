# Initial validation record

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

## Cloud validation boundary

The workflow files and restoration/upload contracts have been tested locally. The
pinned official action tags and Python 3.12.14 distribution tag were checked against
their GitHub repositories. A hosted GitHub job has **not** been launched in this
session, and the changes have **not** been committed or pushed. Activating the
schedule requires these files on the repository's default branch with Actions
enabled. See [README](../README.md#cloud-execution) for the precise steps and artifact
retention behavior.
