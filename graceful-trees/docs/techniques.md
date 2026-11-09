# Candidate-search techniques and novelty review

This work adds useful techniques to this repository. It does **not** establish
that they are new algorithms in the literature, a new mathematical theorem about
graceful trees, or a new exhaustive verification bound. The default is a portfolio:
keep the original search first, then try a complementary method in the time left.

## Prior work and selected ideas

| Direction | Prior work and decision |
| --- | --- |
| Descending differences, central roots and isomorphic subtrees | [Fang (2010), §2.1](https://arxiv.org/abs/1003.3045) already combines these ideas. Our original search uses descending differences; the second method tries central roots before high-degree roots. Root selection remains incomplete witness search. |
| Remember failed residual problems | Learning from dead ends is established constraint-search practice; see [Dechter (1990)](https://doi.org/10.1016/0004-3702(90)90046-3). We specialize the key to the unused labels and an exact representation of the remaining rooted forest with its assigned boundary labels. Novelty of this particular combination has not been established. |
| Capacity and matching checks | Hall-interval and all-different propagation have prior applications to graceful graphs; see [Bessiere et al. (2009)](https://www.ijcai.org/Proceedings/09/Papers/077.pdf). We implement a cheap necessary local capacity test. The stronger interval-matching ablation cost more without improving its reference-case success count. |
| Alternative constraint models and partial hints | [Smith's work on graceful constraint models](https://www.cs.rhul.ac.uk/home/dave/MathsCSP/WebSite/slides/talks/smith/GracefulGraphs.pdf) predates this project. Inverse-label encodings, CP-SAT hints and constrained neighborhood repair remain experimental directions. Small exploratory probes were insufficient to justify deploying them. |

The new code is `frontier_memo.py` and `frontier_portfolio.py`. No extra constraint,
symmetry restriction, or hint is passed to the exact fallback model.

## Why the residual-state cache is valid within the heuristic

After a connected set of vertices has been assigned, let `d` be the next edge
difference to place. Assigned labels are distinct, and already assigned edges
have exactly the differences `n-1, ..., d+1`. Each unassigned component is a rooted
tree attached to exactly one assigned parent. The search state needed for future
choices is therefore:

- the set of already used labels;
- the multiset of pairs `(assigned parent label, unassigned rooted-tree type)`.

Types are computed recursively from the sorted tuple of child types. These are
exact structural encodings, not probabilistic graph hashes. The type dictionary
is shared across roots of one attempt and reset between attempts. Identical keys
give component isomorphisms preserving the parent labels. Transport any remaining
label assignment along these isomorphisms: unused labels, edge differences and
the ability to grow connected prefixes are preserved in both directions. The
closed assigned part has no other connection to the remaining forest. Its labels
and differences have already been accounted for.

Thus equivalent keys have the same completion possibilities, including within
the heuristic's descending connected-prefix search. A failed state is inserted
only after **every continuation allowed by this heuristic** has failed. Root,
node and time cutoffs raise exceptions that bypass insertion. These cached failures
are not unrestricted UNSAT certificates: a graceful labeling outside the heuristic's
search space may still exist.

Keys retain the full sorted boundary descriptor and label bitset. Packing uses
`65536 * parent_label + type_id`; at most four roots on 256 vertices generate fewer
than 65,536 type IDs. Lean checks injectivity of the fields under that bound. Python
sets compare complete keys even if their internal hashes collide. The cache holds
at most 20,000 states, with compact four-byte boundary descriptors; it never grows
across trees or runs.

## Capacity pruning and its proof boundary

Suppose an assigned parent has label `p` and `q` unassigned children. Since every
remaining difference is at most `d`, these children need `q` distinct unused labels
in `[max(0,p-d), min(n-1,p+d)]`. Fewer than `q` available values makes that partial
assignment impossible to complete. This is a necessary condition, not a sufficient
one: it does not check distinctness of all future differences or deeper branches.

[Search.lean](../formal/Graceful/Search.lean) proves the distance-window implication,
the distinct-subset cardinality bound, their application to this capacity test,
and injectivity of packed boundary fields. It does not formalize the complete
Python search, tree-type construction or cache-control flow.

The optional `hall` ablation also checks whether all frontier children can receive
distinct values in their allowed intervals. Intervals have the same radius `d`,
so sorting by parent label sorts both endpoints. Assign the lowest eligible unused
value to each child in this order. If a feasible matching used a larger value for
the current child, exchanging it with the smaller value's later owner preserves
both intervals: both endpoints of the later interval are no smaller. This exchange
argument justifies the greedy feasibility check. It still ignores distinct edge
differences. This ablation is covered by permutation oracles, not a Lean theorem.

Tests enumerate every labeling and every connected partial assigned region for
every tree through six vertices. They compare full completion truth and the more
restricted connected-prefix completion truth across identical production keys,
and confirm that neither capacity test rejects an actual completion. Further tests
cover every tree through order 10, reordered edges, larger inputs, cache limits,
cutoff handling, legacy replay and byte-identical exact fallback models.

## Evidence that changed the design

The initial replacement, `memo-frontier-v2`, combined caching, local capacity and
central roots. Seven component ablations on 30 reference non-caterpillar inputs
gave these candidate-only results (one bounded pass each):

| Method | Verified / 30 | Visited nodes | Total seconds |
| --- | ---: | ---: | ---: |
| Original v1 | 23 | 223,355 | 0.319 |
| Memoization only | 26 | 151,461 | 0.426 |
| Local capacity only | 23 | 216,119 | 0.602 |
| Central roots only | 25 | 162,949 | 0.254 |
| Memoization and local capacity | 26 | 146,632 | 0.605 |
| All three, v2 | 28 | 101,460 | 0.418 |
| All three with stronger interval matching | 28 | 96,230 | 0.476 |

With exact fallback and a common one-second attempt allowance, v2 improved the
60-case reference workload from 54 to 58 verified cases. On 60 cases from fresh
input seeds, it improved 55 to 57, with median total time 5.402 to 3.362 seconds.
However, fresh seeds were not enough to ensure new shapes: 22 cases repeated a
reference isomorphism class. On the remaining **38 previously unseen shapes**, v2
regressed from **36 to 35** verified cases and median time increased from **2.148
to 3.190 seconds**. The aggregate result was not enough to justify replacement.

Both methods had complementary successes. We therefore retained v1 first and
added v2 only when time remained. The first held-out corpus became development
evidence for that design; the portfolio was tested on a **new** corpus instead of
reusing it as an independent evaluation. All these observations are retained in
[techniques-benchmark.json](../examples/techniques-benchmark.json).

## Portfolio evaluation on new shapes

The final corpus contains **48 unique non-caterpillar trees**, with six per family
and order: Prüfer, recursive, spider and lobster inputs at 35 and 75 vertices.
Every isomorphism class in both earlier corpora was excluded. Generation seed,
selection rules, solver seeds and methods were fixed before measuring these cases.
No method was retuned afterward. Three repetitions rotate execution order.

| Complete route | Verified in every repetition | Unresolved | Median total seconds |
| --- | ---: | ---: | ---: |
| Original v1 + exact fallback | 43 / 48 | 5 | 5.236 |
| v2 replacement + exact fallback | 46 / 48 | 2 | 2.507 |
| v1 then v2 portfolio + exact fallback | 47 / 48 | 1 | 1.413 |

The portfolio is **3.71× faster on this capped workload**, with four additional
verified cases and no lost successes in this sample. Each attempt has the same
one-second allowance. Candidate methods share the smaller of 0.1 seconds and 10%
of that allowance. Each stage has a 20,000-node cap; the portfolio's explicit total
is 40,000, compared with 20,000 for each individual method. This is an equal-time
comparison, not an equal-node comparison. The exact solver receives the time left.
Independent positive checks and exact-model hashes are verified by the benchmark.

Measured on macOS ARM64, CPython 3.12.14, NetworkX 3.5 and OR-Tools 9.14.6206, with
imports warmed and no concurrent tests. This small, structured sample does not
establish superiority over published methods, universal speedup, or expected
nightly throughput. Cutoff observations are censored. The solitary unresolved case
is not evidence of a counterexample. Individual timings can regress near cutoffs.

## Reproduction and operations

```sh
python scripts/benchmark_techniques.py --output results/techniques-benchmark --attempt-seconds 1 --repeats 3
python scripts/benchmark_portfolio.py --output results/portfolio-benchmark --attempt-seconds 1 --repeats 3
```

Use new output directories and run without other CPU-heavy jobs. Archives retain
requests, results, witnesses, versions, source snapshots and checksums. These are
benchmark archives, not campaign checkpoints for `graceful-research audit`.
The checked-in [portfolio measurements](../examples/portfolio-benchmark.json)
include all 48 inputs and 432 attempt records; the earlier comparison includes
120 inputs and 720 records. Recorded Git commits are the bases before uncommitted
changes; source hashes identify the measured code. Full local archives are
`results/techniques-benchmark-v1/` and `results/portfolio-benchmark-v1/`.

The default `frontier_algorithm` is `portfolio-frontier-v3`, with
`frontier_max_nodes=40000`. Set `descending-frontier-v1` and 20,000 nodes to reproduce
the original configuration, or select `memo-frontier-v2` for a direct comparison.
Saved requests without an algorithm field keep v1. Nightly budgets, schedules,
generation streams, identity keys and earlier history are unchanged. Restricted
probes, SAT attempts and infeasibility investigations skip all these candidates.

One useful next research question is whether classes of small residual forests
admit stronger necessary or sufficient completion rules. A heuristic cache miss
cannot certify impossibility: such investigations need a complete scoped model
and an independently checked proof. Any claimed new rule also needs a targeted
literature review. Current cache statistics are algorithm observations, not new
theorems about gracefulness.
