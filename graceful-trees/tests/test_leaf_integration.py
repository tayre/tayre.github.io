"""The terminal rule must preserve witness verification and exact fallback scope."""

import json
from dataclasses import replace

import networkx as nx
import pytest
from test_optimizations import request
from test_system import small_config

from graceful_research import frontier, frontier_memo, frontier_portfolio
from graceful_research.audit import audit_run
from graceful_research.runner import run
from graceful_research.solver import solve
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


@pytest.mark.parametrize(
    "method", [frontier.search, frontier_memo.search, frontier_portfolio.search]
)
def test_all_small_tree_witnesses(method):
    for n in range(1, 11):
        graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
        for graph in graphs:
            data = graph_input(graph)
            result = method(**data, seed=717, seconds=30, leaf_tail=True)
            assert verify_labeling(**data, labels=result["labels"])["valid"]
            assert not result["search_complete"]
            assert "status" not in result


@pytest.mark.parametrize("n", [35, 75, 256])
@pytest.mark.parametrize("family", ["prufer", "recursive", "spider", "lobster"])
def test_larger_bounded_candidates_are_valid_and_replayable(n, family):
    data = graph_input(generate_family(family, n, 104729))
    outputs = [
        frontier_memo.search(**data, seed=9182, seconds=30, max_nodes=1500, leaf_tail=True)
        for _ in range(2)
    ]
    assert {k: v for k, v in outputs[0].items() if k != "wall_seconds"} == {
        k: v for k, v in outputs[1].items() if k != "wall_seconds"
    }
    result = outputs[0]
    assert result["nodes"] <= 1500
    if result["labels"] is not None:
        assert verify_labeling(**data, labels=result["labels"])["valid"]


def test_observer_does_not_change_legacy_search():
    data = graph_input(nx.path_graph(9))
    states = []
    plain = frontier_memo.search(**data, seed=1, seconds=30)
    observed = frontier_memo.search(**data, seed=1, seconds=30, leaf_observer=states.append)
    assert {k: v for k, v in plain.items() if k != "wall_seconds"} == {
        k: v for k, v in observed.items() if k != "wall_seconds"
    }
    assert states
    for state in states:
        remaining = {v for group in state["frontier_vertices"].values() for v in group}
        assert len(remaining) == state["difference"]
        assert all(len(list(nx.path_graph(9).neighbors(v))) == 1 for v in remaining)
        assert set(state["unused"]) == set(range(9)) - {
            label for v, label in enumerate(state["labels"]) if v not in remaining
        }


def test_new_route_rejects_invalid_reconstructed_witness(tmp_path, monkeypatch):
    monkeypatch.setattr(frontier_portfolio, "search", lambda **kwargs: {"labels": [0] * 4})
    result = solve(
        request(
            tmp_path,
            constructive_search=False,
            frontier_search=True,
            frontier_algorithm="leaf-portfolio-v4",
        )
    )
    assert result["status"] == "invalid_solution"


def test_failed_tail_keeps_the_original_exact_model(tmp_path, monkeypatch):
    from graceful_research import leaf_tail

    monkeypatch.setattr(leaf_tail, "complete_leaf_tail", lambda *args: {"feasible": False})
    options = {"constructive_search": False}
    plain = solve(request(tmp_path / "plain", **options))
    result = solve(
        request(
            tmp_path / "tail",
            **options,
            frontier_search=True,
            frontier_algorithm="leaf-portfolio-v4",
        )
    )
    assert result["model_sha256"] == plain["model_sha256"]
    assert result["verification"]["valid"]
    assert result["frontier"]["algorithm"] == "leaf-portfolio-v4"


@pytest.mark.parametrize("backend", ["cp-sat", "sat"])
def test_restricted_probes_skip_tail(tmp_path, backend):
    result = solve(
        request(
            tmp_path,
            backend=backend,
            frontier_search=True,
            frontier_algorithm="leaf-portfolio-v4",
            restriction={"kind": "extreme_edge", "edge": [1, 2]},
        )
    )
    assert result["status"] == "solver_infeasible"
    assert result["proof_certificate_verified"] == (backend == "sat")
    assert "frontier" not in result


@pytest.mark.parametrize(
    "method", [frontier.search, frontier_memo.search, frontier_portfolio.search]
)
def test_empty_budget_never_calls_tail(method, monkeypatch):
    from graceful_research import leaf_tail

    def unexpected(*args):
        raise AssertionError("empty budget invoked completion")

    monkeypatch.setattr(leaf_tail, "complete_leaf_tail", unexpected)
    result = method(**graph_input(nx.path_graph(4)), seed=1, seconds=0, leaf_tail=True)
    assert result["labels"] is None and result["nodes"] == 0


def test_checkpoint_resume_preserves_prior_history(tmp_path):
    old = small_config(max_cases=12, probe_max_attempts=0)
    new = replace(old, frontier_algorithm="leaf-portfolio-v4", constructive_search=False)
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
        json.loads(line).get("frontier", {}).get("algorithm") == "leaf-portfolio-v4"
        for line in (after / "attempts.jsonl").read_text().splitlines()
    )
