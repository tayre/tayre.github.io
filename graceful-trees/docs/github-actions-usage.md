# GitHub Actions usage review

Reviewed on 8 November 2026 against GitHub's published terms. This review records
an engineering decision; it is not confirmation from GitHub that a particular
workload is permitted.

## Purpose comes before frequency

The [Actions terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions)
restrict GitHub-hosted runners to activities related to producing, testing,
deploying, or publishing the repository's software. They also prohibit burdens
disproportionate to the benefit provided to users. A successful job, public
repository, small compute budget, or permitted cron interval does not establish
approval of its purpose.

`graceful-ci.yml` runs software tests, lint, and a bounded CLI integration check.
The current `graceful-research.yml` has a different purpose: it restores a cumulative
campaign and searches new mathematical inputs. This review does not assume that
an ongoing discovery campaign is covered by the permission for software testing.
Running tests before that campaign or renaming it a benchmark would not resolve
the distinction.

The earlier activation record establishes that the workflow works technically. It
does not establish that GitHub has approved ongoing research compute. No such
approval has been obtained or recorded in this repository.

## Options before increasing discovery runs

1. Run actual research on a separate compute host whose terms permit the workload,
   using the same CLI, verifier and cumulative checkpoints. That host can schedule
   four 30-minute runs daily at 00:23, 06:23, 12:23 and 18:23 UTC. GitHub can continue
   building and testing the software. A host and its storage must be provisioned
   separately; this repository does not create one or assume a free allowance.
2. Obtain clarification from GitHub about this specific hosted-runner use before
   increasing its frequency. No support request has been submitted automatically.

The first option separates discovery compute from GitHub Actions entirely; it does
not rely on treating a self-hosted Actions runner as exempt from all Actions terms.
Changing the existing discovery workflow to tests alone would stop its accumulated
research progress, so that change must be explicit to the operator.

## Concrete request for GitHub clarification

> Our public repository is https://github.com/tayre/tayre.github.io, with research
> code under `graceful-trees/`. It contains Python graph generators, an OR-Tools
> exact constraint model, independent witness verification, tests, and reports.
> We want to run a cumulative Graceful Tree Conjecture search, whose primary
> purpose is mathematical discovery rather than software regression testing.
> The proposed schedule is four runs daily, each with a 7.5-minute search budget
> (30 search minutes daily, plus dependency installation, tests, and artifact
> handling). Jobs would use one standard Linux runner at a time, one solver
> worker, no GPUs, and 14-day artifact retention. Does this specific use comply
> with the GitHub-hosted runner purpose restrictions in the Actions terms? If so,
> are there additional limits or conditions we should follow?

This is a draft for review, not an authorization to send a message. If permission
is received, retain its scope and any conditions before changing the workflow.

## Cost and operational limits are separate

GitHub's [billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
states that standard hosted runners in public repositories are free, while artifact
and cache storage have their own allowances. Free compute is not unrestricted
compute. Four 7.5-minute searches would retain the current 30-minute daily search
budget, but incur four sets of setup and artifact overhead. Four 30-minute searches
would instead allow 120 search minutes daily, plus that overhead.

The [schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
and [Actions limits](https://docs.github.com/en/actions/reference/limits) describe
technical scheduling and job ceilings, not a research-specific acceptable-use
allowance. Serialization, bounded jobs, short artifact retention, and monitoring
storage remain useful controls for any permitted workflow; they do not replace
the purpose restriction.
