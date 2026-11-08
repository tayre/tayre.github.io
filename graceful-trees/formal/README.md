# Lean proofs for the graceful-tree experiments

These files prove specific mathematical facts used by the research system. They
do **not** prove the Graceful Tree Conjecture, certify arbitrary CP-SAT infeasibility,
or establish correctness of the Python implementation.

The project pins **Lean 4.24.0** and uses only its bundled standard library.
There is no Mathlib download, LLM service, API key or additional proof axiom.

## What is checked

`Basic.lean` defines labels as `Fin (m+1)` for a graph with `m+1` vertices.
`IsGraceful` requires a bijection of labels and a permutation of edge differences
equal to `[1,...,m]`. Absolute difference is `(a-b)+(b-a)` on natural numbers.
Treehood is a separate precondition: these model lemmas work for any edge list.

| Source | Formal claim | Used by |
| --- | --- | --- |
| [Complement.lean](Graceful/Complement.lean) | Complementation is an involution, preserves bijection and every edge difference, and yields a witness ordered at any two distinct vertices. | `solver.py`: `x[0] < x[1]`, including restricted edge probes; `constructive.py` witness normalization in `solver.py`. |
| [Constraints.lean](Graceful/Constraints.lean) | A graceful difference permutation sums to `m(m+1)/2`; a difference of `m` joins labels 0 and `m`. | The redundant sum equation and extreme-edge experiments. |
| [Constraints.lean](Graceful/Constraints.lean) | The explicit four-vertex path has a graceful labeling, but none with difference 3 on its middle edge. | The positive and negative controls in the Python tests. This proof is independent of CP-SAT. |
| [Construction.lean](Graceful/Construction.lean) | Low/high interval assignments produce descending differences; assigning the next spine vertex last preserves the boundary arithmetic. | The arithmetic invariant of the caterpillar construction. |
| [SAT.lean](Graceful/SAT.lean) | Every graceful labeling respecting the declared edge restriction satisfies every clause in the one-hot schema; refuting that schema excludes such a labeling. Row-major variable indices are injective and the X block ends before the Y block. | The mathematical interpretation of the SAT backend's scoped UNSAT proofs. |

The construction proofs cover **local arithmetic**, conditional on their stated
bounds. Spine recognition, traversal coverage, the complete caterpillar theorem,
tree diameter, graph isomorphism, the CP-SAT encoding and the Python verifier are
not formalized here. They retain their mathematical arguments and independent
tests. The mapping from Python code to these Lean statements remains a human
review obligation; changing one does not automatically change the other.

No run result is promoted to a Lean-certified infeasibility result. The SAT schema
proof is a mathematical model theorem; the Python serialization loops and DRUP
checker are not formalized or extracted from Lean. Runtime certificate counts
refer to independently checked DRUP, not Lean-checked refutations. The formal path
control is a separate theorem. See the [SAT trust boundary](../docs/sat-certificates.md).

## Build and audit

With [Elan](https://lean-lang.org/doc/reference/latest/Build-Tools-and-Distribution/Managing-Toolchains-with-Elan/)
installed, the checked-in `lean-toolchain` selects the exact compiler:

```sh
cd graceful-trees/formal
lake build
lake env lean -DwarningAsError=true Audit.lean
```

To save a reproducible audit report, from `graceful-trees/` run:

```sh
python scripts/check_proofs.py --output results/proofs
```

For a standalone toolchain, add `--lake /absolute/path/to/bin/lake`.
The output directory must be new. The checker rebuilds project sources, verifies
the compiler version, audits transitive dependencies of **every declaration from
the project modules**, and saves compiler logs, source snapshots, SHA-256 hashes
and `proof-check.json`. Generated helper theorems are included in the audit count.

Warnings are errors, so unfinished proofs fail the build. The axiom audit allows
only Lean's standard foundations: `propext`, `Classical.choice` and `Quot.sound`.
It rejects `sorryAx`, custom postulates and the extra computational trust used by
`native_decide`. The proofs use ordinary kernel-checked tactics, including `omega`
and `decide`. See Lean's [axiom documentation](https://lean-lang.org/doc/reference/latest/Axioms/).
As usual, the compiler/kernel distribution and its standard library are trusted.

The **Lean proofs and axiom audit** job in `graceful-ci.yml` downloads the official
Linux compiler and checks its pinned SHA-256 before extraction. It tests rejection
of unfinished proofs, arbitrary postulates, native computation and false claims,
and uploads the successful proof report (or failure logs) as a workflow artifact.
The research timer and CPU search budget do not include this separate software CI job.
Research archives also retain the formal source and toolchain pin in their source
snapshots; that inclusion alone does not claim a fresh Lean check for every run.

## Adding a result

State the mathematical claim in the model first, including all hypotheses. Add
the theorem to a module imported by `Graceful.lean`; add a required-theorem entry
to `Audit.lean` for a new critical result, and update the coverage table above.
Run the build, axiom audit and relevant Python regression tests. For a new
optimization, show how its implementation matches the formal assumptions.
For a claimed discovery, also conduct a literature review: formal validity does
not establish novelty. An open proof obligation should remain in the research
notes, without an admitted theorem in the checked library.
