"""Paired prepass benchmark against the previous construction + CP-SAT route.

Run without concurrent tests. Both variants share inputs, exact-model options,
seeds and total attempt allowance; neither treats cutoff outcomes as negatives.
"""

import argparse
import math
import statistics
import time
from collections import Counter
from pathlib import Path

import networkx as nx
from ortools.sat.python import cp_model  # Warm native imports equally for both routes.

from graceful_research.config import FAMILIES
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.solver import solve
from graceful_research.trees import (
    canonical_code,
    derived_seed,
    features,
    generate_family,
    graph_input,
    tree_diameter,
    tree_id,
)
from graceful_research.verify import verify_labeling


def graph_copy_features(graph):
    """Previous feature algorithm, retained here as an explicit paired baseline."""
    n = len(graph)
    degrees = [d for _, d in graph.degree]
    core = graph.copy()
    core.remove_nodes_from([v for v, d in graph.degree if d == 1])
    caterpillar = len(core) <= 1 or max(dict(core.degree).values()) <= 2
    core2 = core.copy()
    core2.remove_nodes_from([v for v, d in core.degree if d <= 1])
    lobster = len(core2) <= 1 or max(dict(core2.degree).values()) <= 2
    counts = Counter(nx.bipartite.color(graph).values())
    leaves = sum(d == 1 for d in degrees)
    mean = sum(degrees) / n
    return {
        "n": n,
        "diameter": tree_diameter(graph),
        "leaves": leaves,
        "leaf_fraction": leaves / n,
        "max_degree": max(degrees),
        "branch_vertices": sum(d >= 3 for d in degrees),
        "degree_variance": sum((d - mean) ** 2 for d in degrees) / n,
        "bipartition_min": min(counts.get(0, 0), counts.get(1, 0)),
        "is_caterpillar": caterpillar,
        "is_lobster": lobster,
        "max_sibling_leaves": max(
            (sum(graph.degree(v) == 1 for v in graph[u]) for u in graph), default=0
        ),
    }


def benchmark(output, *, seconds=1.0, repeats=3):
    if not math.isfinite(seconds) or seconds <= 0 or repeats < 1:
        raise ValueError("positive finite attempt budget and positive repeats required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = provenance(output)
    seeds = [20261108, 104729, 130363]
    cases = []
    for seed in seeds:
        for n in (35, 75):
            for family in FAMILIES:
                graph = generate_family(family, n, seed)
                cases.append(
                    {
                        "input": graph_input(graph),
                        "tree_id": tree_id(canonical_code(graph)),
                        "input_seed": seed,
                        "solver_seed": derived_seed("frontier-benchmark", seed, n, family),
                        "family": family,
                    }
                )
    write_json(output / "inputs.json", cases)
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": source,
        "attempt_seconds": seconds,
        "repeats": repeats,
        "input_seeds": seeds,
        "cases": len(cases),
        "distinct_tree_ids": len({case["tree_id"] for case in cases}),
        "interpretation": "Paired capped workload, not a universal speedup. Unknown outcomes are censored.",
    }
    records = []
    assert cp_model.CpSolver
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            for enabled in (False, True) if repeat % 2 == 0 else (True, False):
                variant = "frontier" if enabled else "baseline"
                directory = output / "attempts" / f"{repeat}-{index:03d}-{variant}"
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
                    "frontier_search": enabled,
                    "frontier_max_nodes": 20000,
                }
                write_json(directory / "request.json", request)
                result = solve(request)
                if result["status"] == "verified_graceful":
                    if not verify_labeling(**case["input"], labels=result["labels"])["valid"]:
                        raise RuntimeError("benchmark witness failed independent verification")
                elif result["status"] != "unknown":
                    raise RuntimeError(f"benchmark requires investigation: {result['status']}")
                write_json(directory / "result.json", result)
                records.append(
                    {
                        "repeat": repeat,
                        "case": index,
                        "variant": variant,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "input_seed": case["input_seed"],
                        "solver_seed": case["solver_seed"],
                        "search_method": result["search_method"],
                        "status": result["status"],
                        "wall_seconds": result["wall_seconds"],
                        "frontier_nodes": result.get("frontier", {}).get("nodes"),
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            if (index + 1) % 10 == 0:
                print(
                    f"Paired repeat {repeat + 1}/{repeats}: {index + 1}/{len(cases)} cases",
                    flush=True,
                )
    totals = []
    for variant in ("baseline", "frontier"):
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
    medians = {
        v: statistics.median(t["seconds"] for t in totals if t["variant"] == v)
        for v in ("baseline", "frontier")
    }
    graphs = [generate_family(f, n, 20261108) for n in (35, 75, 256) for f in FAMILIES]
    expected = [graph_copy_features(g) for g in graphs]
    if [features(g) for g in graphs] != expected:
        raise RuntimeError("feature algorithms disagree")
    feature_times = {"graph-copy": [], "degree-cores": []}
    for repeat in range(repeats):
        algorithms = [("graph-copy", graph_copy_features), ("degree-cores", features)]
        if repeat % 2:
            algorithms.reverse()
        for name, calculate in algorithms:
            started = time.perf_counter()
            for _ in range(5):
                if [calculate(g) for g in graphs] != expected:
                    raise RuntimeError("feature algorithms disagree")
            feature_times[name].append(time.perf_counter() - started)
    result = {
        "metadata": metadata,
        "totals": totals,
        "search_median_seconds": medians,
        "bounded_workload_speedup": medians["baseline"] / medians["frontier"],
        "feature_seconds": feature_times,
        "feature_speedup": statistics.median(feature_times["graph-copy"])
        / statistics.median(feature_times["degree-cores"]),
        "records": records,
    }
    write_json(output / "benchmark.json", result)
    write_checksums(output)
    print(
        f"Capped search workload: {result['bounded_workload_speedup']:.2f}×; features: {result['feature_speedup']:.2f}×",
        flush=True,
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt-seconds", type=float, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    benchmark(args.output, seconds=args.attempt_seconds, repeats=args.repeats)
