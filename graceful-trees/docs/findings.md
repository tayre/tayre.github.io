# Mathematical findings

## Five-edge symmetric spiders — recorded 14 November 2026

**Status, corrected 14 November 2026:** consequence of established constructions;
not claimed as a new theorem. Our explicit formula was obtained on
9 November 2026 and its arithmetic remains universally checked.

**Correction to the earlier assessment.** The initial review found no matching
construction and left novelty unconfirmed. The
[deeper priority review](spider-priority-review.md) now derives the same strong
interior-zero and maximum-edge property using established α-amalgamation and
known hub-zero labelings of symmetric spiders. This positive derivation replaces
the earlier inconclusive assessment. It does not invalidate our formula or its proof.

**Statement.** Let `S(k,5)` consist of a central vertex and `k` disjoint legs,
each five edges long, for any positive integer `k`. For every vertex `v`, there
exists a graceful labeling assigning zero to `v`. This property is called
**0-rotatability**; different choices of `v` may require different labelings.

**Relation to prior work.** Our explicit formula places zero
two edges from the center and the maximum label `5k` at the adjacent vertex
three edges from the center. Complementing labels supplies zero at depth three.
Permuting equal legs covers every vertex at these depths. Rofa's Corollary 2
covers depths zero, one, four and five for proper spiders; the one- and two-leg
path cases use known path results. For `k >= 3`, the same interior-extreme property
also follows by amalgamating a fixed α-labeled ten-edge path with a known hub-zero
labeling of `S(k−2,5)`. The review gives the complete derivation and locates the
underlying construction in Wu–Lu (2012) and Bell–Cummins (2019).

Our formula has hub label one; the prior-construction route has hub label four.
The priority of the particular formula is not established, but a different formula
is not evidence that the resulting family theorem is new. Ordinary gracefulness
of these trees was already known as well.

**Verification.** Lean checks the exact vertex-label and actual adjacent
edge-difference permutations for every positive `k`, including the interior
extremes and complementation. The full graph-level corollary also uses the written
graph argument and Rofa's theorem. Treehood, leg permutation, the Python code and
Rofa's theorem are outside this formalization. Separately, 270 five-edge witnesses
and 68 four-edge controls were independently verified, with the largest input
having 50,001 vertices. Those finite checks validate instances and implementation;
the universal conclusion comes from the proof.

**Research significance and limits.** This is an infinite-family structural
result, separate from the nightly exhaustive-search bound. It neither proves the
Graceful Tree Conjecture nor improves the general exhaustive bound. The retained
contribution is an explicit implementation, proof and formal arithmetic
verification of a consequence of established constructions. Historical experiments
and evidence archives are preserved as records of the work, not claims of priority.

**Next action.** Check further construction targets against existing amalgamation,
path-labeling and subdivision results before treating them as open. Any future
novelty claim needs a precise statement that is not already implied by those
methods, followed by specialist review.

Evidence: [priority review and prior-work derivation](spider-priority-review.md),
[complete formula proof](spider_formula_five.md),
[Lean source](../formal/Graceful/FiveSpider.lean),
[validation record](validation.md#five-edge-spider-construction--9-november-2026),
[formal audit](../examples/five-spider-proof.json), and
[reproducible evidence archive](../examples/five-spider-evidence.zip).
