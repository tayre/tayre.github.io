# An infinite family without a prescribed-center alpha labeling

Recorded 27 November 2026. **Status: independently reviewed elementary proof;
priority unestablished, no novelty claim.** This is a written proof, not a Lean
formalization or a conclusion extrapolated from a numerical sweep.
The independent reviews were within this project; external peer review has not
been obtained.

## Statement and scope

Let `G(1,l)` have adjacent centers `c,d`, supports `A,B` adjacent to `c`, and
supports `C,D` adjacent to `d`. Give `A,B,C,D` respectively `2,3,2l,2l+1`
pendant leaves, with no other vertices or edges.

```text
  2 leaves — A                 C — 2l leaves
               \             /
                  c ——— d  (zero)
               /             \
  3 leaves — B                 D — 2l+1 leaves
```

**Theorem.** For every integer `l >= 5`, `G(1,l)` has no alpha labeling assigning
zero to `d`.

Here a graceful labeling bijectively assigns `0..q` to the vertices of a
`q`-edge tree and induces edge differences `1..q`. An alpha labeling additionally
separates its two bipartition classes: every label in one class is smaller than
every label in the other.

The theorem concerns an infinite family of orders **32, 36, 40, ...**, with one
specified zero vertex and the additional alpha condition. It does **not** say
these trees are nongraceful, or exclude ordinary graceful labelings with `d=0`.
The [earlier finite result](mixed-core-alpha-obstruction.md) includes a verified
ordinary `d=0` witness for `G(1,5)`. Alpha labelings with other zero vertices are
not classified here.

The cutoff is sharp for this statement: the archived `G(1,4)` witness reproduced
below is alpha with `d=0`. This observation does not classify every smaller
parameter.

## Notation and necessary identities

Suppose an alpha labeling `f` with `f(d)=0` exists. Put

```text
s = 4l+3,     P = s+1 = 4l+4,     q = P+7 = 4l+11.
```

The class containing `d` consists of `d,A,B` and the leaves of `C,D`. Its
`4l+4` vertices must receive `0..s`. The other eight vertices must receive
`P..P+7`. Write

```text
f(c)=P+H,   f(C)=P+K,   f(D)=P+L,
f(A)=u=P-U,             f(B)=v=P-V.
```

The offsets `H,K,L` are distinct members of `0..7`; `U,V` are distinct integers
in `1..s`. The five remaining high offsets are split between the two leaves of
`A` and the three leaves of `B`.

Summing edge differences as high label minus low label gives

```text
2u + 3v = 2H + 2lK + (2l+1)L,
```

or equivalently

```text
2U + 3V = 2l(10-K-L) + 20 - 2H - L.                 (1)
```

For completeness, the high-label sum is `8P+28`, the low-label sum is `sP/2`,
and the corrections to these sums from degrees exceeding one are
`2f(c)+2l f(C)+(2l+1)f(D)-2u-3v`; the correction at `d` vanishes. Equating the
result to `q(q+1)/2` gives the displayed identity. Since `U,V` are positive and
distinct, `2U+3V >= 7`.

Difference `q` can only join labels `0,q`, so **7 is one of `H,K,L`**. Difference
1 can only join labels `s,P`. We will use both consequences without imposing
any additional restriction on the location of the maximum.

An edge from `A` to a high vertex of offset `h` has difference `U+h`; the
corresponding expression at `B` is `V+h`. In particular `cA,cB` have differences
`U+H,V+H`.

## The minimum high label cannot be at a large support

This part holds for every `l >= 1`. Suppose one of `C,D` has label `P`, and the
other has label `P+g`, where `g >= 1`. Set

```text
w = min(U,V) = P-max(u,v).
```

Every high vertex on the `c` side has label at least `P+1`. Thus all seven
edges `cA,cB` and the five edges to leaves of `A,B` have differences at least
`w+1`. The three edges incident with `d` have differences at least `P>w`.
Consequently differences `1,...,w` must be realized by leaves of the two large
supports.

We prove successively that difference `j`, for `1 <= j <= w`, forces the
support labeled `P` to have a leaf labeled `P-j`. A leaf at the other support
would need label `P+g-j`. If `j <= g`, this is at least `P`, outside the low
class. If `j > g`, it equals `P-(j-g)`, already used as a leaf of the support
labeled `P` at an earlier induction step. It therefore cannot be used at the
other support. The stated leaf is forced.

At `j=w`, however, `P-w=max(u,v)` is the label of an internal support `A` or
`B`, not a leaf. This is a contradiction. Hence

```text
K > 0 and L > 0.                                    (2)
```

## Consequences when both large offsets are positive

By (2), the vertex labeled `P` is `c` or a leaf of `A,B`. The edge of difference
1 therefore forces `u=s` or `v=s`, equivalently

```text
min(U,V)=1.                                         (3)
```

The label `s` is now unavailable to leaves of `C,D`. If `r=min(K,L)`, every
large-support leaf edge has difference at least `r+2`. Call the low support
whose gap is 1 the *critical support*. The other gap is at least 2.

We split according to the location of the maximum label.

## Case I: the maximum is at `c`

Here `H=7` and `K,L` are distinct members of `1..6`. Difference `q-1` requires
either a large support of offset 6 adjacent to `d`, or an internal low support
of label 1 adjacent to `c`.

The latter possibility is impossible for `l>=5`. If `(u,v)=(s,1)`, the balance
identity gives

```text
2l(4-K-L)=5+L.
```

Its positive right side forces `K+L<=3`, hence `{K,L}={1,2}`. The right side
is 6 or 7, whereas the left side is at least `2l>=10`. If `(u,v)=(1,s)`, it gives

```text
2l(6-K-L)=3+L.
```

Again the positive left side is at least 10, but the right side is at most 9.
Thus one large offset is 6. Write `{K,L}={6,r}`, where `1<=r<=5`. Equation (1)
becomes

```text
2U+3V = 2l(4-r)+6-L.                                (4)
```

For `r>=4`, the right side is at most 2, contradicting `2U+3V>=7`.

For `r=3`, first let `U=1`. Then `V=(2l+4-L)/3`, with `L=3` or 6. For `L=3`
this exceeds 3 when `l>=5`. For `L=6`, integrality forces `l=1 mod 3`; the
first such `l>=5` is 7, again giving `V>=4`. Differences 1, 2, 3 must be leaf
edges at `A`: large-support leaf differences are at least 5, `cA,cB` have
differences at least 8, and edges at `B` have differences at least 4. But `A`
has only two leaves. If instead `V=1`, equation (4) excludes `L=6` by parity;
`L=3` gives `U=l>=5`. Differences 1, 2, 3 force `B` to use leaf offsets 0, 1, 2.
Difference 4 would require offset 3, already occupied by a large support.

For `r=2`, both possible values of `L` are even. Equation (4) excludes `V=1`
by parity, so `U=1`. It then gives `V=(4l+4-L)/3>=6` whenever integral.
Differences 1, 2, 3 must all be leaf edges at `A`, since large-support leaf
differences are at least 4. Again `A` has only two leaves.

For `r=1`, `L=6` gives `2U+3V=6l`. Then `U=1` would give the noninteger
`V=(6l-2)/3`, and `V=1` would give the noninteger `U=(6l-3)/2`. If `L=1`, these
possibilities give respectively `V=2l+1` or `U=3l+1`. The noncritical gap
therefore exceeds 2. Difference 2 would require a critical-support edge to
offset 1, which is occupied by a large support. Large-support leaf differences
are at least 3. This is the final contradiction in Case I.

## Case II: the maximum is at a large support

Write `{K,L}={7,r}`, where `1<=r<=6`.

For `r>=4`, `K+L>=11` and `L>=4`, so the right side of (1) is at most
`20-2l-4<=6`, contradicting `2U+3V>=7`.

For `r=2`, large-support leaf differences are at least 4. Difference 3 cannot
come from the critical support: it would require offset 2, already occupied
by a large support. The other gap must consequently be 2 or 3, so
`2U+3V<=11`. Equation (1), however, gives

```text
2U+3V = 2l+20-2H-L >= 2l+1.
```

This excludes `l>=6`. At `l=5`, equality is possible only for
`H=6,K=2,L=7,U=1,V=3`. Differences 1 and 2 then force the two `A`-leaf offsets
0 and 1. Difference 3 would require a `B` leaf of offset 0, already used.

For `r=1`, large-support leaf differences are at least 3. Difference 2 cannot
come from the critical support because offset 1 is occupied by a large
support. The other gap must therefore be 2 and use offset 0. Difference 1 also
requires the critical support to meet offset 0. Only `c` is adjacent to both
`A` and `B`, so `H=0` and `{U,V}={1,2}`. Thus `2U+3V` is 7 or 8, while (1)
gives `4l+20-L>=4l+13>8`.

It remains to exclude `r=3`, the gap-four case.

## The ten gap-four cases

If `(K,L)=(3,7)`, equation (1) reads `2U+3V=13-2H`; if `(K,L)=(7,3)`, it
reads `2U+3V=17-2H`. Combine this with `min(U,V)=1`, `U!=V`, and
`H` in `{0,1,2,4,5,6}`. The following ten rows are the complete possibilities.
Indeed, `V=1` gives respectively `U=5-H` or `U=7-H`; `U=1` adds only
`(H,V)=(1,3)` or `(0,5)` after excluding `U=V=1`.

In the table, `A:h` or `B:h` denotes a leaf at that support with high offset
`h`. Each offset is used by exactly one high vertex. Large-support leaf
differences are at least 5, and the three edges at `d` have differences greater
than 6. The entries identify an absent difference after the specified smaller
differences have been forced.

| K | L | H | U | V | Missing | Forcing contradiction |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 3 | 7 | 0 | 5 | 1 | 4 | An edge at `A` has difference at least 5; `B` would need offset 3, occupied by `C`. Neither central edge gives 4. |
| 3 | 7 | 1 | 4 | 1 | 4 | Difference 1 forces `B:0`; difference 3 forces `B:2`. Difference 4 needs `A:0`, already used, or occupied offset 3 at `B`. |
| 3 | 7 | 2 | 3 | 1 | 4 | Differences 1,2 force `B:0,B:1`. Difference 4 needs `A:1`, already used, or occupied offset 3 at `B`. |
| 3 | 7 | 1 | 1 | 3 | 6 | Differences 1,3 force `A:0,A:2`, filling `A`. A `B` edge of difference 6 needs occupied offset 3. The only possible large-support leaf edge of difference 6 would use label `P-3=v`, already at `B`. |
| 7 | 3 | 0 | 7 | 1 | 4 | An edge at `A` has difference at least 7; `B` would need offset 3, occupied by `D`. Neither central edge gives 4. |
| 7 | 3 | 1 | 6 | 1 | 4 | An edge at `A` has difference at least 6; `B` would need occupied offset 3. Central differences are 7 and 2. |
| 7 | 3 | 2 | 5 | 1 | 4 | An edge at `A` has difference at least 5; `B` would need occupied offset 3. Central differences are 7 and 3. |
| 7 | 3 | 0 | 1 | 5 | 4 | An edge at `A` of difference 4 needs occupied offset 3; edges at `B` have difference at least 5. Neither central edge gives 4. |
| 7 | 3 | 4 | 3 | 1 | 4 | Differences 1,2,3 successively force `B:0,B:1,B:2`. Difference 4 needs `A:1`, already used, or occupied offset 3 at `B`. |
| 7 | 3 | 5 | 2 | 1 | 4 | Differences 1,2,3 successively force `B:0,B:1,B:2`. Difference 4 needs `A:2`, already used, or occupied offset 3 at `B`. |

Every row is impossible. Cases I and II exhaust the possible locations of
the maximum under (2), while the preceding induction excludes a zero large
offset. This proves the theorem for every integer `l>=5`.

## The adjacent positive parameter

The following archived labeling of `G(1,4)` was independently checked on
25 November and is reproduced here so the cutoff does not depend on access to
the working archive. The leaf entries give labels, with arbitrary order among
leaves at the same support.

| Vertex | Label | Labels of its pendant leaves |
| --- | ---: | --- |
| c | 20 | none |
| d | 0 | none |
| A | 19 | 26,25 |
| B | 18 | 23,22,21 |
| C | 27 | 14,5,1,11,4,17,8,2 |
| D | 24 | 3,9,6,7,10,12,13,15,16 |

With the internal edges `cd,cA,cB,dC,dD`, these labels give exactly `0..27`
on vertices and `1..27` on edges. The class containing `d` receives `0..19`,
and the other class receives `20..27`. Thus the all-parameter exclusion cannot
be extended from `l>=5` to `l>=4`.

## Reproduce the finite supporting checks

From the repository root, using Python 3.11 or later:

```sh
python3 graceful-trees/scripts/check_mixed_core_alpha_tail.py
cd graceful-trees
python3 -m pytest tests/test_mixed_core_alpha_tail.py
```

The first command uses only the standard library. The test command uses the
project's pinned development dependencies. The saved
[evidence](../examples/mixed-core-alpha-tail.json) contains the boundary graph,
labeling, original solver provenance and ten anchor tuples. The
[standalone checker](../scripts/check_mixed_core_alpha_tail.py) regenerates the
anchor table, checks all 100 choices for the two `A` leaves, and independently
verifies the boundary tree, label permutation, difference permutation, zero
vertex and alpha split. Tests reject altered tables and invalid witnesses,
including an ordinary graceful witness that is not alpha.

These checks validate the finite table and boundary witness only. The infinite
conclusion uses the written algebra and induction above; neither this program
nor the existing project Lean files formally verifies that argument. No new
solver run is needed to reproduce these checks.

## Prior work and evidence limits

The [finite certificate for `G(1,5)`](mixed-core-alpha-obstruction.md) preceded
this proof. That certificate checks one parameter. The argument above proves
the infinite statement directly through identities, induction and bounded
symbolic cases; the later finite `G(1,6)` control is not a premise.

Ordinary gracefulness of diameter-five trees is established by
[Hrnčiar and Haviar (2001)](https://doi.org/10.1016/S0012-365X(00)00233-8).
The present root-and-alpha restriction is stronger than ordinary gracefulness.

[Ghosh, arXiv:1306.2932v2](https://arxiv.org/pdf/1306.2932v2), Definition 4.7
and Theorem 4.9, pp.20–22, supplies alpha constructions for balanced lobsters.
With two branches at each center, that definition forces all four branch leaf
counts to agree, so it does not cover this family.

[Brinkmann et al. (2012)](https://dmtcs.episciences.org/569/pdf), Lemma 5.1,
pp.167–168, supplies a known insertion construction conditional on consecutive
pendant-label runs. Applied here, an alpha seed with seven consecutive leaf
labels at each large support would extend to larger parameters while retaining
`d=0`. The theorem excludes any such seed at `l>=5`; the insertion lemma by
itself did not guarantee one.

[Hua, Krop and Raridan, arXiv:1412.6984v1](https://arxiv.org/pdf/1412.6984v1),
pp.2–3, exhibits a seven-vertex obstruction to the **joint** placement of
critical and maximum labels at the two centers. Its chosen center can
separately be critical or maximum; standard alpha transformations permit zero.
This differs from excluding every alpha labeling with one prescribed center
zero.

Priority remains unestablished. The bounded review did not obtain the original
Huang–Kotzig–Rosa (1982) proof or the full Mishra–Panigrahi (2007) text. A
[2017 primary report by Luiz, Campos and Richter](https://ic.unicamp.br/~reltech/2017/17-14.pdf),
p.2, attributes a non-alpha result for noncaterpillar diameter-four trees to the
1982 paper; that attribution does not itself give a root-preserving reduction
for the present diameter-five family. No novelty claim follows from these
source-access gaps or from a search failing to locate the exact statement.
