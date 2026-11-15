# Seven-edge symmetric spiders: an amalgamation consequence

**15 November 2026. Status:** consequence of established constructions; no claim
of a new theorem. Two finite α-labeled path seeds specialize the same classical
amalgamation used in the [five-edge priority review](spider-priority-review.md).
This removes seven-edge 0-rotatability from this project's proposed new-result
targets. The argument below proves the statement for every leg count; numerical
checks verify its implementation, not its universal quantifier.

## Statement and conventions

For every integer `k >= 1`, let `S(k,7)` have hub `h` and `k` otherwise disjoint
paths `h—v[i,1]—...—v[i,7]`. Each leg has **seven edges**, and the tree has
`7k+1` vertices. Put `v[i,0]=h`. For each chosen leg `i` and each
`d in {0,2,4,6}`, there is a graceful labeling `F` satisfying

```text
F(v[i,d]) = 0,       F(v[i,d+1]) = 7k.
```

Complementation, `F ↦ 7k−F`, supplies zero at depths `1,3,5,7`. Thus every
vertex can receive zero in some graceful labeling: **0-rotatability**. Different
chosen vertices may require different labelings. Permuting equal legs selects
any leg. The one- and two-leg cases are paths with the displayed hub distinguished.

## Established amalgamation

Let `G` have `m` edges and an ordinary graceful labeling `g`, with a chosen
vertex labeled zero. Let `H` have `n` edges and an α-labeling `f` with boundary
`s`: every edge crosses between labels at most `s` and labels greater than `s`.
Identify the two zero vertices, adding no edge, and use

```text
on G:                    g + s
on H where f <= s:       s − f
on H where f > s:        m + n + s + 1 − f.
```

The shared vertex receives `s`. Old differences remain unchanged; a difference
`a` on `H` becomes `m+n+1−a`. This is the published construction, not a new
operation. The ordinary gracefulness of `G` suffices; it need not be α-labeled
or “gracious.” Sources and their exact hypotheses are recorded below.

## Interior pairs at depths 2/3 and 4/5

Take these paths, each with **14 edges and 15 vertices**, indexed `0..14`:

```text
depth 2 seed: 12,4,11,2,13,1,14,0,10,6,7,5,8,3,9
differences:  8,7,9,11,12,13,14,10,4,1,2,3,5,6

depth 4 seed: 9,5,11,2,13,1,14,0,10,3,8,6,7,4,12
differences:  4,6,9,11,12,13,14,10,7,5,2,1,3,8
```

Each label set is `0..14`, each difference set is `1..14`, and every edge
crosses the boundary **`s=6`**. The midpoint, index 7, is zero. In the first
seed, indices 9/10 carry `6,7`; in the second, indices 11/12 carry `6,7`.
These are simultaneous position constraints, checked directly—not inferred
from a theorem merely allowing zero at one prescribed path vertex.

For `k >= 3`, use a known hub-zero labeling of `G=S(k−2,7)` and set
`m=7(k−2)`. Amalgamating its hub with the path midpoint adds exactly two
seven-edge legs. The new hub is 6. On either selected seed, its `6,7` pair
becomes `0,m+14=7k` at the required outward depths.

The vertex ranges after relabeling are `0..6` on the path's low part,
`6..m+6` on `G`, and `m+7..m+14` on the path's high part. Only the identified
hub shares label 6. These ranges therefore give every label in `0..7k` exactly
once. Old differences are `1..m`; each path difference `a` becomes `m+15−a`,
giving `m+1..m+14`. This proves gracefulness for every such `k`.

For `k=2`, the same argument uses a singleton `G`, `m=0`, and no old edges.
For `k=1`, the following full path labelings, starting at the distinguished hub,
supply the two pairs directly:

```text
depth 2: 1,6,0,7,3,4,2,5     differences: 5,6,7,4,1,2,3
depth 4: 2,5,3,4,0,7,1,6     differences: 3,2,1,4,7,6,5
```

## Outer pairs and a hub-zero construction

The known hub-zero construction of `S(r,7)`, for `r >= 1`, can be written as
hub 0 and the following seven labels on leg `j`, `0 <= j < r`:

```text
7(r−j), 7j+1, 7(r−j)−1, 7j+2, 7(r−j)−2, 7j+3, 7(r−j)−3.
```

The residues modulo seven partition the labels `1..7r`. Hub-edge differences
are `7,14,...,7r`; all other differences are the absolute values of
`7(r−2j)−b`, for `0 <= j < r`, `1 <= b <= 6`. These are distinct nonzero
nonmultiples of seven below `7r`: equal signed values force identical `j,b`,
and opposite values would require `14(r−j−j')=b+b'`, impossible for
`2 <= b+b' <= 12`. Hence they cover the remaining differences. This also
supplies zero/max at depths 0/1. For `r=0`, use a singleton labeled zero.

For depths 6/7, amalgamate the hub of `S(k−1,7)` with the zero endpoint of
the α-labeled seven-edge path `(0,7,1,6,2,5,3,4)`, boundary `s=3`.
Its differences are `7,6,...,1`. The new hub is 3 and the new leg is

```text
7k−3, 2, 7k−2, 1, 7k−1, 0, 7k.
```

The same interval and difference argument proves this construction, including
`k=1` with a singleton old graph. All four pairs are now covered without
assuming any unproved extension property.

## Sources and priority limits

- [Wu–Lu (2012)](https://combinatorialpress.com/article/ars/Volume%20106/volume-106-paper-20.pdf),
  *On the Constructions of New Families of Graceful Graphs*, Theorem 3.1,
  printed pp.239–240, gives α-amalgamation. The paragraph on **p.242 immediately
  before Theorem 3.6** explicitly permits one input labeling to be only graceful.
  The relevant scanned statements were checked directly.
- [Bell–Cummins (2019)](https://ajc.maths.uq.edu.au/pdf/75/ajc_v75_p343.pdf),
  *Graceful pairings*, **pp.353–354**, restate ordinary graceful + α amalgamation
  and display its relabeling. Proposition 4.4 adds “graciousness” under an extra
  assumption; our ordinary graceful conclusion does not need that assumption.
  They attribute the older result to Huang–Kotzig–Rosa, *Further results on tree
  labellings*, Utilitas Mathematica 21 (1982), 31–48, Lemma 2.1. The 1982 original
  was not obtained; the 2012 and 2019 primary texts establish the construction used.
- [Panpa–Imnang–Wasuanankul (2025)](https://onlinelibrary.wiley.com/doi/pdf/10.1155/jama/5826777),
  **p.2**, Theorems 2.1, 2.4 and 2.5, restate prescribed-zero path α-labelings,
  hub-zero symmetric spiders and amalgamation. Our finite seeds supply the
  additional simultaneous interior positions explicitly.
- [Rofa, arXiv:2312.16235v1 (25 December 2023)](https://arxiv.org/pdf/2312.16235v1),
  Corollary 2, **p.12**, gives the first two and last two levels; for seven-edge
  legs these are depths `0,1,6,7`. Corollary 3 covers legs of length at most three;
  **p.14** asks about longer legs. Such a question does not exclude implications
  of earlier constructions.

The bounded review did not locate a publication explicitly stating this exact
seven-edge corollary. That search miss establishes no novelty. The checked
2025–2026 spider extensions address other hypotheses; their statements do not
remove the older amalgamation implication. Rosa's 1977 original and Cattell's
2007 full text were not obtained in this review. No claim of exhaustive priority
research or external specialist review is made.

## Reproduction and verification scope

From `graceful-trees/`, using Python 3.11 or later and a new output path:

```sh
python3 -S scripts/check_seven_spider_amalgamation.py --output /tmp/seven-spider-amalgamation.json
```

The standard-library checker verifies the path seeds and constructed numbered
trees, vertex-label sets, actual edge differences, prescribed zero positions and
adjacent maximum labels. The [saved evidence](../examples/seven-spider-amalgamation.json)
records its source hash and finite checks. These checks do not replace the universal
range argument above. No Lean verification of this new note is claimed, and the
result neither settles the Graceful Tree Conjecture nor raises an exhaustive bound.

Validation on 15 November checked **824 constructed labelings**, covering all eight
zero depths at each of 103 leg counts (`1..100`, 256, 1,000 and 10,000), with a
largest tree of **70,001 vertices**. Selected legs vary deterministically. Tests
also check every vertex for several small leg counts, compare against the separate
labeling verifier, and reject corrupted labels, edges and prescribed positions.
The known ten-edge seed is a control. The two fourteen-edge seeds were found with
OR-Tools 9.14.6206, one worker, seed 20261115 and a ten-second solver limit each;
the standalone checker requires no solver. Review working records preserve that
discovery metadata separately from the directly checkable positive certificates.
