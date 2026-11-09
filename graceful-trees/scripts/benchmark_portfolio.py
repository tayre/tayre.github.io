"""Fresh, isomorphism-disjoint evaluation after the v2 replacement failed to generalize.

The corpus and selection criteria are fixed before search. No concurrent tests.
All methods share the same wall allowance; the portfolio uses two bounded stages.
"""

import argparse
import json
import math
import statistics
from collections import Counter
from pathlib import Path

from ortools.sat.python import cp_model

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

VARIANTS = {
    "previous": ("descending-frontier-v1", 20000),
    "replacement": ("memo-frontier-v2", 20000),
    "portfolio": ("portfolio-frontier-v3", 40000),
}


def benchmark(output, *, seconds=1.0, repeats=3):
    if not math.isfinite(seconds) or seconds <= 0 or repeats < 1:
        raise ValueError("positive finite attempt budget and positive repeats required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    project = Path(__file__).resolve().parents[1]
    excluded = {
        case["tree_id"]
        for filename in ("frontier-benchmark.json", "techniques-benchmark.json")
        for case in json.loads((project / "examples" / filename).read_text())["inputs"]
    }
    seen = set(excluded)
    cases = []
    for n in (35, 75):
        for family in ("prufer", "recursive", "spider", "lobster"):
            accepted = 0
            for index in range(10000):
                seed = derived_seed("portfolio-unseen-v1", 859433, n, family, index)
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
                        "solver_seed": derived_seed("portfolio-solver-v1", seed),
                    }
                )
                accepted += 1
                if accepted == 6:
                    break
            if accepted != 6:
                raise RuntimeError("Could not generate the prespecified corpus")
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": provenance(output),
        "attempt_seconds": seconds,
        "candidate_seconds": min(0.1, seconds * 0.1),
        "repeats": repeats,
        "variants": VARIANTS,
        "master_seed": 859433,
        "excluded_tree_ids": sorted(excluded),
        "cases": len(cases),
        "protocol": "48 unique non-caterpillar trees: six per family/order, excluding every class in both earlier corpora. No tuning after these results. Equal wall allowances; different node caps are explicit. Unknowns are censored. Compared with our previous implementation, not published state of the art.",
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", cases)
    assert cp_model.CpSolver
    records = []
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            names = list(VARIANTS)
            offset = (repeat + index) % len(names)
            names = names[offset:] + names[:offset]
            models = set()
            for name in names:
                algorithm, nodes = VARIANTS[name]
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
                    "frontier_max_nodes": nodes,
                    "frontier_algorithm": algorithm,
                }
                write_json(directory / "request.json", request)
                result = solve(request)
                write_json(directory / "result.json", result)
                if result["status"] == "verified_graceful":
                    if not verify_labeling(**case["input"], labels=result["labels"])["valid"]:
                        raise RuntimeError("Invalid candidate witness")
                elif result["status"] != "unknown":
                    raise RuntimeError(f"Unexpected result needs investigation: {result['status']}")
                if "model_sha256" in result:
                    models.add(result["model_sha256"])
                frontier = result.get("frontier", {})
                records.append(
                    {
                        "case": index,
                        "repeat": repeat,
                        "variant": name,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "solver_seed": case["solver_seed"],
                        "search_method": result["search_method"],
                        "status": result["status"],
                        "wall_seconds": result["wall_seconds"],
                        "frontier_nodes": frontier.get("nodes"),
                        "frontier_stages": len(frontier.get("stages", [frontier])),
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            assert len(models) <= 1, "Exact fallback model changed"
            if (index + 1) % 12 == 0:
                print(f"Fresh repeat {repeat + 1}/{repeats}: {index + 1}/48 trees", flush=True)
    totals = []
    for name in VARIANTS:
        for repeat in range(repeats):
            rows = [r for r in records if r["variant"] == name and r["repeat"] == repeat]
            totals.append(
                {
                    "variant": name,
                    "repeat": repeat,
                    "cases": len(rows),
                    "seconds": sum(r["wall_seconds"] for r in rows),
                    "verified": sum(r["status"] == "verified_graceful" for r in rows),
                    "unknown": sum(r["status"] == "unknown" for r in rows),
                    "methods": dict(Counter(r["search_method"] for r in rows)),
                }
            )
    medians = {
        v: statistics.median(r["seconds"] for r in totals if r["variant"] == v) for v in VARIANTS
    }
    result = {
        "metadata": metadata,
        "totals": totals,
        "median_seconds": medians,
        "bounded_workload_speedup": medians["previous"] / medians["portfolio"],
        "records": records,
    }
    write_json(output / "benchmark.json", result)
    write_checksums(output)
    print(
        json.dumps(
            {"median_seconds": medians, "speedup": result["bounded_workload_speedup"]}, indent=2
        ),
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
