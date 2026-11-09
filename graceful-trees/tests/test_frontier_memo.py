"""Verify pruning against complete permutation oracles, not solver opinions."""

import itertools
import json
from dataclasses import replace

import networkx as nx
import pytest
from test_optimizations import request
from test_system import small_config

from graceful_research.audit import audit_run
from graceful_research.config import Config
from graceful_research.frontier_memo import (
    ALGORITHM,
    _capacity_feasible,
    _centers,
    _rooted_data,
    _state_key,
    search,
)
from graceful_research.runner import run
from graceful_research.solver import solve
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


@pytest.mark.parametrize("n", range(1, 11))
def test_all_small_trees_and_centers(n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        data = graph_input(graph)
        assert _centers([list(graph[v]) for v in range(n)]) == sorted(nx.center(graph))
        result = search(**data, seed=717, seconds=30)
        assert verify_labeling(**data, labels=result["labels"])["valid"]


@pytest.mark.parametrize("n", range(2, 7))
def test_equal_residual_keys_have_equal_completion_status_and_pruning_is_sound(n):
    # Enumerate all assignments and all connected partial assigned regions. Group
    # by the actual production key, across different trees as well as vertex IDs.
    # Exact completion truth is obtained by visiting EVERY remaining permutation.
    types, outcomes = {}, {}
    impossible = 0
    for graph in nx.nonisomorphic_trees(n):
        data = graph_input(graph)
        neighbors = [list(graph[v]) for v in range(n)]
        assignments = [
            (labels, verify_labeling(**data, labels=list(labels))["valid"])
            for labels in itertools.permutations(range(n))
        ]
        for mask in range(1, (1 << n) - 1):
            assigned = {v for v in range(n) if mask >> v & 1}
            if not nx.is_connected(graph.subgraph(assigned)):
                continue
            order = list(range(n))
            parents, children, shape = _rooted_data(neighbors, min(assigned), order, types)
            frontier = sum(1 << v for v in range(n) if v not in assigned and parents[v] in assigned)
            difference = n - len(assigned)
            internal = [e for e in data["edges"] if all(v in assigned for v in e)]
            partials = {}
            for full, valid in assignments:
                if sorted(abs(full[u] - full[v]) for u, v in internal) != list(
                    range(difference + 1, n)
                ):
                    continue
                labels = tuple(full[v] if v in assigned else -1 for v in range(n))
                ordered = valid
                reached = set(assigned)
                if ordered:
                    by_difference = {abs(full[u] - full[v]): (u, v) for u, v in data["edges"]}
                    for remaining in range(difference, 0, -1):
                        u, v = by_difference[remaining]
                        if (u in reached) == (v in reached):
                            ordered = False
                            break
                        reached.update((u, v))
                if labels not in partials:
                    used = sum(1 << labels[v] for v in assigned)
                    key = _state_key(frontier, used, order, parents, labels, shape)
                    fits = [
                        _capacity_feasible(
                            n,
                            difference,
                            frontier,
                            used,
                            order,
                            parents,
                            children,
                            labels,
                            [(1 << i) - 1 for i in range(n + 1)],
                            mode,
                        )
                        for mode in ("local", "hall")
                    ]
                    partials[labels] = [key, valid, ordered, fits]
                else:
                    partials[labels][1] |= valid
                    partials[labels][2] |= ordered
            for key, possible, ordered_possible, fits in partials.values():
                if possible:
                    assert all(fits), "A capacity test rejected an actual graceful completion"
                else:
                    impossible += 1
                outcomes.setdefault(key, set()).add((possible, ordered_possible))
    assert outcomes and all(len(truths) == 1 for truths in outcomes.values())
    if n >= 3:
        assert impossible > 0  # The oracle covers failures, not just easy witnesses.


@pytest.mark.parametrize("family", ["binary_heap", "prufer", "recursive", "spider", "lobster"])
@pytest.mark.parametrize("n", [35, 75, 256])
def test_bounded_replay_ignores_edge_order_and_keeps_all_witnesses_valid(family, n):
    data = graph_input(generate_family(family, n, 104729))
    first = search(**data, seed=9182, max_nodes=1500, seconds=30)
    second = search(
        n, [e[::-1] for e in data["edges"][::-1]], seed=9182, max_nodes=1500, seconds=30
    )
    assert {k: v for k, v in first.items() if k != "wall_seconds"} == {
        k: v for k, v in second.items() if k != "wall_seconds"
    }
    assert first["nodes"] <= 1500 and first["memo_states"] <= 1500
    assert first["search_complete"] is False and "status" not in first
    if first["labels"] is not None:
        assert verify_labeling(**data, labels=first["labels"])["valid"]


def test_cutoffs_are_not_memoized_as_exhaustive_failures():
    result = search(**graph_input(nx.path_graph(8)), seed=1, max_nodes=4, seconds=30)
    assert result["labels"] is None and result["memo_states"] == 0
    assert result["nodes"] <= 4 and not result["search_complete"]
    for limit in ({"max_nodes": 0}, {"seconds": 0}):
        result = search(**graph_input(nx.path_graph(8)), seed=1, **limit)
        assert result["labels"] is None and result["memo_states"] == result["nodes"] == 0


def test_cache_is_bounded_and_is_actually_used(monkeypatch):
    data = graph_input(generate_family("prufer", 75, 20261108))
    result = search(**data, seed=1755282300, seconds=30)
    assert result["memo_hits"] > 0 and result["capacity_prunes"] > 0
    monkeypatch.setattr("graceful_research.frontier_memo.MAX_MEMO_STATES", 3)
    result = search(**data, seed=1755282300, max_nodes=1000, seconds=30)
    assert result["memo_states"] <= result["memo_limit"] == 3


@pytest.mark.parametrize("algorithm", [None, ALGORITHM, "portfolio-frontier-v3"])
def test_legacy_replay_and_exact_fallback_are_preserved(tmp_path, algorithm):
    options = {} if algorithm is None else {"frontier_algorithm": algorithm}
    result = solve(
        request(tmp_path / "candidate", constructive_search=False, frontier_search=True, **options)
    )
    assert result["frontier"]["algorithm"] == (algorithm or "descending-frontier-v1")
    assert result["verification"]["valid"]
    plain = solve(request(tmp_path / "plain", constructive_search=False))
    fallback = solve(
        request(
            tmp_path / "fallback",
            constructive_search=False,
            frontier_search=True,
            frontier_max_nodes=0,
            **options,
        )
    )
    assert plain["model_sha256"] == fallback["model_sha256"]


@pytest.mark.parametrize("backend", ["cp-sat", "sat"])
@pytest.mark.parametrize("algorithm", [ALGORITHM, "portfolio-frontier-v3"])
def test_restricted_probes_skip_the_new_candidate_search(tmp_path, backend, algorithm):
    result = solve(
        request(
            tmp_path,
            backend=backend,
            frontier_search=True,
            frontier_algorithm=algorithm,
            restriction={"kind": "extreme_edge", "edge": [1, 2]},
        )
    )
    assert result["status"] == "solver_infeasible"
    assert result["proof_certificate_verified"] == (backend == "sat")
    assert "frontier" not in result


def test_invalid_memoized_candidate_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "graceful_research.frontier_memo.search", lambda **kwargs: {"labels": [0] * 4}
    )
    result = solve(
        request(
            tmp_path, constructive_search=False, frontier_search=True, frontier_algorithm=ALGORITHM
        )
    )
    assert result["status"] == "invalid_solution" and not result["verification"]["valid"]


@pytest.mark.parametrize("value", [True, [], "unknown-version"])
def test_invalid_algorithm_config(value):
    with pytest.raises(ValueError, match="frontier_algorithm"):
        replace(Config(), frontier_algorithm=value).validate()


def test_algorithm_change_resumes_without_rewriting_history(tmp_path):
    old = small_config(
        max_cases=12, frontier_algorithm="descending-frontier-v1", probe_max_attempts=0
    )
    new = replace(old, frontier_algorithm=ALGORITHM, constructive_search=False)
    assert old.generation_fingerprint() == new.generation_fingerprint()
    before, after = tmp_path / "before", tmp_path / "after"
    run(old, before)
    run(new, after, resume=before / "research.sqlite")
    assert (
        json.loads((after / "progress.json").read_text())["history"][:-1]
        == json.loads((before / "progress.json").read_text())["history"]
    )
    assert audit_run(after)["valid"]
    assert any(
        json.loads(line).get("frontier", {}).get("algorithm") == ALGORITHM
        for line in (after / "attempts.jsonl").read_text().splitlines()
    )
