"""Check finite support for the written G(1,l) d-zero alpha proof.

Checks ten gap-four anchors, their 100 leaf partitions, and an archived l=4
boundary witness. This is NOT a formalization or machine proof of the infinite
theorem, and does not use Lean, a graph library, or a solver. Python >=3.11.
"""

import argparse
import json
from itertools import combinations
from pathlib import Path


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_gap_four(rows):
    """Regenerate all anchors and reject each small-difference overapproximation."""
    supplied = []
    for row in rows:
        _require(
            isinstance(row, list) and len(row) == 5 and all(type(x) is int for x in row),
            "Each gap-four row must contain integer K,L,H,U,V",
        )
        supplied.append(tuple(row))
    _require(len(supplied) == len(set(supplied)), "Duplicate gap-four row")
    expected = set()
    for k, large_l in ((3, 7), (7, 3)):
        for h in range(8):
            if h in (k, large_l):
                continue
            rhs = 20 - 2 * h - large_l
            # Bounds follow directly from positive U,V and 2U+3V=rhs.
            for u in range(1, rhs // 2 + 1):
                for v in range(1, rhs // 3 + 1):
                    if u != v and min(u, v) == 1 and 2 * u + 3 * v == rhs:
                        expected.add((k, large_l, h, u, v))
    _require(len(expected) == 10 and set(supplied) == expected, "Missing or extra gap-four row")
    checks = []
    for k, large_l, h, u, v in sorted(expected):
        available = [offset for offset in range(8) if offset not in (k, large_l, h)]
        for at_a in combinations(available, 2):
            at_b = [offset for offset in available if offset not in at_a]
            core = {h + u, h + v}
            core.update(u + offset for offset in at_a)
            core.update(v + offset for offset in at_b)
            # For P>=24 and j<=6, a leaf label P+offset-j is positive.
            # It lies below P precisely when j>offset, and is unoccupied by
            # A/B precisely when j-offset is neither U nor V. This deliberately
            # overapproximates simultaneous assignments; missing j is decisive.
            possible_large = {
                j
                for j in range(1, 7)
                if (j > k and j - k not in (u, v)) or (j > large_l and j - large_l not in (u, v))
            }
            missing = sorted(set(range(1, 7)) - core - possible_large)
            _require(missing, "A gap-four partition lacks the claimed missing small difference")
            checks.append(
                {
                    "anchor": [k, large_l, h, u, v],
                    "a_leaf_offsets": list(at_a),
                    "missing_differences": missing,
                }
            )
    _require(len(checks) == 100, "Wrong gap-four partition count")
    return {
        "anchor_count": 10,
        "partition_checks": 100,
        "all_partitions_missing_small_difference": True,
    }


def verify_boundary(boundary):
    """Independently check the exact archived G(1,4) rooted-alpha witness."""
    tree = boundary["input"]
    _require(
        type(tree["n"]) is int
        and tree["n"] == 28
        and type(boundary["root"]) is int
        and boundary["root"] == 1
        and boundary["parameter_l"] == 4
        and boundary["threshold"] == 19,
        "Wrong boundary graph, root, parameter, or alpha threshold",
    )
    edges = []
    for edge in tree["edges"]:
        _require(isinstance(edge, list) and len(edge) == 2, "Malformed boundary edge")
        a, b = edge
        _require(
            type(a) is int and type(b) is int and 0 <= a < 28 and 0 <= b < 28 and a != b,
            "Invalid boundary edge endpoints",
        )
        edges.append(tuple(sorted(edge)))
    expected = {(0, 1), (0, 2), (0, 5), (1, 9), (1, 18)}
    expected.update((2, v) for v in (3, 4))
    expected.update((5, v) for v in (6, 7, 8))
    expected.update((9, v) for v in range(10, 18))
    expected.update((18, v) for v in range(19, 28))
    _require(
        len(edges) == len(set(edges)) == 27 and set(edges) == expected,
        "Boundary input is not the exact numbered G(1,4)",
    )
    adjacency = {v: set() for v in range(28)}
    for a, b in edges:
        adjacency[a].add(b)
        adjacency[b].add(a)
    parts = {1: 0}
    queue = [1]
    for a in queue:
        for b in adjacency[a]:
            if b not in parts:
                parts[b] = 1 - parts[a]
                queue.append(b)
            _require(parts[b] != parts[a], "Boundary input is not bipartite")
    _require(len(parts) == 28, "Boundary graph is disconnected")
    # Connectivity and exactly n-1 distinct edges establish that it is a tree.
    for center, support, count in ((0, 2, 2), (0, 5, 3), (1, 9, 8), (1, 18, 9)):
        leaves = adjacency[support] - {center}
        _require(
            center in adjacency[support]
            and len(leaves) == count
            and all(len(adjacency[leaf]) == 1 for leaf in leaves),
            "Wrong boundary branch leaf counts",
        )
    labels = boundary["labels"]
    _require(
        isinstance(labels, list) and len(labels) == 28 and all(type(x) is int for x in labels),
        "Invalid boundary vertex labels",
    )
    _require(sorted(labels) == list(range(28)), "Boundary vertex labels are not a permutation")
    _require(labels[1] == 0, "Boundary root is not zero")
    differences = [abs(labels[a] - labels[b]) for a, b in edges]
    _require(
        sorted(differences) == list(range(1, 28)), "Boundary differences are not a permutation"
    )
    low = {v for v in parts if parts[v] == 0}
    _require(
        sorted(labels[v] for v in low) == list(range(20))
        and sorted(labels[v] for v in set(range(28)) - low) == list(range(20, 28)),
        "Boundary labeling is not alpha at threshold19",
    )
    return {
        "n": 28,
        "parameter_l": 4,
        "tree_valid": True,
        "graceful": True,
        "root_zero": True,
        "alpha_threshold": 19,
    }


def verify_evidence(evidence):
    _require(evidence["schema_version"] == 1, "Unknown evidence schema")
    _require(
        evidence["gap_four"]["columns"] == ["K", "L", "H", "U", "V"],
        "Wrong gap-four anchor schema",
    )
    return {
        "status": "finite_support_checks_passed",
        "scope": "Only the gap-four finite table and archived l=4 boundary witness are checked.",
        "infinite_theorem_machine_verified": False,
        "lean_verified": False,
        "new_solver_run": False,
        "gap_four": verify_gap_four(evidence["gap_four"]["anchors"]),
        "boundary": verify_boundary(evidence["boundary"]),
    }


def main():
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--evidence", type=Path, default=project / "examples/mixed-core-alpha-tail.json"
    )
    args = parser.parse_args()
    print(json.dumps(verify_evidence(json.loads(args.evidence.read_text())), indent=2))


if __name__ == "__main__":
    main()
