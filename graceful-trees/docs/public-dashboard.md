# Public research homepage

The project homepage is **https://tayre.github.io/**. It is a buildless GitHub Pages
site: the repository-root `index.html` uses `graceful-trees/site/` for its CSS,
JavaScript, and small SVG icon. Tom's contact and existing Hellinger paper link
remain in the footer. The site needs no API key, paid service, font CDN, or chart
library.

## What the dashboard shows

- Distinct trees attempted, independently verified graceful trees, unresolved
  cases, and recorded runs, all for the **nightly-v1** campaign.
- A cumulative chart with a keyboard-accessible run slider and last-30/all-run
  views. Runs are evenly spaced; this is a run-index chart, not elapsed-time sampling.
- Coverage by generation source or vertex count. Families can overlap; the saved
  source is not a disjoint mathematical classification of all trees.
- Current-run difficult cases, cumulative conservative review candidates, and
  proposed next experiments. Observations, candidate questions, and proofs remain
  separate.
- The complete recorded run history, downloadable CSV and public JSON, and links
  to the latest Actions run and full evidence artifact.
- A six-vertex graceful tree illustration and its label complement. This explanatory
  example is never added to the campaign totals.

The timestamp is the last completed, audited research result. It is **not** a live
job status. A snapshot older than 48 hours is visibly marked. The page refreshes
public JSON every five minutes while visible; this does not trigger computation.
On a network failure, a previously validated browser-local snapshot is labeled as
saved/offline. With no usable snapshot, the page shows an unavailable message and
no inferred counts. Invalid or inconsistent data cannot populate the dashboard.

## Unattended publication

The existing `graceful-research.yml` workflow has a separate **Publish public
progress** job, after the research job. It is limited to successful independent
audits of the nightly campaign on `master`. Other manually selected campaigns
retain their own artifacts without changing the homepage's campaign.

`scripts/publish_dashboard.py` downloads the workflow's results artifact, verifies
the selected files against saved SHA-256 checksums, checks the exact repository,
revision, run, attempt, and branch provenance, and requires both a successful
audit step and `audit.json` with `valid: true`. It exports an explicit subset of
reporting fields; raw solver responses, local paths, and the environment are not
included. Checksums identify the source evidence; they are not independent
infeasibility proofs or digital signatures.

The job uses the automatic `GITHUB_TOKEN`, with `actions: read` and
`contents: write`. Git's REST API creates an initial parentless commit and then
non-forced updates on the data-only branch **`graceful-progress`**. The single
nightly feed is:

<https://raw.githubusercontent.com/tayre/tayre.github.io/graceful-progress/campaigns/nightly-v1.json>

There is no checkout, force push, source-branch mutation, or custom credential in
the publication step. Immutable Git objects are used to check existing history;
older results are ignored, repeated publication is idempotent, and a newer result
must extend the exact previously published run history. Conflicts, unavailable
history, failed checks, and unexpected data-branch contents fail safely. The
previous public snapshot remains accessible. A publication failure does not
invalidate a successfully audited research checkpoint; the next successful run
can publish the cumulative history that was missed.

This data branch lets the existing Pages site update without a rebuild. GitHub
documents that pushes made with `GITHUB_TOKEN` do not ordinarily trigger another
workflow; relying on such a push to rebuild Pages would leave stale data.
[GitHub workflow triggering documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
The [Git database API](https://docs.github.com/en/rest/git/refs) supports the
separate branch updates. The browser fetches only the public raw JSON, without a
token or authenticated API call. GitHub's CDN can delay a new snapshot briefly.

## Retention and limits

Public summary history is retained in Git beyond the **14-day** workflow artifact
retention. The summary is not a replacement for the cumulative SQLite ledger and
saved labeling witnesses. Archive full artifacts for long-term reproducibility;
recovering a checkpoint after artifact expiry still requires an archived ledger.

The feed has a 4 MiB publication limit. As the campaign grows, paginate older
history and keep an immutable archive before raising that bound. No full SQLite
database, large figures, or per-attempt model files are committed by the publisher.
The data-only branch may grow independently of the source branch.

If branch protection or organization policy blocks `contents: write`, the job's
summary reports a publication failure. Allow the data branch under that policy or
adapt the publisher to an approved destination. The research artifacts and owner
notifications remain separate. Changing the public campaign requires updating
the workflow's campaign guard and the frontend's `FEED_URL` and validation rule.

## Local verification

From `graceful-trees/`:

```sh
python -m pytest -q
node --test site/test/data.test.mjs
```

The Python tests include a real research run and independent audit before export,
tampered files, wrong provenance, failing audits, history rewrites, idempotency,
network failure, and non-forced Git ref updates. Node tests cover count invariants,
the graceful illustration, chart edge cases, incomplete coverage, stale timestamps,
and CSV export. The regular CI workflow runs both suites when this project or the
homepage changes.

For browser QA, use an existing Playwright installation and Chromium:

```sh
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright \
PLAYWRIGHT_EXECUTABLE_PATH=/absolute/path/to/chromium \
node site/browser.test.cjs
```

The harness serves only the homepage and its assets on an ephemeral loopback port,
uses explicit **synthetic test fixtures**, and does not contact or publish research
results. It checks desktop and mobile layouts, chart navigation, coverage grouping,
CSV download, stale/offline/unavailable states, safe text rendering, and the
JavaScript-free project explanation. It writes inspection screenshots to `/tmp/`.
Synthetic fixtures are never a production fallback. To preview real data, serve
the repository root with `python3 -m http.server`; the page fetches the public cloud
feed just as the hosted site does.
