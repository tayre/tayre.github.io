"""Check explicit seven-edge spider witnesses from classical amalgamation.

Standard library only; no discovery solver is used. Finite verification does not
establish a universal theorem or novelty. The range proof and literature status
are recorded in docs/seven-spider-amalgamation.md.
"""

import argparse
import hashlib
import json
import platform
from pathlib import Path

SEEDS = {
    2: [12, 4, 11, 2, 13, 1, 14, 0, 10, 6, 7, 5, 8, 3, 9],
    4: [9, 5, 11, 2, 13, 1, 14, 0, 10, 3, 8, 6, 7, 4, 12],
}
TEN_EDGE_CONTROL = [9, 2, 7, 1, 10, 0, 8, 4, 5, 3, 6]
ENDPOINT_SEED = [0, 7, 1, 6, 2, 5, 3, 4]
SINGLE_LEG = {
    2: [1, 6, 0, 7, 3, 4, 2, 5],
    4: [2, 5, 3, 4, 0, 7, 1, 6],
}
LEG_COUNTS = [*range(1, 101), 256, 1000, 10000]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_alpha(labels, boundary, center, target):
    n = len(labels) - 1
    require(all(type(x) is int for x in labels), "noninteger seed label")
    require(sorted(labels) == list(range(n + 1)), "incorrect seed vertex labels")
    differences = [abs(a - b) for a, b in zip(labels, labels[1:], strict=False)]
    require(sorted(differences) == list(range(1, n + 1)), "incorrect seed differences")
    require(labels[center] == 0, "incorrect seed zero position")
    require(labels[target : target + 2] == [boundary, boundary + 1], "incorrect seed pair")
    require(
        all(min(a, b) <= boundary < max(a, b) for a, b in zip(labels, labels[1:], strict=False)),
        "seed does not cross alpha boundary",
    )
    return {
        "labels": labels,
        "differences": differences,
        "boundary": boundary,
        "zero_index": center,
        "boundary_pair_index": target,
        "valid": True,
    }


def hub_zero_legs(r):
    """Standard hub-zero symmetric-tree formula, specialized to seven edges."""
    return [
        [
            7 * (r - j),
            7 * j + 1,
            7 * (r - j) - 1,
            7 * j + 2,
            7 * (r - j) - 2,
            7 * j + 3,
            7 * (r - j) - 3,
        ]
        for j in range(r)
    ]


def construct(k, depth, leg=0):
    """Return the exact tree and a labeling with zero at the chosen vertex.

    Depth zero denotes the hub. Each witness also places the maximum at the
    adjacent even/odd partner depth: (0,1), (2,3), (4,5) or (6,7).
    """
    require(type(k) is int and k >= 1, "leg count must be a positive integer")
    require(type(depth) is int and 0 <= depth <= 7, "depth must be in 0..7")
    require(type(leg) is int and 0 <= leg < k, "invalid leg index")
    even = depth - depth % 2
    if even == 0:
        hub, legs = 0, hub_zero_legs(k)
    elif even == 6:
        m, boundary = 7 * (k - 1), 3
        mapped = [boundary - x if x <= boundary else m + 11 - x for x in ENDPOINT_SEED]
        hub = boundary
        legs = [mapped[1:]] + [[x + boundary for x in row] for row in hub_zero_legs(k - 1)]
    elif k == 1:
        hub, legs = SINGLE_LEG[even][0], [SINGLE_LEG[even][1:]]
    else:
        m, boundary = 7 * (k - 2), 6
        mapped = [boundary - x if x <= boundary else m + 21 - x for x in SEEDS[even]]
        hub = boundary
        legs = [mapped[8:], list(reversed(mapped[:7]))]
        legs += [[x + boundary for x in row] for row in hub_zero_legs(k - 2)]
    legs[0], legs[leg] = legs[leg], legs[0]
    labels = [hub] + [x for row in legs for x in row]
    if depth % 2:
        labels = [7 * k - x for x in labels]
    edges = []
    for j in range(k):
        indices = [0, *range(7 * j + 1, 7 * j + 8)]
        edges.extend([a, b] for a, b in zip(indices, indices[1:], strict=False))
    return {"n": len(labels), "edges": edges, "labels": labels}


def verify(data, k, depth, leg):
    """Recheck treehood, exact sets and the prescribed adjacent extreme pair."""
    n, edges, labels = data["n"], data["edges"], data["labels"]
    require(n == 7 * k + 1 and len(labels) == n, "incorrect order")
    require(all(type(x) is int for x in labels), "noninteger vertex label")
    require(sorted(labels) == list(range(n)), "incorrect vertex labels")
    require(len(edges) == n - 1, "incorrect edge count")
    seen_edges, adjacency = set(), [[] for _ in range(n)]
    for edge in edges:
        require(len(edge) == 2 and all(type(v) is int and 0 <= v < n for v in edge), "invalid edge")
        u, v = edge
        pair = tuple(sorted(edge))
        require(u != v and pair not in seen_edges, "loop or duplicate edge")
        seen_edges.add(pair)
        adjacency[u].append(v)
        adjacency[v].append(u)
    expected_edges = {(0 if v % 7 == 1 else v - 1, v) for v in range(1, n)}
    require(seen_edges == expected_edges, "input is not the prescribed seven-edge spider")
    reached, stack = {0}, [0]
    while stack:
        for v in adjacency[stack.pop()]:
            if v not in reached:
                reached.add(v)
                stack.append(v)
    require(len(reached) == n, "not connected")
    require(
        sorted(abs(labels[u] - labels[v]) for u, v in edges) == list(range(1, n)),
        "incorrect edge differences",
    )

    def index(d):
        return 0 if d == 0 else 7 * leg + d

    partner = depth + 1 if depth % 2 == 0 else depth - 1
    require(
        labels[index(depth)] == 0 and labels[index(partner)] == n - 1,
        "incorrect prescribed extreme pair",
    )
    require(index(partner) in adjacency[index(depth)], "extreme vertices are not adjacent")
    return {
        "legs": k,
        "zero_depth": depth,
        "leg_index": leg,
        "vertices": n,
        "valid": True,
        "labels_sha256": hashlib.sha256(json.dumps(labels).encode()).hexdigest(),
    }


def report():
    seeds = {str(d): check_alpha(labels, 6, 7, 7 + d) for d, labels in SEEDS.items()}
    control = check_alpha(TEN_EDGE_CONTROL, 4, 5, 7)
    endpoint = check_alpha(ENDPOINT_SEED, 3, 0, 6)
    checks = []
    for k in LEG_COUNTS:
        for depth in range(8):
            leg = (k // 2 + 3 * depth) % k
            checks.append(verify(construct(k, depth, leg), k, depth, leg))
    corrupted = construct(3, 2)
    corrupted["labels"][0] = corrupted["labels"][1]
    try:
        verify(corrupted, 3, 2, 0)
    except ValueError:
        pass
    else:
        raise ValueError("checker accepted a corrupted witness")
    return {
        "schema_version": 1,
        "review_date": "2026-11-15",
        "python_version": platform.python_version(),
        "checker_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "scope": "finite checks of classical amalgamation, complements and leg permutations",
        "novelty_claim": False,
        "universal_proof_claim_from_tests": False,
        "formally_verified": False,
        "ten_edge_control": control,
        "fourteen_edge_seeds": seeds,
        "endpoint_seed": endpoint,
        "checks": checks,
        "corrupted_witness_rejected": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = report()
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    print(
        json.dumps(
            {
                "checked": len(result["checks"]),
                "largest_vertices": 70001,
                "valid": True,
                "novelty_claim": False,
            }
        )
    )


if __name__ == "__main__":
    main()
