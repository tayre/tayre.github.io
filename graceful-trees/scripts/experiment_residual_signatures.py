"""Bounded, deterministic branch-compatibility experiment with permutation checks.

This runs 102 prespecified residual problems, not searches for nongraceful trees.
Every component has at most three vertices; every residual has at most eight.
The generated cases are saved before solving, with no selection on outcomes.
"""

import argparse
import itertools
import json
import random
import time
from collections import Counter
from pathlib import Path

from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.residual_signatures import complete_forest
from graceful_research.trees import derived_seed

MASTER_SEED = 2026110901
LAYOUTS = [
    [[-1]],
    [[-1, 0]],
    [[-1, 0, 1]],
    [[-1, 0, 0]],
    [[-1], [-1]],
    [[-1, 0], [-1]],
    [[-1, 0, 1], [-1]],
    [[-1, 0, 0], [-1, 0]],
    [[-1, 0, 1], [-1, 0, 0]],
    [[-1, 0], [-1, 0], [-1]],
    [[-1, 0, 1], [-1, 0, 0], [-1]],
    [[-1, 0, 1], [-1, 0, 0], [-1, 0]],
]


def cases():
    controls = [
        {"name": "empty", "unused": [], "differences": [], "components": [], "expected": True},
        {
            "name": "two_vertex_branch",
            "unused": [1, 2],
            "differences": [1, 2],
            "components": [{"parent_label": 0, "parents": [-1, 0]}],
            "expected": True,
        },
        {
            "name": "missing_branch_difference",
            "unused": [1, 2],
            "differences": [1, 3],
            "components": [{"parent_label": 0, "parents": [-1, 0]}],
            "expected": False,
        },
        {
            "name": "four_vertex_path_middle_extreme",
            "unused": [1, 2],
            "differences": [1, 2],
            "components": [
                {"parent_label": 0, "parents": [-1]},
                {"parent_label": 3, "parents": [-1]},
            ],
            "expected": False,
        },
    ]
    result = [{"kind": "known_control", **control} for control in controls]
    for n in range(5, 10):
        for layout_index, layout in enumerate(LAYOUTS):
            size = sum(map(len, layout))
            if size >= n:
                continue
            for sample in range(2):
                seed = derived_seed("residual-signatures-v1", MASTER_SEED, n, layout_index, sample)
                rng = random.Random(seed)
                unused = sorted(rng.sample(range(n), size))
                available_parents = [value for value in range(n) if value not in unused]
                result.append(
                    {
                        "kind": "generated",
                        "ambient_n": n,
                        "layout": layout_index,
                        "sample": sample,
                        "seed": seed,
                        "unused": unused,
                        "differences": sorted(rng.sample(range(1, n), size)),
                        "components": [
                            {"parent_label": rng.choice(available_parents), "parents": shape.copy()}
                            for shape in layout
                        ],
                    }
                )
    return result


def verify_placement(case, placements):
    """Arithmetic check independent of the signature tables and join."""
    components = case["components"]
    if len(components) != len(placements):
        return False
    if sorted(value for row in placements for value in row) != sorted(case["unused"]):
        return False
    actual = []
    for component, row in zip(components, placements, strict=True):
        if len(row) != len(component["parents"]):
            return False
        for child, parent in enumerate(component["parents"]):
            neighbor = component["parent_label"] if parent == -1 else row[parent]
            actual.append(abs(row[child] - neighbor))
    return sorted(actual) == sorted(case["differences"])


def permutation_oracle(case):
    checked = 0
    for assignment in itertools.permutations(case["unused"]):
        checked += 1
        placements, cursor = [], 0
        for component in case["components"]:
            count = len(component["parents"])
            placements.append(list(assignment[cursor : cursor + count]))
            cursor += count
        if verify_placement(case, placements):
            return {
                "feasible": True,
                "assignments_checked": checked,
                "exhausted": False,
                "placements": placements,
            }
    return {"feasible": False, "assignments_checked": checked, "exhausted": True, "placements": []}


def experiment(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    inputs = cases()
    if len(inputs) != 102:
        raise RuntimeError("Prespecified case count changed")
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "master_seed": MASTER_SEED,
        "provenance": provenance(output),
        "cases": len(inputs),
        "scope": "fixed residual assignments only; not whole-tree infeasibility",
        "protocol": "Four known controls and two seeded samples per admissible layout/ambient order 5..9. All twelve layouts fixed in source; no outcome-based filtering. Components at most three vertices, residuals at most eight. Exact signature joins checked against direct full-permutation search.",
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    rows = []
    for index, case in enumerate(inputs):
        started = time.monotonic()
        result = complete_forest(case["unused"], case["differences"], case["components"])
        elapsed = time.monotonic() - started
        oracle = permutation_oracle(case)
        if result["feasible"] != oracle["feasible"]:
            raise RuntimeError(f"Signature/oracle disagreement in case {index}")
        if "expected" in case and result["feasible"] != case["expected"]:
            raise RuntimeError(f"Known control failed in case {index}")
        if result["feasible"] and not verify_placement(case, result["placements"]):
            raise RuntimeError(f"Invalid reconstructed witness in case {index}")
        write_json(
            output / "cases" / f"{index:03d}.json",
            {
                "input": case,
                "result": result,
                "permutation_oracle": oracle,
                "signature_seconds": elapsed,
            },
        )
        rows.append(
            {
                "case": index,
                "kind": case["kind"],
                "vertices": len(case["unused"]),
                "feasible": result["feasible"],
                "reason": result["reason"],
                "signature_counts": result["signature_counts"],
                "join_nodes": result["join_nodes"],
                "signature_seconds": elapsed,
                "oracle_assignments_checked": oracle["assignments_checked"],
                "oracle_agreed": True,
                "evidence": f"cases/{index:03d}.json",
            }
        )
    incompatible = [
        row["case"] for row in rows if not row["feasible"] and all(row["signature_counts"])
    ]
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(rows),
        "feasible": sum(row["feasible"] for row in rows),
        "infeasible_fixed_residuals": sum(not row["feasible"] for row in rows),
        "all_oracles_agreed": True,
        "incompatible_nonempty_tables": incompatible,
        "negative_proof_certificates": 0,
        "novelty_claimed": False,
        "records": rows,
    }
    write_json(output / "summary.json", summary)
    distribution = Counter(row["vertices"] for row in rows)
    report = [
        "# Small residual branch compatibility experiment",
        "",
        f"{len(rows)} fixed residual problems; {summary['feasible']} admit completion and "
        f"{summary['infeasible_fixed_residuals']} do not. All results agreed with an independent "
        "permutation search. No timeout or heuristic cutoff was used.",
        "",
        "These outcomes concern the declared parent labels and remaining resources. "
        "An impossible residual is not a nongraceful tree. Exhaustive agreement is not "
        "an independently checked UNSAT proof certificate; no result is promoted to one. "
        "No literature or mathematical novelty is claimed.",
        "",
        "## Residual sizes",
        "",
        "| Vertices | Cases |",
        "| --- | ---: |",
        *[f"| {size} | {count} |" for size, count in sorted(distribution.items())],
        "",
        "## Component compatibility",
        "",
        f"{len(incompatible)} cases had a nonempty table for every branch but no compatible "
        "joint choice. These are examples of competition for labels or differences, not discoveries.",
        "",
        *[f"- [Case {index}](cases/{index:03d}.json)" for index in incompatible[:12]],
        "",
        "## Recommended next experiments",
        "",
        "Group incompatible cases by exact rooted shapes and boundary/resource patterns. "
        "Seek a general exclusion formula and test it on a separately fixed corpus before "
        "attempting a proof. Compare this experiment with the existing two-parent leaf rule; "
        "do not infer a whole-tree obstruction or extrapolate a speedup from these timings.",
        "",
        "## Reproduction",
        "",
        "`inputs.json` records every case before search. Per-case files retain complete signature "
        "tables, reconstructed witnesses and permutation-oracle results. `protocol.json` records "
        "the seed, environment and source snapshot hashes; `checksums.json` covers the archive. "
        "This experimental archive is not a campaign checkpoint for `graceful-research audit`.",
        "",
    ]
    (output / "report.md").write_text("\n".join(report))
    write_checksums(output)
    print(
        json.dumps(
            {
                key: summary[key]
                for key in (
                    "cases",
                    "feasible",
                    "infeasible_fixed_residuals",
                    "all_oracles_agreed",
                    "incompatible_nonempty_tables",
                )
            },
            indent=2,
        )
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    experiment(args.output)
