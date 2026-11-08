"""Bounded candidate construction; an unsuccessful search says nothing about UNSAT.

Inspired by Fang's descending-difference search (arXiv:1003.3045, §2.1).
This searches a subset of labelings: a connected assigned region grows from a
chosen zero-labeled vertex. It is NOT a symmetry reduction or a complete solver.
No restrictions from this routine are passed to the exact fallback model.
"""

import math
import random
import time

from .verify import verify_tree

ALGORITHM = "descending-frontier-v1"
MAX_N = 256


def search(n, edges, *, seed, max_nodes=20000, seconds=0.1):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    started = time.monotonic()
    deadline = started + seconds
    result = {
        "algorithm": ALGORITHM,
        "seed": seed,
        "max_nodes": max_nodes,
        "seconds": seconds,
        "nodes": 0,
        "roots_tried": [],
        "labels": None,
        "search_complete": False,
        "termination": "candidates_exhausted",
    }
    if n > MAX_N:
        return {**result, "termination": "size_limit", "wall_seconds": time.monotonic() - started}
    neighbors = [[] for _ in range(n)]
    for u, v in edges:
        neighbors[u].append(v)
        neighbors[v].append(u)
    rng = random.Random(seed)
    roots = list(range(n))
    rng.shuffle(roots)
    roots.sort(key=lambda v: -len(neighbors[v]))
    roots = roots[:4]
    per_root = max(1, max_nodes // len(roots))
    nodes = 0

    class RootLimit(Exception):
        pass

    class SearchLimit(Exception):
        pass

    def visit(difference, frontier, used):
        nonlocal nodes
        if nodes >= max_nodes:
            result["termination"] = "node_limit"
            raise SearchLimit
        if nodes % 64 == 0 and time.monotonic() >= deadline:
            result["termination"] = "time_limit"
            raise SearchLimit
        if nodes >= root_limit:
            raise RootLimit
        nodes += 1
        if difference == 0:
            return labels.copy()
        choices = frontier
        while choices:
            bit = choices & -choices
            choices ^= bit
            vertex = order[bit.bit_length() - 1]
            parent_label = labels[parents[vertex]]
            for value in (parent_label + difference, parent_label - difference):
                if 0 <= value < n and not (used >> value) & 1:
                    labels[vertex] = value
                    answer = visit(
                        difference - 1,
                        (frontier ^ bit) | children[vertex],
                        used | (1 << value),
                    )
                    if answer is not None:
                        return answer
            labels[vertex] = -1
        return None

    try:
        for root in roots:
            if time.monotonic() >= deadline:
                result["termination"] = "time_limit"
                break
            if nodes >= max_nodes:
                result["termination"] = "node_limit"
                break
            result["roots_tried"].append(root)
            root_limit = min(max_nodes, nodes + per_root)
            # Prefer leaves when eligible; shuffle ties with a local logged seed.
            order = list(range(n))
            rng.shuffle(order)
            order.sort(key=lambda v: len(neighbors[v]))
            bits = {v: 1 << i for i, v in enumerate(order)}
            parents, children = [-1] * n, [0] * n
            parents[root] = root
            queue = [root]
            for vertex in queue:
                for child in neighbors[vertex]:
                    if child != parents[vertex]:
                        parents[child] = vertex
                        children[vertex] |= bits[child]
                        queue.append(child)
            labels = [-1] * n
            labels[root] = 0
            try:
                answer = visit(n - 1, children[root], 1)
            except RootLimit:
                result["termination"] = "root_node_limits"
                continue
            if answer is not None:
                result.update(labels=answer, termination="witness")
                break
    except SearchLimit:
        pass
    result.update(nodes=nodes, wall_seconds=time.monotonic() - started)
    return result
