# Exact residual completion experiments

These methods concern a **fixed partial labeling**. Rejecting its remaining
problem never rejects the original tree. No literature novelty, new exhaustive
verification bound, or counterexample to the Graceful Tree Conjecture is claimed.

## Two-parent leaf completion

Suppose every unassigned vertex is a leaf adjacent to an assigned parent, with
at most two distinct parent labels `p < q`. Let `U` be the unused vertex labels,
`D` the remaining differences, and `k` the number of leaves at `p`. Leaves sharing
a parent must be interchangeable; additional restrictions on individual leaves
are not supported. Both resource sets have the same size as the remaining leaves.

For each `u` in `U`, form its eligible choices `(|u-p|, p)` and `(|u-q|, q)` when
the difference belongs to `D`. No eligible choice rejects this partial state.
Interpret differences as vertices of a multigraph and unused labels as objects:
two distinct choices give an edge, one choice gives a stub, and two choices with
the same difference give a loop retaining both parent choices. Each object must
choose exactly one difference, and each difference must be chosen exactly once.

Objects cannot move between connected components. Therefore a component with
unequal object and vertex counts is impossible. A balanced connected component
is either a tree with one stub, or a unicyclic graph with no stubs. In the former,
the stub and the choices pointing away from it are forced. In the latter, peel
the attached trees, forcing their choices toward their outermost differences.

Write `delta = q-p > 0`. An ordinary edge joins differences separated by `delta`,
or whose sum is `delta`. The underlying simple graph has no cycle: a largest
vertex of any hypothetical cycle has at most one distinct smaller neighbor under
these rules. Thus a remaining cycle must be a parallel pair or a loop. The two
labels of a parallel pair are reflections `u+v=p+q`; assigning both to either
parent consumes the same two differences. A loop is the unique possible midpoint
`2*u=p+q`. Two distinct parents' distances determine a label uniquely, so there
cannot be three parallel objects.

After forcing `f` leaves to `p`, let `c` be the number of free pairs and let
`epsilon` indicate the midpoint. The attainable counts are exactly

```
f + 2*j + h,  0 <= j <= c,  0 <= h <= epsilon,  epsilon in {0,1}.
```

Equivalently, `f <= k <= f+2*c+epsilon` and either a midpoint is available or
`k-f` is even. Choose the required pairs and midpoint, then reconstruct the
assignments. One-parent tails are checked directly. The graph work is linear in
the number of leaves, assuming constant-cost integer and set operations.

`leaf_tail.py` checks reconstructed labels, differences, and parent capacities
directly. The enclosing search independently verifies the complete graceful
labeling, and the archive audit checks it again. Invalid internal invariants raise
errors rather than returning infeasibility.

## Formal and independent checks

[LeafTail.lean](../formal/Graceful/LeafTail.lean) proves reflection, midpoint,
candidate-difference arithmetic, and the necessary and sufficient quota criterion.
The sufficient direction constructs a finite assignment of pairs. **The quota
theorem is conditional on the decomposition.** Graph recognition, peeling,
completeness of the component classification and the Python implementation are
not formalized. The argument above and independent enumeration cover that bridge;
these are not a claim of full program verification.

The independent oracle enumerates all parent choices for every `p,q,U,D` through
ambient order 9. It checks all capacities: **291,720 resource instances,
1,343,154 capacity checks, and 35,375 reconstructed witnesses**. It includes
impossible states, arbitrary missing differences, and the empty residual.

```sh
python - <<'PY'
import runpy
print(runpy.run_path('tests/test_leaf_tail.py')['exhaustive_leaf_oracle'](9))
PY
```

An elementary specialization gives the existing four-vertex negative control as
part of a family: a double-star with `a,b` extra leaves at its two centers admits
the central edge as its largest-difference edge exactly when `a,b` are not both
odd. Reflection pairs supply the construction. The Lean library checks the quota
arithmetic, not the whole graph statement. Novelty of this corollary is unasserted.

## Measurements and deployment decision

**The nightly default remains `portfolio-frontier-v3`.** The new method is
available as `leaf-portfolio-v4`, but did not improve the measured workloads.

First, the two original candidate methods traced the existing 48-tree development
corpus under fixed 20,000-node caps. Across 96 traces, 49,429 eligible visits were
observed. The first 100 per trace were retained, giving 5,112 frozen states. These
are visits, not necessarily distinct residual problems. All states were saved
before timing either completion method; no success-based selection was used.

Both methods agreed on **121 feasible and 4,991 impossible residuals**, with no
unknowns. Most tails contained one or two leaves; the full range was one through
six. Over three alternating-order repetitions, ordinary leaf branching took a
median **0.03361 seconds**, versus **0.04163 seconds** for the exact rule. These
very short totals are timing-sensitive; the rule's setup cost outweighed its benefit.

Second, 48 new non-caterpillar tree shapes were generated, excluding all earlier
benchmark shapes: six per family/order for Prüfer, recursive, spider and lobster
trees of orders 35 and 75. Seeds and methods were fixed before the measurements;
no tuning followed. Both routes had the same one-second attempt limit, shared
0.1-second candidate allowance, and 40,000-node total cap.

| Route | Verified per repetition | Unknown | Median total seconds |
| --- | ---: | ---: | ---: |
| Current v3 portfolio | 46 / 48 | 2 | 2.486 |
| Experimental leaf v4 portfolio | 45 / 48 | 3 | 3.718 |

The same 75-vertex lobster lost its witness within the cap in all three repetitions.
Leaf checking consumed time otherwise available to the second candidate method.
This is a performance regression under these budgets, not evidence against that
tree's gracefulness. No gain in nightly throughput is claimed. The exact model
and its scope remain unchanged; benchmarked fallback model hashes agree.

[Measurement summary](../examples/leaf-tail-benchmark.json) and the
[complete benchmark evidence](../examples/leaf-tail-benchmarks.zip) preserve the
inputs, frozen states, witnesses, outcomes, source hashes and protocols, including
the negative results. These are benchmark archives, not campaign checkpoints.

```sh
python scripts/benchmark_leaf_tail.py --suite frozen --output results/leaf-frozen
python scripts/benchmark_leaf_tail.py --suite held-out --output results/leaf-held-out
graceful-research run --config configs/leaf-tail.json --output results/leaf-smoke
graceful-research audit results/leaf-smoke
```

The experimental mode logs per-stage completion calls, rejected partials, completed
tails and leaves examined. Saved requests without it keep their original method.
Restricted probes and SAT attempts continue to use their exact backend. Existing
campaign identities, schedules, budgets, and chart history are unchanged.

## Research scope and prior work

### Bounded branch compatibility tables

`residual_signatures.complete_forest` implements the next experiment, independently
of the nightly search. Each unassigned component attaches to one assigned parent.
Components have at most three vertices; the complete residual has at most eight.
Larger inputs raise an error rather than returning a truncated negative answer.

For each component, enumerate every injective assignment from the unused labels.
Its signature is the exact pair of consumed label and difference sets, including
the edge to its assigned parent. Duplicate signatures retain one realizing
assignment. Join one signature from each component, requiring both sets to be
disjoint and together cover all resources. This is an exact equivalence: any
completion induces such a partition, and joining its component witnesses gives
a completion because components have no other interactions. Shared assigned
parents are permitted; additional restrictions on individual vertices are not.
The Python join is checked against complete permutation enumeration, not Lean.

```sh
python scripts/experiment_residual_signatures.py --output results/residual-signatures
```

The first deterministic corpus contained **102 fixed residual problems**: 25
feasible and 77 impossible, all agreeing with the independent definition-level
oracle, which examined 60,678 assignments. In 30 cases every branch could be
labeled individually, but their resource requirements could not be combined.
These are useful examples for investigating compatibility; they are not
nongraceful trees or claimed new discoveries. The corpus includes the known
four-vertex-path central-edge negative control.

[Exact inputs, tables, witnesses and oracle results](../examples/residual-signatures.json)
are checked in. The complete local archive at `results/residual-signatures-v1/`
also contains provenance, source snapshots, checksums and a Markdown report.
These experimental records do not enter the campaign's certified-UNSAT counters.

### Literature boundary

The useful next target is a classification of compatible branch-resource patterns,
not a claim that matching or decomposition is new. Branch packing already appears
in [Dumitru and Nacu's spider constructions](https://arxiv.org/abs/2607.12597).
The connected descending search itself follows
[Horton's edge-search work](https://scispace.com/pdf/graceful-trees-statistics-and-algorithms-1zos0tywhe.pdf)
and [Fang's algorithm](https://arxiv.org/abs/1003.3045).
A broader priority review would be required before claiming this residual criterion
as a new result in the literature.

The [deep literature review](research.md#deep-review-and-experiment-priorities)
identifies the reflection identity as established transfer arithmetic and connects
short-branch completion to generalized Skolem pairings. Its next proposed targets
are compatibility with fixed attachment labels and independently checked congruence
certificates for complete signature tables. The rooted-branch classification below
implements the first bounded experiment; congruence certificates remain proposed.
Neither direction carries a claim of novelty.

## Rooted two-vertex branch experiment

`rooted_pairings.py` now implements the short-branch classification proposed in
the literature review. For each branch `p--x--y`, the already assigned parent
label `p` is fixed. Unused labels `U`, internal differences `A`, and attachment
differences `B` must each be consumed exactly once in their specified roles.
The initial bound is four branches, with one or two distinct parents.

The classifier enumerates all internal pairings, then tests their orientations
and allocations to individual branch instances. Choosing the least remaining
label first removes duplicate descriptions of an unordered pairing; it does not
exclude any pairing. Internal and attachment differences remain disjoint. A
separate oracle enumerates all permutations of `U` and checks the definitions
directly, without using the pairing search or its necessary-condition filters.

```sh
python scripts/experiment_rooted_pairings.py --output results/rooted-pairings
```

The first corpus has **82 distinct resource problems** from 89 deterministic
proposals, including explicit controls and seeded interval, two-interval and
two-hole resources. This is not exhaustive coverage of those families or a sample
of naturally encountered search states. All classifications agreed with the
independent oracle, which examined **795,109 assignments**:

| Outcome | Cases |
| --- | ---: |
| Verified rooted completion | 24 |
| Internal pairing exists, attachment constraints prevent completion | 21 |
| Skolem parity or density condition fails | 35 |
| Conditions pass, but no internal pairing exists | 2 |

The known Nordh example is a regression control, not a discovery. Among the 21
attachment failures, four have a locally feasible assignment for every branch
and cover every attachment difference somewhere. Only one also covers every
unused label and internal difference in the local tables. These are necessary
availability checks, not a sufficient compatibility criterion.

That stronger example, case 56, has
`U={1,4,5,6,7,8}`, `A={1,4,6}`, `B={2,3,5}`, and parents `(0,9,9)`.
The branch at zero must start with label 5. Its attachment uses difference 5,
so the other two branches must start with labels 6 and 7 to use differences 3
and 2. The remaining leaf labels are 1, 4 and 8. None can follow label 6 with
an internal difference in `A`. Thus this particular resource partition fails,
even though the local option tables cover every resource.

[RootedPairing.lean](../formal/Graceful/RootedPairing.lean) now proves this precise
obstruction, with exact permutation requirements for the labels and both difference
lists. The fresh Lean 4.24.0 audit checks all 175 project declarations, including
121 theorem declarations with generated helpers; the public named theorem count
is 43. The new theorem depends only on standard `propext` and `Quot.sound`.
The Python classifier and general pairing completeness are not formalized.

A regression embeds the example in an 11-vertex tree and independently verifies
a graceful labeling when the split is relaxed to internal differences `{2,3,6}`
and attachment differences `{1,4,5}`. This checks the negative claim's limited scope.

This is a small explanation of a fixed partial-state obstruction, with no novelty
claim. It does not exclude a labeling of the underlying tree or a completion using
a different internal/attachment partition. It is not installed as a nightly prune.
The [machine-readable evidence](../examples/rooted-pairings.json) preserves all
inputs, internal pairings, local options, witnesses and oracle results. The local
archive `results/rooted-pairings-v2/` adds the source snapshot, dependency versions,
per-case files, checksums and Markdown report. These are research archives, not
campaign checkpoints accepted by `graceful-research audit`.
The [downloadable archive](../examples/rooted-pairings.zip) includes that experiment
and the separate successful Lean source/build/axiom audit; the
[proof audit summary](../examples/rooted-pairing-proof.json) is also checked in.
