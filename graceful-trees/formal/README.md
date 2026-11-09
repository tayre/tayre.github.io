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
| [Search.lean](Graceful/Search.lean) | A remaining edge bounds its endpoint's label interval; distinct child labels cannot outnumber available interval labels; packed boundary fields are injective under the stated type-ID bound. | Necessary capacity pruning and exact boundary-field packing in `frontier_memo.py`. |
| [LeafTail.lean](Graceful/LeafTail.lean) | Reflection swaps two-parent differences; a midpoint is unique; candidate differences satisfy the folded-path arithmetic; explicit independent pair choices realize exactly the even counts in their interval. With forced count `f`, `c` pairs, and an optional midpoint `e <= 1`, a quota `k` is realizable exactly when `f <= k <= f+2*c+e` and either `e=1` or `k-f` is even. | The allocation arithmetic in `leaf_tail.py`, conditional on a correct decomposition of its choice graph. |
| [RootedPairing.lean](Graceful/RootedPairing.lean) | Three branches at parents `(0,9,9)` cannot consume unused labels `{1,4,5,6,7,8}`, internal differences `{1,4,6}` and attachment differences `{2,3,5}` exactly. The predicate requires all three resource lists to be exact permutations, hence labels and differences are unique. | The fixed case-56 obstruction in `rooted_pairings.py` experiments. This proves only the declared resource partition, not impossibility after relaxing that partition or gracefulness of a whole tree. |
| [ResidueCertificate.lean](Graceful/ResidueCertificate.lean) | A modular linear functional that annihilates every selected resource column but not a target excludes any exact cover of that target. The proof establishes linearity across finite column sums and the zero-residue sum implication. | The algebra behind residual congruence certificates. No primality assumption is needed for validity; discovery uses small prime fields. Python table completeness, serialization and checking are not formalized. |

The construction proofs cover **local arithmetic**, conditional on their stated
bounds. Spine recognition, traversal coverage, the complete caterpillar theorem,
tree diameter, graph isomorphism, the CP-SAT encoding and the Python verifier are
not formalized here. They retain their mathematical arguments and independent
tests. The mapping from Python code to these Lean statements remains a human
review obligation; changing one does not automatically change the other.
The residual-forest equivalence argument is documented in
[techniques.md](../docs/techniques.md); rooted-type construction, memo-table control
flow, and the complete search are not formalized in Lean. The Hall ablation is
checked by permutation oracles and a separate exchange argument, not this library.

The leaf-tail quota theorem is an equivalence with **finite assignments of the
pair choices**, and its sufficient direction constructs those assignments. It
does not assume that all intermediate even counts are attainable. The reflected
pair lemma proves preservation of the exact two consumed differences, and the
midpoint uniqueness lemma justifies at most one such single-label choice.
Two-parent distance injectivity bounds the multiplicity of a candidate edge. A
further arithmetic lemma shows that a maximum difference vertex has at most one
distinct lower neighbor, supporting the written argument against longer simple
cycles without formalizing the graph argument itself.
An additional theorem specializes the arithmetic to the double-star leaf counts;
it is conditional on the reflected decomposition, not a formalized graph-family
gracefulness theorem. The multigraph component-balance argument, forced-choice
peeling, the absence of longer cycles, decomposition coverage and Python
reconstruction are **not formalized**. They require the written proof argument,
independent exhaustive oracles and runtime witness verification. A local negative
result concerns only that fixed partial labeling and is not a Lean-certified
refutation of the complete tree.

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
