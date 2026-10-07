#!/usr/bin/env python3
"""Exhaustive finite diagnostics for the candidate switch-Laplacian bound.

Requires NumPy. For each n, enumerate ALL 2**C(n,2) simple labeled graphs,
retain graphs with nonincreasing labeled degrees, and group by that degree
vector. Each possible degree sequence is represented up to relabeling, and
all labeled realizations of its representative vector remain in the group.

Check the proposed D >= H, H^2 >= 2H, H <= L, and gap(L) >= 2. Construct
L directly from distinct valid switch neighbors, independently of the
pair-resampling operators. Spectral computations use floating point and
are diagnostic, not a proof. Assertion failures produce a nonzero exit.
No files are written. The default n <= 6 takes less than a second locally;
n=7 is more expensive for the full operator checks.
"""
import argparse
from collections import defaultdict
from itertools import combinations

import numpy as np

TOLERANCE = 1e-8


def degree_classes(n):
    edges = list(combinations(range(n), 2))
    groups = defaultdict(list)
    enumerated = 1 << len(edges)
    for mask in range(enumerated):
        degrees = [0] * n
        for k, (a, b) in enumerate(edges):
            if mask >> k & 1:
                degrees[a] += 1
                degrees[b] += 1
        if degrees == sorted(degrees, reverse=True):
            groups[tuple(degrees)].append(mask)
    return edges, groups, enumerated


def pair_operators(n, edges, states):
    edge_index = {edge: k for k, edge in enumerate(edges)}
    size = len(states)
    operators = []
    for a, b in edges:
        frozen = sum(1 << k for k, edge in enumerate(edges)
                     if edge == (a, b) or (a not in edge and b not in edge))
        fibers = defaultdict(list)
        for row, mask in enumerate(states):
            counts = tuple(
                ((mask >> edge_index[tuple(sorted((a, c)))]) & 1)
                + ((mask >> edge_index[tuple(sorted((b, c)))]) & 1)
                for c in range(n) if c not in (a, b))
            fibers[mask & frozen, counts].append(row)
        h = np.eye(size)
        for indices in fibers.values():
            h[np.ix_(indices, indices)] -= 1 / len(indices)
        operators.append(h)
    return operators


def direct_switch_laplacian(n, edges, states):
    """Use only the switch definition, counting each distinct neighbor once."""
    edge_index = {edge: k for k, edge in enumerate(edges)}
    state_index = {mask: row for row, mask in enumerate(states)}
    proposals = []
    for a, b, c, d in combinations(range(n), 4):
        matchings = [((a, b), (c, d)), ((a, c), (b, d)),
                     ((a, d), (b, c))]
        matching_masks = [sum(1 << edge_index[edge] for edge in matching)
                          for matching in matchings]
        proposals.extend((removed, added) for removed in matching_masks
                         for added in matching_masks if removed != added)
    laplacian = np.zeros((len(states), len(states)))
    for row, mask in enumerate(states):
        neighbors = set()
        for removed, added in proposals:
            if mask & removed == removed and mask & added == 0:
                neighbors.add(mask ^ removed ^ added)
        laplacian[row, row] = len(neighbors)
        for neighbor in neighbors:
            laplacian[row, state_index[neighbor]] = -1
    assert np.array_equal(laplacian, laplacian.T)
    return laplacian


def assert_psd(matrix, label, degrees):
    assert np.allclose(matrix, matrix.T, atol=TOLERANCE, rtol=0), label
    smallest = np.linalg.eigvalsh(matrix)[0]
    assert smallest >= -TOLERANCE, (label, degrees, smallest)
    return smallest


def check(n):
    edges, groups, enumerated = degree_classes(n)
    counts = dict(n=n, enumerated_labeled_graphs=enumerated,
                  degree_classes=len(groups), nontrivial_classes=0,
                  representative_states=sum(map(len, groups.values())),
                  max_states=max(map(len, groups.values())))
    minimum_h_gap = minimum_l_gap = float('inf')
    minimum_reserve = 0.0
    for degrees, states in groups.items():
        if len(states) == 1:
            continue
        counts['nontrivial_classes'] += 1
        operators = pair_operators(n, edges, states)
        h = sum(operators)
        disjoint = np.zeros_like(h)
        for first in range(len(edges)):
            for second in range(first + 1, len(edges)):
                if set(edges[first]).isdisjoint(edges[second]):
                    product = operators[first] @ operators[second]
                    disjoint += product + product.T
        laplacian = direct_switch_laplacian(n, edges, states)
        minimum_reserve = min(minimum_reserve,
                              assert_psd(disjoint - h, 'D-H', degrees))
        assert_psd(h @ h - 2 * h, 'H^2-2H', degrees)
        assert_psd(laplacian - h, 'L-H', degrees)
        h_gap = np.linalg.eigvalsh(h)[1]
        l_gap = np.linalg.eigvalsh(laplacian)[1]
        assert h_gap >= 2 - TOLERANCE, ('H gap', degrees, h_gap)
        assert l_gap >= 2 - TOLERANCE, ('L gap', degrees, l_gap)
        minimum_h_gap = min(minimum_h_gap, h_gap)
        minimum_l_gap = min(minimum_l_gap, l_gap)
    print('PASS:', counts)
    print(f'  min gap(H)={minimum_h_gap:.12g}, min gap(L)={minimum_l_gap:.12g}, '
          f'min eigenvalue(D-H)={minimum_reserve:.3g}')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-n', type=int, default=6)
    args = parser.parse_args()
    if args.max_n < 4:
        parser.error('--max-n must be at least 4')
    results = [check(n) for n in range(4, args.max_n + 1)]
    print('TOTAL:', {key: sum(result[key] for result in results)
                     for key in ('enumerated_labeled_graphs', 'degree_classes',
                                 'nontrivial_classes', 'representative_states')})


if __name__ == '__main__':
    main()
