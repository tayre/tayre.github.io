"""Frozen residual-state and fresh-tree evaluation of exact leaf completion.

Run without concurrent tests. Frozen states come from unchanged, node-bounded
searches on an existing development corpus. They are not independent held-out
trees. The optional held-out suite excludes every earlier benchmark tree shape.
Neither a residual rejection nor a bounded-search failure rejects a whole tree.
"""

import argparse
import json
import math
import statistics
import time
from collections import Counter
from pathlib import Path

from ortools.sat.python import cp_model  # Warm the exact backend before timing.

from graceful_research.constructive import caterpillar_labeling
from graceful_research.frontier import search as legacy_search
from graceful_research.frontier_memo import search as memo_search
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.leaf_tail import complete_leaf_tail
from graceful_research.solver import solve
from graceful_research.trees import (
    canonical_code,
    derived_seed,
    generate_family,
    graph_input,
    tree_id,
)
from graceful_research.verify import verify_labeling

VARIANTS = {"previous": "portfolio-frontier-v3", "leaf_tail": "leaf-portfolio-v4"}
PRIOR_CORPORA = (
    "frontier-benchmark.json",
    "techniques-benchmark.json",
    "portfolio-benchmark.json",
)


def branching_completion(state, *, seconds, max_nodes):
    """Complete descending DFS on the frozen leaves, without memoization/pruning.

    Leaf identities use ascending vertex-ID order. This is a residual
    algorithm comparison, not a timing claim about the full v3 portfolio.
    """
    started = time.perf_counter()
    deadline = started + seconds
    vertices = sorted((v, int(p)) for p, group in state["frontier_vertices"].items() for v in group)
    available = set(state["unused"])
    remaining = sorted(state["differences"], reverse=True)
    used_vertices = set()
    placements = []
    nodes = 0
    stopped = None

    class Cutoff(Exception):
        pass

    def visit(index):
        nonlocal nodes, stopped
        if nodes >= max_nodes:
            stopped = "node_limit"
            raise Cutoff
        if nodes % 64 == 0 and time.perf_counter() >= deadline:
            stopped = "time_limit"
            raise Cutoff
        nodes += 1
        if index == len(remaining):
            return True
        difference = remaining[index]
        for vertex, parent in vertices:
            if vertex in used_vertices:
                continue
            for value in (parent + difference, parent - difference):
                if value not in available:
                    continue
                available.remove(value)
                used_vertices.add(vertex)
                placements.append([value, parent])
                if visit(index + 1):
                    return True
                placements.pop()
                used_vertices.remove(vertex)
                available.add(value)
        return False

    try:
        feasible = visit(0)
    except Cutoff:
        feasible = None
    return {
        "feasible": feasible,
        "placements": placements.copy() if feasible else [],
        "reason": stopped or ("witness" if feasible else "exhausted_residual"),
        "nodes": nodes,
    }


def verify_completion(case, state, result):
    """Reconstruct a full tree labeling and call the independent verifier."""
    if result["feasible"] is not True:
        return None
    placements = result["placements"]
    values = [u for u, _ in placements]
    if len(values) != len(set(values)) or set(values) != set(state["unused"]):
        raise RuntimeError("Residual witness does not use the unused labels exactly once")
    counts = Counter(p for _, p in placements)
    expected = {int(p): k for p, k in state["parent_counts"].items()}
    if dict(counts) != expected:
        raise RuntimeError("Residual witness violates a parent's leaf count")
    differences = sorted(abs(u - p) for u, p in placements)
    if differences != sorted(state["differences"]):
        raise RuntimeError("Residual witness has wrong differences")
    labels = state["labels"].copy()
    for parent, vertices in state["frontier_vertices"].items():
        chosen = sorted(u for u, p in placements if p == int(parent))
        if len(chosen) != len(vertices):
            raise RuntimeError("Residual vertex and label counts differ")
        for vertex, value in zip(sorted(vertices), chosen, strict=True):
            labels[vertex] = value
    if not verify_labeling(**case["input"], labels=labels)["valid"]:
        raise RuntimeError("Reconstructed tree witness failed independent verification")
    return labels


def capture_states(cases, directory, *, per_trace, nodes):
    directory.mkdir()
    frozen = []
    traces = []
    for case_index, case in enumerate(cases):
        for name, search in (
            ("descending-frontier-v1", legacy_search),
            ("memo-frontier-v2", memo_search),
        ):
            eligible = 0
            retained = 0

            def observe(state, case_index=case_index, name=name):
                nonlocal eligible, retained
                eligible += 1
                if retained >= per_trace:
                    return
                retained += 1
                frozen.append(
                    {
                        "case": case_index,
                        "trace_algorithm": name,
                        "ordinal": eligible,
                        "state": state,
                    }
                )

            result = search(
                **case["input"],
                seed=case["solver_seed"],
                max_nodes=nodes,
                seconds=30,
                leaf_tail=False,
                leaf_observer=observe,
            )
            if result["termination"] == "time_limit":
                raise RuntimeError("Trace hit its safety deadline; it is not node-deterministic")
            if result["labels"] is not None:
                if not verify_labeling(**case["input"], labels=result["labels"])["valid"]:
                    raise RuntimeError("Trace witness failed verification")
            trace = {
                "case": case_index,
                "algorithm": name,
                "eligible_states": eligible,
                "retained_states": retained,
                "result": result,
            }
            traces.append(trace)
            write_json(directory / f"{case_index:03d}-{name}.json", trace)
        if (case_index + 1) % 12 == 0:
            print(f"Captured {case_index + 1}/{len(cases)} development trees", flush=True)
    return frozen, traces


def frozen_suite(
    cases, output, *, repeats, per_trace, trace_nodes, residual_seconds, residual_nodes
):
    frozen, traces = capture_states(
        cases, output / "traces", per_trace=per_trace, nodes=trace_nodes
    )
    # All states are fixed and written before either completion method is timed.
    write_json(output / "states.json", frozen)
    records = []
    for repeat in range(repeats):
        for index, item in enumerate(frozen):
            state = item["state"]
            names = ["branching", "exact_leaf"]
            if (repeat + index) % 2:
                names.reverse()
            outcomes = {}
            for name in names:
                started = time.perf_counter()
                if name == "exact_leaf":
                    result = complete_leaf_tail(
                        state["unused"],
                        state["differences"],
                        {int(p): k for p, k in state["parent_counts"].items()},
                    )
                else:
                    result = branching_completion(
                        state, seconds=residual_seconds, max_nodes=residual_nodes
                    )
                elapsed = time.perf_counter() - started
                witness = verify_completion(cases[item["case"]], state, result)
                outcomes[name] = result["feasible"]
                records.append(
                    {
                        "state": index,
                        "case": item["case"],
                        "trace_algorithm": item["trace_algorithm"],
                        "remaining_leaves": len(state["unused"]),
                        "repeat": repeat,
                        "variant": name,
                        "seconds": elapsed,
                        "result": result,
                        "verified_full_witness": witness,
                    }
                )
            if (
                outcomes["branching"] is not None
                and outcomes["branching"] != outcomes["exact_leaf"]
            ):
                raise RuntimeError("Complete residual search disagrees with exact leaf criterion")
        print(f"Frozen residual repeat {repeat + 1}/{repeats}: {len(frozen)} states", flush=True)
    totals = []
    for variant in ("branching", "exact_leaf"):
        for repeat in range(repeats):
            rows = [r for r in records if r["variant"] == variant and r["repeat"] == repeat]
            totals.append(
                {
                    "variant": variant,
                    "repeat": repeat,
                    "seconds": sum(r["seconds"] for r in rows),
                    "states": len(rows),
                    "feasible": sum(r["result"]["feasible"] is True for r in rows),
                    "infeasible_residual": sum(r["result"]["feasible"] is False for r in rows),
                    "unknown": sum(r["result"]["feasible"] is None for r in rows),
                }
            )
    medians = {
        v: statistics.median(t["seconds"] for t in totals if t["variant"] == v)
        for v in ("branching", "exact_leaf")
    }
    result = {
        "traces": traces,
        "eligible_states": sum(t["eligible_states"] for t in traces),
        "retained_states": len(frozen),
        "traces_with_eligible_states": sum(t["eligible_states"] > 0 for t in traces),
        "size_distribution": dict(Counter(len(s["state"]["unused"]) for s in frozen)),
        "totals": totals,
        "median_seconds": medians,
        "bounded_workload_speedup": medians["branching"] / medians["exact_leaf"]
        if frozen
        else None,
        "records": records,
    }
    write_json(output / "frozen-benchmark.json", result)
    return result


def fresh_inputs(project, master_seed):
    excluded = {
        c["tree_id"]
        for filename in PRIOR_CORPORA
        for c in json.loads((project / "examples" / filename).read_text())["inputs"]
    }
    seen = set(excluded)
    cases = []
    for n in (35, 75):
        for family in ("prufer", "recursive", "spider", "lobster"):
            accepted = 0
            for index in range(10000):
                seed = derived_seed("leaf-tail-unseen-v1", master_seed, n, family, index)
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
                        "solver_seed": derived_seed("leaf-tail-solver-v1", seed),
                    }
                )
                accepted += 1
                if accepted == 6:
                    break
            if accepted != 6:
                raise RuntimeError("Could not generate the prespecified fresh corpus")
    return cases, sorted(excluded)


def held_out_suite(cases, output, *, seconds, repeats):
    assert cp_model.CpSolver
    records = []
    for repeat in range(repeats):
        for index, case in enumerate(cases):
            names = list(VARIANTS)
            if (repeat + index) % 2:
                names.reverse()
            models = set()
            for name in names:
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
                    "frontier_algorithm": VARIANTS[name],
                }
                write_json(directory / "request.json", request)
                result = solve(request)
                write_json(directory / "result.json", result)
                if result["status"] == "verified_graceful":
                    if not verify_labeling(**case["input"], labels=result["labels"])["valid"]:
                        raise RuntimeError("Invalid held-out tree witness")
                elif result["status"] != "unknown":
                    raise RuntimeError(f"Unexpected tree result: {result['status']}")
                if "model_sha256" in result:
                    models.add(result["model_sha256"])
                frontier = result.get("frontier", {})
                stages = frontier.get("stages", [])
                records.append(
                    {
                        "case": index,
                        "repeat": repeat,
                        "variant": name,
                        "family": case["family"],
                        "n": case["input"]["n"],
                        "search_method": result["search_method"],
                        "status": result["status"],
                        "wall_seconds": result["wall_seconds"],
                        "frontier_nodes": frontier.get("nodes"),
                        "leaf_statistics": [
                            {k: v for k, v in stage.items() if k.startswith("leaf_")}
                            for stage in stages
                        ],
                        "evidence": str(directory.relative_to(output)),
                    }
                )
            if len(models) > 1:
                raise RuntimeError("Exact fallback model changed")
        print(f"Fresh tree repeat {repeat + 1}/{repeats}: {len(cases)} trees", flush=True)
    totals = []
    for variant in VARIANTS:
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
        v: statistics.median(t["seconds"] for t in totals if t["variant"] == v) for v in VARIANTS
    }
    result = {
        "totals": totals,
        "median_seconds": medians,
        "bounded_workload_speedup": medians["previous"] / medians["leaf_tail"],
        "records": records,
    }
    write_json(output / "held-out-benchmark.json", result)
    return result


def benchmark(
    output,
    *,
    suite="frozen",
    repeats=3,
    per_trace=100,
    trace_nodes=20000,
    residual_seconds=0.1,
    residual_nodes=200000,
    attempt_seconds=1,
    master_seed=704989,
):
    if suite not in {"frozen", "held-out", "both"}:
        raise ValueError("unsupported benchmark suite")
    for value in (repeats, per_trace, trace_nodes, residual_nodes):
        if type(value) is not int or value <= 0:
            raise ValueError("positive integer counts and node limits required")
    for value in (residual_seconds, attempt_seconds):
        if not math.isfinite(value) or value <= 0:
            raise ValueError("positive finite time allowances required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    project = Path(__file__).resolve().parents[1]
    reference = json.loads((project / "examples/portfolio-benchmark.json").read_text())["inputs"]
    fresh, excluded = fresh_inputs(project, master_seed) if suite != "frozen" else ([], [])
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": provenance(output),
        "suite": suite,
        "repeats": repeats,
        "trace_node_limit": trace_nodes,
        "trace_safety_seconds": 30,
        "states_per_trace_cap": per_trace,
        "residual_branching_seconds": residual_seconds,
        "residual_branching_nodes": residual_nodes,
        "attempt_seconds": attempt_seconds,
        "candidate_seconds": min(0.1, attempt_seconds * 0.1),
        "variants": VARIANTS,
        "master_seed": master_seed,
        "excluded_tree_ids": excluded,
        "protocol": {
            "frozen": "Existing 48-tree development corpus; capture v1 and v2 separately with the new shortcut disabled. Retain first configured number of eligible states per trace, including trivial and failing cases; count all eligible states. No filtering by either completion result. Freeze inputs before timing. Alternate method order. DFS is ordinary complete descending leaf branching without memoization or capacity pruning; cutoffs stay unknown. This microbenchmark does not compare full portfolio runtimes.",
            "held_out": "48 unique non-caterpillar trees, six per family/order, excluding every class in all three earlier benchmark corpora. Inputs and variants saved before measurement; no tuning after these results. Both portfolios use identical time and node allowances. Unknowns are censored. This is not a comparison with published state of the art.",
            "evidence": "All reconstructed positive full labelings are independently verified. Residual negatives apply only to the fixed partial labeling and are not independently certified UNSAT results. Benchmark archives are not campaign checkpoints.",
        },
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "development-inputs.json", reference)
    write_json(output / "held-out-inputs.json", fresh)
    result = {"metadata": metadata}
    if suite in {"frozen", "both"}:
        result["frozen"] = frozen_suite(
            reference,
            output,
            repeats=repeats,
            per_trace=per_trace,
            trace_nodes=trace_nodes,
            residual_seconds=residual_seconds,
            residual_nodes=residual_nodes,
        )
    if suite in {"held-out", "both"}:
        result["held_out"] = held_out_suite(fresh, output, seconds=attempt_seconds, repeats=repeats)
    write_json(output / "benchmark.json", result)
    write_checksums(output)
    print(
        json.dumps(
            {k: v["median_seconds"] for k, v in result.items() if k != "metadata"}, indent=2
        ),
        flush=True,
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--suite", choices=("frozen", "held-out", "both"), default="frozen")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--states-per-trace", type=int, default=100)
    parser.add_argument("--trace-nodes", type=int, default=20000)
    parser.add_argument("--residual-seconds", type=float, default=0.1)
    parser.add_argument("--residual-nodes", type=int, default=200000)
    parser.add_argument("--attempt-seconds", type=float, default=1)
    parser.add_argument("--master-seed", type=int, default=704989)
    args = parser.parse_args()
    benchmark(
        args.output,
        suite=args.suite,
        repeats=args.repeats,
        per_trace=args.states_per_trace,
        trace_nodes=args.trace_nodes,
        residual_seconds=args.residual_seconds,
        residual_nodes=args.residual_nodes,
        attempt_seconds=args.attempt_seconds,
        master_seed=args.master_seed,
    )
