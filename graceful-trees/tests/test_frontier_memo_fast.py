"""Check orbit pruning against exhaustive, adjacency-based partial-state oracles."""

from functools import lru_cache

import networkx as nx
import pytest

from graceful_research.frontier_memo import search as original_search
from graceful_research.frontier_memo_fast import (
    ALGORITHM,
    _rooted_data,
    _sibling_orbits,
    search,
)
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


def _connected_prefix_oracle(neighbors, root):
    """Enumerate every continuation without rooted types, masks or memo pruning."""
    n = len(neighbors)
    truths = {}

    @lru_cache(None)
    def complete(labels):
        assigned = {v for v, value in enumerate(labels) if value >= 0}
        used = {labels[v] for v in assigned}
        difference = n - len(assigned)
        if difference == 0:
            edges = [(u, v) for u in range(n) for v in neighbors[u] if u < v]
            answer = sorted(labels) == list(range(n)) and sorted(
                abs(labels[u] - labels[v]) for u, v in edges
            ) == list(range(1, n))
        else:
            answer = False
            for vertex in range(n):
                if vertex in assigned:
                    continue
                boundary = [v for v in neighbors[vertex] if v in assigned]
                if len(boundary) != 1:
                    continue
                parent = boundary[0]
                for value in range(n):
                    if value in used or abs(value - labels[parent]) != difference:
                        continue
                    following = list(labels)
                    following[vertex] = value
                    # Do not short circuit: failures and every partial are needed.
                    possible = complete(tuple(following))
                    answer = answer or possible
        truths[labels] = answer
        return answer

    initial = [-1] * n
    initial[root] = 0
    complete(tuple(initial))
    return truths


@pytest.mark.parametrize("n", range(2, 7))
def test_sibling_representatives_preserve_every_small_partial_completion(n):
    failed_partials = 0
    duplicate_choices = 0
    for graph in nx.nonisomorphic_trees(n):
        neighbors = [list(graph[v]) for v in range(n)]
        for root in range(n):
            # The production bit order need not agree with vertex identifiers.
            order = list(reversed(range(n)))
            parents, _, shape = _rooted_data(neighbors, root, order, {})
            orbits = _sibling_orbits(order, parents, shape)
            truths = _connected_prefix_oracle(neighbors, root)
            for labels, possible in truths.items():
                used = {value for value in labels if value >= 0}
                difference = n - len(used)
                if difference == 0:
                    continue
                failed_partials += not possible
                choices = sum(
                    1 << i
                    for i, vertex in enumerate(order)
                    if labels[vertex] < 0 and labels[parents[vertex]] >= 0
                )
                representative_truths = []
                while choices:
                    bit = choices & -choices
                    vertex = order[bit.bit_length() - 1]
                    equivalent = choices & orbits[vertex]
                    choices ^= equivalent
                    duplicate_choices += equivalent.bit_count() - 1
                    for value in range(n):
                        if value in used or abs(value - labels[parents[vertex]]) != difference:
                            continue
                        sibling_truths = []
                        pending = equivalent
                        while pending:
                            sibling_bit = pending & -pending
                            pending ^= sibling_bit
                            sibling = order[sibling_bit.bit_length() - 1]
                            following = list(labels)
                            following[sibling] = value
                            sibling_truths.append(truths[tuple(following)])
                        assert len(set(sibling_truths)) == 1
                        representative_truths.append(sibling_truths[0])
                assert any(representative_truths) == possible
    if n >= 4:
        assert failed_partials > 0
        assert duplicate_choices > 0


@pytest.mark.parametrize("n", range(1, 11))
def test_all_small_trees_produce_independently_verified_witnesses(n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        data = graph_input(graph)
        result = search(**data, seed=717, seconds=30)
        assert result["algorithm"] == ALGORITHM
        assert verify_labeling(**data, labels=result["labels"])["valid"]
        assert result["search_complete"] is False


@pytest.mark.parametrize("capacity", ["off", "local", "hall"])
@pytest.mark.parametrize("memoize", [False, True])
def test_orbit_reduction_matches_unbounded_old_search(capacity, memoize):
    for n in range(2, 8):
        for graph in nx.nonisomorphic_trees(n):
            data = graph_input(graph)
            options = dict(
                seed=9182,
                max_nodes=1000000,
                seconds=30,
                capacity=capacity,
                memoize=memoize,
            )
            before = original_search(**data, **options)
            after = search(**data, **options)
            assert before["termination"] not in {"time_limit", "node_limit", "root_node_limits"}
            assert after["termination"] == before["termination"]
            assert (before["labels"] is None) == (after["labels"] is None)
            if after["labels"] is not None:
                assert verify_labeling(**data, labels=after["labels"])["valid"]


@pytest.mark.parametrize("family", ["binary_heap", "prufer", "recursive", "spider", "lobster"])
@pytest.mark.parametrize("n", [35, 75, 256])
def test_bounded_replay_is_independent_of_edge_presentation(family, n):
    data = graph_input(generate_family(family, n, 104729))
    first = search(**data, seed=9182, max_nodes=1500, seconds=30)
    second = search(
        n, [edge[::-1] for edge in data["edges"][::-1]], seed=9182, max_nodes=1500, seconds=30
    )
    assert {k: v for k, v in first.items() if k != "wall_seconds"} == {
        k: v for k, v in second.items() if k != "wall_seconds"
    }
    assert first["nodes"] <= 1500 and first["memo_states"] <= 1500
    assert first["search_complete"] is False
    if first["labels"] is not None:
        assert verify_labeling(**data, labels=first["labels"])["valid"]


def test_orbits_are_exercised_and_cutoffs_do_not_cache_unfinished_states(monkeypatch):
    result = search(**graph_input(nx.star_graph(7)), seed=1, seconds=30)
    assert result["orbit_skips"] > 0
    assert verify_labeling(**graph_input(nx.star_graph(7)), labels=result["labels"])["valid"]
    for limits in ({"max_nodes": 0}, {"seconds": 0}):
        result = search(**graph_input(nx.path_graph(8)), seed=1, **limits)
        assert result["labels"] is None
        assert result["nodes"] == result["memo_states"] == result["orbit_skips"] == 0
    result = search(**graph_input(nx.path_graph(8)), seed=1, max_nodes=4, seconds=30)
    assert result["labels"] is None and result["memo_states"] == 0
    assert result["nodes"] <= 4
    monkeypatch.setattr("graceful_research.frontier_memo_fast.MAX_MEMO_STATES", 3)
    data = graph_input(generate_family("prufer", 75, 20261108))
    result = search(**data, seed=1755282300, max_nodes=1000, seconds=30)
    assert result["memo_states"] <= result["memo_limit"] == 3


def test_size_limit_stays_bounded_and_reports_orbit_counter():
    result = search(**graph_input(nx.path_graph(257)), seed=1, seconds=30)
    assert result["termination"] == "size_limit"
    assert result["nodes"] == result["orbit_skips"] == 0
    assert result["labels"] is None and result["search_complete"] is False
