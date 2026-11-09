"""Bounded prescribed-zero probes for equal-leg spiders, with tiny exact controls.

This tests the leg-length-four midpoint orbit left open in the reviewed symmetric
spider question. Finite positive results are evidence, not a general theorem;
restricted solver-infeasible answers are not independently certified refutations.
"""

import argparse
import hashlib
import itertools
import json
import math
import os
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.rooted_spiders import solve_rooted, spider
from graceful_research.trees import derived_seed
from graceful_research.verify import verify_labeling

MASTER_SEED = 2026110811


def permutation_oracle(n, edges, root):
    """Fix root zero and exhaust the remaining permutations through order eight."""
    if not 1 <= n <= 8 or type(root) is not int or not 0 <= root < n:
        raise ValueError("tiny oracle supports valid roots through eight vertices")
    vertices = [v for v in range(n) if v != root]
    checked = 0
    for values in itertools.permutations(range(1, n)):
        checked += 1
        labels = [0] * n
        for vertex, label in zip(vertices, values, strict=True):
            labels[vertex] = label
        if sorted(abs(labels[u] - labels[v]) for u, v in edges) == list(range(1, n)):
            return {
                "feasible": True,
                "labels": labels,
                "assignments_checked": checked,
                "exhausted": False,
            }
    return {"feasible": False, "labels": None, "assignments_checked": checked, "exhausted": True}


def verify_answer(case, labels):
    """Benchmark-level independent check, without the scoped solver helper."""
    check = verify_labeling(**case["input"], labels=labels)
    return {
        **check,
        "root_valid": check["vertex_labels_valid"] and labels[case["root"]] == 0,
        "valid": check["valid"] and labels[case["root"]] == 0,
    }


def cases():
    result = []
    # Freeze all six target questions before controls, so a total-budget cutoff
    # cannot silently prioritize easier root orbits over the research target.
    for distance in (2, 0, 1, 3, 4):
        for count in range(3, 9):
            data, legs = spider([4] * count)
            root = 0 if distance == 0 else legs[0][distance - 1]
            result.append(
                {
                    "name": f"equal_{count}_legs_4_root_distance_{distance}",
                    "kind": "midpoint_target" if distance == 2 else "known_orbit_control",
                    "input": data,
                    "root": root,
                    "legs": count,
                    "leg_length": 4,
                    "root_distance": distance,
                }
            )
    for lengths in ([1, 1, 3], [3]):
        data, _ = spider(lengths)
        for root in range(data["n"]):
            result.append(
                {
                    "name": f"tiny_{'-'.join(map(str, lengths))}_root_{root}",
                    "kind": "permutation_control",
                    "input": data,
                    "root": root,
                    "leg_lengths": lengths,
                }
            )
    result.append(
        {
            "name": "singleton_root",
            "kind": "permutation_control",
            "input": {"n": 1, "edges": []},
            "root": 0,
        }
    )
    for index, case in enumerate(result):
        case["solver_seed"] = derived_seed("spider-zero-v1", MASTER_SEED, index, case["name"])
    return result


def write_coverage(output, records):
    """Show only finite verified root orbits, with no interpolation or proof claim."""
    # Match the shared plotting code's writable per-environment font cache.
    identity = hashlib.sha256(sys.prefix.encode()).hexdigest()[:16]
    cache = Path(tempfile.gettempdir()) / f"graceful-matplotlib-{identity}"
    if not os.environ.get("MPLCONFIGDIR"):
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.environ["MPLCONFIGDIR"] = str(cache)
    import matplotlib as mpl
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.colors import BoundaryNorm, ListedColormap
    from matplotlib.figure import Figure
    from matplotlib.patches import Patch

    grid = [[0] * 5 for _ in range(6)]
    plotted = []
    for row in records:
        case, result = row["input"], row["result"]
        if case["kind"] not in ("midpoint_target", "known_orbit_control"):
            continue
        category = 0
        if result["status"] == "verified_graceful":
            if not verify_answer(case, result["labels"])["valid"]:
                raise ValueError("coverage cannot mark an invalid root witness as verified")
            category = 1
        elif result["status"] == "solver_infeasible":
            category = 2
        grid[case["legs"] - 3][case["root_distance"]] = category
        plotted.append(
            {
                "legs": case["legs"],
                "root_distance": case["root_distance"],
                "status": result["status"],
                "category": category,
            }
        )
    directory = Path(output) / "figures"
    directory.mkdir(exist_ok=True)
    write_json(
        directory / "root-orbit-coverage.json",
        {
            "leg_length": 4,
            "scope": "prescribed_zero",
            "finite_cases_only": True,
            "categories": {
                "0": "unknown or not investigated",
                "1": "verified graceful under root=0",
                "2": "solver infeasible under root=0; no checked negative certificate",
            },
            "records": plotted,
        },
    )
    colors = ("#e7e7e7", "#246a57", "#a85729")
    labels = (
        "Unknown / not run",
        "Verified graceful under root=0",
        "Solver negative (uncertified)",
    )
    with mpl.rc_context(
        {
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "text.color": "#222222",
            "svg.fonttype": "none",
            "svg.hashsalt": "spider-root-orbits-v1",
        }
    ):
        figure = Figure(figsize=(7.2, 5.0))
        FigureCanvasAgg(figure)
        ax = figure.subplots()
        figure.subplots_adjust(left=0.13, right=0.96, top=0.84, bottom=0.28)
        ax.imshow(
            grid,
            cmap=ListedColormap(colors),
            norm=BoundaryNorm((-0.5, 0.5, 1.5, 2.5), 3),
            aspect="auto",
        )
        ax.set_xticks(range(5), ("0 (hub)", "1", "2 (midpoint)", "3", "4 (leaf)"))
        ax.set_yticks(range(6), range(3, 9))
        ax.set_xlabel("Distance of the prescribed zero vertex from the hub", labelpad=10)
        ax.set_ylabel("Number of equal legs")
        ax.set_xticks([i - 0.5 for i in range(6)], minor=True)
        ax.set_yticks([i - 0.5 for i in range(7)], minor=True)
        ax.grid(which="minor", color="white", linewidth=2)
        ax.tick_params(which="both", length=0)
        ax.spines[:].set_visible(False)
        for y, row in enumerate(grid):
            for x, category in enumerate(row):
                ax.text(
                    x,
                    y,
                    ("?", "yes", "negative")[category],
                    ha="center",
                    va="center",
                    color="#333333" if category == 0 else "white",
                    fontsize=10,
                )
        figure.suptitle(
            "Symmetric spiders · fixed leg length 4", x=0.13, ha="left", y=0.96, fontsize=14
        )
        figure.text(
            0.13,
            0.89,
            "One representative per root orbit; all vertex labels independently checked.",
            fontsize=9,
        )
        figure.legend(
            [Patch(facecolor=color) for color in colors],
            labels,
            loc="lower left",
            bbox_to_anchor=(0.11, 0.08),
            frameon=False,
            fontsize=9,
            ncols=2,
        )
        figure.text(
            0.13,
            0.04,
            "Finite cases only (3–8 legs). This does not prove a general theorem.",
            fontsize=9,
        )
        figure.savefig(directory / "root-orbit-coverage.svg", metadata={"Date": None})
        figure.savefig(directory / "root-orbit-coverage.png", dpi=160)
        figure.clear()


def experiment(output, *, attempt_seconds=2.0, budget_seconds=90.0):
    for value in (attempt_seconds, budget_seconds):
        if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
            raise ValueError("positive finite attempt and experiment allowances required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    inputs = cases()
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "master_seed": MASTER_SEED,
        "provenance": provenance(output),
        "cases": len(inputs),
        "scope": "prescribed_zero",
        "attempt_seconds": attempt_seconds,
        "budget_seconds": budget_seconds,
        "protocol": "Six midpoint targets on equal-leg length-four spiders with 3..8 legs, followed by the other four root orbits for each shape and eleven tiny permutation controls. One representative per symmetric leg orbit; no root or complement constraint is imposed as symmetry breaking. The prescribed zero is the experiment itself. CP-SAT uses one worker and symmetry_level=0. Preparation counts against each attempt; the total solve loop is bounded, with output finalization afterward. Concurrent execution is permitted for functional evidence; timings are not performance comparisons.",
        "references": ["https://arxiv.org/pdf/2312.16235"],
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    deadline = time.monotonic() + budget_seconds
    records = []
    for index, case in enumerate(inputs):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            result = {
                "status": "not_run_budget_limit",
                "scope": "prescribed_zero",
                "labels": None,
                "restriction": {"kind": "prescribed_zero", "vertex": case["root"]},
                "proof_certificate_verified": False,
                "timed_out": False,
            }
        else:
            result = solve_rooted(
                **case["input"],
                root=case["root"],
                seed=case["solver_seed"],
                seconds=min(attempt_seconds, remaining),
                directory=output / "attempts" / f"{index:03d}",
            )
        verification = None
        if result["status"] == "verified_graceful":
            verification = verify_answer(case, result["labels"])
            if not verification["valid"]:
                raise RuntimeError(f"independent root/witness check failed for case {index}")
        elif result["status"] not in ("unknown", "solver_infeasible", "not_run_budget_limit"):
            raise RuntimeError(f"unexpected result needs investigation: {result['status']}")
        oracle = None
        if case["input"]["n"] <= 8:
            oracle = permutation_oracle(**case["input"], root=case["root"])
            if (result["status"] == "verified_graceful" and not oracle["feasible"]) or (
                result["status"] == "solver_infeasible" and oracle["feasible"]
            ):
                raise RuntimeError(f"solver and independent oracle disagree on case {index}")
        row = {
            "case": index,
            "input": case,
            "result": result,
            "independent_verification": verification,
            "permutation_oracle": oracle,
        }
        records.append(row)
        write_json(output / "cases" / f"{index:03d}.json", row)
        if (index + 1) % 6 == 0:
            print(f"Rooted spider cases {index + 1}/{len(inputs)}", flush=True)
    counts = dict(Counter(row["result"]["status"] for row in records))
    targets = [row for row in records if row["input"]["kind"] == "midpoint_target"]
    groups = {
        kind: dict(
            Counter(row["result"]["status"] for row in records if row["input"]["kind"] == kind)
        )
        for kind in ("midpoint_target", "known_orbit_control", "permutation_control")
    }
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(records),
        "outcomes": counts,
        "by_kind": groups,
        "records": records,
        "oracle_assignments_checked": sum(
            row["permutation_oracle"]["assignments_checked"]
            for row in records
            if row["permutation_oracle"]
        ),
        "negative_proof_certificates": 0,
        "novelty_claimed": False,
        "general_theorem_proved": False,
    }
    write_json(output / "summary.json", summary)
    write_coverage(output, records)
    lines = [
        "# Prescribed-zero symmetric spider experiment",
        "",
        "The target is zero at the midpoint of a four-edge leg, on equal-leg spiders with 3–8 legs. The literature review identified this as a specific unresolved orbit in Rofa's symmetric-spider question; finite tests do not settle that question.",
        "",
        "![Coverage of the five root-distance orbits on equal-leg length-four spiders with 3–8 legs. Green cells have independently verified graceful witnesses with the indicated vertex labeled zero; finite cases only.](figures/root-orbit-coverage.svg)",
        "",
        "[PNG figure](figures/root-orbit-coverage.png) · [machine-readable coverage](figures/root-orbit-coverage.json). Each row is one tree shape and each column one root orbit. A verified cell asserts only that finite constrained instance.",
        "",
        "| Legs | Vertices | Target outcome | Labels along each leg, from the hub outward |",
        "| ---: | ---: | --- | --- |",
    ]
    for row in targets:
        case, result = row["input"], row["result"]
        labels = result["labels"]
        leg_labels = "unresolved"
        if labels is not None:
            _, legs = spider([4] * case["legs"])
            leg_labels = f"hub {labels[0]}; " + "; ".join(
                str([labels[v] for v in leg]) for leg in legs
            )
        lines.append(
            f"| {case['legs']} | {case['input']['n']} | {result['status']} | {leg_labels} |"
        )
    lines += [
        "",
        "## Outcomes by scope",
        "",
        "| Scope | Outcomes |",
        "| --- | --- |",
        *[f"| {kind} | {json.dumps(count)} |" for kind, count in groups.items()],
        "",
        "All positive solutions passed a full independent graceful-labeling verifier and a separate root-zero check. Tiny controls are also checked by complete permutation enumeration. A solver-infeasible answer excludes only the prescribed root and is not a checkable negative proof certificate. Unknowns and skipped cases remain unresolved.",
        "",
        "## Reproducibility and limits",
        "",
        metadata["protocol"],
        "",
        "Exact inputs, root restrictions, seeds, CP-SAT model and parameter files, witnesses, source snapshots, dependency versions and checksums are preserved. These are functional experiments, not isolated timing benchmarks, and no speed claim is made. The other root orbits are controls from the reviewed construction results; a timeout on a control does not contradict its theorem.",
        "",
        "## Next mathematical step",
        "",
        "Compare the verified midpoint witnesses by leg count for a parameterized formula. Any proposed formula must verify every label, every edge difference and the prescribed zero for arbitrary leg count; a finite witness table is insufficient. Do not infer obstruction from a solver cutoff. No new formula, general theorem or novelty is claimed in this run.",
        "",
        "Source: [Rofa, symmetric rooted trees and spiders](https://arxiv.org/pdf/2312.16235).",
        "",
    ]
    (output / "report.md").write_text("\n".join(lines))
    write_checksums(output)
    print(
        json.dumps(
            {
                "outcomes": counts,
                "by_kind": groups,
                "oracle_assignments_checked": summary["oracle_assignments_checked"],
            },
            indent=2,
        ),
        flush=True,
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt-seconds", type=float, default=2)
    parser.add_argument("--budget-seconds", type=float, default=90)
    args = parser.parse_args()
    experiment(
        args.output, attempt_seconds=args.attempt_seconds, budget_seconds=args.budget_seconds
    )
