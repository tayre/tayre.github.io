"""Known-family witness construction; never used to infer infeasibility."""

from .verify import verify_tree


def caterpillar_labeling(n, edges):
    """Alternate low/high labels along the spine, leaves before the next spine node.

    Returns None for other trees. See docs/research.md for the invariant and proof.
    Vertex and neighbor order depend only on the saved input, never on hash order.
    """
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if n <= 2:
        return list(range(n))
    neighbors = [[] for _ in range(n)]
    for u, v in edges:
        neighbors[u].append(v)
        neighbors[v].append(u)
    internal = [len(adjacent) > 1 for adjacent in neighbors]
    core = [v for v in range(n) if internal[v]]
    core_degree = {v: sum(internal[u] for u in neighbors[v]) for v in core}
    if any(degree > 2 for degree in core_degree.values()):
        return None
    # Removing leaves from a tree leaves a connected tree, here a path or singleton.
    current = min(v for v in core if core_degree[v] <= 1)
    labels = [None] * n
    labels[current] = 0
    low, high = 1, n - 1
    previous, take_high = None, True
    while current is not None:
        following = next((v for v in neighbors[current] if internal[v] and v != previous), None)
        targets = [v for v in neighbors[current] if not internal[v]]
        if following is not None:
            targets.append(following)
        for v in targets:
            if take_high:
                labels[v] = high
                high -= 1
            else:
                labels[v] = low
                low += 1
        previous, current = current, following
        take_high = not take_high
    return labels
