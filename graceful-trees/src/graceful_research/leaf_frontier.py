"""Adapt the exact leaf-tail rule to a connected-prefix candidate search.

Only all-leaf tails with at most two assigned parents qualify. Negative answers
discard this fixed partial labeling, never the original tree or exact model.
"""


def finish_tail(
    n,
    difference,
    frontier,
    used,
    order,
    parents,
    labels,
    *,
    enabled,
    observer,
    stats,
    seed,
    root,
    node,
):
    groups = {}
    while frontier:
        bit = frontier & -frontier
        frontier ^= bit
        vertex = order[bit.bit_length() - 1]
        parent_label = labels[parents[vertex]]
        groups.setdefault(parent_label, []).append(vertex)
        if len(groups) > 2:
            return False, None
    unused = [value for value in range(n) if not (used >> value) & 1]
    differences = list(range(1, difference + 1))
    counts = {p: len(vertices) for p, vertices in groups.items()}
    if observer is not None:
        observer(
            {
                "n": n,
                "difference": difference,
                "unused": unused.copy(),
                "differences": differences.copy(),
                "parent_counts": counts.copy(),
                "frontier_vertices": {p: vertices.copy() for p, vertices in groups.items()},
                "labels": labels.copy(),
                "seed": seed,
                "root": root,
                "node": node,
            }
        )
    if not enabled:
        return False, None
    from .leaf_tail import complete_leaf_tail

    stats["calls"] += 1
    stats["leaves"] += difference
    completion = complete_leaf_tail(unused, differences, counts)
    if not completion["feasible"]:
        stats["rejected_partials"] += 1
        return True, None
    answer = labels.copy()
    for value, parent_label in completion["placements"]:
        answer[groups[parent_label].pop()] = value
    if any(groups.values()) or any(value < 0 for value in answer):
        raise RuntimeError("incomplete leaf-tail reconstruction")
    stats["completed"] += 1
    return True, answer
