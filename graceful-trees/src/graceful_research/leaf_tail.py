"""Exact completion of leaves attached to at most two already labeled parents.

This decides only the supplied residual problem. An impossible tail does not make
the whole tree nongraceful. Leaves at the same parent must be interchangeable:
there can be no additional per-leaf label or edge restrictions.

For two parents p < q, each unused label chooses at most two remaining
differences. A balanced component of this choice multigraph is a tree with one
stub, or a unicyclic graph. Absolute-distance arithmetic limits the cycles to
reflected pairs and one possible midpoint. After forced choices contribute f
leaves to p, attainable counts are f + 2*j + h (0 <= j <= pairs, 0 <= h <= midpoint).
The implementation reconstructs a witness and checks it directly before returning.
Graph work is linear in the number of unused labels; integer/set operations are
assumed constant-cost. Input order may choose a different valid witness.
"""

from collections import Counter, deque
from collections.abc import Mapping


def _integers(values, name, *, positive=False):
    try:
        values = list(values)
    except TypeError as exc:
        raise ValueError(f"{name} must be an iterable of distinct integers") from exc
    if any(type(v) is not int or v < (1 if positive else 0) for v in values):
        raise ValueError(f"{name} contains an invalid integer")
    if len(values) != len(set(values)):
        raise ValueError(f"{name} must contain distinct values")
    return values


def complete_leaf_tail(unused, differences, parent_counts):
    """Return a checked allocation, or infeasibility of this fixed leaf tail.

    ``parent_counts`` maps already used vertex labels to remaining leaf counts.
    At most two counts may be positive. Zero-count parents are accepted but their
    labels remain unavailable. Malformed or unsupported inputs raise ValueError;
    internal invariant failures raise RuntimeError, never an infeasibility result.
    ``forced`` counts forced placements at the smaller active parent (at the sole
    parent in the one-parent case). ``pairs`` and ``midpoint`` describe free choices.
    """
    unused = _integers(unused, "unused labels")
    differences = _integers(differences, "differences", positive=True)
    if not isinstance(parent_counts, Mapping):
        raise ValueError("parent_counts must be a mapping")
    if any(type(p) is not int or p < 0 for p in parent_counts):
        raise ValueError("parent labels must be nonnegative integers")
    if any(type(c) is not int or c < 0 for c in parent_counts.values()):
        raise ValueError("parent counts must be nonnegative integers")
    if set(unused).intersection(parent_counts):
        raise ValueError("an unused label is already assigned to a parent")
    active = {p: c for p, c in parent_counts.items() if c}
    if len(active) > 2:
        raise ValueError("at most two active parents are supported")
    if len(unused) != len(differences) or sum(active.values()) != len(unused):
        raise ValueError("label, difference, and leaf counts must agree")
    target = set(differences)
    result = {
        "feasible": False,
        "placements": [],
        "reason": "",
        "forced": 0,
        "pairs": 0,
        "midpoint": False,
    }

    def failure(reason):
        return {**result, "reason": reason}

    def success(allocation):
        # Direct arithmetic validation, separate from the graph criterion.
        placements = [[u, allocation[i]] for i, u in enumerate(unused)]
        actual = [abs(u - p) for u, p in placements]
        if (
            len(allocation) != len(unused)
            or Counter(allocation.values()) != Counter(active)
            or len(set(actual)) != len(actual)
            or set(actual) != target
        ):
            raise RuntimeError("leaf-tail reconstruction failed independent arithmetic check")
        return {**result, "feasible": True, "placements": placements, "reason": "completion"}

    if not unused:
        return success({})
    if len(active) == 1:
        p = next(iter(active))
        actual = [abs(u - p) for u in unused]
        if len(set(actual)) != len(actual) or set(actual) != target:
            return failure("single_parent_differences")
        result["forced"] = len(unused)
        return success(dict.fromkeys(range(len(unused)), p))

    p, q = sorted(active)
    objects = []
    adjacency = {d: [] for d in differences}
    for u in unused:
        options = [(abs(u - a), a) for a in (p, q) if abs(u - a) in target]
        if not options:
            return failure("label_without_choice")
        index = len(objects)
        objects.append(options)
        for d, _ in options:
            adjacency[d].append(index)

    allocation, pairs, midpoints = {}, [], []
    visited = set()
    for seed in differences:
        if seed in visited:
            continue
        vertices, edges, queue = {seed}, set(), [seed]
        for d in queue:
            for index in adjacency[d]:
                edges.add(index)
                for e, _ in objects[index]:
                    if e not in vertices:
                        vertices.add(e)
                        queue.append(e)
        visited.update(vertices)
        if len(edges) != len(vertices):
            return failure("component_imbalance")
        stubs = [i for i in edges if len(objects[i]) == 1]
        if stubs:
            if len(stubs) != 1:
                raise RuntimeError("balanced connected component has multiple stubs")
            stub = stubs[0]
            root, parent = objects[stub][0]
            allocation[stub] = parent
            reached, queue = {root}, [root]
            for d in queue:
                for index in adjacency[d]:
                    if index in allocation:
                        continue
                    options = [(e, a) for e, a in objects[index] if e != d]
                    if len(options) != 1 or options[0][0] in reached:
                        raise RuntimeError("a stub component is not a tree")
                    e, parent = options[0]
                    allocation[index] = parent
                    reached.add(e)
                    queue.append(e)
            if reached != vertices:
                raise RuntimeError("tree component traversal missed a difference")
        else:
            degree = {d: len(adjacency[d]) for d in vertices}
            removed = set()
            tips = deque(d for d in vertices if degree[d] == 1)
            while tips:
                d = tips.popleft()
                if degree[d] != 1:
                    continue
                index = next(i for i in adjacency[d] if i not in removed)
                allocation[index] = next(a for e, a in objects[index] if e == d)
                removed.add(index)
                degree[d] -= 1
                for e, _ in objects[index]:
                    if e != d:
                        degree[e] -= 1
                        if degree[e] == 1:
                            tips.append(e)
            cycle = list(edges - removed)
            if len(cycle) == 1:
                index = cycle[0]
                if objects[index][0][0] != objects[index][1][0]:
                    raise RuntimeError("one-object cycle is not a midpoint loop")
                midpoints.append(index)
            elif len(cycle) == 2:
                a, b = cycle
                first = {d: parent for d, parent in objects[a]}
                second = {d: p + q - parent for d, parent in objects[b]}
                if len(first) != 2 or first != second:
                    raise RuntimeError("two-object cycle is not a reflected pair")
                pairs.append(cycle)
            else:
                raise RuntimeError("absolute-distance graph has an unexpected cycle")
    if len(midpoints) > 1:
        raise RuntimeError("two parents have multiple distinct midpoint labels")

    forced = sum(parent == p for parent in allocation.values())
    result.update(forced=forced, pairs=len(pairs), midpoint=bool(midpoints))
    need = active[p] - forced
    h = need % 2
    if need < 0 or h > len(midpoints) or (need - h) // 2 > len(pairs):
        return failure("parent_capacity_parity")
    choose_pairs = (need - h) // 2
    for j, pair in enumerate(pairs):
        for index in pair:
            allocation[index] = p if j < choose_pairs else q
    if midpoints:
        allocation[midpoints[0]] = p if h else q
    return success(allocation)
