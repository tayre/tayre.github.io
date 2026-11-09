"""Swap candidates must share budgets and preserve unrestricted fallback scope."""

import json
from dataclasses import replace
from types import SimpleNamespace

import pytest
from test_optimizations import request
from test_system import small_config

from graceful_research import swap_portfolio, swap_search
from graceful_research.audit import audit_run
from graceful_research.config import Config
from graceful_research.runner import run
from graceful_research.solver import solve

ALGORITHMS = ("label-swap-v1", "swap-portfolio-v5")


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("objective", ("missing_count", "missing_sum"))
@pytest.mark.parametrize("policy", ("uniform", "missing_difference"))
def test_empty_candidate_budget_preserves_exact_model(tmp_path, algorithm, objective, policy):
    baseline = solve(request(tmp_path / "baseline", constructive_search=False))
    result = solve(
        request(
            tmp_path / "candidate",
            constructive_search=False,
            frontier_search=True,
            frontier_algorithm=algorithm,
            frontier_max_nodes=0,
            swap_objective=objective,
            swap_proposal_policy=policy,
        )
    )
    assert result["model_sha256"] == baseline["model_sha256"]
    assert result["verification"]["valid"]
    assert result["frontier"]["labels"] is None
    assert not result["frontier"]["search_complete"]


@pytest.mark.parametrize(
    "module,algorithm", [(swap_search, ALGORITHMS[0]), (swap_portfolio, ALGORITHMS[1])]
)
def test_candidate_does_not_bypass_independent_verifier(tmp_path, monkeypatch, module, algorithm):
    monkeypatch.setattr(module, "search", lambda **kwargs: {"labels": [0] * 4})
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


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("backend", ("cp-sat", "sat"))
def test_scoped_negative_experiment_skips_swap_candidates(
    tmp_path, monkeypatch, algorithm, backend
):
    def unexpected(**kwargs):
        raise AssertionError("restricted experiment ran a candidate")

    monkeypatch.setattr(swap_search, "search", unexpected)
    monkeypatch.setattr(swap_portfolio, "search", unexpected)
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


def test_portfolio_reserves_time_and_logs_distinct_work_units(monkeypatch):
    now = [0.0]
    calls = []
    monkeypatch.setattr(swap_portfolio, "time", SimpleNamespace(monotonic=lambda: now[0]))

    def first(n, edges, **kwargs):
        calls.append(kwargs)
        now[0] += 0.04
        return {"nodes": 40000, "labels": None, "termination": "node_limit"}

    def second(n, edges, **kwargs):
        calls.append(kwargs)
        now[0] += 0.06
        return {"nodes": 40000, "labels": None, "termination": "node_limit"}

    monkeypatch.setattr(swap_portfolio, "frontier_search", first)
    monkeypatch.setattr(swap_portfolio, "swap_search", second)
    result = swap_portfolio.search(4, [[0, 1], [1, 2], [2, 3]], seed=7)
    assert calls[0]["seconds"] == 0.05
    assert calls[1]["seconds"] == pytest.approx(0.06)
    assert [call["max_nodes"] for call in calls] == [40000, 40000]
    assert result["nodes"] == 80000
    assert result["wall_seconds"] == 0.1
    assert not result["search_complete"]


@pytest.mark.parametrize("first_labels,elapsed", [([0, 3, 1, 2], 0.01), (None, 0.1)])
def test_success_or_exhausted_wall_budget_skips_second_stage(monkeypatch, first_labels, elapsed):
    now = [0.0]
    monkeypatch.setattr(swap_portfolio, "time", SimpleNamespace(monotonic=lambda: now[0]))

    def first(n, edges, **kwargs):
        now[0] += elapsed
        return {"nodes": 10, "labels": first_labels, "termination": "time_limit"}

    def unexpected(*args, **kwargs):
        raise AssertionError("second stage should be skipped")

    monkeypatch.setattr(swap_portfolio, "frontier_search", first)
    monkeypatch.setattr(swap_portfolio, "swap_search", unexpected)
    result = swap_portfolio.search(4, [[0, 1], [1, 2], [2, 3]], seed=7)
    assert len(result["stages"]) == 1
    assert result["labels"] == first_labels
    assert result["termination"] == ("witness" if first_labels else "time_limit")


@pytest.mark.parametrize("value", (None, [], {}, True, "wrong"))
def test_invalid_objectives_rejected(value):
    with pytest.raises(ValueError, match="swap_objective"):
        replace(Config(), swap_objective=value).validate()


@pytest.mark.parametrize("value", (True, 1.5, "seed", None))
def test_portfolio_validates_seed_before_either_stage(value):
    with pytest.raises(ValueError, match="seed"):
        swap_portfolio.search(1, [], seed=value)


@pytest.mark.parametrize("value", (None, [], {}, True, "wrong"))
def test_invalid_proposal_policies_rejected(value):
    with pytest.raises(ValueError, match="swap_proposal_policy"):
        replace(Config(), swap_proposal_policy=value).validate()


def test_switching_candidate_keeps_generation_and_resume_history(tmp_path):
    old = small_config(max_cases=12, probe_max_attempts=0)
    new = replace(
        old,
        frontier_algorithm="swap-portfolio-v5",
        frontier_max_nodes=80000,
        swap_objective="missing_count",
        swap_proposal_policy="missing_difference",
        constructive_search=False,
    )
    assert old.generation_fingerprint() == new.generation_fingerprint()
    before, after = tmp_path / "before", tmp_path / "after"
    run(old, before)
    run(new, after, resume=before / "research.sqlite")
    assert (
        json.loads((after / "progress.json").read_text())["history"][:-1]
        == json.loads((before / "progress.json").read_text())["history"]
    )
    assert audit_run(after)["valid"]
    requests = [
        json.loads(path.read_text()) for path in (after / "attempts").glob("*/request.json")
    ]
    assert requests and all(req["swap_objective"] == "missing_count" for req in requests)
    assert all(req["swap_proposal_policy"] == "missing_difference" for req in requests)
    assert any(
        json.loads(line).get("frontier", {}).get("algorithm") == "swap-portfolio-v5"
        for line in (after / "attempts.jsonl").read_text().splitlines()
    )
