#!/usr/bin/env python3
"""Check a known delta/amalgamation consequence without solver dependencies.

The accompanying note proves the formula for all b >= 1. These finite checks
validate the implementation, not the universal statement or its priority.
"""

import argparse
import hashlib
import json
import platform
import time
from collections import deque
from pathlib import Path


def fork(b):
    """Rooted C(b, 0, b), with its central vertex zero."""
    if type(b) is not int or b < 1:
        raise ValueError("b must be a positive integer")
    edges = [(0, 1), (0, 2)]
    edges += [(1, v) for v in range(3, b + 3)]
    edges += [(2, v) for v in range(b + 3, 2 * b + 3)]
    labels = [0, b + 1, 2 * b + 2]
    labels += list(range(b + 2, 2 * b + 2))
    labels += list(range(1, b + 1))
    return edges, labels


def double(edges, labels):
    """Two rooted copies joined at vertex 0, using the standard delta formula."""
    order = len(labels)
    adjacency = [[] for _ in labels]
    for u, v in edges:
        adjacency[u].append(v)
        adjacency[v].append(u)
    parity = {0: 0}
    queue = deque([0])
    while queue:
        u = queue.popleft()
        for v in adjacency[u]:
            if v not in parity:
                parity[v] = 1 - parity[u]
                queue.append(v)
    new_edges = edges + [(u + order, v + order) for u, v in edges]
    new_edges.append((0, order))
    new_labels = [x + order * parity[v] for v, x in enumerate(labels)]
    new_labels += [x + order * (1 - parity[v]) for v, x in enumerate(labels)]
    return new_edges, new_labels


def pendant_family(b):
    edges, labels = double(*fork(b))
    support = len(labels)
    final_maximum = len(edges) + b + 1
    edges = edges + [(0, support)]
    edges += [(support, support + i + 1) for i in range(b)]
    labels = [x + b for x in labels] + [final_maximum] + list(range(b))
    return edges, labels


def verify(edges, labels, *, pendant_maximum=False):
    """Independently check graph and witness, with no construction assumptions."""
    n = len(labels)
    if any(type(x) is not int for x in labels) or sorted(labels) != list(range(n)):
        raise AssertionError("vertex label permutation failed")
    if len(edges) != n - 1:
        raise AssertionError("edge count failed")
    adjacency = [set() for _ in range(n)]
    differences = []
    for u, v in edges:
        if not (0 <= u < n and 0 <= v < n) or u == v or v in adjacency[u]:
            raise AssertionError("invalid or duplicate edge")
        adjacency[u].add(v)
        adjacency[v].add(u)
        differences.append(abs(labels[u] - labels[v]))
    seen, queue = {0}, deque([0])
    while queue:
        u = queue.popleft()
        for v in adjacency[u] - seen:
            seen.add(v)
            queue.append(v)
    if len(seen) != n:
        raise AssertionError("graph is disconnected")
    # A connected simple graph on n vertices with n-1 edges is a tree.
    if sorted(differences) != list(range(1, n)):
        raise AssertionError("edge difference permutation failed")
    extreme = next((u, v) for u, v in edges if abs(labels[u] - labels[v]) == n - 1)
    if pendant_maximum and not any(len(adjacency[v]) == 1 for v in extreme):
        raise AssertionError("maximum edge is not pendant")
    return {
        "tree": True,
        "vertex_permutation": True,
        "edge_permutation": True,
        "maximum_edge": list(extreme),
        "pendant_maximum": any(len(adjacency[v]) == 1 for v in extreme),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=15.0)
    args = parser.parse_args()
    if not 0 < args.seconds <= 60:
        parser.error("seconds must be positive and at most 60")
    started = time.monotonic()
    parameters = list(range(1, 101)) + [256, 1000]
    checks = 0
    for b in parameters:
        if time.monotonic() - started >= args.seconds:
            raise TimeoutError("verification budget exhausted; no success record written")
        base = fork(b)
        verify(*base)
        doubled = double(*base)
        verify(*doubled)
        if doubled[1][0] != 0:
            raise AssertionError("prescribed root not zero")
        edges, labels = pendant_family(b)
        verify(edges, labels, pendant_maximum=True)
        verify(edges, [len(edges) - x for x in labels], pendant_maximum=True)
        checks += 4
    edges, labels = pendant_family(2)
    output = {
        "schema_version": 1,
        "claim_id": "diameter-five-two-three-uniform-branches-known-consequence-v1",
        "classification": "finite implementation checks of an established-construction consequence",
        "novelty_claimed": False,
        "formal_verification_claimed": False,
        "solver_used": False,
        "random_seed": None,
        "python_version": platform.python_version(),
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "parameters": parameters,
        "witnesses_verified": checks,
        "largest_family_order": 5 * max(parameters) + 7,
        "budget_seconds": args.seconds,
        "elapsed_seconds": time.monotonic() - started,
        "example": {
            "b": 2,
            "n": len(labels),
            "edges": edges,
            "labels": labels,
            "verification": verify(edges, labels, pendant_maximum=True),
        },
        "limits": "Finite checks do not prove the universal statement. See the written proof; no claim of new mathematics or exhaustive all-tree coverage.",
    }
    with args.output.open("x") as stream:
        json.dump(output, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(f"Verified {checks} witnesses; largest family order {output['largest_family_order']}.")


if __name__ == "__main__":
    main()
