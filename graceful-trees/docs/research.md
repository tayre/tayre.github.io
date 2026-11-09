# Research basis and initial strategy

Literature review: 8–9 November 2026. This is a scoped review, not a novelty certification.
The [deep review and experiment priorities](#deep-review-and-experiment-priorities)
below compare the implemented searches with primary papers, author programs and
recent preprints. The follow-up [rooted-branch experiment](leaf-tail.md#rooted-two-vertex-branch-experiment)
is now implemented and independently cross-checked. The [swap-search comparison](performance.md)
is also complete; its regression keeps the current default in place. Other proposed mathematical
experiments remain proposals unless accompanied by an implementation and evidence.

## What is established

For a tree with `n >= 1` vertices, a graceful labeling is a bijection to
`{0,...,n-1}` whose absolute edge differences are `{1,...,n-1}`. The singleton
has label 0 and no differences. A search cutoff says nothing about nonexistence.

Aldred and McKay reported exhaustive verification through 27 vertices, using
label-swapping search with tabu-style escape from local optima [1]. Fang reported
verification through 35 vertices with a hybrid of backtracking and randomized
search [2]. Reusing a previous tree's witness is explicitly proposed by
Aldred–McKay [1]. These are computational results reported by
their authors; this project has not rerun them. The 35-vertex result is our primary
documented paper baseline. Fang subsequently announced verification through
**39 vertices** in December 2012 [9]; that author report is distinct from the
documented 2010 paper and has not been reproduced here.
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
| SAT + certificates | One-hot vertex assignments and implications to edge-difference variables give an exact CNF. The implemented Glucose 4.1 backend emits DRUP; an independent checker regenerates the scoped CNF and checks every proof addition [6]. A Lean lemma covers the schema's completeness, not the entire Python pipeline. See [encoding and trust boundary](sat-certificates.md). |
| Graph isomorphism | NetworkX's nonisomorphic-tree generator avoids repeated free trees [7]. Exact center/root encodings additionally deduplicate sampled trees. General graph isomorphism machinery is unnecessary for trees. |

## Exact model and safe optimizations

The [Lean library](../formal/README.md) checks the complement and sum arguments
below, the four-vertex path control, and the construction's local arithmetic.
Its coverage table states the unformalized parts explicitly; a checked model
lemma is not automatically a proof of the Python implementation.

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
carry `n-1` in the unrestricted exact model. In particular, arbitrary root-zero
constraints are not sound symmetry breaking for the Graceful Tree Conjecture.

Every edge label `n-1` necessarily joins 0 and `n-1`; this follows from the domain.
The exact model does not choose its location. CP-SAT's built-in symmetry level
is explicitly set to 0 so the documented complement reduction is the only enabled
symmetry reduction. Standard solver presolve remains enabled.

### Direct witnesses for caterpillars

The optional `constructive_search` prepass implements the known alternating-extremes
caterpillar construction (described in [8], §2, and attributed there to Rosa).
This is an implementation optimization, not a new gracefulness result. It applies
to the tree's structure, regardless of which generator introduced it; paths, stars,
brooms and double stars are included. Other trees can try the candidate search
below before exact fallback. **All restricted probes** use their selected exact backend.

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

### Bounded frontier witness search

`frontier.py` implements a candidate search inspired by Fang's descending-difference
backtracking [2, §2.1]. This is an existing algorithmic idea, not a novelty claim.
It grows a connected assigned region from a chosen vertex labeled zero, trying
edge differences `n-1, n-2, ..., 1`. Each eligible unassigned vertex is adjacent to
one assigned parent; its two candidate values are the parent's label plus or minus
the next difference. Out-of-range and already used values are rejected. Integer
bitsets track eligible vertices and used labels, avoiding copied search states.

For a tree, the unassigned children of the assigned region each have exactly one
assigned neighbor. Adding one such child preserves that property and consumes one
new label and one new edge difference. A completed candidate has assigned all
vertices and all edges; the independent verifier still checks it in full.
Complement normalization uses the existing proved symmetry only after completion.

This routine is deliberately **incomplete**: it explores connected assignment
prefixes and a bounded selection of roots, not all graceful labelings. These
choices are not symmetry-breaking constraints in the exact model, and no
nonexistence conclusion follows from exhausting them. Failure passes the original
input to the same CP-SAT model, with no root or frontier constraints or hints.
The model's serialized hash is regression-tested against the original route.
SAT attempts, restricted probes, and independent infeasibility investigations skip
the frontier prepass.

Version `descending-frontier-v1` tries up to four high-degree roots, with seeded
ties and vertex ordering. It gives each root at most a quarter of the node budget
(or an equal share if fewer roots exist). The default total is 20,000 visited
nodes. Its wall allowance is the smaller of 0.1 seconds and 10% of the attempt
allowance, checked periodically; the enclosing worker retains the hard deadline.
Inputs above 256 vertices skip it to bound Python recursion. Seed, roots tried,
visited nodes, limits, termination reason and candidate labels are saved. A wall
cutoff can vary across machines. The exact fallback receives the remaining time.

The `memo-frontier-v2` method adds residual-forest failure caching, a
necessary label-capacity check, and center-first root selection. The original
`descending-frontier-v1` remains available, and saved requests without an algorithm
field still select it. See [techniques.md](techniques.md) for prior work, the
state-equivalence argument, ablations and fresh-input evaluation. The default
`portfolio-frontier-v3` tries v1 and then v2 within a single shared wall allowance.
Each stage receives at most 20,000 visited nodes (40,000 total by default); the
exact fallback model is unchanged. This allows complementary methods without
discarding the original method's early witnesses.

Lean additionally checks the local capacity inequality and injectivity of packed
boundary fields. Neither Python search is itself formally verified. Its
correctness boundary is the independently checked witness, not successful
heuristic execution. No new exact-model or symmetry-breaking constraint is added.

### Structural preprocessing

An unweighted tree's diameter is found by two breadth-first searches: find a
farthest vertex from any vertex, then the greatest distance from that endpoint.
The farthest-vertex endpoint property of trees makes this exact, in `O(n)` time.
The former all-pairs distance computation took `O(n²)` on trees. Tree validation
precedes the optimized calculation; it is not used on arbitrary graphs.
Canonical encodings, input order, generators and campaign fingerprints are
unchanged. NetworkX 3.5 already specializes its center calculation for trees.
Structural family checks now compute degrees in the once- and twice-pruned cores
directly, instead of copying and modifying two NetworkX graphs. These are the same
induced subgraphs and give identical feature values; they change neither generation
nor case identity.

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

## Deep review and experiment priorities

### What the review changes

The immediate engineering priority is **a complementary search space**, followed
by known constructive reductions. The mathematical priority is **small completion
theorems with prescribed boundary labels**. Neither requires larger nightly budgets.
The existing v3 portfolio remains the baseline: the opt-in leaf-v4 method lost a
success and increased runtime on its held-out sample [local evidence](leaf-tail.md).
That result argues against adding more work at every search node without measuring
how often the new rule applies.

| Priority | Direction | Status in the literature | Useful deliverable here |
| --- | --- | --- | --- |
| 1, engineering | Incremental label swapping and bounded exact repair | Swapping, tabu escape and hybrids are established [1,2] | A complementary, independently verified witness finder |
| 2, engineering | Contract a perfect matching, solve the smaller tree, lift | Known strong-gracefulness / delta constructions [10,11] | A positive construction reducing `2s` vertices to `s` |
| 1, mathematics | Rooted pairing of short residual branches | Skolem and interval pairing are established [3,15,16]; the proposed boundary classification is unverified | An explicit completion rule for a narrowly defined resource family |
| 2, mathematics | Congruence certificates for incompatible signatures | Standard integer-lattice reasoning applied to our exact tables | Small explanations of partial-state impossibility, then a parameterized lemma |
| 3, mathematics | Root/edge-conditioned descending-prefix width | Connected edge search and rooted failures have substantial prior work [12,13,14] | A certified separation or a constructive theorem for a specified family |

This ordering is a research judgment, not an estimated probability of solving the
conjecture. A useful contribution could be a construction, a proved completion
criterion, or a reproducible negative result about a stronger restricted statement.

### 1. Search permutations, then repair a small neighborhood

Aldred–McKay search by exchanging vertex labels and escaping local optima [1].
Fang's hybrid includes swaps, a missing-difference objective, recent-move exclusions
and occasional non-improving moves [2, §§2.2–2.3]. Our production fast path currently
grows connected descending prefixes; it lacks this complementary permutation search.

Maintain the frequency of each edge difference. A swap at vertices `u,v` changes
only edges incident to `u` or `v`; evaluate the union once, including `uv` only once
when it exists. Compare minimizing the number of missing differences with minimizing
their sum. Both objectives are zero exactly at a graceful permutation, but may guide
search differently. If a candidate stalls with few conflicts, an optional exact
neighborhood model can unfreeze their endpoints and a bounded set of neighbors,
keeping the other vertex labels fixed. Its infeasibility concerns only that frozen
neighborhood. Every successful repair still needs the full independent verifier.

**Experiment:** v3 candidates, swap candidates, and v3/swaps candidates on 48 fresh
isomorphism classes, three repetitions, one second per complete attempt. All three
routes retain the same exact fallback; candidates share a 0.1-second cap and the
fallback receives the remainder. That is 432 seconds of attempt allowance,
excluding preparation. Use earlier failures for
development, then freeze choices before generating the final holdout. Record
success sets, censored failures, objective trajectories and runtime. Add exact repair
only in a separate ablation. No speedup is asserted before this comparison.

### 2. Use perfect matchings as a constructive reduction

Broersma–Hoede's strong-gracefulness framework [10,25, §4] and the generalized delta
construction [11, §2] give a useful implementation route. For a tree on `2s`
vertices with a perfect matching, contract its matched edges to a tree `C` on `s`
vertices. Given a graceful labeling `f` of `C`, assign the two vertices of its
matched pair the values

```text
2 f(v),  2s - 1 - 2 f(v).
```

Orient each pair so that every edge between pairs joins two even labels or two
odd labels. This can be done recursively because `C` is a tree. Inter-pair
differences are then the distinct even numbers `2,4,...,2s-2`; matched differences
are the distinct odd numbers `|4f(v)-(2s-1)|`. Together the labels and differences
exhaust the required ranges. This is a restatement of a known construction,
not a new theorem.

**Implemented experiment:** `matching_lift.py` detects the unique perfect matching
by forced leaf peeling, contracts repeatedly, labels the final contree using a
caterpillar construction or the existing portfolio, and independently verifies
each lifted witness. A shared work/node/time allowance covers this route. Its
35-case functional corpus produced 28 witnesses: all 27 perfect-matching inputs
and the singleton. Seven controls lacked perfect matchings. All 24 generated
matching-rich cases at 32, 64 and 128 vertices succeeded. These deliberately
constructed inputs are not a representative random sample or a speed comparison.
See the [inputs and witnesses](../examples/matching-lift.json).

A failed or timed-out contree attempt does not justify rejecting the original
tree: this route seeks a strongly graceful witness, a stronger condition than
ordinary gracefulness. The nightly default remains unchanged pending a separate
equal-budget benchmark on fresh inputs.

There is also a useful refinement to our pendant-maximum-edge question. Perfect-
matching lobsters and almost-perfect-matching lobsters are already graceful by
known constructions [10,11]. For lobsters with at least two vertices, those
constructions also yield a pendant maximum edge (the two-vertex case is immediate):
in the perfect case, lift a zero-labeled end leaf of the caterpillar contree; its
matched pair has only one external incident edge. In the almost-perfect case,
Krop's proof leaves a longest-path endpoint unmatched and gives it the largest
label. Since it is a leaf in a graceful labeling, its sole edge must be the largest.
This pendant-edge conclusion is our direct consequence of the constructions,
not a separately quoted theorem or a novelty claim.

Accordingly, focus discovery probes on non-caterpillar lobsters with
`n - 2*maximum_matching_size >= 2`. Keep the known cases as controls. This excludes
two already explained subclasses; it does not establish that all remaining cases
are outside every known construction. The current campaign filter has not yet
been changed to make this refinement.

### 3. Classify short branches using Skolem and interval pairings

An unfinished branch `p--x--y` consumes unused labels `x,y`, internal difference
`|x-y|`, and attachment difference `|p-x|`. Generalized Skolem sets study pairing
positions into prescribed differences. Nordh's Theorem 6 gives parity and density
necessary conditions; they are insufficient for arbitrary positions, with
`P={1,2,4,5}`, `A={1,3}` as an explicit control [15].

Letzter–Pokrovskiy–Williams give an explicit rainbow matching between equal odd-width
label intervals using a centered consecutive difference block (Proposition 5.8),
then lift repeated components using extra label range (Lemma 5.9) [3]. Signed
Langford constructions supply related even-width displacement patterns [16,
Lemma 4.3 and Theorem 5.5]. Simply rediscovering these pairings would not be new.

The concrete question is which pairings can **also satisfy prescribed attachment
labels and differences simultaneously**. Start with at most four two-vertex
branches attached to one or two fixed parents, within the existing eight-vertex
residual limit. Enumerate unused resources consisting of one interval, two
intervals, or an interval with at most two holes; specify a partition of remaining
differences into internal and attachment resources. Compare exact feasibility with
the known pairing conditions and constructions. Extract smallest failures caused
specifically by attachment or orientation, rather than by impossible pairing alone.

The target is a theorem for one parameterized resource pattern, with an explicit
construction and finite exceptions. Arbitrary resource sets are too broad for an
initial classification. Existing spider branch-packing work [17] is another prior-art
boundary. Novelty of the proposed rooted compatibility classification is unresolved.

Our existing two-parent leaf identity also has clear transfer ancestry:
`x+y=p+q` is precisely the reflection arithmetic that lets a pair of leaves change
parents without changing the two differences. Superdock's transfer framework
explicitly uses such parent/leaf sums [18, §1.1]. The identity itself should not be
advertised as novel; the exact arbitrary-resource criterion still needs a separate
priority check.

### 4. Turn impossible tables into short arithmetic certificates

The existing [residual experiment](leaf-tail.md#bounded-branch-compatibility-tables)
contains 30 cases where every branch has a possible assignment but the branches
cannot share resources consistently. Represent each complete branch signature as
a column of a `0/1` matrix `A`, with rows for each branch instance, unused labels and
remaining differences. A completion chooses columns with `A z = b`, where `b`
is all ones and `z` is binary.

A short sufficient impossibility certificate is a modulus `q >= 2` and an integer
row vector `lambda` such that

```text
lambda A = 0 (mod q),     lambda b != 0 (mod q).
```

Multiplying `A z = b` gives a contradiction. This is elementary integer-lattice
reasoning; Smith normal form is a possible discovery tool, not a new principle.
Passing the congruence test does not prove feasible completion.

**Experiment:** search for such certificates on the frozen 102-instance corpus,
then on new bounded tables. Test real feasibility with `0 <= z <= 1` and integer
lattice membership with unrestricted integer `z` separately: both relax binary
selection, but in different ways, and their failures can overlap. Identify
incompatibility surviving both relaxations. A checker must independently
regenerate **complete** branch tables as well as check the arithmetic: a congruence
over sampled columns cannot exclude an omitted valid assignment. Report the fixed
boundary, resources and branch shapes with every certificate. These remain
partial-state certificates, never unrestricted tree counterexamples.

**Implemented experiment:** all 102 frozen inputs were tested over the prime fields
of orders 2, 3, 5 and 7. Independent regeneration checked 68 certificates, all
modulo 2, among the 77 impossible residuals. This includes 21 of the 30 failures
with nonempty branch tables; six also have every target resource available in
some local option. Nine impossible inputs have no certificate over these fields.
Complete global permutation checks agreed on all inputs, including the 25 feasible
controls. See the [certificates and example parity argument](leaf-tail.md#congruence-certificates).

Lean now proves the general modular implication in
[`ResidueCertificate.lean`](../formal/Graceful/ResidueCertificate.lean). It does not
formalize the Python checker or prove that its branch enumeration is complete.
The standalone checker establishes that finite premise by regenerating every
injective branch assignment. Neither the certificate principle nor the Lean lemma
is claimed novel. A family-specific explanation of recurring coefficients remains
a more interesting mathematical target.

**Relaxation follow-up:** all nine remaining impossible inputs admit independently
checked signed integer solutions of `Az=b`. Consequently no modular linear
functional of this form can refute any of them, at **any** modulus. Eight instead
have exact integer separating functionals excluding nonnegative real covers.
The ninth, case 32, admits a nonnegative half-integral cover as well as a signed
integer cover, although all 120 actual assignments fail. It demonstrates the
limitation of combining these two relaxations. This is an explanation of a fixed
corpus, not a new general obstruction theorem. See the
[exact certificates](leaf-tail.md#integer-and-real-relaxations).

### 5. Measure the restriction imposed by connected prefixes

Horton explicitly studied connected descending edge search and formulated a
corresponding stronger conjecture [12, §4.5]. Knuth's unrestricted `BACK-GRACEFUL`
also allows the next edge to join **two previously unassigned vertices**, opening
a new component; its published implementation supports at most 64 vertices [13].
This is a useful independent baseline absent from our current prepasses. The
single-boundary memoization key cannot be carried over unchanged.

For a graceful labeling `f` of a tree with `m` edges, let `H_k` contain its `k`
largest-difference edges and their endpoints, for `1 <= k <= m`, and define
`w(f)=max_k components(H_k)` (zero for the singleton). Ignore isolated
vertices outside those edges. Since these graphs are forests,
`components(H_k)=active_vertices(H_k)-k`. Connected descending witnesses have width
one. Investigate minimum width **conditional on a specified zero vertex or maximum
edge**, rather than relabeling Horton's unrestricted question as new. Define a
conditional minimum only when the restriction admits a graceful labeling; an
unsupported restriction is a separate outcome, not a large width.

**Experiment:** enumerate exact small-instance witnesses, record conditioned minima,
and identify the smallest separations between width-one and unrestricted support.
A witnessed width-two solution alone does not prove the absence of a width-one
solution. That negative claim requires a complete correctly scoped search, ideally
with a checked SAT certificate. A parameterized family forcing larger width would
be more informative than a small atlas duplicating previous rooted computations.

For prescribed-zero experiments, disable the existing complement inequality:
complementation changes a zero root to a maximum-labeled root and need not preserve
the restricted solution set. It remains valid for an unordered prescribed maximum
edge. Root feasibility and ordinary gracefulness must have separate result fields.

Arnold–Vitor's 2026 flexible edge search changes difference order and already studies
rooted failures [14]. Their order-15 unrooted comparison was slower than descending
search, despite benefits on the all-roots task. The printed Apply/Remove pseudocode
reverses used/unused movement, so a reproduction needs independent small oracles.
Their flexible main algorithm propagates cutoffs; its comparison algorithm does
not visibly do so. These observations limit reuse of the pseudocode, not establish
that the authors' executable results are false.

### Other useful leads and literature cautions

| Source or approach | What can be used, and what cannot be concluded |
| --- | --- |
| Knuth's colored exact-cover program [19] | A direct graceful-labeling encoding already exists. Our branch-signature join can use most-constrained-resource branching; decomposition or exact cover itself is not novel. Benchmark table generation separately from joining. |
| Smith's endpoint-selector model [20] | Choose the smaller label of each difference and channel inverse vertex positions. A useful encoding ablation for restricted probes; older CP results do not establish a CP-SAT speedup on trees. |
| Rofa's symmetric rooted trees [21] | The full paper asks whether symmetric spiders with longer legs are 0-rotatable. Interior root levels provide a precise target. Its abstract's broader wording about all spiders must not replace the narrower full-text conjecture. |
| Recent spider constructions [17,22] | Pinned paths, self-matched legs and boundary-label extension rules provide controls and construction ideas. These results have specific hypotheses, not all-spider or all-tree conclusions. |
| Li's October 2026 rainbow-map preprint [23] | Counts graceful labeled trees across all shapes and repairs cycles by changing topology. This does not show that every fixed shape occurs. A fixed-shape swap/three-cycle exchange experiment is an interesting, lower-priority bridge to investigate. |
| Claimed general proof, arXiv:2409.01981 [24] | Withdrawn on 1 September 2026 for an error in its Composition Lemma. It is not an available proof of the conjecture. |

**Correction after closer review:** the equal-four-edge-leg midpoint target is
already a consequence of rooted uniform subdivision applied to the known
length-two depth-one construction. The same observation covers the length-six
midpoint. These are useful implementation controls, not unresolved theorem
targets. The rooted consequence follows from the exceptional-vertex construction
in [Krop, Theorem 2.4](https://arxiv.org/pdf/1402.3994), with complementation;
[Superdock's thesis](https://arxiv.org/pdf/1403.1564) surveys these subdivision
constructions. For lobsters, deficiency exactly two suggests a different
experiment: retain two exceptional interfaces while contracting matched pairs.

**General construction obtained:** for every positive leg count, an explicit
formula for `S(k,5)` puts 0 at depth two and `5k` at adjacent depth three.
Complementation supplies zero at depth three. Rofa's Corollary 2 covers depths
0,1,4,5, so every five-edge symmetric spider is 0-rotatable. The
[formula, proof, literature comparison and evidence](spider_formula_five.md)
are preserved. Lean verifies its exact vertex and edge-weight permutations for
all positive `k`; the full corollary also uses the written graph argument and
Rofa's result. No matching construction was found in this scoped review;
priority remains unconfirmed. Primitive length-seven interior positions are
the next targets, not asserted to be open in the full literature.

**Implemented spider experiment:** CP-SAT found independently verified prescribed-
zero witnesses for all six midpoint targets and all 24 other root-orbit controls,
with four edges per leg and 3–8 legs. Eleven tiny controls gave ten witnesses and
one restricted solver negative, also checked by all 120 root-fixed permutations;
no negative proof certificate is claimed for it. The model disables complement
symmetry breaking because complementation does not preserve a specified zero.
This earlier finite table is not the proof of the general construction above.
[Exact witnesses](../examples/spider-roots.json) and a
[coverage figure](../examples/spider-root-coverage.svg) are preserved.

The Li preprint includes Lean files and explicitly assumes two Gamma-function
identities for its main analytic result. Its combinatorial part is reported to use
only standard Lean axioms. This review checked the paper and ancillary listing,
not a local compilation or axiom audit. Its formalization does not certify this
repository or establish the Graceful Tree Conjecture.

The asymptotic gracesize result [3] allows repeated differences; a nearly graceful
labeling need not admit a bounded local repair. Neither abundance across tree shapes
nor a construction of a larger graceful supertree supplies a proof for a specified
input tree. We therefore use these works to suggest finite experiments, not to
strengthen solver conclusions.

### Evidence required before adopting a direction

Keep development examples separate from fresh isomorphism classes. Freeze seeds,
limits, objectives and method order; compare the whole route under the same wall
allowance, including preprocessing and failed attempts. Preserve regressions and
timeouts. Check every positive witness independently and compare exact bounded
claims with a definition-level oracle. A new theorem needs a general argument;
enumerating small cases alone is insufficient. Formalize useful lemmas in Lean
with their assumptions visible, then state separately which implementation steps
remain outside the formal proof.

This review verified accessible primary texts and programs and checked source
status through 8 November 2026. It is not an exhaustive priority search or an
independent proof audit of every cited paper. The subsequent functional experiments
above add reproducible finite evidence, not new exhaustive tree bounds, controlled
performance measurements or claims of novelty. Their complete inputs, reports,
models, witnesses, certificates and source snapshots are in the
[parallel experiment archive](../examples/parallel-experiments.zip).

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
9. Wenjie Fang, *Every tree with at most 39 vertices is graceful*, author announcement,
   4 December 2012. [Primary report](https://fwjmath.wordpress.com/2012/12/04/every-tree-with-at-most-39-vertices-is-graceful/).
10. H. J. Broersma and C. Hoede, *Another equivalent of the graceful tree conjecture*,
    Ars Combinatoria 51 (1999), 183–192.
    [Publisher record and paper](https://combinatorialpress.com/ars-articles/volume-051-ars-articles/another-equivalent-of-the-graceful-tree-conjecture/).
11. Elliot Krop, *Lobsters with an almost perfect matching are graceful* (2014),
    Theorem 1.6 and §2. [Full text](https://arxiv.org/html/1402.3994v1).
12. Michael P. Horton, *Graceful Trees: Statistics and Algorithms*, University of
    Tasmania thesis (2003), §§4.5, 4.7 and 5.2–5.4.
    [University repository](https://figshare.utas.edu.au/articles/thesis/Graceful_Trees_Statistics_and_Algorithms/23212346).
13. Donald E. Knuth, `BACK-GRACEFUL`, author program (2020).
    [Literate source](https://cs.stanford.edu/~knuth/programs/back-graceful.w).
14. Michael Arnold and Fabio Vitor, *A Flexible Edge Search Algorithm for Graceful
    Tree Labeling*, IJCSMT 12(3) (2026), 295–333, §§4–6.
    [Publisher PDF](https://iiardjournals.org/get/IJCSMT/VOL.%2012%20NO.%203%202026/A%20FLEXIBLE%20EDGE%20SEARCH%20ALGORITHM%20295-333.pdf).
15. Gustav Nordh, *Perfect Skolem sets*, arXiv:math/0506155 (2005), Theorem 6.
    [Full text](https://arxiv.org/html/math/0506155).
16. Heather Jordon and Lon Mitchell, *Signed Langford sequences*, Discrete Mathematics
    345(3) (2022), 112719. [Publisher article](https://doi.org/10.1016/j.disc.2021.112719).
17. Bogdan Dumitru and Mihai Nacu, *Alternating Extremes in Graceful Labelings of Full
    Binary Trees and Spider Trees*, July 2026 preprint, v2.
    [arXiv:2607.12597](https://arxiv.org/abs/2607.12597).
18. Matt Superdock, *New graceful diameter-6 trees by transfers*, June 2015 revision,
    §1.1. [Paper](https://arxiv.org/pdf/1402.6570).
    His 2013 thesis, posted 2014, restates the pair and midpoint transfer rules in
    Lemmas 2.44 and 2.46: [full text](https://arxiv.org/html/1403.1564v1).
19. Donald E. Knuth, `GRACEFUL-DLX-PRESETS`, author program (2020).
    [Colored exact-cover generator](https://cs.stanford.edu/~knuth/programs/graceful-dlx-presets.w).
20. Barbara M. Smith, *Constraint Programming Models for Graceful Graphs* (2006),
    slides 13–14. [Author slides](https://www.cs.rhul.ac.uk/home/dave/MathsCSP/WebSite/slides/talks/smith/GracefulGraphs.pdf).
21. Rafael I. Rofa, *0-rotatability of classes of rooted symmetric trees. Are rooted
    symmetric trees 0-rotatable?*, December 2023 preprint, §3 Corollary 2 and §4.
    [Full paper](https://arxiv.org/pdf/2312.16235).
22. Songling Shan and Yucheng Zhong, *Graceful Labeling of Two Families of Spiders*,
    May 2026 preprint, v2. [arXiv:2605.14295](https://arxiv.org/abs/2605.14295).
23. Shisheng Li, *Rainbow maps and the number of graceful labelings of trees*,
    26 October 2026 preprint, v1, Theorem 1.3 and §5.
    [Full text](https://arxiv.org/html/2610.34877v1);
    [metadata and Lean ancillary files](https://arxiv.org/abs/2610.34877).
24. Parikshit Chalise, Antwan Clark and Edinah K. Gnang, arXiv:2409.01981,
    withdrawn v3, 1 September 2026.
    [Withdrawal and reason](https://arxiv.org/abs/2409.01981).
25. Atílio G. Luiz, C. N. Campos and R. Bruce Richter, *On α-labellings of lobsters
    and trees with a perfect matching*, Technical Report IC-17-14 (August 2017), §4.
    [Primary report and explicit lift](https://www.ic.unicamp.br/~reltech/2017/17-14.pdf).
