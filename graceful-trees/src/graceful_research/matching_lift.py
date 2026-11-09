"""Known perfect-matching contraction and strong-graceful witness lifting.

This is the Broersma--Hoede construction, not a new gracefulness theorem.
The experimental search contracts repeatedly, labels the final contree, and
lifts its witness. Failure of this route never excludes an ordinary graceful
labeling of the original tree. It is not installed in the nightly solver.
"""

import math
import time
from collections import Counter, deque

from .constructive import caterpillar_labeling
from .frontier_portfolio import search as frontier_search
from .verify import verify_labeling, verify_tree

ALGORITHM = "matching-lift-v1"
MAX_INPUT_VERTICES = 4096


def _validate_tree(n, edges):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")


def _ignore_work(kind, amount=1):
    pass


def _matching(n, edges, charge=_ignore_work):
    """Forced leaf matching in linear graph work, also on the residual forest."""
    if n % 2:
        return None
    charge("matching_entries", n + 2 * len(edges))
    neighbors = [[] for _ in range(n)]
    for u, v in edges:
        neighbors[u].append(v)
        neighbors[v].append(u)
    degrees = list(map(len, neighbors))
    live = [True] * n
    mates = [-1] * n
    leaves = deque(v for v in range(n) if degrees[v] == 1)
    while leaves:
        charge("matching_leaf_steps")
        u = leaves.popleft()
        if not live[u] or degrees[u] != 1:
            continue
        v = next(w for w in neighbors[u] if live[w])
        mates[u], mates[v] = v, u
        live[u] = live[v] = False
        for w in neighbors[v]:
            charge("matching_incidence_steps")
            if live[w]:
                degrees[w] -= 1
                if degrees[w] == 1:
                    leaves.append(w)
    if any(mate < 0 for mate in mates):
        return None
    # A tree has at most one perfect matching. Vertex scan fixes pair order and
    # endpoint orientation independently of the input edge presentation.
    return [[v, mate] for v, mate in enumerate(mates) if v < mate]


def perfect_matching(n, edges):
    """Return the unique perfect matching in canonical vertex order, or None.

    A leaf must match its only remaining neighbor in every perfect matching.
    Removing each forced pair therefore preserves existence in both directions.
    Uncovered isolated vertices at the end certify only absence of a perfect
    matching; they say nothing about gracefulness.
    """
    _validate_tree(n, edges)
    return _matching(n, edges)


def _validated_matching(n, edges, matching):
    if not isinstance(matching, (list, tuple)) or len(matching) * 2 != n:
        raise ValueError("matching must cover every vertex once")
    edge_set = {tuple(sorted(edge)) for edge in edges}
    mates = [-1] * n
    for pair in matching:
        if (
            not isinstance(pair, (list, tuple))
            or len(pair) != 2
            or any(type(v) is not int or not 0 <= v < n for v in pair)
        ):
            raise ValueError("invalid matching pair")
        u, v = pair
        if u == v or mates[u] >= 0 or mates[v] >= 0 or tuple(sorted(pair)) not in edge_set:
            raise ValueError("matching pairs must be disjoint tree edges")
        mates[u], mates[v] = v, u
    return [[v, mate] for v, mate in enumerate(mates) if v < mate]


def _contract(n, edges, matching, charge=_ignore_work):
    charge("contraction_entries", n + len(edges))
    mapping = [-1] * n
    for index, (u, v) in enumerate(matching):
        mapping[u] = mapping[v] = index
    core_edges = sorted(
        [min(mapping[u], mapping[v]), max(mapping[u], mapping[v])]
        for u, v in edges
        if mapping[u] != mapping[v]
    )
    core = {"n": len(matching), "edges": core_edges}
    charge("contree_validation_entries", core["n"] + len(core_edges))
    _validate_tree(**core)
    return {"matching": matching, "vertex_to_core": mapping, "core_input": core}


def contract_matching(n, edges, matching=None):
    """Contract a detected or supplied perfect matching, retaining exact maps."""
    _validate_tree(n, edges)
    matching = _matching(n, edges) if matching is None else _validated_matching(n, edges, matching)
    return None if matching is None else _contract(n, edges, matching)


def _lift(n, edges, contraction, core_labels, charge=_ignore_work):
    core = contraction["core_input"]
    charge("core_verification_entries", core["n"] + len(core["edges"]))
    core_check = verify_labeling(**core, labels=core_labels)
    if not core_check["valid"]:
        raise ValueError("contree witness failed independent verification")
    charge("lift_entries", n + 2 * len(edges))
    matching_edges = {tuple(pair) for pair in contraction["matching"]}
    neighbors = [[] for _ in range(n)]
    for u, v in edges:
        flip = int(tuple(sorted((u, v))) in matching_edges)
        neighbors[u].append((v, flip))
        neighbors[v].append((u, flip))
    parity = [-1] * n
    parity[0] = 0
    stack = [0]
    while stack:
        charge("lift_vertex_steps")
        u = stack.pop()
        for v, flip in neighbors[u]:
            if parity[v] < 0:
                parity[v] = parity[u] ^ flip
                stack.append(v)
            elif parity[v] != parity[u] ^ flip:
                raise RuntimeError("tree matching orientation became inconsistent")
    labels = [
        2 * core_labels[contraction["vertex_to_core"][v]]
        if parity[v] == 0
        else n - 1 - 2 * core_labels[contraction["vertex_to_core"][v]]
        for v in range(n)
    ]
    charge("lift_verification_entries", n + len(edges))
    check = verify_labeling(n, edges, labels)
    if not check["valid"]:
        raise RuntimeError("lifted witness failed independent verification")
    if any(labels[u] + labels[v] != n - 1 for u, v in contraction["matching"]):
        raise RuntimeError("lifted witness does not have the required matching sums")
    return labels, parity, check


def lift_labeling(n, edges, core_labels, matching=None):
    """Lift a verified contree witness using the known even/odd construction.

    Match edges receive odd differences; every other edge joins equal parities
    and receives twice its contree difference. Invalid core witnesses are rejected.
    """
    contraction = contract_matching(n, edges, matching)
    if contraction is None:
        raise ValueError("tree has no perfect matching")
    labels, _, _ = _lift(n, edges, contraction, core_labels)
    return labels


class _Cutoff(Exception):
    def __init__(self, reason):
        self.reason = reason


class _Budget:
    def __init__(self, started, seconds, max_work):
        self.deadline = started + seconds
        self.max_work = max_work
        self.work = 0
        self.by_kind = Counter()

    def check_time(self):
        if time.monotonic() >= self.deadline:
            raise _Cutoff("time_limit")

    def charge(self, kind, amount=1, *, check_time=True):
        if self.work + amount > self.max_work:
            raise _Cutoff("work_limit")
        if check_time:
            self.check_time()
        self.work += amount
        self.by_kind[kind] += amount


def search(n, edges, *, seed, seconds=0.1, max_nodes=40000, max_work=100000):
    """Repeated contraction, one bounded core search, and verified reconstruction.

    Work units count declared graph-input entries, peeling/lifting steps and core
    frontier visits. They bound this route's logical work, not CPU instructions.
    Preflight input validation is outside that work count but inside elapsed time.
    The wall deadline includes reconstruction and verification. Individual linear
    phases are bounded by MAX_INPUT_VERTICES; a process supervisor is still needed
    if an operating-system hard deadline is required.
    """
    started = time.monotonic()
    _validate_tree(n, edges)
    if type(seed) is not int:
        raise ValueError("seed must be an integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if any(type(v) is not int or v < 0 for v in (max_nodes, max_work)):
        raise ValueError("node and work limits must be nonnegative integers")
    budget = _Budget(started, seconds, max_work)
    levels = []
    current = {"n": n, "edges": [list(edge) for edge in edges]}
    result = {
        "algorithm": ALGORITHM,
        "seed": seed,
        "seconds": seconds,
        "max_nodes": max_nodes,
        "max_work": max_work,
        "labels": None,
        "verification": None,
        "search_complete": False,
        "tree_infeasibility_claimed": False,
        "has_perfect_matching": False if n == 1 else None,
        "contraction_depth": 0,
        "levels": levels,
        "core_input": current,
        "core_labels": None,
        "core_method": None,
        "core_search": None,
        "reconstruction_work_reserved": 0,
        "nodes": 0,
    }

    def finish(reason):
        result.update(
            termination=reason,
            work_units=budget.work,
            work_by_kind=dict(budget.by_kind),
            wall_seconds=time.monotonic() - started,
        )
        return result

    if n > MAX_INPUT_VERTICES:
        return finish("size_limit")
    if max_work == 0:
        return finish("work_limit")
    try:
        budget.check_time()
        while current["n"] > 1:
            matching = _matching(**current, charge=budget.charge)
            if not levels:
                result["has_perfect_matching"] = matching is not None
            if matching is None:
                if not levels:
                    return finish("no_perfect_matching")
                break
            contraction = _contract(**current, matching=matching, charge=budget.charge)
            levels.append({"input": current, **contraction})
            current = contraction["core_input"]
            result["contraction_depth"] = len(levels)
            result["core_input"] = current
        budget.charge("construction_entries", current["n"] + len(current["edges"]))
        core_labels = caterpillar_labeling(**current)
        if core_labels is None:
            # Reserve the declared logical work needed to verify the core and
            # lift it back through every level before giving the rest to search.
            reserved = 2 * current["n"] - 1 + sum(7 * level["input"]["n"] - 4 for level in levels)
            result["reconstruction_work_reserved"] = reserved
            available = max(0, max_work - budget.work - reserved)
            remaining_nodes = min(max_nodes, available)
            if remaining_nodes == 0:
                return finish("node_limit" if max_nodes == 0 else "work_limit")
            budget.check_time()
            candidate = frontier_search(
                **current,
                seed=seed,
                max_nodes=remaining_nodes,
                seconds=max(0.0, budget.deadline - time.monotonic()),
            )
            result["core_method"] = "portfolio-frontier-v3"
            result["core_search"] = candidate
            result["nodes"] = candidate["nodes"]
            budget.charge("frontier_nodes", candidate["nodes"], check_time=False)
            core_labels = candidate["labels"]
            if core_labels is None:
                reason = candidate["termination"]
                return finish("core_" + reason)
        else:
            result["core_method"] = "caterpillar-construction"
        budget.charge("final_core_verification_entries", current["n"] + len(current["edges"]))
        verification = verify_labeling(**current, labels=core_labels)
        if not verification["valid"]:
            raise RuntimeError("core search returned an invalid witness")
        result["core_labels"] = core_labels
        labels = core_labels
        for level in reversed(levels):
            labels, parity, verification = _lift(
                **level["input"],
                contraction=level,
                core_labels=labels,
                charge=budget.charge,
            )
            level["parity"] = parity
            level["lift_verification"] = verification
            level["labels"] = labels
        budget.check_time()
        result["labels"] = labels
        result["verification"] = verification
        return finish("witness")
    except _Cutoff as cutoff:
        return finish(cutoff.reason)
