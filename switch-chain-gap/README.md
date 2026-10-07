# A sharp spectral-gap refinement for the switch chain

Tom Ayre<br>
ayre.tom at gmail.com

A conditional research note proposing the sharp bound `lambda_2(L) >= 2`
for the unnormalized switch Laplacian of every nontrivial realization
space of a simple undirected graphical degree sequence. Each distinct
valid switch neighbor is counted once. For the source's lazy proposal
chain this gives `gap(P) >= 1/(6 binom(n,4))` and an `O(n^6)` mixing-time
bound. Only the spectral-gap constant is claimed sharp.

The proof retains two lemmas from
[OpenAI's source manuscript](https://github.com/openai/math/tree/adc7f1241b42e322a6451854ab7e4b4c146bf78a/preprints/Polynomial-Mixing-of-the-Switch-Chain-for-Every-Graphical-Degree-Sequence-September-25-2026)
and strengthens its disjoint-pair estimate from `D >= 0` to `D >= H`.
This is a potentially novel quantitative refinement. Priority is not
established. The closest located sharp result is for
[bipartite fixed-margin graphs](https://arxiv.org/abs/2606.22636).

## Files

- `switch-chain-gap.pdf`: readable research note.
- `switch-chain-gap.tex`: LaTeX source, including assumptions and proof.
- `audit-switch-gap.txt`: local AI-assisted audit and literature notes.
- `check_switch_gap_candidate.py`: operator and spectral diagnostics.
- `check_switch_gap_independent.py`: separate direct-Laplacian diagnostic.
- `index.html` and `sitemap.xml`: landing page and search discovery metadata.

## Reproduce

With Python 3.11 and NumPy/SciPy installed:

```sh
python3.11 check_switch_gap_candidate.py
python3.11 check_switch_gap_independent.py
```

Alternatively, let `uv` supply the dependencies:

```sh
uv run --python 3.11 --with numpy python check_switch_gap_candidate.py
uv run --python 3.11 --with numpy --with scipy python check_switch_gap_independent.py
```

The operator diagnostic covers 144 degree-sequence classes on four through
six vertices, scanning 33,856 labeled graphs. It checks `D >= H`,
`H^2 >= 2H`, `L >= H`, and the nontrivial spectral gaps.
The separate direct-Laplacian diagnostic covers all 486 degree-sequence
classes on four through seven vertices, including 366 nontrivial classes.
Its minimum observed gap is 2, within tolerance `1e-7`.
Enumeration grows exponentially, so larger sizes can be expensive.

Rebuild the PDF with Tectonic:

```sh
tectonic --untrusted switch-chain-gap.tex
```

Or run `pdflatex switch-chain-gap.tex` twice.

## Status

Prepared with assistance from Codex. Separate local AI-assisted audits
found no proof gap, but this is not external human peer review.
The theorem remains explicitly conditional on the source's triple and
slice inequalities. The scripts are floating-point diagnostics, not
proofs. No fresh Lean kernel verification was performed. Novelty remains
unconfirmed.
