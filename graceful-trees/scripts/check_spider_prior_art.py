"""Finite checks of the classical alpha-amalgamation implication; standard library only.

These checks corroborate docs/spider-priority-review.md, not its universal proof.
They use neither the project's original spider formulas nor a search solver.
"""

import argparse
import hashlib
import json
import platform
from pathlib import Path

PATH_LABELS = [9, 2, 7, 1, 10, 0, 8, 4, 5, 3, 6]
LEG_COUNTS = list(range(1, 101)) + [256, 1000, 10000]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def construct(k):
    if k == 1:
        return 1, [[4, 0, 5, 3, 2]], 0
    total, r = 5 * k, k - 2
    legs = [
        [total - 5, 3, total - 2, 2, total - 4],
        [total - 3, 0, total, 1, total - 1],
    ]
    for j in range(r):
        # Known center-zero symmetric-tree labeling, shifted by four.
        legs.append([5 * (r - j) + 4, 5 * j + 5, 5 * (r - j) + 3, 5 * j + 6, 5 * (r - j) + 2])
    return 4, legs, 1


def check(k):
    hub, legs, special = construct(k)
    require(len(legs) == k and all(len(leg) == 5 for leg in legs), "wrong spider shape")
    labels = [hub] + [x for leg in legs for x in leg]
    edges = []
    for i in range(k):
        indices = [0] + list(range(1 + 5 * i, 6 + 5 * i))
        edges.extend((indices[j], indices[j + 1]) for j in range(5))
    adjacency = [[] for _ in labels]
    for u, v in edges:
        adjacency[u].append(v)
        adjacency[v].append(u)
    seen, stack = {0}, [0]
    while stack:
        for v in adjacency[stack.pop()]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    require(len(seen) == len(labels) and len(edges) == len(labels) - 1, "not a tree")
    require(len(set(edges)) == len(edges), "duplicate edges")
    for values in (labels, [5 * k - x for x in labels]):
        require(sorted(values) == list(range(5 * k + 1)), "incorrect vertex labels")
        require(
            sorted(abs(values[u] - values[v]) for u, v in edges) == list(range(1, 5 * k + 1)),
            "incorrect edge differences",
        )
    require(legs[special][1] == 0 and legs[special][2] == 5 * k, "wrong interior extrema")
    return {
        "legs": k,
        "vertices": len(labels),
        "valid": True,
        "labels_sha256": hashlib.sha256(json.dumps(labels).encode()).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pairs = [PATH_LABELS[i : i + 2] for i in range(10)]
    differences = [abs(a - b) for a, b in pairs]
    require(sorted(PATH_LABELS) == list(range(11)), "invalid seed labels")
    require(sorted(differences) == list(range(1, 11)), "invalid seed differences")
    require(PATH_LABELS[5] == 0 and PATH_LABELS[7:9] == [4, 5], "wrong seed positions")
    require(
        all(min(a, b) <= 4 < max(a, b) for a, b in pairs),
        "seed is not alpha-labeled at boundary four",
    )
    report = {
        "schema_version": 1,
        "review_date": "2026-11-14",
        "python_version": platform.python_version(),
        "checker_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "path_labels": PATH_LABELS,
        "path_differences": differences,
        "alpha_boundary": 4,
        "center_index": 5,
        "scope": "finite verification of a classical construction specialization and complement",
        "novelty_claim": False,
        "universal_proof_claim_from_tests": False,
        "checks": [check(k) for k in LEG_COUNTS],
    }
    with args.output.open("x") as stream:
        stream.write(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"cases": len(LEG_COUNTS), "largest_vertices": 50001, "valid": True}))


if __name__ == "__main__":
    main()
