"""Connected edge search followed by permutation swaps within one wall allowance.

This is an incomplete witness portfolio, never an infeasibility test. Half the
candidate allowance is reserved for swaps when v3 does not find a witness early.
Node counts in v3 and evaluated swap proposals are distinct work units; their
individual caps and outcomes are retained, not treated as comparable operations.
"""

import math
import time

from .frontier_portfolio import search as frontier_search
from .swap_search import search as swap_search

ALGORITHM = "swap-portfolio-v5"
STAGE_MAX_NODES = 40000
FRONTIER_TIME_FRACTION = 0.5


def search(
    n,
    edges,
    *,
    seed,
    max_nodes=80000,
    seconds=0.1,
    objective="missing_sum",
    proposal_policy="uniform",
):
    if type(seed) is not int:
        raise ValueError("seed must be an integer")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if objective not in ("missing_sum", "missing_count"):
        raise ValueError("unsupported swap objective")
    if proposal_policy not in ("uniform", "missing_difference"):
        raise ValueError("unsupported swap proposal_policy")
    started = time.monotonic()
    # Even an empty budget calls the first stage to validate the tree input.
    first = frontier_search(
        n,
        edges,
        seed=seed,
        max_nodes=min(STAGE_MAX_NODES, max_nodes),
        seconds=seconds * FRONTIER_TIME_FRACTION,
    )
    stages = [first]
    nodes = first["nodes"]
    labels = first["labels"]
    remaining = max(0.0, seconds - (time.monotonic() - started))
    if labels is not None:
        termination = "witness"
    elif first["termination"] == "size_limit":
        termination = "size_limit"
    elif remaining <= 0:
        termination = "time_limit"
    elif nodes >= max_nodes:
        termination = "node_limit"
    else:
        second = swap_search(
            n,
            edges,
            seed=seed,
            max_nodes=min(STAGE_MAX_NODES, max_nodes - nodes),
            seconds=remaining,
            objective=objective,
            proposal_policy=proposal_policy,
        )
        stages.append(second)
        nodes += second["nodes"]
        labels = second["labels"]
        termination = "witness" if labels is not None else second["termination"]
    return {
        "algorithm": ALGORITHM,
        "seed": seed,
        "max_nodes": max_nodes,
        "stage_max_nodes": STAGE_MAX_NODES,
        "frontier_time_fraction": FRONTIER_TIME_FRACTION,
        "objective": objective,
        "proposal_policy": proposal_policy,
        "seconds": seconds,
        "nodes": nodes,
        "node_units": "v3 search visits plus evaluated swap proposals; see stages",
        "labels": labels,
        "search_complete": False,
        "termination": termination,
        "stages": stages,
        "wall_seconds": time.monotonic() - started,
    }
