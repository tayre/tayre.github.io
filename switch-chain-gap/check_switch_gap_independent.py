#!/usr/bin/env python3
"""Independently test the sharp switch-Laplacian gap on small graphs.

Enumerate every simple graph on n labeled vertices and retain precisely the
graphs whose labeled degrees are in nonincreasing order. This represents
every graphical degree sequence up to relabeling, retaining ALL labeled
realizations of each retained sequence. Construct the unnormalized switch
Laplacian directly from four-edge symmetric differences, without using
Curveball fibers, conditional expectations, H, D, or the candidate proof.

Run with Python 3 and NumPy/SciPy installed:
    python check_switch_gap_independent.py --max-n 7
Or with uv supplying the dependencies:
    uv run --with numpy --with scipy python check_switch_gap_independent.py

Default n=4,...,7 covers 486 degree classes, of which 366 have more than
one realization. Enumeration costs 2**binom(n,2); larger n is expensive.
Eigenvalue checks use floating-point arithmetic and are diagnostics, not
a proof or formal verification. No fresh Lean verification is performed.
"""

import argparse
from collections import defaultdict
from itertools import combinations
import json

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import eigsh


def realization_classes(n):
    """Use Gray order to update degrees after changing one graph edge."""
    edges = list(combinations(range(n), 2))
    groups = defaultdict(list)
    degrees = [0] * n
    previous = 0
    for step in range(1 << len(edges)):
        graph = step ^ (step >> 1)
        if step:
            changed = (graph ^ previous).bit_length() - 1
            a, b = edges[changed]
            increment = 1 if graph >> changed & 1 else -1
            degrees[a] += increment
            degrees[b] += increment
        if all(degrees[i] >= degrees[i + 1] for i in range(n - 1)):
            groups[tuple(degrees)].append(graph)
        previous = graph
    return edges, groups


def switch_patterns(n, edges):
    """Each pair of perfect matchings of a four-set specifies one move."""
    edge_index = {edge: i for i, edge in enumerate(edges)}
    patterns = []
    for a, b, c, d in combinations(range(n), 4):
        matchings = [
            ((a, b), (c, d)),
            ((a, c), (b, d)),
            ((a, d), (b, c)),
        ]
        masks = [sum(1 << edge_index[e] for e in matching)
                 for matching in matchings]
        patterns.extend((x, y, x ^ y) for x, y in combinations(masks, 2))
    return patterns


def laplacian(states, patterns):
    index = {graph: i for i, graph in enumerate(states)}
    rows, columns, values = [], [], []
    for i, graph in enumerate(states):
        neighbors = set()
        for first, second, toggle in patterns:
            if (graph & toggle) in (first, second):
                neighbor = graph ^ toggle
                assert neighbor in index, "A proposed switch changed degrees"
                neighbors.add(index[neighbor])
        for j in neighbors:
            rows.append(i)
            columns.append(j)
            values.append(-1.0)
        rows.append(i)
        columns.append(i)
        values.append(float(len(neighbors)))
    matrix = coo_matrix((values, (rows, columns)),
                        shape=(len(states), len(states))).tocsr()
    assert (matrix - matrix.T).nnz == 0
    assert np.max(np.abs(np.asarray(matrix.sum(axis=1)))) == 0
    return matrix


def audit(n, tolerance):
    edges, groups = realization_classes(n)
    patterns = switch_patterns(n, edges)
    minimum_gap = float("inf")
    minimizers = []
    nontrivial = 0
    maximum_states = 0
    for degrees, states in groups.items():
        size = len(states)
        if size < 2:
            continue
        nontrivial += 1
        maximum_states = max(maximum_states, size)
        matrix = laplacian(states, patterns)
        if size <= 5:
            eigenvalues = np.linalg.eigvalsh(matrix.toarray())[:2]
        else:
            eigenvalues = np.sort(eigsh(
                matrix, k=2, which="SM", return_eigenvectors=False,
                v0=np.random.default_rng(0).standard_normal(size),
                tol=tolerance / 100))
        assert abs(eigenvalues[0]) < tolerance, (degrees, eigenvalues)
        gap = float(eigenvalues[1])
        assert gap >= 2 - tolerance, (degrees, size, gap)
        if gap < minimum_gap - tolerance:
            minimum_gap = gap
            minimizers = [{"degrees": degrees, "states": size}]
        elif abs(gap - minimum_gap) < tolerance:
            minimizers.append({"degrees": degrees, "states": size})
    return {
        "n": n,
        "canonical_degree_sequences": len(groups),
        "nontrivial_degree_sequences": nontrivial,
        "maximum_states": maximum_states,
        "minimum_gap": minimum_gap,
        "minimizers": minimizers,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-n", type=int, default=4)
    parser.add_argument("--max-n", type=int, default=7)
    parser.add_argument("--tolerance", type=float, default=1e-7)
    args = parser.parse_args()
    if args.min_n < 4 or args.max_n < args.min_n:
        parser.error("require 4 <= min-n <= max-n")
    if args.tolerance <= 0:
        parser.error("tolerance must be positive")
    reports = []
    for n in range(args.min_n, args.max_n + 1):
        report = audit(n, args.tolerance)
        reports.append(report)
        print(json.dumps(report), flush=True)
    print(json.dumps({
        "status": "all numerical checks passed",
        "total_degree_sequences": sum(
            x["canonical_degree_sequences"] for x in reports),
        "total_nontrivial_degree_sequences": sum(
            x["nontrivial_degree_sequences"] for x in reports),
    }))


if __name__ == "__main__":
    main()
