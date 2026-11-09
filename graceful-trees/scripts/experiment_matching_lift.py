"""Reproducible functional experiment for the known perfect-matching lift.

The structured corpus deliberately contains matching-rich trees. It is not a
representative random-tree sample or a controlled runtime comparison. Every
positive output is reverified, and matching existence is checked with NetworkX.
"""

import argparse
import json
import math
import random
from collections import Counter
from pathlib import Path

import networkx as nx

from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.matching_lift import search
from graceful_research.trees import (
    canonical_code,
    derived_seed,
    generate_family,
    graph_input,
    tree_id,
)
from graceful_research.verify import verify_labeling

MASTER_SEED = 2026110903


def expand_pairs(graph, rng):
    """Replace every core vertex by a matched pair; choose external endpoints."""
    source = graph_input(graph)
    expanded = nx.Graph()
    expanded.add_nodes_from(range(2 * source["n"]))
    expanded.add_edges_from((2 * v, 2 * v + 1) for v in range(source["n"]))
    for u, v in source["edges"]:
        expanded.add_edge(2 * u + rng.randrange(2), 2 * v + rng.randrange(2))
    permutation = list(range(len(expanded)))
    rng.shuffle(permutation)
    return nx.relabel_nodes(expanded, dict(enumerate(permutation)))


def cases():
    proposals = []
    controls = [
        ("singleton", nx.empty_graph(1)),
        ("single_edge", nx.path_graph(2)),
        ("path_four", nx.path_graph(4)),
        ("path_eight", nx.path_graph(8)),
        ("star_six_no_perfect_matching", nx.star_graph(5)),
    ]
    for n in (32, 64, 128):
        controls.extend(
            [
                (f"star_{n}_no_perfect_matching", nx.star_graph(n - 1)),
                (f"odd_path_{n + 1}_no_perfect_matching", nx.path_graph(n + 1)),
            ]
        )
    for index, (name, graph) in enumerate(controls):
        proposals.append(
            {
                "kind": "known_control",
                "name": name,
                "input": graph_input(graph),
                "solver_seed": derived_seed("matching-control", MASTER_SEED, index),
            }
        )
    for n in (32, 64, 128):
        for family in ("prufer", "recursive", "spider", "lobster"):
            for expansions in (1, 2):
                seed = derived_seed("matching-lift-corpus-v1", MASTER_SEED, n, family, expansions)
                rng = random.Random(seed)
                base = generate_family(family, n // (2**expansions), seed)
                graph = base
                for _ in range(expansions):
                    graph = expand_pairs(graph, rng)
                proposals.append(
                    {
                        "kind": "matching_rich_generated",
                        "family": family,
                        "input_seed": seed,
                        "expansions": expansions,
                        "base_input": graph_input(base),
                        "input": graph_input(graph),
                        "solver_seed": derived_seed("matching-lift-solver-v1", seed),
                    }
                )
    unique = {}
    for case in proposals:
        data = case["input"]
        graph = nx.Graph()
        graph.add_nodes_from(range(data["n"]))
        graph.add_edges_from(data["edges"])
        identifier = tree_id(canonical_code(graph))
        if identifier in unique:
            unique[identifier].setdefault("duplicate_proposals", []).append(case)
        else:
            unique[identifier] = {"tree_id": identifier, **case}
    return list(unique.values())


def experiment(output, *, seconds=0.5, max_nodes=40000, max_work=100000):
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("seconds must be positive and finite")
    if any(type(v) is not int or v < 0 for v in (max_nodes, max_work)):
        raise ValueError("node and work budgets must be nonnegative integers")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    inputs = cases()
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "master_seed": MASTER_SEED,
        "provenance": provenance(output),
        "scope": "known constructive reduction; positive tree witnesses only",
        "cases": len(inputs),
        "proposals_before_isomorphism_deduplication": 35,
        "seconds_per_case": seconds,
        "max_frontier_nodes_per_case": max_nodes,
        "max_work_units_per_case": max_work,
        "protocol": "Eleven singleton/path/star controls and 24 matching-rich proposals: orders 32,64,128; four base families; one or two pair-expansion levels. External matched-pair endpoints and vertex presentations are seeded. Exact isomorphism classes are deduplicated before search. All inputs are frozen before outcomes. Matching existence is independently checked with NetworkX maximum matching. This functional experiment may run concurrently with other work: elapsed time is logged for provenance, not compared as a performance result. No default solver changes or novelty claims.",
        "references": [
            "https://combinatorialpress.com/ars-articles/volume-051-ars-articles/another-equivalent-of-the-graceful-tree-conjecture/",
            "https://www.ic.unicamp.br/~reltech/2017/17-14.pdf",
        ],
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    records = []
    for index, case in enumerate(inputs):
        data = case["input"]
        graph = nx.Graph()
        graph.add_nodes_from(range(data["n"]))
        graph.add_edges_from(data["edges"])
        oracle = nx.max_weight_matching(graph, maxcardinality=True)
        oracle_perfect = len(oracle) * 2 == data["n"]
        result = search(
            **data,
            seed=case["solver_seed"],
            seconds=seconds,
            max_nodes=max_nodes,
            max_work=max_work,
        )
        if result["has_perfect_matching"] is not None:
            if result["has_perfect_matching"] != oracle_perfect:
                raise RuntimeError(f"matching detector disagrees with NetworkX in case {index}")
        if case["kind"] == "matching_rich_generated" and not oracle_perfect:
            raise RuntimeError("matching-rich generator failed its construction invariant")
        verification = None
        if result["labels"] is not None:
            verification = verify_labeling(**data, labels=result["labels"])
            if not verification["valid"]:
                raise RuntimeError(f"independent witness verification failed in case {index}")
        if result["work_units"] > max_work or result["nodes"] > max_nodes:
            raise RuntimeError("declared work/node limit exceeded")
        row = {
            "case": index,
            "input": case,
            "result": result,
            "networkx_matching_oracle": {
                "maximum_matching_size": len(oracle),
                "has_perfect_matching": oracle_perfect,
                "matching": sorted(sorted(pair) for pair in oracle),
            },
            "independent_verification": verification,
        }
        write_json(output / "cases" / f"{index:03d}.json", row)
        records.append(row)
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(records),
        "verified_witnesses": sum(row["result"]["labels"] is not None for row in records),
        "perfect_matching_inputs": sum(
            row["networkx_matching_oracle"]["has_perfect_matching"] for row in records
        ),
        "termination_counts": dict(Counter(row["result"]["termination"] for row in records)),
        "contraction_depths": dict(
            Counter(str(row["result"]["contraction_depth"]) for row in records)
        ),
        "whole_tree_negative_claims": 0,
        "performance_claimed": False,
        "novelty_claimed": False,
        "records": records,
    }
    write_json(output / "summary.json", summary)
    lines = [
        "# Perfect-matching lift experiment",
        "",
        f"{len(records)} unique input trees; {summary['verified_witnesses']} independently verified "
        f"labelings; {summary['perfect_matching_inputs']} inputs have a perfect matching.",
        "",
        "This implements the known Broersma–Hoede construction. Pair contraction reduces a "
        "2s-vertex tree to an s-vertex contree. A graceful contree witness is lifted using "
        "even/odd labels, with opposite parity inside each matched pair and equal parity "
        "on external edges. Every lifted witness is independently verified.",
        "",
        "| Termination | Cases |",
        "| --- | ---: |",
        *[f"| {name} | {count} |" for name, count in sorted(summary["termination_counts"].items())],
        "",
        "No perfect matching means only that this construction is unavailable. Failure to label "
        "a contree, exhaustion of the work allowance, or a timeout does not establish that "
        "the original tree is nongraceful. No negative tree certificates are produced.",
        "",
        "The corpus intentionally favors matching-rich structures and includes negative "
        "applicability controls. It is not a natural random-tree sample. This functional "
        "run may be concurrent with other work; recorded elapsed times are not a speed "
        "comparison. A separate frozen, equal-time comparison is required before adoption.",
        "",
        "## Reproduction",
        "",
        "`inputs.json` records every original tree. Per-case files retain every contraction, "
        "vertex-to-core map, matching, core witness/search, parity choice, lifted labeling, "
        "and independent verification. Source snapshots, dependency versions and checksums "
        "are retained. This archive is not a campaign checkpoint.",
        "",
        "`python scripts/experiment_matching_lift.py --output results/matching-lift`",
        "",
    ]
    (output / "report.md").write_text("\n".join(lines))
    write_checksums(output)
    print(
        json.dumps(
            {
                key: summary[key]
                for key in (
                    "cases",
                    "verified_witnesses",
                    "perfect_matching_inputs",
                    "termination_counts",
                    "contraction_depths",
                )
            },
            indent=2,
        ),
        flush=True,
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=0.5)
    parser.add_argument("--max-nodes", type=int, default=40000)
    parser.add_argument("--max-work", type=int, default=100000)
    args = parser.parse_args()
    experiment(args.output, seconds=args.seconds, max_nodes=args.max_nodes, max_work=args.max_work)
