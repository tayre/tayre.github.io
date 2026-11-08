# Processing optimization — 8 November 2026

The optimized path uses the established caterpillar construction before CP-SAT,
and computes tree diameters with two breadth-first sweeps. It also defers loading
OR-Tools until an attempt needs the solver. No solver constraints, generation
streams, canonical tree IDs, time limits or independent verification checks were
weakened. See the [construction invariant](research.md#direct-witnesses-for-caterpillars).

## Paired measurements

Measured on macOS 15.7.7, ARM64, CPython 3.12.14, NetworkX 3.5 and OR-Tools
9.14.6206. The workload contains one input from each of the ten configured
families at orders 35 and 75: **20 fixed trees**, repeated three times per variant,
with a one-second CP-SAT limit and the same logged seeds. Execution order
alternates between repetitions; solver imports are warmed for both variants.
There was no concurrent project test run during these measurements.

| Measurement | Before | Optimized |
| --- | ---: | ---: |
| Median total time for the 20-tree capped search workload | 13.406 s | 6.105 s |
| Verified trees in each repetition | 9 / 20 | 15 / 20 |
| Unresolved trees in each repetition | 11 / 20 | 5 / 20 |
| Median time for 150 diameter calculations | 0.6212 s | 0.01098 s |

That is **2.20× faster for this capped search workload** and **56.6× faster for
the diameter calculation alone**. The ten caterpillar-family inputs all receive
verified witnesses from the construction; their median in-process attempt time
is 0.296 ms, including verification and method-file output. Non-caterpillars still
use the existing solver. Six additional verified trees were previously unresolved
at the one-second limit; this is an algorithm improvement on known graceful
families, not new mathematical evidence against or beyond established results.

The diameter workload uses all ten families at orders 35, 75 and 256, five passes
per repetition. Both algorithms returned identical integers for every input.
This phase times diameter calculation only, not the full research pipeline.

These ratios are observations for this machine and workload, not forecasts for a
nightly run or an estimate of time to solve arbitrary trees. Unknowns are censored;
we do not substitute the time limit for an actual solution time. Smaller exhaustive
cases, non-caterpillar-heavy workloads, report generation and checkpoint I/O can
have different speedups. The lazy-import saving is not included in these ratios.

## Reproduction and evidence

```sh
python scripts/benchmark.py --output results/benchmark --attempt-seconds 1 --repeats 3
```

The output must be a new directory. `benchmark.json` records each outcome and
duration, seeds, exact dependency versions and machine information. Per-attempt
directories contain inputs, options and verified labelings; CP-SAT attempts also
retain their model, parameter and response protos. The benchmark checks every
positive witness independently and retains a source snapshot and checksums.
It is a benchmark archive, not a campaign checkpoint for `graceful-research audit`.

The checked-in [measurement summary](../examples/optimization-benchmark.json)
contains the raw repetition totals, versions and hashes of the measured source.
The full local evidence is in `results/optimization-benchmark/`. The recorded Git
commit is the base before the optimization; the file hashes identify the code
actually measured. Repeat runs may produce different timings and cutoff outcomes.

## Validation and reporting

- 319 Python tests and 19 dashboard tests passed. The fast algorithms were checked
  on all 201 non-isomorphic trees through order 10, and on larger generated and
  relabeled trees through order 256.
- The end-to-end smoke run verified 100 unrestricted trees and produced 25 edge
  probes. Four probes were solver-infeasible; no unrestricted tree was infeasible
  or unresolved. Its independent audit accepted all 121 positive certificates.
- Restricted negative controls used CP-SAT in this benchmark; nightly probes now use SAT with proof checking. Invalid constructed witnesses
  fail verification, and non-caterpillars fall back to the original model.
- Reports record `search_method`; construction has no invented solver time,
  branch count or infeasibility proof. CP-SAT medians and outlier baselines exclude
  constructed witnesses. History counts retain their existing schema.

`constructive_search` is enabled by default and explicitly in the nightly config.
Set it to `false` to benchmark CP-SAT alone. Changing it does not reset the campaign.
Replay of a legacy request without this field still uses CP-SAT. The existing
nightly budget and schedule are unchanged.
