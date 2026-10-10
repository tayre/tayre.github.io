A spectral remainder in the Hellinger-to-information implication
Tom Ayre
ayre.tom@gmail.com
Updated October 10, 2026

A short research note on a potentially new quantitative refinement.
The general theorem assumes the cited full-bias Hellinger inequality.
An antipodal corollary uses Ky's separate Hellinger theorem.
Novelty and publication significance remain unconfirmed.

Files
  hellinger-stability.pdf: paper
  hellinger-stability.tex: complete standalone LaTeX source
  check_hellinger_stability.py: finite numerical diagnostics
  requirements.txt: Python diagnostic dependency
  source-verification-summary.json: source certificate replay summary
  index.html: simple discovery and download page
  sitemap.xml: URLs for search engines

Read online
  https://tayre.github.io/hellinger-stability/

Build the PDF
  tectonic hellinger-stability.tex
  Alternatively, run pdflatex twice on the source.

Run the diagnostics (Python 3.10 or newer)
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
  .venv/bin/python check_hellinger_stability.py

The diagnostic enumerates every Boolean function in dimensions 1 through 4
at eight correlations. All 526,496 cases passed on October 10, 2026 at
floating-point tolerance 1e-12. This does not prove the theorem.

The source-certificate replay occurred on October 7, 2026 and checked
finite arithmetic certificates, not the complete underlying analytic proof.
Its summary contains source hashes and outcomes, without machine-local paths.
The source package and its instructions are in openai/math at revision
adc7f1241b42e322a6451854ab7e4b4c146bf78a under
preprints/Hellinger-contraction-with-arbitrary-Boolean-output-bias-September-24-2026.

The note, code, and internal reviews were prepared with assistance from Codex.
No formal kernel verification or external peer review is claimed.
