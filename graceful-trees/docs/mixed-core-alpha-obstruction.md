# A 32-vertex obstruction to a prescribed-center alpha labeling

Recorded 26 November 2026. **Status: independently checked finite result;
priority unestablished, no novelty claim.**

**27 November follow-up:** the [infinite-family proof](mixed-core-alpha-tail.md)
now excludes this prescribed alpha placement for every `G(1,l)` with `l>=5`.
The finite certificate below remains independent evidence for `l=5`.

The tree below can be gracefully labeled with its specified center `d` equal to
zero. However, it cannot do so with the additional **alpha** requirement: every
label in one bipartition class must be smaller than every label in the other.
This closes one proposed construction route, not the broader center-zero
question or the Graceful Tree Conjecture.

## Exact input and claim

Join centers `c,d`. Attach supports `A,B` to `c`, and `C,D` to `d`. Give those
supports respectively **2, 3, 10, 11 leaves**, with no other vertices or edges.
There are 32 vertices and 31 edges. In the saved numbering, `c=0` and `d=1`.

```text
  2 leaves — A                 C — 10 leaves
               \             /
                  c ——— d
               /             \
  3 leaves — B                 D — 11 leaves
```

The claim is that **no alpha labeling of this exact tree assigns zero to `d`**.
The class containing `d` has 24 vertices, so its labels would have to be
`0..23`; the other eight vertices would have labels `24..31`. We do not require
any particular neighbor of `d` to receive 31.

This tree is `G(1,5)` in the working family `G(k,l)`, whose four branch leaf
counts are `(2k,2k+1;2l,2l+1)`. Consequently the proposed statement
“every `G(1,l)`, `l>=5`, admits an alpha labeling with `d=0`” is false.
Other values of `l`, other zero vertices, and alpha labelings without this root
restriction are not classified here.

## Why the finite search is exhaustive

Write the labels of `c,C,D` as `24+H,24+K,24+L`, where `H,K,L` are distinct
members of `0..7`. Write `f(A)=u` and `f(B)=v`, with distinct `u,v` in `1..23`.
Summing all edge differences, using the separated bipartition, gives the
necessary identity

```text
2u + 3v = 2H + 10K + 11L.
```

All 336 ordered high-label triples are included, including `H=7`. Exactly
1,486 ordered low-label pairs satisfy this identity. For each pair, choose any
two of the five remaining high labels for the leaves of `A`; the other three
belong to `B`. This gives **14,860 cases**. Permutations of leaves attached to
the same support are graph automorphisms fixing the centers, so using label
sets preserves existence of every relevant solution.

Each case fixes ten edge differences. If these are distinct, the remaining
21 low labels must be assigned as leaves of `C` or `D`. A remaining label `x`
can supply only differences `24+K-x` and `24+L-x`. Each certificate entry
exhibits a local obstruction:

| Obstruction | Cases |
| --- | ---: |
| Repeated fixed edge difference | 7,976 |
| Remaining vertex label with no available difference | 6,660 |
| Remaining difference with no available vertex label | 223 |
| Two remaining labels competing for one difference | 1 |

The last case has `c=28, C=31, D=24, A=15, B=16`. Remaining vertex labels
**3 and 10 can each produce only remaining difference 21**. Both cannot use
it. This is a two-element Hall obstruction; no completion is possible.

The checker regenerates the entire domain from the graph, verifies exact
certificate coverage, and checks each obstruction directly. It calls neither
a solver nor a matching algorithm. An earlier independent implementation also
reproduced the result using direct low-label loops and general bipartite
matching. The certificate is a custom finite-domain proof, **not** a SAT proof
format or a Lean formalization.

## Positive witness and reproduction

The [evidence record](../examples/mixed-core-alpha-obstruction.json) contains
the complete numbered graph, an ordinary graceful witness with `d=0`, exact
scope, provenance and certificate hashes. The independent checker verifies
that witness as well as the negative certificate.

From `graceful-trees/`, run:

```sh
python3 -S scripts/check_mixed_core_alpha.py
```

The [compressed certificate](../examples/mixed-core-alpha-certificate.json.gz)
is about 52 KB. The check needs Python 3.11 or newer and only its standard library. It establishes
this fixed input's restricted exclusion; it does not search arbitrary trees.

The original three-second CP-SAT alpha attempt returned **unknown**, which is
retained in the working archive. The later structural enumeration exhausted
its explicitly finite domain. A separate three-second ordinary rooted model
found the positive witness. These are different evidence stages, not a timeout
being relabeled as infeasible. Their timings are not a controlled speedup claim.

## Relation to prior work

Ordinary gracefulness of all diameter-five trees is established by
[Hrnčiar and Haviar (2001)](https://doi.org/10.1016/S0012-365X(00)00233-8).
Our positive witness additionally checks the chosen zero position directly.

[Ghosh, arXiv:1306.2932v2](https://arxiv.org/pdf/1306.2932v2), Definition 4.7
and Theorem 4.9, pp.20–22, give alpha constructions for balanced lobsters. With
two branches at each center, that definition forces all four branch leaf counts
to agree. It does not cover this input.

[Hua, Krop and Raridan, arXiv:1412.6984v1](https://arxiv.org/pdf/1412.6984v1),
pp.2–3, give a seven-vertex counterexample to a **joint** placement of the
critical and maximum labels at the two centers. That example has central
degrees `2,2`, and its chosen center can separately be critical or maximum.
Those placements permit zero under standard alpha transformations. Thus their
joint restriction is different from the single prescribed-zero restriction
checked here.

[Brinkmann et al. (2012)](https://backoffice.biblio.ugent.be/download/3047437/5748774),
Lemma 5.1, pp.167–168, supplies a conditional continuation route: a suitable
alpha seed with seven consecutive leaf labels at each large support would
extend to larger parameters while preserving `d=0`. This result provides no
such seed at `l=5`. This finite result alone did not rule out later parameters;
the [27 November proof](mixed-core-alpha-tail.md) now excludes every later seed
with this same alpha and zero-position requirement.

These comparisons do **not** establish priority. In particular, the full text
of Mishra–Panigrahi (2007) was unavailable, and this was a bounded literature
review rather than an exhaustive novelty assessment. The useful conclusion is
precise: a universal prescribed-center construction for this family must allow
interleaved labels across the bipartition, or exclude this parameter from its
alpha stage. The broader graceful center-zero question remains open in this
investigation.
