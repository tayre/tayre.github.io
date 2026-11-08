"""Paired, bounded benchmarks. Run from an installed checkout; no cloud credentials.

Outputs are benchmark evidence, not a campaign checkpoint. Wall-clock cutoffs make
unknown observations censored; ratios concern this bounded workload only.
"""

import argparse
import statistics
import time
from collections import Counter
from pathlib import Path

import networkx as nx
from ortools.sat.python import cp_model  # Warm both variants equally before timing.

from graceful_research.config import FAMILIES
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.solver import solve
from graceful_research.trees import derived_seed, generate_family, graph_input, tree_diameter
from graceful_research.verify import verify_labeling


def benchmark(output, *, seconds=1.0, repeats=3):
    if seconds <= 0 or repeats < 1:
        raise ValueError("seconds and repeats must be positive")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    seed = 20261108
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "seed": seed,
        "solver_seconds": seconds,
        "repeats": repeats,
        "provenance": provenance(output),
        "interpretation": "Paired capped workload; unknowns are censored, never infeasible.",
    }
    records = []
    assert cp_model.CpSolver  # Import/setup cost is excluded from both timed variants.
    for repeat in range(repeats):
        for n in (35, 75):
            for family in FAMILIES:
                data = graph_input(generate_family(family, n, seed))
                # Alternate order to reduce systematic warm-up/cache bias.
                variants = (False, True) if repeat % 2 == 0 else (True, False)
                for enabled in variants:
                    variant = "optimized" if enabled else "cp-sat-only"
                    directory = output / "attempts" / f"{repeat}-{family}-{n}-{variant}"
                    directory.mkdir(parents=True)
                    request = {
                        "input": data,
                        "seed": derived_seed(seed, family, n),
                        "solver_seconds": seconds,
                        "directory": str(directory),
                        "restriction": None,
                        "complement_break": True,
                        "redundant_sum": True,
                        "constructive_search": enabled,
                    }
                    write_json(directory / "request.json", request)
                    result = solve(request)
                    if result["status"] == "verified_graceful":
                        assert verify_labeling(**data, labels=result["labels"])["valid"]
                    elif result["status"] != "unknown":
                        raise RuntimeError(f"benchmark requires investigation: {result}")
                    write_json(directory / "result.json", result)
                    records.append(
                        {
                            "repeat": repeat,
                            "family": family,
                            "n": n,
                            "variant": variant,
                            "seed": request["seed"],
                            "search_method": result["search_method"],
                            "status": result["status"],
                            "wall_seconds": result["wall_seconds"],
                            "evidence": str(directory.relative_to(output)),
                        }
                    )
            print(f"Finished paired search repeat {repeat + 1}/{repeats}, n={n}", flush=True)

    searches = []
    for variant in ("cp-sat-only", "optimized"):
        for repeat in range(repeats):
            rows = [r for r in records if r["variant"] == variant and r["repeat"] == repeat]
            searches.append(
                {
                    "variant": variant,
                    "repeat": repeat,
                    "cases": len(rows),
                    "wall_seconds": sum(r["wall_seconds"] for r in rows),
                    "verified": sum(r["status"] == "verified_graceful" for r in rows),
                    "unknown": sum(r["status"] == "unknown" for r in rows),
                    "methods": dict(Counter(r["search_method"] for r in rows)),
                }
            )
    medians = {
        variant: statistics.median(r["wall_seconds"] for r in searches if r["variant"] == variant)
        for variant in ("cp-sat-only", "optimized")
    }
    # Same saved trees, exact integer equality, separate from search/I/O timings.
    graphs = [generate_family(f, n, seed) for n in (35, 75, 256) for f in FAMILIES]
    diameter_rounds = {"all-pairs": [], "two-sweeps": []}
    expected = [nx.diameter(g) for g in graphs]
    assert [tree_diameter(g) for g in graphs] == expected
    for repeat in range(repeats):
        variants = [("all-pairs", nx.diameter), ("two-sweeps", tree_diameter)]
        if repeat % 2:
            variants.reverse()
        for name, calculate in variants:
            started = time.perf_counter()
            for _ in range(5):
                assert [calculate(g) for g in graphs] == expected
            diameter_rounds[name].append(time.perf_counter() - started)
    summary = {
        "metadata": metadata,
        "searches": searches,
        "search_median_seconds": medians,
        "bounded_workload_speedup": medians["cp-sat-only"] / medians["optimized"],
        "diameter_seconds": diameter_rounds,
        "diameter_speedup": statistics.median(diameter_rounds["all-pairs"])
        / statistics.median(diameter_rounds["two-sweeps"]),
        "records": records,
    }
    write_json(output / "benchmark.json", summary)
    write_checksums(output)
    print(
        f"Bounded search workload: {summary['bounded_workload_speedup']:.2f}×; "
        f"diameter calculation: {summary['diameter_speedup']:.2f}×. Evidence: {output}",
        flush=True,
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt-seconds", type=float, default=1.0)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    benchmark(args.output, seconds=args.attempt_seconds, repeats=args.repeats)
