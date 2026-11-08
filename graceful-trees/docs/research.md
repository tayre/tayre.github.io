# Research basis and initial strategy

Literature review: 8 November 2026. This is a scoped review, not a novelty certification.

## What is established

For a tree with `n >= 1` vertices, a graceful labeling is a bijection to
`{0,...,n-1}` whose absolute edge differences are `{1,...,n-1}`. The singleton
has label 0 and no differences. A search cutoff says nothing about nonexistence.

Aldred and McKay reported exhaustive verification through 27 vertices, using
label-swapping search with tabu-style escape from local optima [1]. Fang reported
verification through 35 vertices with a hybrid of backtracking, randomized search,
and reuse between related trees [2]. These are computational results reported by
their authors; this project has not rerun them. The 35-vertex result is our primary
published computational baseline, not a claim that no subsequent computation exists.
The number of unlabelled trees grows rapidly; nightly runs here will not reproduce
that bound by brute force. Small exhaustive sweeps are regression evidence.

Letzter, Pokrovskiy and Williams' 2025 preprint proves an asymptotic statement about
*gracesize*: sufficiently large trees admit a bijective labeling with at least
`(1-epsilon)n` distinct edge differences [3]. This permits repeated differences and
does not establish exact gracefulness. Specific families and relaxations should not
be confused with the universal conjecture.

## Approaches considered

| Approach | Use and limitations |
| --- | --- |
| Exact backtracking | Assign large differences first; track unused labels and differences. Complete only when every branch is exhausted. Fang's hybrid is a useful future performance baseline. |
| Tabu / randomized local search | Swap labels to reduce missing differences. Useful witness finder; failure supplies no infeasibility evidence. |
| CP / CP-SAT | Bounded integer labels, `AllDifferent`, absolute equalities and distinct differences directly express the definition. CP-SAT combines propagation and SAT search [4]. Selected for v1. |
| SMT | The same bounded-integer model can use Z3 `Distinct` and `If` to encode absolute differences [5]. A separate implementation is a useful cross-check; an UNSAT answer alone is not an independently checked proof. |
| SAT + certificates | One-hot vertex assignments, exactly-one constraints, and implications to edge-difference variables give a finite CNF encoding. A proof-logging SAT solver plus DRAT/LRAT checking could certify UNSAT [6]. The graph-to-CNF translation must itself be audited. Not implemented in v1. |
| Graph isomorphism | NetworkX's nonisomorphic-tree generator avoids repeated free trees [7]. Exact center/root encodings additionally deduplicate sampled trees. General graph isomorphism machinery is unnecessary for trees. |

## Exact model and safe optimizations

For each vertex, `0 <= x[v] <= n-1`; all `x` are distinct. For each edge `uv`,
`1 <= d[uv] <= n-1` and `d[uv] = abs(x[u]-x[v])`; all `d` are distinct.
There are exactly `n-1` such differences, so they exhaust the required range.
The optional redundant constraint `sum(d) = n(n-1)/2` follows immediately.

The only added symmetry constraint is `x[0] < x[1]` for `n > 1`.
If a solution violates it, complement every label by `x'[v] = n-1-x[v]`.
The domain and bijection are preserved, absolute differences are unchanged, and
the inequality reverses. Distinctness excludes equality. Thus at least one member
of each complement pair survives. This preserves *existence*, not the full set of
labelings or their counts. It also preserves the unordered extreme-edge restriction
used below. Disable it for solution enumeration or restrictions not invariant under
complement. No vertex is arbitrarily forced to 0, and no selected edge is forced to
carry `n-1` in the unrestricted experiment. In particular, arbitrary root-zero
constraints are not sound symmetry breaking for the Graceful Tree Conjecture.

Every edge label `n-1` necessarily joins 0 and `n-1`; this follows from the domain.
We do not choose its location in the main search. CP-SAT's built-in symmetry level
is explicitly set to 0 so the documented complement reduction is the only enabled
symmetry reduction. Standard solver presolve remains enabled.

### Direct witnesses for caterpillars

The optional `constructive_search` prepass implements the known alternating-extremes
caterpillar construction (described in [8], §2, and attributed there to Rosa).
This is an implementation optimization, not a new gracefulness result. It applies
to the tree's structure, regardless of which generator introduced it; paths, stars,
brooms and double stars are included. Other trees and **all restricted probes**
continue to the same exact CP-SAT model.

Here is the invariant for the implementation in `constructive.py`. For `n > 2`,
delete the leaves; proceed only if the remaining connected tree is a path or a
singleton. Start at an endpoint of that spine with label 0. The unused labels
form an interval `[L,H]`. At each step the current spine vertex has label `L-1`
or `H+1`. Assign its still-unlabeled leaf neighbors from the opposite end of the
interval, then assign the next spine vertex **last**, using the same end.
After `k` assignments, the next spine vertex lies just outside the new interval
on the opposite side, preserving the invariant.

Each assignment decreases the next edge difference by exactly one. Initially the
first difference is `n-1`; a spine transition also decreases it by one, because
the next spine label was the last label consumed. Every vertex is assigned once
and every edge occurs in one such assignment, so the differences are precisely
`n-1,...,1` and the labels exhaust `0,...,n-1`. The one- and two-vertex trees are
handled directly. Complementing the completed labeling, if needed, satisfies
`x[0] < x[1]` without changing differences. This chooses a witness without adding
a restriction to the search model.

The first assigned neighbor is a leaf, so this also establishes the pendant
maximum-difference property for caterpillars (the two-vertex case is immediate).
The rule-based question therefore now targets non-caterpillar lobsters instead;
its truth and novelty remain unasserted. Every constructed witness still passes
the independent worker, parent and archive verifiers. Failure of the construction
to apply is never an infeasibility result.

### Structural preprocessing

An unweighted tree's diameter is found by two breadth-first searches: find a
farthest vertex from any vertex, then the greatest distance from that endpoint.
The farthest-vertex endpoint property of trees makes this exact, in `O(n)` time.
The former all-pairs distance computation took `O(n²)` on trees. Tree validation
precedes the optimized calculation; it is not used on arbitrary graphs.
Canonical encodings, input order, generators and campaign fingerprints are
unchanged. NetworkX 3.5 already specializes its center calculation for trees.

## Secondary experiment: extreme-edge support

Define `E_max(T) = {uv in E(T) : some graceful labeling has |x[u]-x[v]| = n-1}`.
For one representative of each edge orbit, solve the defining model with the
additional restriction `d[uv] = n-1`. Cutting an edge produces two rooted trees;
the unordered pair of their exact rooted encodings characterizes its orbit.
Equal pairs give component isomorphisms that combine into an automorphism carrying
one edge to the other. Conversely such an automorphism preserves the pair.

Restricted infeasibility concerns only that orbit, never gracefulness of the tree.
As a useful control, the central edge of the four-vertex path cannot carry 3:
the remaining labels 1 and 2 give repeated differences at the two ends. Its end
edges can carry 3. Thus the universal statement `E_max(T) = E(T)` is already false;
rediscovering this example is not a new result.

Potential questions include whether `E_max(T)` always intersects the pendant edges
within a specified family, which rooted component pairs exclude extreme labels,
and how orbit coverage changes under subdividing a specified edge. These are
precisely testable questions, not claims of new conjectures. A literature review of
rotatability, prescribed-label and edge-constrained graceful labelings is required
before claiming novelty. Observed solver difficulty is a property of an encoding,
seed and machine, not evidence that a tree is nongraceful.

## References

1. R. E. L. Aldred and B. D. McKay, *Graceful and harmonious labellings of trees*,
   Bulletin of the ICA 23 (1998), 69–72.
   [Author-hosted paper](https://users.cecs.anu.edu.au/~bdm/papers/graceful.pdf).
2. Wenjie Fang, *A computational approach to the graceful tree conjecture* (2010).
   [arXiv:1003.3045](https://arxiv.org/abs/1003.3045).
3. Shoham Letzter, Alexey Pokrovskiy and Ella Williams, *On the gracesize of trees*
   (2025 preprint). [arXiv:2511.11331](https://arxiv.org/abs/2511.11331).
4. Google OR-Tools, [CP-SAT solver and status definitions](https://developers.google.com/optimization/cp/cp_solver).
   The implementation deliberately pins 9.14.6206; it does not claim this is the latest release.
5. Microsoft, [Z3 Python guide source](https://github.com/microsoft/z3guide/blob/main/website/docs-programming/02%20-%20Z3%20Python/01%20-%20Introduction.md).
6. Marijn Heule et al., [DRAT-trim proof checker](https://www.cs.utexas.edu/~marijn/drat-trim/).
7. NetworkX, [nonisomorphic tree generation](https://networkx.org/documentation/stable/reference/generated/networkx.generators.nonisomorphic_trees.nonisomorphic_trees.html).
8. M. F. Hossain, M. M. Al Aziz and M. Kaykobad, *New Classes of Graceful Trees*,
   Journal of Discrete Mathematics (2014), article 194759, §2.
   [Paper and description of the standard caterpillar construction](https://doi.org/10.1155/2014/194759).
