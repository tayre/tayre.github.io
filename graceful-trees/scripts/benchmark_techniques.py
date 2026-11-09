"""Compare frozen candidate methods on development inputs and fresh held-out trees.

Run without concurrent tests. Both complete routes have the same one-second
attempt allowance, independent positive verification, and an unchanged exact model.
"""

import argparse
import json
import math
import statistics
from collections import Counter
from pathlib import Path

from ortools.sat.python import cp_model  # Warm native imports for both variants.

from graceful_research.config import FAMILIES
from graceful_research.constructive import caterpillar_labeling
from graceful_research.frontier import search as legacy_search
from graceful_research.frontier_memo import search as memo_search
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

HELD_OUT_SEEDS = [570041, 570097, 570113]
VARIANTS = {"previous": "descending-frontier-v1", "memo": "memo-frontier-v2"}


def benchmark(output, *, seconds=1.0, repeats=3):
    if not math.isfinite(seconds) or seconds <= 0 or repeats < 1:
        raise ValueError("positive finite attempt budget and positive repeats required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    project = Path(__file__).resolve().parents[1]
    reference = json.loads((project / "examples/frontier-benchmark.json").read_text())["inputs"]
    cases = [{**case, "group": "reference"} for case in reference]
    for seed in HELD_OUT_SEEDS:
        for n in (35, 75):
            for family in FAMILIES:
                graph = generate_family(family, n, seed)
                cases.append(
                    {
                        "group": "held_out",
                        "input": graph_input(graph),
                        "family": family,
                        "tree_id": tree_id(canonical_code(graph)),
                        "input_seed": seed,
                        "solver_seed": derived_seed("techniques-holdout-v1", seed, n, family),
                    }
                )
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": provenance(output),
        "attempt_seconds": seconds,
        "repeats": repeats,
        "held_out_seeds": HELD_OUT_SEEDS,
        "variants": VARIANTS,
        "protocol": "Selected using reference inputs only; no retuning after held-out results. Unknowns are censored. This is not a comparison with published state-of-the-art implementations.",
        "distinct_classes": {
            group: len({c["tree_id"] for c in cases if c["group"] == group})
            for group in ("reference", "held_out")
        },
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", cases)
    ablations = []
    profiles = {
        "previous": None,
        "memo_only": {"capacity": "off", "roots_mode": "degree", "memoize": True},
        "capacity_only": {"capacity": "local", "roots_mode": "degree", "memoize": False},
        "centers_only": {"capacity": "off", "roots_mode": "centers", "memoize": False},
        "memo_capacity": {"capacity": "local", "roots_mode": "degree", "memoize": True},
        "selected": {},
        "hall_variant": {"capacity": "hall", "roots_mode": "centers", "memoize": True},
    }
    for name, options in profiles.items():
        for index, case in enumerate(reference):
            if caterpillar_labeling(**case["input"]) is not None:
                continue
            run_search = legacy_search if options is None else memo_search
            result = run_search(
                **case["input"],
                seed=case["solver_seed"],
                seconds=min(0.1, seconds * 0.1),
                **(options or {}),
            )
            if result["labels"] is not None:
                assert verify_labeling(**case["input"], labels=result["labels"])["valid"]
            ablations.append(
                {
                    "profile": name,
                    "case": index,
                    "family": case["family"],
                    "n": case["input"]["n"],
                    "result": result,
                }
            )
        print(f"Ablation {name} complete", flush=True)
    write_json(output / "ablations.json", ablations)
    records = []
    assert cp_model.CpSolver
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            pair = {}
            variants = list(VARIANTS)
            if (repeat + index) % 2:
                variants.reverse()
            for variant in variants:
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
                    "frontier_search": True,
                    "frontier_max_nodes": 20000,
                    "frontier_algorithm": VARIANTS[variant],
                }
                write_json(directory / "request.json", request)
                result = solve(request)
                write_json(directory / "result.json", result)
                if result["status"] == "verified_graceful":
                    if not verify_labeling(**case["input"], labels=result["labels"])["valid"]:
                        raise RuntimeError("benchmark witness failed independent verification")
                elif result["status"] != "unknown":
                    raise RuntimeError(f"benchmark requires investigation: {result['status']}")
                pair[variant] = result
                records.append(
                    {
                        "repeat": repeat,
                        "case": index,
                        "group": case["group"],
                        "variant": variant,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "input_seed": case["input_seed"],
                        "solver_seed": case["solver_seed"],
                        "search_method": result["search_method"],
                        "status": result["status"],
                        "wall_seconds": result["wall_seconds"],
                        "frontier_nodes": result.get("frontier", {}).get("nodes"),
                        "memo_hits": result.get("frontier", {}).get("memo_hits"),
                        "capacity_prunes": result.get("frontier", {}).get("capacity_prunes"),
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            if all("model_sha256" in result for result in pair.values()):
                assert pair["previous"]["model_sha256"] == pair["memo"]["model_sha256"]
            if (index + 1) % 20 == 0:
                print(
                    f"Paired repeat {repeat + 1}/{repeats}: {index + 1}/{len(cases)} cases",
                    flush=True,
                )
    totals = []
    for group in ("reference", "held_out"):
        for variant in VARIANTS:
            for repeat in range(repeats):
                rows = [
                    r
                    for r in records
                    if (r["group"], r["variant"], r["repeat"]) == (group, variant, repeat)
                ]
                totals.append(
                    {
                        "group": group,
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
        group: {
            variant: statistics.median(
                t["seconds"] for t in totals if t["group"] == group and t["variant"] == variant
            )
            for variant in VARIANTS
        }
        for group in ("reference", "held_out")
    }
    result = {
        "metadata": metadata,
        "totals": totals,
        "median_seconds": medians,
        "bounded_workload_speedup": {g: m["previous"] / m["memo"] for g, m in medians.items()},
        "records": records,
    }
    write_json(output / "benchmark.json", result)
    write_checksums(output)
    print(json.dumps(result["bounded_workload_speedup"], indent=2), flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt-seconds", type=float, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    benchmark(args.output, seconds=args.attempt_seconds, repeats=args.repeats)
