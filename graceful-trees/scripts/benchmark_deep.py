"""Frozen ablations and fresh equal-budget evaluation of frontier optimizations.

Run without other CPU-heavy project work. Fixed-work measurements distinguish
evaluation cost from changes in visited states. Complete-route measurements retain
the exact fallback, successful witnesses, losses and censored unknowns.
"""

import argparse
import importlib
import json
import math
import time
from pathlib import Path

from benchmark_swaps import _prepare_plot_cache, _rotate, _verified_result, model_hash, summarize

from graceful_research.constructive import caterpillar_labeling
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.solver import solve
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
    "swap-benchmark.json",
)
ROUTES = {
    "baseline": "portfolio-frontier-v3",
    "filter": "bitset-portfolio-v6",
    "orbits": "orbit-portfolio-v6",
}
WORK_METHODS = {
    "baseline": "frontier",
    "filter": "frontier_fast",
    "memo": "frontier_memo",
    "orbits": "frontier_memo_fast",
}


def fresh_inputs(master_seed):
    excluded = {
        case["tree_id"]
        for name in PRIOR_CORPORA
        for case in json.loads((PROJECT / "examples" / name).read_text())["inputs"]
    }
    seen, cases = set(excluded), []
    for n, count in ((35, 6), (75, 6), (128, 4)):
        for family in ("prufer", "recursive", "spider", "lobster"):
            accepted = 0
            for index in range(10000):
                seed = derived_seed("deep-unseen-v1", master_seed, n, family, index)
                data = graph_input(generate_family(family, n, seed))
                import networkx as nx

                graph = nx.Graph(data["edges"])
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
                        "solver_seed": derived_seed("deep-solver-v1", seed),
                    }
                )
                accepted += 1
                if accepted == count:
                    break
            if accepted != count:
                raise RuntimeError("could not generate the prespecified corpus")
    return cases, sorted(excluded)


def render(output, result):
    _prepare_plot_cache()
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    names = list(result["median_seconds"])
    fig, axes = plt.subplots(1, 2, figsize=(8.5, 3.3))
    axes[0].bar(names, [len(result["verified_every_repeat"][v]) for v in names], color="#315b4e")
    axes[0].set_ylabel("Verified in every repetition")
    axes[0].set_ylim(0, result["metadata"]["cases"])
    axes[1].bar(names, [result["median_seconds"][v] for v in names], color="#737b82")
    axes[1].set_ylabel("Median capped-workload seconds")
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
    fig.suptitle(f"Frontier optimization · {result['metadata']['phase']}")
    fig.tight_layout()
    fig.savefig(output / "comparison.svg", metadata={"Date": None})
    fig.savefig(output / "comparison.png", dpi=160)
    plt.close(fig)
    lines = [
        "# Frontier optimization experiment",
        "",
        result["metadata"]["protocol"],
        "",
        "![Verified counts and bounded workload times](comparison.svg)",
        "",
        "| Method | Verified in every repetition | Median total seconds |",
        "| --- | ---: | ---: |",
    ]
    for name in names:
        lines.append(
            f"| {name} | {len(result['verified_every_repeat'][name])} / "
            f"{result['metadata']['cases']} | {result['median_seconds'][name]:.6f} |"
        )
    lines += [
        "",
        "All witnesses are independently checked. Unknowns are censored, never infeasible. "
        "The node budgets have identical numerical limits but orbit pruning changes the "
        "meaning of a visited node. Only the baseline/filter work ablation preserves the "
        "entire traversal. Timings cover this machine and workload, not expected nightly "
        "throughput or published state of the art. No novelty or theorem is claimed.",
        "",
        "Per-repetition gained/lost cases, family/order totals and full evidence paths "
        "are in benchmark.json. These are benchmark artifacts, not campaign checkpoints.",
    ]
    (output / "report.md").write_text("\n".join(lines) + "\n")


def benchmark(output, *, phase="development", seconds=1.0, repeats=3, master_seed=6119347):
    if phase not in {"work", "development", "holdout"}:
        raise ValueError("unsupported phase")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("positive finite seconds required")
    if type(repeats) is not int or repeats < 1 or type(master_seed) is not int:
        raise ValueError("positive integer repeats and integer seed required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    methods = {
        name: importlib.import_module(f"graceful_research.{module}").search
        for name, module in WORK_METHODS.items()
    }
    # Warm all routes and exact imports before any measurement.
    importlib.import_module("graceful_research.frontier_accelerated")
    if phase == "holdout":
        cases, excluded = fresh_inputs(master_seed)
    else:
        cases = json.loads((PROJECT / "examples/portfolio-benchmark.json").read_text())["inputs"]
        excluded = []
    expected = {index: model_hash(case["input"]) for index, case in enumerate(cases)}
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "phase": phase,
        "provenance": provenance(output),
        "master_seed": master_seed,
        "cases": len(cases),
        "repeats": repeats,
        "attempt_seconds": seconds,
        "candidate_seconds": min(0.1, 0.1 * seconds),
        "routes": WORK_METHODS if phase == "work" else ROUTES,
        "excluded_tree_ids": excluded,
        "protocol": (
            "Fixed before outcomes. Development/work use the earlier 48-tree portfolio corpus; "
            "holdout uses 64 new unique non-caterpillar shapes excluding all five earlier benchmark "
            "corpora: six per family at orders 35/75 and four at128 (Prüfer, recursive, spider, "
            "lobster). Work ablations allow 20,000 visits and30seconds, requiring no time cutoff; "
            "baseline and filter must return identical labels/nodes/roots/termination. Complete "
            "routes get the same attempt allowance and identical exact fallback; each candidate "
            "portfolio shares min(0.1s,10% of attempt) and40,000 nodes,20,000 perstage. Method order "
            "rotates by case/repetition. Imports warmed; no concurrent project CPU-heavy jobs. "
            "Every witness and fallback model hash is independently checked. No tuning after "
            "holdout. Adoption requires no lost cases in any paired repetition and lower median "
            "complete-route time; otherwise keep v3. Pipeline/ledger costs are measured separately."
        ),
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", cases)
    write_json(output / "expected-model-hashes.json", expected)
    records = []
    names = list(methods if phase == "work" else ROUTES)
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            paired = {}
            for name in _rotate(names, repeat, index):
                directory = output / "attempts" / f"{repeat}-{index:03d}-{name}"
                directory.mkdir(parents=True)
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
                    "frontier_max_nodes": 40000,
                    "frontier_algorithm": ROUTES.get(name, name),
                }
                if phase == "work":
                    request.update(method=WORK_METHODS[name], max_nodes=20000, seconds=30)
                write_json(directory / "request.json", request)
                started = time.perf_counter()
                if phase == "work":
                    candidate = methods[name](
                        **case["input"], seed=case["solver_seed"], max_nodes=20000, seconds=30
                    )
                    elapsed = time.perf_counter() - started
                    if candidate["termination"] == "time_limit":
                        raise RuntimeError("fixed-work phase hit a wall cutoff")
                    result = {
                        **candidate,
                        "status": "verified_graceful"
                        if candidate["labels"] is not None
                        else "unknown",
                        "search_method": candidate["algorithm"],
                    }
                    paired[name] = {
                        k: candidate[k] for k in ("labels", "nodes", "roots_tried", "termination")
                    }
                else:
                    result = solve(request)
                    elapsed = time.perf_counter() - started
                    candidate = result.get("frontier", {})
                write_json(directory / "result.json", result)
                verification = _verified_result(case, result)
                write_json(directory / "benchmark-verification.json", verification)
                if "model_sha256" in result and result["model_sha256"] != expected[index]:
                    raise RuntimeError("exact fallback model changed")
                if result.get("labels") is not None:
                    assert verify_labeling(**case["input"], labels=result["labels"])["valid"]
                records.append(
                    {
                        "case": index,
                        "tree_id": case["tree_id"],
                        "repeat": repeat,
                        "variant": name,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "status": result["status"],
                        "search_method": result["search_method"],
                        "wall_seconds": elapsed,
                        "nodes": candidate.get("nodes"),
                        "orbit_skips": candidate.get("orbit_skips"),
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            if phase == "work" and paired["baseline"] != paired["filter"]:
                raise RuntimeError("endpoint filtering changed the fixed-work traversal")
            if (index + 1) % 16 == 0:
                print(
                    f"{phase} repeat {repeat + 1}/{repeats}: {index + 1}/{len(cases)}", flush=True
                )
    result = {
        "metadata": metadata,
        "inputs": cases,
        **summarize(records, names, repeats, baseline="baseline"),
    }
    result["eligible_for_adoption"] = (
        []
        if phase != "holdout"
        else [
            name
            for name in names
            if name != "baseline"
            and not any(result["comparisons_against_baseline"][name]["losses_by_repeat"])
            and result["median_seconds"][name] < result["median_seconds"]["baseline"]
        ]
    )
    write_json(output / "benchmark.json", result)
    render(output, result)
    write_checksums(output)
    print(
        json.dumps(
            {
                "medians": result["median_seconds"],
                "verified": {v: len(x) for v, x in result["verified_every_repeat"].items()},
                "eligible": result["eligible_for_adoption"],
            },
            indent=2,
        ),
        flush=True,
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--phase", choices=("work", "development", "holdout"), default="development"
    )
    parser.add_argument("--attempt-seconds", type=float, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--seed", type=int, default=6119347)
    args = parser.parse_args()
    benchmark(
        args.output,
        phase=args.phase,
        seconds=args.attempt_seconds,
        repeats=args.repeats,
        master_seed=args.seed,
    )
