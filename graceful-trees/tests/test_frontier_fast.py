"""Bitset filtering must preserve v1's search tree and witness semantics."""

import networkx as nx
import pytest

from graceful_research.frontier import search as original_search
from graceful_research.frontier_fast import search
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


def comparable(result):
    return {key: value for key, value in result.items() if key not in {"algorithm", "wall_seconds"}}


def compare(data, **options):
    original = original_search(**data, seconds=30, **options)
    optimized = search(**data, seconds=30, **options)
    assert comparable(optimized) == comparable(original)
    assert not optimized["search_complete"]
    assert "status" not in optimized
    if optimized["labels"] is not None:
        assert verify_labeling(**data, labels=optimized["labels"])["valid"]
    return optimized


@pytest.mark.parametrize("n", range(1, 11))
def test_same_traversal_and_verified_witness_on_every_small_tree(n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        data = graph_input(graph)
        for seed in (0, 717, 9182):
            result = compare(data, seed=seed, max_nodes=20000)
            assert result["labels"] is not None


@pytest.mark.parametrize("family", ["binary_heap", "prufer", "recursive", "spider", "lobster"])
@pytest.mark.parametrize("n", [35, 75, 256])
def test_large_seeded_search_has_identical_work_limited_results(family, n):
    for seed in (0, 104729, 130363):
        data = graph_input(generate_family(family, n, seed))
        for nodes in (1, 17, 1000):
            compare(data, seed=seed + 9182, max_nodes=nodes)
        reversed_edges = {**data, "edges": [edge[::-1] for edge in data["edges"][::-1]]}
        forward = search(**data, seed=seed, max_nodes=1000, seconds=30)
        reversed_result = search(**reversed_edges, seed=seed, max_nodes=1000, seconds=30)
        assert comparable(forward) == comparable(reversed_result)


@pytest.mark.parametrize("leaf_tail", [False, True])
@pytest.mark.parametrize("family", ["prufer", "recursive", "spider", "lobster"])
def test_leaf_visits_and_optional_exact_tail_keep_the_same_trace(family, leaf_tail):
    data = graph_input(generate_family(family, 16, 104729))
    original_trace, optimized_trace = [], []
    options = {"seed": 9182, "max_nodes": 1000, "seconds": 30, "leaf_tail": leaf_tail}
    original = original_search(**data, **options, leaf_observer=original_trace.append)
    optimized = search(**data, **options, leaf_observer=optimized_trace.append)
    assert comparable(original) == comparable(optimized)
    assert original_trace == optimized_trace
    if optimized["labels"] is not None:
        assert verify_labeling(**data, labels=optimized["labels"])["valid"]


@pytest.mark.parametrize(
    "options,reason",
    [({"max_nodes": 0}, "node_limit"), ({"seconds": 0}, "time_limit")],
)
def test_empty_allowance_cannot_be_mistaken_for_infeasibility(options, reason):
    result = search(**graph_input(nx.path_graph(20)), seed=1, **options)
    assert result["labels"] is None
    assert result["nodes"] == 0
    assert result["termination"] == reason
    assert not result["search_complete"]
    assert "status" not in result


def test_clock_cutoff_checks_occur_at_the_same_search_visits(monkeypatch):
    data = graph_input(generate_family("prufer", 75, 104729))

    def run(method):
        tick = 0

        def clock():
            nonlocal tick
            tick += 1
            return tick * 0.01

        monkeypatch.setattr("graceful_research.frontier_fast.time.monotonic", clock)
        return method(**data, seed=9182, max_nodes=20000, seconds=0.06)

    original, optimized = run(original_search), run(search)
    assert comparable(original) == comparable(optimized)
    assert optimized["termination"] == "time_limit"
    assert optimized["labels"] is None


@pytest.mark.parametrize("value", [-1, True, 1.5])
def test_invalid_node_limit_is_rejected(value):
    with pytest.raises(ValueError, match="max_nodes"):
        search(2, [[0, 1]], seed=1, max_nodes=value)


@pytest.mark.parametrize("value", [-1, True, float("nan"), float("inf")])
def test_invalid_wall_allowance_is_rejected(value):
    with pytest.raises(ValueError, match="seconds"):
        search(2, [[0, 1]], seed=1, seconds=value)


def test_invalid_tree_and_tail_option_are_rejected_before_search():
    with pytest.raises(ValueError, match="invalid tree"):
        search(4, [[0, 1], [1, 2], [2, 0]], seed=1)
    with pytest.raises(ValueError, match="leaf_tail"):
        search(2, [[0, 1]], seed=1, leaf_tail=1)
    result = search(**graph_input(nx.path_graph(257)), seed=1)
    assert result["termination"] == "size_limit"
    assert result["labels"] is None
    assert not result["search_complete"]
