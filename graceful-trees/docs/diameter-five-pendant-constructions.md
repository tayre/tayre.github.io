# A diameter-five pendant-maximum control family

Review: **23 November 2026**. This is a consequence of established constructions,
not a new theorem or an improvement to the exhaustive-search bound. It removes
one precisely defined family from the proposed unresolved pendant-placement
targets. The broader non-caterpillar lobster question remains unresolved here.

## Family and conclusion

For any integer `b >= 1`, build `T_b` from a central edge `cd`. Attach two new
neighbors to `c` and three to `d`; attach exactly `b` leaves to each of these five
neighbors. There are no other vertices or edges. Then `T_b` has a graceful
labeling with its maximum edge difference on a pendant edge.

It has `5b+7` vertices and diameter five. Removing its original leaves leaves
branching at both centers, so it is not a caterpillar. Its maximum matching has
size six: one leaf edge at each support, plus `cd`. The five supports together
with `c` are a vertex cover of size six, proving optimality. Thus its matching
deficiency is `5b-5`. For `b >= 2`, the whole family belongs to the nightly
study's deficiency-at-least-two target. That filter does not exclude known cases.

## Construction and proof

Make a rooted tree `R_b` with root `r`, two neighboring supports, and `b` leaves
at each support. Assign:

| Vertices | Labels |
| --- | --- |
| Root `r` | `0` |
| First support | `b+1` |
| Its leaves | `b+2, ..., 2b+1` |
| Second support | `2b+2` |
| Its leaves | `1, ..., b` |

These are exactly `0..2b+2`. The support-to-leaf differences are `1..b` and
`b+2..2b+1`; root edges supply `b+1` and `2b+2`. This is root-zero graceful.

Next take two copies of any rooted graceful tree `R` with `q` edges, labeling
`h`, and root label zero. Let `M=q+1` and join their roots by an edge. Use:

| Root-distance parity in `R` | Copy A | Copy B |
| --- | --- | --- |
| Even | `h(v)` | `M+h(v)` |
| Odd | `M+h(v)` | `h(v)` |

Every original label occurs once in `0..q` and once in `M..M+q`. An old edge
with difference `e` gives differences `M-e` and `M+e` across its two copies.
The joining edge gives `M`. Thus every difference `1..2q+1` occurs once.
Roots receive `0` and `M`; exchanging copies makes either specified root zero.
This is the `K_2` case of the established delta construction.

Apply it to `R_b`, calling the zero root `d` and the other root `c`. The resulting
`G_b` has two branches at each center, `m=4b+5` edges, and `d=0`. Restore a third
branch at `d`:

- Increase every label of `G_b` by `b`.
- Give the new support label `m+b+1 = 5b+6`.
- Give its `b` new leaves the labels `0..b-1`.

Old vertex labels fill `b..m+b`; new labels fill exactly the gaps. Old differences
remain `1..m`. The new edge at `d` has difference `m+1`; the new leaf edges have
differences `m+2..m+b+1`. The leaf labeled zero meets the final maximum `5b+6`.
This proves the pendant-maximum claim. Complementation gives another witness.

## Literature status and limits of the earlier route

[Krop, arXiv:1402.3994v1](https://arxiv.org/pdf/1402.3994v1),
*Lobsters with an almost perfect matching are graceful*, Definition 2.1,
Theorem 2.2 and the displayed formula on printed p.2, gives the delta operation
above. Substitute base order two and rooted-copy order `q+1`. Krop attributes
it to Stanton and Zarnke, *Labeling of balanced trees* (1973), pp.479–495.
We checked Krop's version and formula, not the full 1973 original.

The final attachment specializes graceful-plus-alpha amalgamation:
[Wu–Lu (2012)](https://combinatorialpress.com/article/ars/Volume%20106/volume-106-paper-20.pdf),
Theorem 3.1, printed pp.239–240, with the ordinary-graceful extension on p.242.
The existing [priority review](spider-priority-review.md#the-established-construction)
records the checked primary statements. The attached star has boundary `b`,
shared leaf zero, center `b+1`, and other leaves `1..b`.

No priority claim is made for this composite formula. Search misses would not
establish novelty: its derivation from older constructions already settles that.

Deleting a branch changes the chosen center's degree parity. The literal
Mishra–Panigrahi (2010) tables impose opposite central degree parities in their
diameter-five specialization. After deletion, `T_b` has center degrees `(2,4)`
or `(3,3)`. Being outside that route does not prevent a central-zero labeling:
the delta construction supplies one for the `(3,3)` remainder. The table scope
is in Theorems 3.4/3.7, Tables 3.1–3.3, and Remark 3.9 of the
[primary paper](https://dml.cz/bitstream/handle/10338.dmlcz/140703/MathBohem_135-2010-3_3.pdf),
printed pp.264–266, 274 and 277; opposite parity alone is not sufficient.

[Barrientos (2019)](https://dergipark.org.tr/en/download/article-file/675268),
Lemma 4.1/Theorem 4.2, printed pp.8–9, also applies to `G_b` as two identical
diameter-four caterpillars joined at their centers. Its displayed center labels
are `b` and `3b+3`; that output alone does not meet the central-zero premise.
A different established construction does. A gap in one formula is not an open
theorem.

Another known consequence covers nontrivial branch counts `(2,1)` at the two
centers, with arbitrary branch leaf counts and direct pendants at the centers.
Delete a branch from the two-branch side. The remainder is a diameter-five
caterpillar. [Luiz–Campos–Richter, IC-17-12 (2017)](https://ic.unicamp.br/~reltech/2017/17-12.pdf),
Lemma 18, printed p.9, permits zero at either prescribed center; star attachment
then gives a pendant maximum. Theorem 19, p.11, proves those caterpillars are
0-rotatable.

## Reproduction

From `graceful-trees/`, using a fresh output filename:

```sh
python3 -S scripts/check_diameter_five_pendant.py --output /tmp/diameter-five-check.json --seconds 15
```

The [standalone checker](../scripts/check_diameter_five_pendant.py) requires no
solver or third-party libraries. Its separate verifier checks connectivity,
simple tree structure, exact vertex and difference sets, and the pendant maximum.
The [saved evidence](../examples/diameter-five-pendant-constructions.json)
contains a complete 17-vertex witness (`b=2`), source hash, Python version and
parameter list. The initial run checked 408 witnesses over 102 parameter values:
seed, doubled tree, final tree and complemented final tree. The largest final
tree had 5,007 vertices. A parent process enforced a 20-second limit in addition
to the checker's cooperative 15-second budget.

These finite checks validate the implementation; the universal conclusion comes
from the written proof. No Lean check, new exhaustive coverage or new mathematical
discovery is claimed. Cloud budgets and solver defaults are unchanged.
Nonuniform branch sizes need a separate construction or proof. Failure of the
identical-copy argument would not establish their novelty or infeasibility.
