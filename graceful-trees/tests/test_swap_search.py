"""Oracle checks for incremental swaps and witness-only search boundaries."""

import random
from collections import Counter
from itertools import combinations, permutations

import networkx as nx
import pytest

from graceful_research.swap_search import MAX_N, _SwapState, _targeted_pair, search
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


def recompute(n, edges, labels):
    counts = Counter(abs(labels[u] - labels[v]) for u, v in edges)
    missing = set(range(1, n)) - counts.keys()
    return [counts[d] for d in range(n)], len(missing), sum(missing)


@pytest.mark.parametrize("n", range(2, 7))
def test_every_incremental_swap_matches_full_recomputation(n):
    # Includes adjacent swaps and two edges to a shared neighbor. In particular,
    # the two differences can exchange values and cancel in the frequency delta.
    for graph in nx.nonisomorphic_trees(n):
        data = graph_input(graph)
        for labels in permutations(range(n)):
            state = _SwapState(n, data["edges"], labels)
            original = recompute(n, data["edges"], labels)
            for u, v in combinations(range(n), 2):
                evaluated = state.evaluate(u, v)
                assert state.labels == list(labels)  # Proposal evaluation is read-only.
                assert (state.frequency, state.missing_count, state.missing_sum) == original
                swapped = list(labels)
                swapped[u], swapped[v] = swapped[v], swapped[u]
                expected = recompute(n, data["edges"], swapped)
                assert evaluated[:2] == expected[1:]
                state.apply(u, v, evaluated)
                assert state.labels == swapped
                assert (state.frequency, state.missing_count, state.missing_sum) == expected
                assert min(state.frequency) >= 0
                assert all(state.positions[label] == vertex for vertex, label in enumerate(swapped))
                assert set(state.missing) == {d for d in range(1, n) if expected[0][d] == 0}
                assert len(state.missing) == state.missing_count
                for d in range(1, n):
                    index = state.missing_positions[d]
                    assert (index == -1) == (expected[0][d] != 0)
                    if index != -1:
                        assert state.missing[index] == d
                state.apply(u, v, state.evaluate(u, v))
                assert (state.frequency, state.missing_count, state.missing_sum) == original


@pytest.mark.parametrize("proposal_policy", ["uniform", "missing_difference"])
@pytest.mark.parametrize("objective", ["missing_count", "missing_sum"])
@pytest.mark.parametrize("n", range(1, 8))
def test_small_tree_successes_pass_independent_verifier(proposal_policy, objective, n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        data = graph_input(graph)
        result = search(
            **data,
            seed=719,
            objective=objective,
            max_nodes=20000,
            seconds=30,
            proposal_policy=proposal_policy,
        )
        assert result["labels"] is not None
        assert verify_labeling(**data, labels=result["labels"])["valid"]
        assert result["best_score"] == 0
        assert result["best_missing_count"] == result["best_missing_sum"] == 0
        assert result["termination"] == "witness"
        assert result["search_complete"] is False
        assert "status" not in result


@pytest.mark.parametrize("proposal_policy", ["uniform", "missing_difference"])
@pytest.mark.parametrize("objective", ["missing_count", "missing_sum"])
@pytest.mark.parametrize("family", ["prufer", "recursive", "spider", "lobster"])
def test_node_bounded_reproducibility_and_edge_order_independence(
    proposal_policy, objective, family
):
    data = graph_input(generate_family(family, 35, 104729))
    other = {**data, "edges": [e[::-1] for e in data["edges"][::-1]]}
    options = dict(
        seed=9182,
        max_nodes=3000,
        seconds=30,
        objective=objective,
        proposal_policy=proposal_policy,
    )
    first, second = search(**data, **options), search(**other, **options)
    assert {k: v for k, v in first.items() if k != "wall_seconds"} == {
        k: v for k, v in second.items() if k != "wall_seconds"
    }
    assert first["nodes"] <= options["max_nodes"]
    assert first["nodes"] == first["uniform_proposals"] + first["targeted_proposals"]
    if first["labels"] is not None:
        assert verify_labeling(**data, labels=first["labels"])["valid"]


def test_escape_restart_and_node_cutoff_are_logged_without_infeasibility():
    data = graph_input(generate_family("prufer", 35, 104729))
    result = search(**data, seed=9182, max_nodes=40000, seconds=30)
    assert result["termination"] == "node_limit" and result["labels"] is None
    assert result["nodes"] == 40000
    assert result["restarts"] > 0
    assert result["initializations"] == result["restarts"] + 1
    assert result["uphill_moves"] > 0 and result["tabu_rejections"] > 0
    assert result["best_score"] < result["initial_score"]
    scores = [entry["missing_sum"] for entry in result["trajectory"]]
    assert all(a > b for a, b in zip(scores, scores[1:], strict=False))
    assert not result["search_complete"] and "status" not in result


@pytest.mark.parametrize("n", [1, 20])
@pytest.mark.parametrize(
    "options,reason", [({"max_nodes": 0}, "node_limit"), ({"seconds": 0}, "time_limit")]
)
def test_zero_budget_returns_no_candidate(n, options, reason):
    result = search(**graph_input(nx.path_graph(n)), seed=1, **options)
    assert result["termination"] == reason
    assert result["nodes"] == result["initializations"] == 0
    assert result["labels"] is None
    assert result["initial_score"] is None and result["trajectory"] == []


def test_time_budget_checked_during_proposals(monkeypatch):
    import graceful_research.swap_search as module

    calls = 0

    def clock():
        nonlocal calls
        calls += 1
        # Permit initialization and one interval of proposals, then expire.
        return 0.0 if calls <= 4 else 2.0

    monkeypatch.setattr(module.time, "monotonic", clock)
    data = graph_input(generate_family("prufer", 75, 104729))
    result = search(**data, seed=9182, max_nodes=40000, seconds=1)
    assert result["termination"] == "time_limit"
    assert result["nodes"] == module.TIME_CHECK_INTERVAL
    assert result["labels"] is None and not result["search_complete"]


@pytest.mark.parametrize(
    "options",
    [
        {"max_nodes": -1},
        {"max_nodes": True},
        {"max_nodes": 1.5},
        {"seconds": -1},
        {"seconds": float("nan")},
        {"seconds": float("inf")},
        {"seconds": True},
        {"objective": "different"},
        {"objective": []},
        {"seed": True},
        {"seed": "1"},
        {"proposal_policy": "wrong"},
        {"proposal_policy": []},
        {"proposal_policy": True},
    ],
)
def test_invalid_options(options):
    with pytest.raises(ValueError):
        search(**graph_input(nx.path_graph(4)), **{"seed": 1, **options})


def test_invalid_tree_and_oversized_input():
    with pytest.raises(ValueError, match="invalid tree"):
        search(4, [[0, 1], [1, 2], [2, 0]], seed=1)
    result = search(**graph_input(nx.path_graph(MAX_N + 1)), seed=1)
    assert result["termination"] == "size_limit"
    assert result["nodes"] == 0 and result["labels"] is None


def test_success_is_independently_verified(monkeypatch):
    monkeypatch.setattr(
        "graceful_research.swap_search.verify_labeling", lambda *args: {"valid": False}
    )
    with pytest.raises(RuntimeError, match="independent verification"):
        search(1, [], seed=1, seconds=30)


@pytest.mark.parametrize("n", range(2, 6))
def test_targeted_proposal_introduces_its_missing_difference(n):
    rng = random.Random(6371)
    for graph in nx.nonisomorphic_trees(n):
        data = graph_input(graph)
        for labels in permutations(range(n)):
            state = _SwapState(n, data["edges"], labels)
            if not state.missing:
                continue
            for _ in range(5):
                u, v, difference, anchor = _targeted_pair(state, rng)
                assert state.frequency[difference] == 0
                assert u != v and anchor not in (u, v)
                assert u in state.neighbors[anchor]
                changed = list(labels)
                changed[u], changed[v] = changed[v], changed[u]
                assert abs(changed[u] - changed[anchor]) == difference
                evaluated = state.evaluate(u, v)
                assert evaluated[:2] == recompute(n, data["edges"], changed)[1:]


def test_targeted_policy_keeps_uniform_escape_and_default_is_original():
    data = graph_input(generate_family("prufer", 35, 104729))
    options = dict(seed=9182, max_nodes=1000, seconds=30)
    default = search(**data, **options)
    uniform = search(**data, **options, proposal_policy="uniform")
    assert {k: v for k, v in default.items() if k != "wall_seconds"} == {
        k: v for k, v in uniform.items() if k != "wall_seconds"
    }
    assert default["targeted_proposals"] == 0
    targeted = search(**data, **options, proposal_policy="missing_difference")
    assert targeted["targeted_proposals"] > 0 and targeted["uniform_proposals"] > 0
    assert targeted["parameters"]["targeted_probability"] == 0.75
    assert targeted["nodes"] == targeted["uniform_proposals"] + targeted["targeted_proposals"]


def test_targeted_proposal_rejects_already_completed_state():
    with pytest.raises(ValueError, match="unfinished"):
        _targeted_pair(_SwapState(2, [[0, 1]], [0, 1]), random.Random(1))
