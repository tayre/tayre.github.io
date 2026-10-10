# A quantitative refinement of a depth-three circuit lower bound

**Tom Ayre**

**Research note**

[Read the research note and download its resources](https://tayre.github.io/quantitative-depth-three/).

This research note derives an explicit asymptotic rate for the existing depth-three circuit construction: for some absolute constant `c > 0` and all sufficiently large input lengths `n`, the required number of OR–AND–OR gates exceeds

```text
2^(c sqrt(n ln(n) / ln(ln(n)))) .
```

The refinement reuses the original construction and proof methods together with published quantitative disjoint CNF sparsification. Its contribution is a growing parameter schedule and uniform estimates that yield the explicit rate. The result is asymptotic; the sufficient input-size threshold in the present proof is enormous. No numerical value of `c` is certified.

## Files

- `depth-three-quantitative-bound.pdf`: the research note.
- `depth-three-quantitative-bound.tex`: standalone LaTeX source for the research note.
- `derivation-and-literature-notes.tex`: extended derivation and literature notes.
- `check_quantitative_depth_three.py` and `check_restriction_lemma.py`: reproducible finite diagnostics.
- `index.html` and `sitemap.xml`: the public abstract, download links, and search-engine discovery information.

## Reproduce

The diagnostic scripts use only the Python standard library. With Python 3.11:

```sh
python3.11 check_quantitative_depth_three.py
python3.11 check_restriction_lemma.py
```

The first checks exact constants and nine parameter examples. The second checks 534 formula–parameter cases for the restriction lemma. These finite diagnostics supplement the written proof; they are not a formal proof or a fresh Lean kernel verification.

Build the research note with Tectonic:

```sh
tectonic --untrusted depth-three-quantitative-bound.tex
```

Alternatively, run `pdflatex depth-three-quantitative-bound.tex` twice with a standard LaTeX installation to resolve references.

## Attribution and status

The language, polynomial-time algorithm, qualitative lower bound, and restriction lemma come from OpenAI’s *Beyond the Square-Root Exponent for Depth-Three Boolean Circuits*. The source revision used is [`adc7f1241b42e322a6451854ab7e4b4c146bf78a`](https://github.com/openai/math/tree/adc7f1241b42e322a6451854ab7e4b4c146bf78a/preprints/Beyond-the-Square-Root-Exponent-for-Depth-Three-Boolean-Circuits-September-23-2026). The research note documents the quantitative parameter schedule and the uniform estimates needed for its explicit growth rate. It cites the published sparsification results on which that implication depends.

This is a potentially new quantitative refinement of the existing result; novelty and publication priority remain unconfirmed. The research note was prepared with assistance from Codex; no fresh Lean kernel verification was performed.
