"""Development ablations and a frozen, isomorphism-disjoint swap-search benchmark.

Run with no concurrent CPU-heavy jobs. Development uses the previous portfolio
corpus and compares swap objectives without exact fallback. Holdout compares
three complete routes with the same wall allowance and unchanged exact fallback.
Every failure of a bounded witness search remains unknown.
"""

import argparse
import hashlib
import importlib
import json
import math
import os
import statistics
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

from graceful_research.constructive import caterpillar_labeling
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.solver import build_model, solve
from graceful_research.trees import (
    canonical_code,
    derived_seed,
    generate_family,
    graph_input,
    tree_id,
)
from graceful_research.verify import verify_labeling

PROJECT = Path(__file__).resolve().parents[1]
PRIOR_CORPORA = (
    "frontier-benchmark.json",
    "techniques-benchmark.json",
    "portfolio-benchmark.json",
    "leaf-tail-benchmark.json",
)
VARIANTS = {
    "baseline": {"algorithm": "portfolio-frontier-v3", "max_nodes": 40000},
    "swaps": {"algorithm": "label-swap-v1", "max_nodes": 40000},
    "portfolio": {"algorithm": "swap-portfolio-v5", "max_nodes": 80000},
}
OBJECTIVES = ("missing_count", "missing_sum")
POLICIES = ("uniform", "missing_difference")


def fresh_inputs(project=PROJECT, master_seed=925733):
    """Freeze 48 new shapes; generation has no access to search outcomes."""
    excluded = {
        case["tree_id"]
        for filename in PRIOR_CORPORA
        for case in json.loads((project / "examples" / filename).read_text())["inputs"]
    }
    seen, cases = set(excluded), []
    for n in (35, 75):
        for family in ("prufer", "recursive", "spider", "lobster"):
            accepted = 0
            for index in range(10000):
                seed = derived_seed("swap-unseen-v1", master_seed, n, family, index)
                graph = generate_family(family, n, seed)
                data = graph_input(graph)
                identifier = tree_id(canonical_code(graph))
                if identifier in seen or caterpillar_labeling(**data) is not None:
                    continue
                seen.add(identifier)
                cases.append(
                    {
                        "input": data,
                        "tree_id": identifier,
                        "family": family,
                        "input_seed": seed,
                        "generation_index": index,
                        "solver_seed": derived_seed("swap-solver-v1", seed),
                    }
                )
                accepted += 1
                if accepted == 6:
                    break
            if accepted != 6:
                raise RuntimeError("Could not generate the prespecified fresh corpus")
    return cases, sorted(excluded)


def model_hash(data):
    """Independent expected exact-model serialization, outside benchmark timing."""
    from google.protobuf import text_format

    model, _ = build_model(**data, complement_break=True, redundant_sum=True, restriction=None)
    return hashlib.sha256(text_format.MessageToString(model.proto).encode()).hexdigest()


def _rotate(names, repeat, index):
    offset = (repeat + index) % len(names)
    return names[offset:] + names[:offset]


def _diagnostics(candidate):
    keys = (
        "algorithm",
        "objective",
        "proposal_policy",
        "initial_score",
        "best_score",
        "improvements",
        "restarts",
        "accepted_moves",
        "termination",
        "nodes",
        "wall_seconds",
        "best_missing_count",
        "best_missing_sum",
        "trajectory",
        "trajectory_omitted",
    )
    result = {key: candidate[key] for key in keys if key in candidate}
    if "stages" in candidate:
        result["stages"] = [_diagnostics(stage) for stage in candidate["stages"]]
    return result


def _verified_result(case, result):
    """Recheck witnesses; unexpected negative/error results require investigation."""
    if result["status"] == "verified_graceful":
        check = verify_labeling(**case["input"], labels=result["labels"])
        if not check["valid"]:
            raise RuntimeError("Independent benchmark verification rejected a witness")
        return check
    if result["status"] != "unknown":
        raise RuntimeError(f"Unexpected result needs investigation: {result['status']}")
    if result.get("labels") is not None:
        raise RuntimeError("Unknown result unexpectedly contains a witness")
    return None


def holdout_suite(cases, output, *, seconds, repeats, objective, policy="uniform"):
    records = []
    expected = {index: model_hash(case["input"]) for index, case in enumerate(cases)}
    write_json(output / "expected-model-hashes.json", expected)
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            for name in _rotate(list(VARIANTS), repeat, index):
                variant = VARIANTS[name]
                directory = output / "attempts" / f"{repeat}-{index:03d}-{name}"
                request = {
                    "input": case["input"],
                    "seed": case["solver_seed"],
                    "solver_seconds": seconds,
                    "directory": str(directory),
                    "restriction": None,
                    "backend": "cp-sat",
                    "complement_break": True,
                    "redundant_sum": True,
                    "constructive_search": True,
                    "frontier_search": True,
                    "frontier_max_nodes": variant["max_nodes"],
                    "frontier_algorithm": variant["algorithm"],
                    "swap_objective": objective,
                    "swap_proposal_policy": policy,
                }
                write_json(directory / "request.json", request)
                started = time.perf_counter()
                result = solve(request)
                elapsed = time.perf_counter() - started
                write_json(directory / "result.json", result)
                verification = _verified_result(case, result)
                write_json(directory / "benchmark-verification.json", verification)
                if "model_sha256" in result and result["model_sha256"] != expected[index]:
                    raise RuntimeError("Exact fallback model changed")
                records.append(
                    {
                        "case": index,
                        "tree_id": case["tree_id"],
                        "repeat": repeat,
                        "variant": name,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "solver_seed": case["solver_seed"],
                        "status": result["status"],
                        "search_method": result["search_method"],
                        "wall_seconds": elapsed,
                        "reported_wall_seconds": result["wall_seconds"],
                        "model_sha256": result.get("model_sha256"),
                        "candidate": _diagnostics(result.get("frontier", {})),
                        "independently_verified": verification is not None,
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            if (index + 1) % 12 == 0:
                print(
                    f"Holdout repeat {repeat + 1}/{repeats}: {index + 1}/{len(cases)}", flush=True
                )
    return summarize(records, list(VARIANTS), repeats, baseline="baseline")


def development_suite(cases, output, *, seconds, repeats, policy="uniform"):
    from graceful_research.swap_search import search

    records = []
    allowance = min(0.1, seconds * 0.1)
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            for objective in _rotate(list(OBJECTIVES), repeat, index):
                directory = output / "attempts" / f"{repeat}-{index:03d}-{objective}"
                request = {
                    **case["input"],
                    "seed": case["solver_seed"],
                    "seconds": allowance,
                    "max_nodes": 40000,
                    "objective": objective,
                    "proposal_policy": policy,
                }
                write_json(directory / "request.json", request)
                started = time.perf_counter()
                result = search(**request)
                elapsed = time.perf_counter() - started
                write_json(directory / "result.json", result)
                status = "verified_graceful" if result["labels"] is not None else "unknown"
                verification = _verified_result(
                    case, {"status": status, "labels": result["labels"]}
                )
                write_json(directory / "benchmark-verification.json", verification)
                records.append(
                    {
                        "case": index,
                        "tree_id": case["tree_id"],
                        "repeat": repeat,
                        "variant": objective,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "solver_seed": case["solver_seed"],
                        "status": status,
                        "search_method": "label-swap-v1",
                        "wall_seconds": elapsed,
                        "reported_wall_seconds": result["wall_seconds"],
                        "candidate": _diagnostics(result),
                        "independently_verified": verification is not None,
                        "evidence": str(directory.relative_to(output)),
                    }
                )
        print(f"Development repeat {repeat + 1}/{repeats}: {len(cases)} trees", flush=True)
    return summarize(records, list(OBJECTIVES), repeats, baseline="missing_sum")


def summarize(records, variants, repeats, *, baseline):
    totals, families = [], []
    for variant in variants:
        for repeat in range(repeats):
            rows = [r for r in records if r["variant"] == variant and r["repeat"] == repeat]
            totals.append(
                {
                    "variant": variant,
                    "repeat": repeat,
                    "cases": len(rows),
                    "seconds": sum(r["wall_seconds"] for r in rows),
                    "verified": sum(r["status"] == "verified_graceful" for r in rows),
                    "unknown": sum(r["status"] == "unknown" for r in rows),
                    "methods": dict(Counter(r["search_method"] for r in rows)),
                }
            )
            for family, n in sorted({(r["family"], r["n"]) for r in rows}):
                group = [r for r in rows if r["family"] == family and r["n"] == n]
                families.append(
                    {
                        "variant": variant,
                        "repeat": repeat,
                        "family": family,
                        "n": n,
                        "cases": len(group),
                        "seconds": sum(r["wall_seconds"] for r in group),
                        "verified": sum(r["status"] == "verified_graceful" for r in group),
                        "unknown": sum(r["status"] == "unknown" for r in group),
                    }
                )
    successes = {
        (variant, repeat): {
            r["case"]
            for r in records
            if r["variant"] == variant
            and r["repeat"] == repeat
            and r["status"] == "verified_graceful"
        }
        for variant in variants
        for repeat in range(repeats)
    }
    comparisons = {}
    for variant in variants:
        if variant == baseline:
            continue
        gains = [successes[variant, r] - successes[baseline, r] for r in range(repeats)]
        losses = [successes[baseline, r] - successes[variant, r] for r in range(repeats)]
        comparisons[variant] = {
            "gains_by_repeat": [sorted(v) for v in gains],
            "losses_by_repeat": [sorted(v) for v in losses],
            "consistent_gains": sorted(set.intersection(*gains)),
            "consistent_losses": sorted(set.intersection(*losses)),
        }
    return {
        "totals": totals,
        "families": families,
        "median_seconds": {
            v: statistics.median(t["seconds"] for t in totals if t["variant"] == v)
            for v in variants
        },
        "verified_every_repeat": {
            v: sorted(set.intersection(*(successes[v, r] for r in range(repeats))))
            for v in variants
        },
        "comparisons_against_baseline": comparisons,
        "records": records,
    }


def _prepare_plot_cache():
    """Respect an operator override; otherwise use a writable external cache."""
    identity = hashlib.sha256(sys.prefix.encode()).hexdigest()[:16]
    cache = Path(tempfile.gettempdir()) / f"graceful-matplotlib-{identity}"
    if not os.environ.get("MPLCONFIGDIR"):
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.environ["MPLCONFIGDIR"] = str(cache)


def render_report(output, result):
    """Static scientific comparison; integer successes and censored elapsed time."""
    _prepare_plot_cache()
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    metadata = result["metadata"]
    variants = list(result["median_seconds"])
    figure, axes = plt.subplots(1, 2, figsize=(8.6, 3.3))
    labels = [v.replace("_", " ") for v in variants]
    axes[0].bar(
        labels, [len(result["verified_every_repeat"][v]) for v in variants], color="#405b70"
    )
    axes[0].set_ylabel("Trees verified in every repetition")
    axes[0].set_ylim(0, max(1, metadata["cases"]))
    axes[1].bar(labels, [result["median_seconds"][v] for v in variants], color="#76766c")
    axes[1].set_ylabel("Median total elapsed seconds")
    for axis in axes:
        axis.spines[["top", "right"]].set_visible(False)
        axis.tick_params(axis="x", labelrotation=15)
    figure.suptitle(f"Swap search: {metadata['phase']} · {metadata['cases']} trees")
    figure.tight_layout()
    figure.savefig(output / "comparison.svg", metadata={"Date": None})
    figure.savefig(output / "comparison.png", dpi=150)
    plt.close(figure)
    lines = [
        "# Swap-search benchmark",
        "",
        f"Phase: **{metadata['phase']}**. {metadata['cases']} tree shapes; "
        f"{metadata['repeats']} repetitions. Unknowns are censored search outcomes.",
        "",
        "![Successes and measured elapsed time](comparison.svg)",
        "",
        "| Route | Verified in every repetition | Median total seconds |",
        "| --- | ---: | ---: |",
    ]
    for variant in variants:
        lines.append(
            f"| {variant} | {len(result['verified_every_repeat'][variant])} / {metadata['cases']} "
            f"| {result['median_seconds'][variant]:.6f} |"
        )
    lines.extend(["", "## Protocol and limits", "", metadata["protocol"], ""])
    lines.append(
        "All positive labelings were independently verified. Bounded-search failures are unknown; "
        "no nongraceful tree, new exhaustive bound, or algorithmic novelty is claimed. "
        "Timings describe this machine and capped workload; compare successes and regressions "
        "alongside time. The evidence archive is a benchmark, not a campaign checkpoint."
    )
    lines.extend(["", "## Paired outcomes", ""])
    for variant, values in result["comparisons_against_baseline"].items():
        lines.append(
            f"- {variant}: consistent gained case indices {values['consistent_gains']}; "
            f"consistent lost case indices {values['consistent_losses']}. "
            "All per-repetition differences are retained in benchmark.json."
        )
    (output / "report.md").write_text("\n".join(lines) + "\n")


def benchmark(
    output,
    *,
    phase="development",
    seconds=1.0,
    repeats=3,
    objective="missing_sum",
    policy="uniform",
    master_seed=925733,
):
    if (
        phase not in {"development", "holdout"}
        or objective not in OBJECTIVES
        or policy not in POLICIES
    ):
        raise ValueError("unsupported phase, objective or policy")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("positive finite attempt allowance required")
    if type(repeats) is not int or repeats < 1 or type(master_seed) is not int:
        raise ValueError("positive integer repeats and integer seed required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    # Imports are warmed before any timed call; source snapshots include the
    # precise uncommitted implementation if this is a development checkout.
    for name in ("frontier_portfolio", "swap_search", "swap_portfolio"):
        importlib.import_module(f"graceful_research.{name}")
    if phase == "holdout":
        cases, excluded = fresh_inputs(PROJECT, master_seed)
        protocol = (
            "48 unique non-caterpillar trees: six per family/order at 35 and 75 vertices; "
            "excludes every class in all four earlier benchmark corpora. Inputs, objective and "
            "method limits are frozen before timing. No tuning after holdout results. Every "
            "route uses the same exact CP-SAT fallback and complete attempt wall allowance; "
            "candidates get min(0.1s, 10% of that allowance). The portfolio reserves half its "
            "candidate time for v3, then gives remaining time to swaps. Baseline and swaps "
            "each have a 40000-operation cap; portfolio has 40000 frontier nodes plus 40000 "
            "swap proposals. These operations are different and the comparison is equal-time, "
            "not equal-work. Method order rotates. Timings measure the whole solve() call, "
            "including candidate search and exact-model preparation; archive writing outside "
            "solve() and the independent benchmark witness check are excluded. All fallback "
            "hashes must match an independently built original model."
        )
    else:
        cases = json.loads((PROJECT / "examples/portfolio-benchmark.json").read_text())["inputs"]
        excluded = []
        protocol = (
            "Existing 48-tree portfolio corpus, explicitly development data. Compare missing-count "
            "and missing-sum swap objectives without exact fallback, each with 40000 proposals "
            "and min(0.1s, 10% of the configured attempt allowance). Alternate objective order. "
            "Seed and corpus are fixed; wall cutoffs may vary. Choose an objective and freeze "
            "the algorithm before running the separate fresh holdout. Scores from the two "
            "objectives have different scales and are not compared numerically across objectives."
        )
    protocol += (
        f" The fixed proposal policy is {policy}; missing_difference uses a 3:1 "
        "targeted/uniform proposal mixture, while uniform samples vertex pairs uniformly. "
        "The policy is selected before this archive's measurements."
    )
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "phase": phase,
        "provenance": provenance(output),
        "attempt_seconds": seconds,
        "candidate_seconds": min(0.1, seconds * 0.1),
        "repeats": repeats,
        "objective": objective if phase == "holdout" else "ablation",
        "proposal_policy": policy,
        "master_seed": master_seed,
        "variants": VARIANTS if phase == "holdout" else OBJECTIVES,
        "excluded_tree_ids": excluded,
        "cases": len(cases),
        "protocol": protocol,
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", cases)
    if phase == "holdout":
        measurements = holdout_suite(
            cases, output, seconds=seconds, repeats=repeats, objective=objective, policy=policy
        )
    else:
        measurements = development_suite(
            cases, output, seconds=seconds, repeats=repeats, policy=policy
        )
    result = {"metadata": metadata, "inputs": cases, **measurements}
    write_json(output / "benchmark.json", result)
    render_report(output, result)
    write_checksums(output)
    print(
        json.dumps(
            {
                "phase": phase,
                "median_seconds": result["median_seconds"],
                "verified_every_repeat": {
                    k: len(v) for k, v in result["verified_every_repeat"].items()
                },
            },
            indent=2,
        ),
        flush=True,
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--phase", choices=("development", "holdout"), default="development")
    parser.add_argument("--attempt-seconds", type=float, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--objective", choices=OBJECTIVES, default="missing_sum")
    parser.add_argument("--policy", choices=POLICIES, default="uniform")
    parser.add_argument("--master-seed", type=int, default=925733)
    args = parser.parse_args()
    benchmark(
        args.output,
        phase=args.phase,
        seconds=args.attempt_seconds,
        repeats=args.repeats,
        objective=args.objective,
        policy=args.policy,
        master_seed=args.master_seed,
    )
