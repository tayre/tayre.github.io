"""Try the original witness search, then residual memoization in the time left.

Each component gets at most 20,000 visited nodes. The shared wall allowance is
unchanged; no candidate failure is interpreted as unrestricted infeasibility.
"""

import math
import time

from .frontier import search as legacy_search
from .frontier_memo import search as memo_search

ALGORITHM = "portfolio-frontier-v3"
STAGE_MAX_NODES = 20000


def search(n, edges, *, seed, max_nodes=40000, seconds=0.1, leaf_tail=False):
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if type(leaf_tail) is not bool:
        raise ValueError("leaf_tail must be boolean")
    started = time.monotonic()
    stages = []
    nodes = 0
    labels = None
    termination = "stages_exhausted"
    for method in (legacy_search, memo_search):
        allowance = max(0, seconds - (time.monotonic() - started))
        # Run the first method even with a zero budget: it validates the input.
        if stages and (allowance <= 0 or nodes >= max_nodes):
            termination = "time_limit" if allowance <= 0 else "node_limit"
            break
        result = method(
            n,
            edges,
            seed=seed,
            max_nodes=min(STAGE_MAX_NODES, max_nodes - nodes),
            seconds=allowance,
            **({"leaf_tail": True} if leaf_tail else {}),
        )
        stages.append(result)
        nodes += result["nodes"]
        if result["labels"] is not None:
            labels = result["labels"]
            termination = "witness"
            break
        if result["termination"] == "size_limit":
            termination = "size_limit"
            break
    elapsed = time.monotonic() - started
    if labels is None and termination == "stages_exhausted":
        if elapsed >= seconds:
            termination = "time_limit"
        elif nodes >= max_nodes:
            termination = "node_limit"
    return {
        "algorithm": "leaf-portfolio-v4" if leaf_tail else ALGORITHM,
        "seed": seed,
        "max_nodes": max_nodes,
        "stage_max_nodes": STAGE_MAX_NODES,
        "seconds": seconds,
        "nodes": nodes,
        "labels": labels,
        "search_complete": False,
        "termination": termination,
        "stages": stages,
        "wall_seconds": elapsed,
    }
