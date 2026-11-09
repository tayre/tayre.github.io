"""Versioned portfolios for measured endpoint filtering and sibling orbits.

The exact solver is unchanged. Each stage shares the original wall allowance;
candidate failure is never an infeasibility claim. Legacy replay remains in v3.
"""

import math
import time

from .frontier_fast import search as filtered_search
from .frontier_memo import search as memo_search

STAGE_MAX_NODES = 20000


def search(n, edges, *, seed, max_nodes=40000, seconds=0.1, sibling_orbits=False):
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if type(sibling_orbits) is not bool:
        raise ValueError("sibling_orbits must be boolean")
    second = memo_search
    if sibling_orbits:
        from .frontier_memo_fast import search as second

    started = time.monotonic()
    stages, nodes, labels = [], 0, None
    termination = "stages_exhausted"
    for method in (filtered_search, second):
        allowance = max(0, seconds - (time.monotonic() - started))
        if stages and (allowance <= 0 or nodes >= max_nodes):
            termination = "time_limit" if allowance <= 0 else "node_limit"
            break
        result = method(
            n,
            edges,
            seed=seed,
            max_nodes=min(STAGE_MAX_NODES, max_nodes - nodes),
            seconds=allowance,
        )
        stages.append(result)
        nodes += result["nodes"]
        if result["labels"] is not None:
            labels, termination = result["labels"], "witness"
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
        "algorithm": "orbit-portfolio-v6" if sibling_orbits else "bitset-portfolio-v6",
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
