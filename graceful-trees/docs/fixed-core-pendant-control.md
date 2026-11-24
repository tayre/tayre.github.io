# A nonuniform fixed-core control

Recorded 24 November 2026. **Established construction consequence; no novelty
claim.** This closes a proposed test family without suggesting a new theorem.

Let `G` have central edge `cd`, two star branches with 2 and 3 leaves at `c`,
and two with 4 and 5 leaves at `d`, with no other vertices. It has 20 vertices.
The [saved input and witness](../examples/diameter-five-fixed-core.json) uses
`c=0`, `d=1` as vertex IDs and assigns the following labels in vertex-ID order:

```text
17, 0, 8, 11, 15, 18, 10, 12, 5, 19, 4, 9, 3, 1, 2, 6, 14, 16, 13, 7
```

Two separate standard-library audits checked the exact tree, diameter five,
branch sizes, vertex labels `0..19`, differences `1..19`, and `d` labeled zero.
The listed edge differences in the evidence are a directly checkable positive
certificate; trusting a solver's status is unnecessary.

Now attach a third star branch at `d`, with `t` leaves at its new support.
For every integer `t >= 1`, increase all old labels by `t`, label the new support
`20+t`, and its leaves `0..t-1`. Vertex labels then partition `0..20+t`.
Old differences are `1..19`, the edge at `d` has difference `20`, and the new
leaf edges have differences `21..20+t`. Thus the resulting tree is graceful
with a pendant maximum. This includes the originally proposed `t >= 6` family.

This is precisely the established star attachment described in the
[preceding method note](diameter-five-pendant-constructions.md). Its mechanism
is graceful-plus-alpha amalgamation: Wu–Lu (2012), Theorem 3.1, pp.239–240,
with the ordinary-graceful extension on p.242; see the
[checked primary references](spider-priority-review.md#the-established-construction).
Only the finite core needed a witness. Adding an arbitrary parameter to one
detachable star does not create a new infinite-family research mechanism.

The isolated rooted halves do not themselves admit hub zero. Their edge counts
are 7 and 11. Van Bussel's diameter-four, center-degree-two criterion implies
a composite edge count when hub zero is possible. See *Towards the Graceful
Tree Conjecture* (2000), Theorem 4.4, printed pp.109–110, and the accessible
[Luiz–Campos–Richter restatement](https://ic.unicamp.br/~reltech/2017/17-12.pdf),
Theorem 1, p.2. Joining those halves changes the labeling problem, as the
verified core illustrates. This is a known-criterion comparison, not a new
obstruction or counterexample.

## Reproduction and provenance

From `graceful-trees/`, independently check the saved seed and one extension
without a solver or additional dependencies:

```sh
python3 -S - <<'PY'
import json, sys
sys.path.insert(0, 'scripts')
from check_diameter_five_pendant import verify
record = json.load(open('examples/diameter-five-fixed-core.json'))
edges, labels = record['input']['edges'], record['labels']
assert record['input']['n'] == len(labels) == 20
assert labels[record['root']] == 0
verify(edges, labels)
t = 6
extended_edges = edges + [[record['root'], 20]] + [[20, 21+i] for i in range(t)]
extended_labels = [x+t for x in labels] + [20+t] + list(range(t))
verify(extended_edges, extended_labels, pendant_maximum=True)
print('Seed and 27-vertex extension verified.')
PY
```

CPython 3.12.14 and the existing pinned CP-SAT 9.14.6206 found the seed with
seed `20261124`, one worker, a five-second allowance, and both complement
symmetry breaking and solver symmetry reduction disabled. A first attempt hit
its 15-second process limit before returning artifacts; it remains **unknown**.
After dependency restoration and a successful import diagnostic, a separately
recorded follow-up used the same input, seed, source and solver allowance with
a 30-second child limit inside a 45-second outer limit. It returned the verified
witness in approximately 0.071 seconds of solver time. This is not a benchmark.

The evidence records exact input, versions, solver settings and artifact hashes.
Full model, parameters, response, source snapshot and failed attempts are in
the ignored local review ledger. No infeasibility or Lean verification is claimed.
The universal extension follows from the written interval proof, not from
checking finitely many values of `t`. Cloud budgets and solver defaults are
unchanged. General varying-core placement questions remain separate.
