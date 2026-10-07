# A quantitative refinement of a depth-three circuit lower bound

**Tom Ayre**

[Read the paper and download its resources](https://tayre.github.io/depth-three/).

This note derives an explicit asymptotic rate for the existing depth-three circuit construction: for some absolute constant `c > 0` and all sufficiently large input lengths `n`, the required number of OR–AND–OR gates exceeds

```text
2^(c sqrt(n ln(n) / ln(ln(n)))) .
```

The refinement combines the original construction and restriction lemma with quantitative disjoint CNF sparsification, allowing the width parameter to grow with the input length. The result is asymptotic; the sufficient input-size threshold in the present proof is enormous. No numerical value of `c` is certified.

## Files

- `depth-three-quantitative-bound.pdf`: the paper.
- `depth-three-quantitative-bound.tex`: standalone LaTeX source for the paper.
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

Build the paper with Tectonic:

```sh
tectonic --untrusted depth-three-quantitative-bound.tex
```

Alternatively, run `pdflatex depth-three-quantitative-bound.tex` twice with a standard LaTeX installation to resolve references.

## Attribution and status

The language, polynomial-time algorithm, qualitative lower bound, and restriction lemma come from OpenAI’s *Beyond the Square-Root Exponent for Depth-Three Boolean Circuits*. The source revision used is [`adc7f1241b42e322a6451854ab7e4b4c146bf78a`](https://github.com/openai/math/tree/adc7f1241b42e322a6451854ab7e4b4c146bf78a/preprints/Beyond-the-Square-Root-Exponent-for-Depth-Three-Boolean-Circuits-September-23-2026). The new claim is the quantitative parameter schedule and its resulting explicit growth rate. The paper cites the published sparsification results on which that implication depends.

Novelty and publication priority remain unconfirmed. The manuscript was prepared with assistance from Codex; no fresh Lean kernel verification was performed.
