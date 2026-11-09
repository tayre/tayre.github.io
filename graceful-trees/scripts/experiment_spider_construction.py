"""Archive independently verified closed-form spider witnesses; no solver or timing claim."""

import argparse
import csv
import hashlib
import math
import os
import sys
import tempfile
from collections import Counter
from pathlib import Path

from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.spider_construction import (
    five_edge_spider_internal_zero,
    midpoint_zero_spider,
)
from graceful_research.verify import verify_labeling

DEFAULT_LEG_COUNTS = (*range(1, 65), 100, 256, 1000, 10000)
MAX_LEGS = 10000


def cases(leg_counts=DEFAULT_LEG_COUNTS):
    """Freeze the corpus independently of all outcomes and deduplicate k=1 roots."""
    if (
        not isinstance(leg_counts, (list, tuple))
        or not leg_counts
        or len(leg_counts) > len(DEFAULT_LEG_COUNTS)
        or any(type(k) is not int or not 1 <= k <= MAX_LEGS for k in leg_counts)
        or len(set(leg_counts)) != len(leg_counts)
    ):
        raise ValueError("leg_counts must be unique integers in 1..10000, with at most 68 entries")
    result = []
    for k in sorted(leg_counts):
        result.append(
            {
                "name": f"s{k}_4_depth2_leg0",
                "kind": "known_length_four_control",
                "legs": k,
                "leg_length": 4,
                "root_distance": 2,
                "root_leg": 0,
            }
        )
        for distance in (2, 3):
            for root_leg in sorted({0, k - 1}):
                result.append(
                    {
                        "name": f"s{k}_5_depth{distance}_leg{root_leg}",
                        "kind": "length_five_internal_construction",
                        "legs": k,
                        "leg_length": 5,
                        "root_distance": distance,
                        "root_leg": root_leg,
                    }
                )
    return result


def construct(case):
    if case["leg_length"] == 4:
        return midpoint_zero_spider(case["legs"], root_leg=case["root_leg"])
    return five_edge_spider_internal_zero(
        case["legs"], root_distance=case["root_distance"], root_leg=case["root_leg"]
    )


def verify_answer(case, certificate):
    """Check the full original graph, labels, prescribed zero and required extreme edge."""
    length, k = case["leg_length"], case["legs"]
    n = length * k + 1
    root = length * case["root_leg"] + case["root_distance"]
    restriction = None
    if length == 5:
        restriction = {
            "kind": "extreme_edge",
            "edge": [5 * case["root_leg"] + 2, 5 * case["root_leg"] + 3],
        }
    result = verify_labeling(
        certificate.get("n"), certificate.get("edges"), certificate.get("labels"), restriction
    )
    expected_edges = set()
    for leg in range(k):
        path = [0, *(length * leg + distance for distance in range(1, length + 1))]
        expected_edges.update(tuple(sorted(pair)) for pair in zip(path, path[1:], strict=False))
    shape_valid = (
        result["tree_valid"]
        and certificate["n"] == n
        and {tuple(sorted(edge)) for edge in certificate["edges"]} == expected_edges
    )
    root_valid = (
        result["vertex_labels_valid"]
        and certificate["n"] == n
        and certificate.get("root") == root
        and certificate["labels"][root] == 0
    )
    errors = result["errors"].copy()
    if not shape_valid:
        errors.append("the complete graph is not the requested numbered equal-leg spider")
    if not root_valid:
        errors.append("the requested vertex does not have label zero")
    return {
        **result,
        "valid": not errors,
        "shape_valid": shape_valid,
        "root_valid": root_valid,
        "errors": errors,
        "verifier": "stdlib-v1-plus-independent-spider-shape-root-and-extreme-edge",
    }


def write_diagram(output):
    """Draw one independently checked k=3 witness, with separate label/weight encodings."""
    case = next(case for case in cases((3,)) if case["name"] == "s3_5_depth2_leg0")
    certificate = construct(case)
    verification = verify_answer(case, certificate)
    if not verification["valid"]:
        raise ValueError("cannot draw an invalid witness")
    identity = hashlib.sha256(sys.prefix.encode()).hexdigest()[:16]
    cache = Path(tempfile.gettempdir()) / f"graceful-matplotlib-{identity}"
    if not os.environ.get("MPLCONFIGDIR"):
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.environ["MPLCONFIGDIR"] = str(cache)
    import matplotlib as mpl
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure
    from matplotlib.lines import Line2D
    from matplotlib.patches import Circle

    directory = Path(output) / "figures"
    directory.mkdir(exist_ok=True)
    write_json(directory / "five-edge-witness.json", {**certificate, "verification": verification})
    positions = {0: (0, 0)}
    for leg, angle in enumerate((0, 2 * math.pi / 3, 4 * math.pi / 3)):
        for distance in range(1, 6):
            positions[5 * leg + distance] = (
                1.25 * distance * math.cos(angle),
                1.25 * distance * math.sin(angle),
            )
    navy, orange, purple, gold = "#213d59", "#a74613", "#70409a", "#f2c861"
    with mpl.rc_context(
        {
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "text.color": "#202830",
            "svg.fonttype": "none",
            "svg.hashsalt": "five-edge-spider-formula-v1",
        }
    ):
        figure = Figure(figsize=(10.8, 9.0))
        FigureCanvasAgg(figure)
        ax = figure.subplots()
        figure.subplots_adjust(left=0.06, right=0.96, bottom=0.19, top=0.86)
        for u, v in certificate["edges"]:
            x1, y1 = positions[u]
            x2, y2 = positions[v]
            difference = abs(certificate["labels"][u] - certificate["labels"][v])
            extreme = difference == 15
            ax.plot(
                [x1, x2],
                [y1, y2],
                color=purple if extreme else "#8c99a5",
                linewidth=3.3 if extreme else 1.6,
                zorder=1,
            )
            dx, dy = x2 - x1, y2 - y1
            norm = math.hypot(dx, dy)
            ax.text(
                (x1 + x2) / 2 - 0.22 * dy / norm,
                (y1 + y2) / 2 + 0.22 * dx / norm,
                str(difference),
                ha="center",
                va="center",
                color=orange,
                fontsize=11,
                fontweight="bold",
                bbox={"facecolor": "white", "edgecolor": "none", "pad": 1.1},
                zorder=4,
            )
        for vertex, (x, y) in positions.items():
            label = certificate["labels"][vertex]
            fill = gold if label == 0 else purple if label == 15 else navy
            ax.add_patch(
                Circle((x, y), 0.265, facecolor=fill, edgecolor="white", linewidth=1.3, zorder=5)
            )
            ax.text(
                x,
                y,
                str(label),
                ha="center",
                va="center",
                color=navy if label == 0 else "white",
                fontsize=11.5,
                fontweight="bold",
                zorder=6,
            )
        ax.text(2.5, -0.58, "depth 2\nzero", color=navy, ha="center", va="top", fontsize=9)
        ax.text(3.75, -0.58, "depth 3\nmaximum", color=purple, ha="center", va="top", fontsize=9)
        ax.set_aspect("equal")
        ax.set_xlim(-3.65, 6.8)
        ax.set_ylim(-5.85, 5.85)
        ax.axis("off")
        figure.suptitle(
            "A graceful five-edge spider with three legs", x=0.06, ha="left", y=0.96, fontsize=17
        )
        figure.text(
            0.06,
            0.91,
            "The adjacent internal vertices carry 0 and 15. Complementing the labels moves zero to depth three.",
            fontsize=10,
        )
        figure.legend(
            [
                Line2D([], [], marker="o", linestyle="none", color=navy, markersize=10),
                Line2D([], [], marker="$\\Delta$", linestyle="none", color=orange, markersize=11),
                Line2D([], [], color=purple, linewidth=3),
            ],
            [
                "Vertex label (inside circle)",
                "Edge difference (beside line)",
                "Extreme edge: |0 − 15| = 15",
            ],
            loc="lower left",
            bbox_to_anchor=(0.05, 0.095),
            frameon=False,
            ncols=2,
            fontsize=10,
        )
        figure.text(
            0.06,
            0.06,
            "Vertex labels: 0–15 exactly once.     Edge differences: 1–15 exactly once.",
            fontsize=10,
        )
        figure.text(
            0.06,
            0.027,
            "Illustration of the general formula; the proof for every leg count is separate from this finite example.",
            fontsize=9,
        )
        figure.savefig(directory / "five-edge-witness.svg", metadata={"Date": None})
        figure.savefig(directory / "five-edge-witness.png", dpi=180)
        figure.clear()


def experiment(output, *, leg_counts=DEFAULT_LEG_COUNTS):
    inputs = cases(leg_counts)
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "seed": None,
        "solver_used": False,
        "deterministic_construction": True,
        "timing_claim": False,
        "leg_counts": sorted(leg_counts),
        "protocol": "One known length-four midpoint control per leg count; length-five roots at distances two and three on first and last legs, deduplicated for one leg. Full original graphs, labels, roots and extreme-edge restrictions independently verified. No search, timing comparison, or default campaign change.",
        "provenance": provenance(output),
    }
    write_json(output / "metadata.json", metadata)
    write_json(output / "requests.json", inputs)
    records = []
    for case in inputs:
        certificate = construct(case)
        verification = verify_answer(case, certificate)
        if not verification["valid"]:
            write_json(
                output / "failure.json",
                {"case": case, "certificate": certificate, "verification": verification},
            )
            write_checksums(output)
            raise ValueError(
                f"independent verification rejected {case['name']}: {verification['errors']}"
            )
        relative = Path("certificates") / f"{case['name']}.json"
        write_json(
            output / relative, {**certificate, "request": case, "verification": verification}
        )
        records.append(
            {
                **case,
                "n": certificate["n"],
                "edge_count": len(certificate["edges"]),
                "root": certificate["root"],
                "status": "verified_graceful",
                "extreme_edge_checked": case["leg_length"] == 5,
                "certificate": str(relative),
            }
        )
    write_diagram(output)
    summary = {
        "schema_version": 1,
        "finished_at": utc_now(),
        "cases": len(records),
        "verified_cases": len(records),
        "by_kind": dict(sorted(Counter(row["kind"] for row in records).items())),
        "total_vertices_checked": sum(row["n"] for row in records),
        "total_edges_checked": sum(row["edge_count"] for row in records),
        "largest_tree_order": max(row["n"] for row in records),
        "distinct_leg_counts": len(leg_counts),
        "seed": None,
        "solver_used": False,
        "timing_claim": False,
        "finite_checks_are_a_general_proof": False,
        "general_proof_source": "source/docs/spider_formula_five.md",
        "formal_source": "source/formal/Graceful/FiveSpider.lean",
        "formal_coverage": "See the snapshotted formal source and audit; this finite experiment does not establish a universal theorem.",
        "research_novelty": "unresolved; checked constructions and source review are separate from the mathematical proof",
        "source_files_snapshotted": len(metadata["provenance"]["source_hashes"]),
        "records": records,
    }
    write_json(output / "summary.json", summary)
    with (output / "cases.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    report = [
        "# Closed-form symmetric-spider construction checks",
        "",
        f"All {len(records)} complete witnesses passed independent verification: {summary['by_kind'].get('known_length_four_control', 0)} known length-four controls and {summary['by_kind'].get('length_five_internal_construction', 0)} length-five interior-root constructions.",
        "",
        "![Three-leg, five-edge spider with vertex labels inside circles and edge differences beside lines. The depth-two vertex has label zero and the adjacent depth-three vertex has the maximum label fifteen.](figures/five-edge-witness.svg)",
        "",
        "[PNG figure](figures/five-edge-witness.png) · [figure's full witness](figures/five-edge-witness.json) · [case table](cases.csv) · [machine-readable summary](summary.json).",
        "",
        "## Scope and result",
        "",
        f"The corpus contains {len(leg_counts)} distinct leg counts: {', '.join(map(str, sorted(leg_counts)))}. It checks {summary['total_vertices_checked']:,} vertex occurrences and {summary['total_edges_checked']:,} edge occurrences across complete original trees. The largest tree has {summary['largest_tree_order']:,} vertices.",
        "",
        "For each leg count, the length-four control places zero at a midpoint on the first leg. The length-five construction places zero at distance two or three, separately on the first and last legs; duplicate leg choices are omitted when there is only one leg. Every length-five certificate also passes the independent extreme-edge check between distances two and three.",
        "",
        "## General proof and finite verification",
        "",
        "The [general algebraic proof](source/docs/spider_formula_five.md) establishes the explicit length-five construction for every positive integer leg count. It partitions all vertex labels by residue modulo five and all edge weights into multiples of five and the absolute values of two arithmetic progressions. Complementation moves zero from distance two to distance three while preserving every edge difference.",
        "",
        "This experiment checks the implementation on a finite corpus; its successful cases are not the proof of the universal statement. The four-edge midpoint construction is a specialization of known subdivision results. Research novelty of the five-edge formula remains unresolved by these checks. The [formal source](source/formal/Graceful/FiveSpider.lean) and its audit must be read for the exact scope of machine-checked claims.",
        "",
        "## Reproducibility",
        "",
        f"All {len(records)} full inputs, vertex labelings, prescribed roots and independent verifier outputs are retained in [certificates/](certificates/). The construction is deterministic and uses no seed or solver. The run snapshots {summary['source_files_snapshotted']} source files, records dependency versions and Git provenance, and hashes every retained artifact in [checksums.json](checksums.json).",
        "",
        "These are mathematical correctness checks, not timing benchmarks. No speed claim, solver-default change, cloud scheduling change, or proof of the unrestricted graceful-tree conjecture is made.",
        "",
    ]
    (output / "report.md").write_text("\n".join(report))
    write_checksums(output)
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--smoke", action="store_true", help="use leg counts 1,2,3 only")
    args = parser.parse_args(argv)
    summary = experiment(args.output, leg_counts=(1, 2, 3) if args.smoke else DEFAULT_LEG_COUNTS)
    print(f"Verified {summary['verified_cases']} complete witnesses; output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
