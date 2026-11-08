# Checkable SAT refutations

The optional SAT backend saves a CNF formula and a DRUP refutation when it reports
UNSAT. A separate standard-library-only checker regenerates the formula from the
tree and declared restriction, then checks every proof addition. An unrestricted
checked refutation would be a candidate for independent mathematical review.
Restricted refutations exclude only their prescribed edge placement.

No counterexample has been found. The four-vertex path's forbidden middle-edge
placement is a known negative control, also proved in Lean; the path itself is graceful.

## Run and verify

From `graceful-trees/`, in the locked environment:

```sh
graceful-research run --config configs/sat-certificates.json --output results/sat
graceful-research audit results/sat
graceful-research verify-unsat results/sat/unsat-certificates
# Same checker, without NetworkX, OR-Tools, PySAT, or site packages:
python3 -S results/sat/proof_verify.py results/sat/unsat-certificates

# Revisit an exact saved input with SAT (the saved restriction is retained):
graceful-research replay results/previous/attempts/000001/request.json \
  --backend sat --seconds 60 --output results/sat-replay
```

`backend` selects `cp-sat` or `sat`; `probe_backend` selects `same`, `cp-sat` or
`sat`. Nightly runs retain CP-SAT and the caterpillar construction for the main
search and use SAT for restricted probes. With `certify_infeasible: true`, an
eligible retry of a solver-infeasible input uses SAT when its order is at most 75.
Attempt caps still apply; larger or capped cases require manual investigation.
Already checked restricted exclusions are not retried automatically.

The pure SAT example sets `constructive_search: false`. Otherwise the established
caterpillar construction may return a verified witness before either exact backend.
SAT uses no complement reduction, redundant sum, solver assumptions or selected
root label. CP-SAT's options apply only to that backend.

## Canonical encoding `graceful-onehot-v1`

The input is a checked tree with vertices `0..n-1`, `m=n-1`, and a saved ordered edge
list. Boolean variables are numbered:

- `X(v,a) = 1 + v*n + a`, for vertex `v` and label `a` in `0..n-1`.
- `Y(e,d) = n*n + e*m + d`, for edge index `e` in `0..m-1` and difference `d` in `1..m`.

There are `n²+m²` variables. Clauses, in this exact order, are:

1. For each vertex, a disjunction of all its labels, then all pairs of negative
   labels in ascending order: exactly one label at that vertex.
2. For each label, all pairs of negative vertex assignments, with `u<v`:
   no two vertices receive the same label.
3. For each saved edge `(u,v)`, then each ordered pair `a,b` with `a != b`,
   `¬X(u,a) ∨ ¬X(v,b) ∨ Y(e,|a-b|)`.
4. For each difference `d`, all edge pairs `e<f`: `¬Y(e,d) ∨ ¬Y(f,d)`.
5. Only for an `extreme_edge` restriction: for its two saved endpoints, in order,
   append `X(v,0) ∨ X(v,m)`.

All loops use ascending indices except the explicitly saved edge and restriction
orders. The clause count is
`n + n²(n−1) + mn(n−1) + m²(m−1)/2`, plus two for a restriction. DIMACS uses an
ASCII `p cnf VARIABLES CLAUSES` header and space-separated integers followed by
` 0\n` per clause, with LF newlines throughout.

**Why this is exact.** The first two rules select a permutation of vertex labels.
Every edge's selected endpoint labels force its actual positive difference via
rule 3. Rule 4 makes these `m` differences distinct; since they lie in `1..m`,
they cover that set. Extra unconstrained Y variables cannot remove a forced
difference or permit a repetition. Conversely, any graceful labeling satisfies
the clauses by selecting its labels and actual differences. For a restricted
edge, distinct endpoints each labeled in `{0,m}` have difference `m`; every
labeling with that difference satisfies the extra clauses.

Lean checks the crucial direction **graceful labeling ⇒ satisfying assignment**
for this clause schema and its restriction. It also checks row-major index
injectivity and the separation of the X and Y blocks. See
[SAT.lean](../formal/Graceful/SAT.lean). The serialization loops are independently
implemented and compared in Python tests; they are not extracted from Lean.

## Proof checking and evidence

The pinned `python-sat==1.8.dev24` binding runs single-threaded **Glucose 4.1**.
Tracing is enabled before loading clauses, including units. No assumptions are
used. Glucose's DRUP additions must pass reverse unit propagation: negating a
claimed clause and propagating units must produce a contradiction. The checker
retains all established clauses and ignores deletions after syntax validation.
Retaining valid consequences is sound, although it increases memory use. RAT-only
steps are rejected; the checker must reach the empty clause.

The certificate embeds the numbered input, exact restriction, encoding version,
proof text, and SHA-256 hashes of the CNF and proof. Hashes bind bytes; they do not
prove correctness. The checker regenerates every clause, verifies the CNF hash,
and actually checks the proof. It imports neither PySAT nor `sat_encoding.py`.
The worker, parent, and cumulative archive audit independently invoke this check.

`status: solver_infeasible` records the solver conclusion. Only
`proof_certificate_verified: true` records a successful independent check.
Missing, oversized or verification-timed-out proofs leave the result uncertified.
A failed proof step is an integrity error. A solver timeout remains `unknown`.
`unsat-certificates/` contains checked certificates from the current run; all
proof text remains in SQLite across resumes, so old proofs can be rechecked even
after their earlier workflow artifacts expire. Audits also bind the current run's
saved `model.cnf` and `proof.drup` to the certificates.

Reports count distinct unrestricted trees with checked proofs separately from
restricted certified attempts. The public feed's optional
`proof_evidence_schema_version: 1` and `proof_counts` carry that distinction;
earlier history rows are preserved exactly. A new unrestricted checked proof
triggers a review alert. Ordinary restricted exclusions do not.

## Limits and reproducibility

SAT encoding is capped at 75 vertices and checked proof text at 8 MiB per attempt.
Pairwise constraints require cubic space in the order. Larger exact searches
need a more compact, separately validated encoding. One quarter of the remaining
attempt allowance is reserved for proof work after loading the solver; the parent
still enforces the run deadline and can terminate a stalled native worker.
Independent archive auditing and report finalization have additional costs;
GitHub's outer job timeout remains the final safeguard.

Input generation uses the logged seed. This pinned Glucose binding exposes no
random-seed setter: its internal randomness uses fixed solver defaults, recorded
in `sat-parameters.json`. A different request seed does not diversify Glucose's
search. Time-limited outcomes still depend on CPU, OS, scheduling and solver version.

The trusted boundary includes Python, the checker implementation, the mathematical
translation, and their mapping to the Lean model. An arbitrary emitted DRUP proof
is **not a Lean proof**. Before announcing a counterexample, independently confirm
the tree, inspect the unrestricted translation, check the refutation with a separate
implementation, and seek expert review. No novelty follows from successful checking.

Primary references: [PySAT solver API](https://pysathq.github.io/docs/html/api/solvers.html),
[DRAT-trim and proof format](https://www.cs.utexas.edu/~marijn/drat-trim/), and
[DRAT-trim source used for independent validation](https://github.com/marijnheule/drat-trim/tree/2e3b2dc0ecf938addbd779d42877b6ed69d9a985).
