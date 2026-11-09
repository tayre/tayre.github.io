"""Versioned optimized portfolios retain budgets, replay and verification scope."""

from dataclasses import replace
from types import SimpleNamespace

import networkx as nx
import pytest
from test_optimizations import request

from graceful_research import frontier_accelerated as portfolio
from graceful_research import frontier_memo_fast
from graceful_research.config import Config
from graceful_research.solver import solve
from graceful_research.trees import graph_input
from graceful_research.verify import verify_labeling

ALGORITHMS = ("bitset-portfolio-v6", "orbit-portfolio-v6")


def patch_second(monkeypatch, sibling_orbits, method):
    if sibling_orbits:
        monkeypatch.setattr(frontier_memo_fast, "search", method)
    else:
        monkeypatch.setattr(portfolio, "memo_search", method)


@pytest.mark.parametrize("sibling_orbits", [False, True])
def test_verified_first_witness_stops_before_second_stage(monkeypatch, sibling_orbits):
    def unexpected(*args, **kwargs):
        raise AssertionError("no additional stage after a witness")

    patch_second(monkeypatch, sibling_orbits, unexpected)
    data = graph_input(nx.path_graph(4))
    result = portfolio.search(**data, seed=1, seconds=30, sibling_orbits=sibling_orbits)
    assert verify_labeling(**data, labels=result["labels"])["valid"]
    assert result["termination"] == "witness"
    assert len(result["stages"]) == 1
    assert result["stages"][0]["algorithm"] == "bitset-descending-frontier-v1"
    assert result["algorithm"] == ALGORITHMS[int(sibling_orbits)]
    assert not result["search_complete"]


@pytest.mark.parametrize("sibling_orbits", [False, True])
def test_second_stage_receives_only_remaining_time_and_nodes(monkeypatch, sibling_orbits):
    clock = iter([0, 0.01, 0.06, 0.07])
    monkeypatch.setattr(portfolio, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    calls = []

    def first(*args, **kwargs):
        calls.append(kwargs)
        return {"labels": None, "nodes": 11, "termination": "node_limit"}

    def second(*args, **kwargs):
        calls.append(kwargs)
        return {"labels": [0, 3, 1, 2], "nodes": 16, "termination": "witness"}

    monkeypatch.setattr(portfolio, "filtered_search", first)
    patch_second(monkeypatch, sibling_orbits, second)
    result = portfolio.search(
        **graph_input(nx.path_graph(4)),
        seed=1,
        max_nodes=50,
        seconds=0.1,
        sibling_orbits=sibling_orbits,
    )
    assert calls[0]["seconds"] == pytest.approx(0.09)
    assert calls[1]["seconds"] == pytest.approx(0.04)
    assert calls[0]["max_nodes"] == 50
    assert calls[1]["max_nodes"] == 39
    assert result["nodes"] == 27
    assert not result["search_complete"]


@pytest.mark.parametrize("sibling_orbits", [False, True])
@pytest.mark.parametrize("reason", ["node_limit", "time_limit"])
def test_exhausted_shared_budget_prevents_second_stage(monkeypatch, sibling_orbits, reason):
    clock = iter([0, 0, 0.2 if reason == "time_limit" else 0.01, 0.2])
    monkeypatch.setattr(portfolio, "time", SimpleNamespace(monotonic=lambda: next(clock)))

    def first(*args, **kwargs):
        return {
            "labels": None,
            "nodes": 50 if reason == "node_limit" else 11,
            "termination": reason,
        }

    def unexpected(*args, **kwargs):
        raise AssertionError("shared budget was exhausted")

    monkeypatch.setattr(portfolio, "filtered_search", first)
    patch_second(monkeypatch, sibling_orbits, unexpected)
    result = portfolio.search(
        **graph_input(nx.path_graph(4)),
        seed=1,
        max_nodes=50,
        seconds=0.1,
        sibling_orbits=sibling_orbits,
    )
    assert result["termination"] == reason
    assert len(result["stages"]) == 1
    assert result["labels"] is None
    assert "status" not in result


@pytest.mark.parametrize("sibling_orbits", [False, True])
def test_each_stage_retains_its_individual_work_cap(monkeypatch, sibling_orbits):
    limits = []

    def exhausted(*args, **kwargs):
        limits.append(kwargs["max_nodes"])
        return {"labels": None, "nodes": kwargs["max_nodes"], "termination": "node_limit"}

    monkeypatch.setattr(portfolio, "filtered_search", exhausted)
    patch_second(monkeypatch, sibling_orbits, exhausted)
    result = portfolio.search(
        **graph_input(nx.path_graph(4)),
        seed=1,
        max_nodes=50000,
        seconds=30,
        sibling_orbits=sibling_orbits,
    )
    assert limits == [20000, 20000]
    assert result["nodes"] == 40000
    assert not result["search_complete"]


@pytest.mark.parametrize("sibling_orbits", [False, True])
@pytest.mark.parametrize("limit", [{"seconds": 0}, {"max_nodes": 0}])
def test_empty_budget_is_unresolved_and_still_validates_input(sibling_orbits, limit):
    result = portfolio.search(
        **graph_input(nx.path_graph(4)), seed=1, sibling_orbits=sibling_orbits, **limit
    )
    assert result["labels"] is None and result["nodes"] == 0
    assert len(result["stages"]) == 1 and "status" not in result
    with pytest.raises(ValueError, match="invalid tree"):
        portfolio.search(
            4, [[0, 1], [1, 2], [2, 0]], seed=1, sibling_orbits=sibling_orbits, **limit
        )


@pytest.mark.parametrize(
    "options",
    [
        {"seconds": float("nan")},
        {"seconds": True},
        {"seconds": -1},
        {"max_nodes": -1},
        {"max_nodes": True},
        {"sibling_orbits": 1},
    ],
)
def test_invalid_limits_and_options_are_rejected(options):
    with pytest.raises(ValueError):
        portfolio.search(**graph_input(nx.path_graph(4)), seed=1, **options)


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_config_accepts_versioned_algorithm_without_changing_generation(algorithm):
    original = Config()
    updated = replace(original, frontier_algorithm=algorithm)
    updated.validate()
    assert original.generation_fingerprint() == updated.generation_fingerprint()
    with pytest.raises(ValueError, match="unsupported frontier_algorithm"):
        replace(updated, frontier_algorithm="unversioned-fastest").validate()


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_new_witness_is_independently_verified_in_solver(tmp_path, algorithm):
    result = solve(
        request(
            tmp_path,
            constructive_search=False,
            frontier_search=True,
            frontier_algorithm=algorithm,
        )
    )
    assert result["search_method"] == "frontier-search"
    assert result["frontier"]["algorithm"] == algorithm
    assert result["status"] == "verified_graceful"
    assert result["verification"]["valid"]
    assert result["labels"][0] < result["labels"][1]
    assert not result["proof_certificate_verified"]
    assert not (tmp_path / "model.pbtxt").exists()


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_work_exhaustion_retains_exact_fallback_model(tmp_path, algorithm):
    previous = solve(request(tmp_path / "previous", constructive_search=False))
    updated = solve(
        request(
            tmp_path / "updated",
            constructive_search=False,
            frontier_search=True,
            frontier_max_nodes=0,
            frontier_algorithm=algorithm,
        )
    )
    assert previous["search_method"] == updated["search_method"] == "cp-sat"
    assert previous["model_sha256"] == updated["model_sha256"]
    assert updated["status"] == "verified_graceful"
    assert updated["frontier"]["termination"] == "node_limit"


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("backend", ["cp-sat", "sat"])
def test_restricted_negative_control_skips_new_prepass(tmp_path, monkeypatch, algorithm, backend):
    def unexpected(*args, **kwargs):
        raise AssertionError("restricted and SAT attempts must not enter witness prepasses")

    monkeypatch.setattr(portfolio, "search", unexpected)
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
    assert not (tmp_path / "frontier.json").exists()


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_unrestricted_sat_backend_skips_new_prepass(tmp_path, monkeypatch, algorithm):
    def unexpected(*args, **kwargs):
        raise AssertionError("SAT requests retain their original backend")

    monkeypatch.setattr(portfolio, "search", unexpected)
    result = solve(
        request(
            tmp_path,
            backend="sat",
            constructive_search=False,
            frontier_search=True,
            frontier_algorithm=algorithm,
        )
    )
    assert result["search_method"] == "sat-drup"
    assert result["verification"]["valid"]
    assert not (tmp_path / "frontier.json").exists()


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_malformed_new_witness_is_rejected_without_fallback(tmp_path, monkeypatch, algorithm):
    monkeypatch.setattr(portfolio, "search", lambda *args, **kwargs: {"labels": [0] * 4})
    result = solve(
        request(
            tmp_path,
            constructive_search=False,
            frontier_search=True,
            frontier_algorithm=algorithm,
        )
    )
    assert result["status"] == "invalid_solution"
    assert not result["verification"]["valid"]
    assert not (tmp_path / "model.pbtxt").exists()


@pytest.mark.parametrize("algorithm", [None, "portfolio-frontier-v3"])
def test_legacy_requests_do_not_silently_switch_search_algorithms(tmp_path, monkeypatch, algorithm):
    def unexpected(*args, **kwargs):
        raise AssertionError("legacy replay must not invoke the new portfolio")

    monkeypatch.setattr(portfolio, "search", unexpected)
    options = {} if algorithm is None else {"frontier_algorithm": algorithm}
    result = solve(request(tmp_path, constructive_search=False, frontier_search=True, **options))
    assert result["frontier"]["algorithm"] == (algorithm or "descending-frontier-v1")
    assert result["verification"]["valid"]
