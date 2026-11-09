"""The v1 connected-prefix search with exact bitset filtering of candidate parents.

For the next difference d, a boundary parent p is eligible exactly when an unused
label equals p+d or p-d. Shifted unused-label masks identify those parents before
we inspect their boundary children. The surviving vertices retain v1's order, as
do labels, roots and all recursive visits. This changes evaluation cost, not the
search tree. Wall cutoffs can still change outcomes because evaluation is faster.

As in v1, this is incomplete witness search, not an infeasibility test. No
restriction from this routine is passed to an exact fallback model.
"""

import math
import random
import time

from .leaf_frontier import finish_tail
from .verify import verify_tree

ALGORITHM = "bitset-descending-frontier-v1"
MAX_N = 256


def search(n, edges, *, seed, max_nodes=20000, seconds=0.1, leaf_tail=False, leaf_observer=None):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if type(leaf_tail) is not bool:
        raise ValueError("leaf_tail must be boolean")
    started = time.monotonic()
    deadline = started + seconds
    result = {
        "algorithm": "bitset-leaf-frontier-v1" if leaf_tail else ALGORITHM,
        "seed": seed,
        "max_nodes": max_nodes,
        "seconds": seconds,
        "nodes": 0,
        "roots_tried": [],
        "labels": None,
        "search_complete": False,
        "termination": "candidates_exhausted",
    }
    leaf_stats = {"calls": 0, "leaves": 0, "completed": 0, "rejected_partials": 0}
    if leaf_tail:
        result["leaf_tail"] = leaf_stats
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
    all_labels = (1 << n) - 1

    class RootLimit(Exception):
        pass

    class SearchLimit(Exception):
        pass

    def visit(difference, frontier, used, active_parents):
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
        # Every remaining vertex is on the boundary iff all remaining vertices
        # are leaves. Labels count the unassigned vertices exactly.
        if (leaf_tail or leaf_observer is not None) and frontier.bit_count() == difference:
            applied, answer = finish_tail(
                n,
                difference,
                frontier,
                used,
                order,
                parents,
                labels,
                enabled=leaf_tail,
                observer=leaf_observer,
                stats=leaf_stats,
                seed=seed,
                root=root,
                node=nodes,
            )
            if applied:
                return answer
        # labels are injective, so inverse[p] identifies the sole assigned parent
        # with label p. active_parents records exactly those having frontier
        # children. An unused value q is p±difference iff p occurs in one of the
        # two shifted masks; intersecting active_parents removes out-of-range bits.
        unused = all_labels ^ used
        eligible = ((unused << difference) | (unused >> difference)) & active_parents
        choices = 0
        while eligible:
            parent_bit = eligible & -eligible
            eligible ^= parent_bit
            choices |= children[inverse[parent_bit.bit_length() - 1]]
        choices &= frontier
        while choices:
            bit = choices & -choices
            choices ^= bit
            vertex = order[bit.bit_length() - 1]
            parent = parents[vertex]
            parent_label = labels[parent]
            next_frontier = frontier ^ bit
            next_active = active_parents
            if not next_frontier & children[parent]:
                next_active ^= 1 << parent_label
            exposed = children[vertex]
            next_frontier |= exposed
            for value in (parent_label + difference, parent_label - difference):
                if 0 <= value < n and not (used >> value) & 1:
                    labels[vertex] = value
                    inverse[value] = vertex
                    answer = visit(
                        difference - 1,
                        next_frontier,
                        used | (1 << value),
                        next_active | ((1 << value) if exposed else 0),
                    )
                    if answer is not None:
                        return answer
                    inverse[value] = -1
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
            inverse = [-1] * n
            inverse[0] = root
            try:
                answer = visit(n - 1, children[root], 1, int(bool(children[root])))
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
