# Mathematical findings

## Five-edge symmetric spiders — recorded 14 November 2026

**Status:** proved family statement, with universally checked formula arithmetic;
novelty and priority remain unconfirmed. The construction was obtained on
9 November 2026. This entry records that existing result, not a new experiment.

**Statement.** Let `S(k,5)` consist of a central vertex and `k` disjoint legs,
each five edges long, for any positive integer `k`. For every vertex `v`, there
exists a graceful labeling assigning zero to `v`. This property is called
**0-rotatability**; different choices of `v` may require different labelings.

**Contribution relative to the cited work.** Our explicit formula places zero
two edges from the center and the maximum label `5k` at the adjacent vertex
three edges from the center. Complementing labels supplies zero at depth three.
Permuting equal legs covers every vertex at these depths. Rofa's Corollary 2
covers depths zero, one, four and five for proper spiders; the one- and two-leg
path cases use known path results. Ordinary gracefulness of these trees was
already known. The additional property concerns where zero can be placed.

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
Graceful Tree Conjecture nor improves the general exhaustive bound. The scoped
literature review found no matching construction, but that does not establish
first discovery.

**Next action.** Obtain specialist review of the proof and prior literature before
claiming novelty or submitting it for publication. Investigate the primitive
interior positions of seven-edge symmetric spiders after checking known
subdivision consequences; these targets are not asserted to be open.

Evidence: [complete proof and literature comparison](spider_formula_five.md),
[Lean source](../formal/Graceful/FiveSpider.lean),
[validation record](validation.md#five-edge-spider-construction--9-november-2026),
[formal audit](../examples/five-spider-proof.json), and
[reproducible evidence archive](../examples/five-spider-evidence.zip).
