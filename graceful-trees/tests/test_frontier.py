"""A fast candidate builder must never become an incomplete infeasibility test."""

import json
from dataclasses import replace

import networkx as nx
import pytest
from test_optimizations import request
from test_system import small_config

from graceful_research.audit import audit_run
from graceful_research.config import Config
from graceful_research.frontier import search
from graceful_research.runner import run
from graceful_research.solver import solve
from graceful_research.trees import features, generate_family, graph_input
from graceful_research.verify import verify_labeling


@pytest.mark.parametrize("n", range(1, 11))
def test_frontier_witnesses_on_every_small_tree_and_core_classifications(n):
    trees = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in trees:
        data = graph_input(graph)
        result = search(**data, seed=717, seconds=30)
        assert result["labels"] is not None
        assert verify_labeling(**data, labels=result["labels"])["valid"]
        core = graph.copy()
        core.remove_nodes_from([v for v, d in graph.degree if d == 1])
        expected_caterpillar = len(core) <= 1 or max(dict(core.degree).values()) <= 2
        core2 = core.copy()
        core2.remove_nodes_from([v for v, d in core.degree if d <= 1])
        expected_lobster = len(core2) <= 1 or max(dict(core2.degree).values()) <= 2
        actual = features(graph)
        assert actual["is_caterpillar"] == expected_caterpillar
        assert actual["is_lobster"] == expected_lobster


@pytest.mark.parametrize("family", ["binary_heap", "prufer", "recursive", "spider", "lobster"])
@pytest.mark.parametrize("n", [35, 75, 256])
def test_bounded_search_is_reproducible_and_all_returned_witnesses_verify(family, n):
    graph = generate_family(family, n, 104729)
    data = graph_input(graph)
    first = search(**data, seed=9182, max_nodes=1000, seconds=30)
    reordered = {**data, "edges": [e[::-1] for e in data["edges"][::-1]]}
    second = search(**reordered, seed=9182, max_nodes=1000, seconds=30)
    assert {k: v for k, v in first.items() if k != "wall_seconds"} == {
        k: v for k, v in second.items() if k != "wall_seconds"
    }
    assert first["nodes"] <= 1000
    assert not first["search_complete"]
    assert "status" not in first  # Candidate construction cannot classify UNSAT.
    if first["labels"] is not None:
        assert verify_labeling(**data, labels=first["labels"])["valid"]


@pytest.mark.parametrize(
    "limit,reason", [({"max_nodes": 0}, "node_limit"), ({"seconds": 0}, "time_limit")]
)
def test_no_budget_returns_only_an_unresolved_candidate_search(limit, reason):
    result = search(**graph_input(nx.path_graph(20)), seed=1, **limit)
    assert result["labels"] is None and result["nodes"] == 0
    assert result["termination"] == reason and result["search_complete"] is False


def test_bad_or_oversized_inputs_do_not_enter_recursive_search():
    with pytest.raises(ValueError, match="invalid tree"):
        search(4, [[0, 1], [1, 2], [2, 0]], seed=1)
    result = search(**graph_input(nx.path_graph(257)), seed=1)
    assert result["termination"] == "size_limit" and result["labels"] is None
    for value in (-1, float("nan"), float("inf"), True):
        with pytest.raises(ValueError, match="seconds"):
            search(**graph_input(nx.path_graph(2)), seed=1, seconds=value)


def test_frontier_witness_is_verified_and_has_separate_work_statistics(tmp_path):
    result = solve(request(tmp_path, constructive_search=False, frontier_search=True))
    assert result["search_method"] == "frontier-search"
    assert result["status"] == "verified_graceful" and result["verification"]["valid"]
    assert result["labels"][0] < result["labels"][1]
    assert result["frontier"]["nodes"] > 0
    assert not {"branches", "solver_wall_seconds", "model_sha256"} & result.keys()
    assert not result["proof_certificate_verified"]


def test_failed_frontier_attempt_falls_back_to_identical_unrestricted_model(tmp_path):
    original = solve(request(tmp_path / "original", constructive_search=False))
    updated = solve(
        request(
            tmp_path / "updated",
            constructive_search=False,
            frontier_search=True,
            frontier_max_nodes=0,
        )
    )
    assert original["search_method"] == updated["search_method"] == "cp-sat"
    assert original["model_sha256"] == updated["model_sha256"]
    assert updated["status"] == "verified_graceful"
    assert updated["frontier"]["termination"] == "node_limit"
    assert "frontier" not in original  # Old saved requests retain the old route.


@pytest.mark.parametrize("backend", ["cp-sat", "sat"])
def test_restricted_negative_control_never_uses_frontier(tmp_path, backend):
    result = solve(
        request(
            tmp_path,
            backend=backend,
            frontier_search=True,
            restriction={"kind": "extreme_edge", "edge": [1, 2]},
        )
    )
    assert result["status"] == "solver_infeasible"
    assert result["proof_certificate_verified"] == (backend == "sat")
    assert not (tmp_path / "frontier.json").exists()


def test_sat_backend_is_not_replaced_by_frontier(tmp_path):
    result = solve(
        request(tmp_path, backend="sat", constructive_search=False, frontier_search=True)
    )
    assert result["search_method"] == "sat-drup" and result["verification"]["valid"]
    assert not (tmp_path / "frontier.json").exists()


def test_invalid_candidate_is_reported_not_hidden_by_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr("graceful_research.frontier.search", lambda **kwargs: {"labels": [0] * 4})
    result = solve(request(tmp_path, constructive_search=False, frontier_search=True))
    assert result["status"] == "invalid_solution" and not result["verification"]["valid"]
    assert not (tmp_path / "model.pbtxt").exists()


@pytest.mark.parametrize(
    "field,value",
    [
        ("frontier_search", "true"),
        ("frontier_max_nodes", True),
        ("frontier_max_nodes", -1),
        ("frontier_max_nodes", 1000001),
    ],
)
def test_invalid_frontier_config(field, value):
    with pytest.raises(ValueError):
        replace(Config(), **{field: value}).validate()


def test_frontier_can_be_enabled_on_an_existing_checkpoint(tmp_path):
    before_config = small_config(max_cases=5, frontier_search=False, probe_max_attempts=0)
    after_config = replace(before_config, frontier_search=True, constructive_search=False)
    assert before_config.generation_fingerprint() == after_config.generation_fingerprint()
    before, after = tmp_path / "before", tmp_path / "after"
    run(before_config, before)
    run(after_config, after, resume=before / "research.sqlite")
    first = json.loads((before / "progress.json").read_text())
    second = json.loads((after / "progress.json").read_text())
    assert second["history"][:-1] == first["history"]
    assert audit_run(after)["valid"]
    assert any(
        json.loads(line)["search_method"] == "frontier-search"
        for line in (after / "attempts.jsonl").read_text().splitlines()
    )
