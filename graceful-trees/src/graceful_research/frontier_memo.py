"""Bounded witness search with residual-forest memoization and capacity pruning.

Roots and connected prefixes still make this incomplete. Only failed residual
states are memoized; no global infeasibility conclusion is possible. See
`docs/techniques.md` for the state-equivalence argument and ablation protocol.
"""

import math
import random
import struct
import time

from .leaf_frontier import finish_tail
from .verify import verify_tree

ALGORITHM = "memo-frontier-v2"
MAX_MEMO_STATES = 20000
MAX_N = 256


def _centers(neighbors):
    degree = [len(adj) for adj in neighbors]
    tips = [v for v in range(len(neighbors)) if degree[v] <= 1]
    remaining = len(neighbors)
    while remaining > 2:
        remaining -= len(tips)
        following = []
        for v in tips:
            for w in neighbors[v]:
                degree[w] -= 1
                if degree[w] == 1:
                    following.append(w)
        tips = following
    return sorted(tips)


def _rooted_data(neighbors, root, order, types):
    n = len(neighbors)
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
    shape = [0] * n
    for v in reversed(queue):
        signature = tuple(sorted(shape[w] for w in neighbors[v] if w != parents[v]))
        shape[v] = types.setdefault(signature, len(types))
    return parents, children, shape


def _state_key(frontier, used, order, parents, labels, shape):
    state = []
    pending = frontier
    while pending:
        bit = pending & -pending
        pending ^= bit
        v = order[bit.bit_length() - 1]
        # At most four roots times 256 vertices: type IDs fit in 16 bits.
        # Full packed keys are compared, not merely hash digests.
        state.append(65536 * labels[parents[v]] + shape[v])
    return used, struct.pack(f"<{len(state)}I", *sorted(state))


def _capacity_feasible(
    n, difference, frontier, used, order, parents, children, labels, masks, capacity
):
    pool = masks[n] ^ used
    groups = []
    while frontier:
        bit = frontier & -frontier
        v = order[bit.bit_length() - 1]
        p = parents[v]
        siblings = frontier & children[p]
        frontier ^= siblings
        groups.append((labels[p], siblings.bit_count()))
    if capacity == "hall":
        groups.sort()
    for value, count in groups:
        low = max(0, value - difference)
        high = min(n, value + difference + 1)
        domain = pool & (masks[high] ^ masks[low])
        if domain.bit_count() < count:
            return False
        if capacity == "hall":
            for _ in range(count):
                bit = domain & -domain
                domain ^= bit
                pool ^= bit
    return True


def search(
    n,
    edges,
    *,
    seed,
    max_nodes=20000,
    seconds=0.1,
    capacity="local",
    roots_mode="centers",
    memoize=True,
    leaf_tail=False,
    leaf_observer=None,
):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if capacity not in {"off", "local", "hall"} or roots_mode not in {"degree", "centers"}:
        raise ValueError("unsupported candidate-search ablation")
    if type(memoize) is not bool:
        raise ValueError("memoize must be boolean")
    if type(leaf_tail) is not bool:
        raise ValueError("leaf_tail must be boolean")
    started = time.monotonic()
    deadline = started + seconds
    result = {
        "algorithm": "leaf-memo-frontier-v4" if leaf_tail else ALGORITHM,
        "options": {"capacity": capacity, "roots_mode": roots_mode, "memoize": memoize},
        "memo_limit": MAX_MEMO_STATES,
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
    if roots_mode == "centers":
        center = _centers(neighbors)
        roots = center + [v for v in roots if v not in center]
    roots = roots[:4]
    per_root = max(1, max_nodes // len(roots))
    nodes = 0
    seen, types = set(), {}
    memo_hits = 0
    capacity_checks = 0
    capacity_prunes = 0
    masks = [(1 << i) - 1 for i in range(n + 1)]

    class RootLimit(Exception):
        pass

    class SearchLimit(Exception):
        pass

    def visit(difference, frontier, used):
        nonlocal nodes, capacity_checks, capacity_prunes, memo_hits
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
        key = None
        if memoize:
            key = _state_key(frontier, used, order, parents, labels, shape)
            if key in seen:
                memo_hits += 1
                return None
        if capacity != "off":
            capacity_checks += 1
            if not _capacity_feasible(
                n, difference, frontier, used, order, parents, children, labels, masks, capacity
            ):
                capacity_prunes += 1
                return None
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
        # Only exhaustive failure of this residual state is reusable. A root/node/
        # time cutoff unwinds by exception and MUST bypass insertion here.
        if memoize and len(seen) < MAX_MEMO_STATES:
            seen.add(key)
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
            parents, children, shape = _rooted_data(neighbors, root, order, types)
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
    result.update(
        memo_hits=memo_hits,
        memo_states=len(seen),
        nodes=nodes,
        capacity_checks=capacity_checks,
        capacity_prunes=capacity_prunes,
        wall_seconds=time.monotonic() - started,
    )
    return result
