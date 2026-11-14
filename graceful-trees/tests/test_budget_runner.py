"""Deadline and resume behavior with a virtual clock, plus real witness checking."""

import copy
import itertools
import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

import graceful_research.runner as runner
from graceful_research.audit import audit_run, check_phases
from graceful_research.config import Config
from graceful_research.verify import verify_labeling


@pytest.fixture
def clock_worker(monkeypatch):
    state = SimpleNamespace(now=0.0, cost=2.0, positive=True, calls=[])
    monkeypatch.setattr(runner, "time", SimpleNamespace(monotonic=lambda: state.now))

    class Worker:
        def __init__(self, **kwargs):
            pass

        def solve(self, request, deadline):
            assert state.now < deadline
            assert 0 < request["solver_seconds"] <= deadline - state.now
            state.calls.append((copy.deepcopy(request), deadline, state.now))
            before = state.now
            state.now = min(deadline, state.now + min(state.cost, request["solver_seconds"]) + 0.03)
            labels = None
            if state.positive:
                for candidate in itertools.permutations(range(request["input"]["n"])):
                    if verify_labeling(
                        **request["input"],
                        labels=list(candidate),
                        restriction=request["restriction"],
                    )["valid"]:
                        labels = list(candidate)
                        break
            return {
                "status": "verified_graceful" if labels is not None else "unknown",
                "labels": labels,
                "verification": None,
                "proof_certificate_verified": False,
                "timed_out": False,
                "wall_seconds": state.now - before,
                "termination": "virtual_clock_fixture",
            }

        def stop(self):
            pass

    monkeypatch.setattr(runner, "Supervisor", Worker)
    return state


def settings(**updates):
    config = Config(
        campaign="budget-tests",
        budget_seconds=30,
        finalize_reserve_seconds=2,
        attempt_seconds=2,
        max_cases=100,
        max_generated=1000,
        exhaustive_sizes=[4, 5, 6, 7],
        sample_sizes=[],
        families=[],
        retry_budget_fraction=0,
        probe_budget_fraction=0.5,
        probe_max_n=5,
        probe_max_attempts=0,
    )
    return replace(config, **updates).validate()


def records(output):
    return [json.loads(line) for line in (output / "attempts.jsonl").read_text().splitlines()]


def test_unused_probe_time_fills_against_original_deadline(clock_worker, tmp_path):
    first, code = runner.run(settings(), tmp_path / "legacy")
    assert code == 0
    legacy_count = first["run_attempts"]
    assert 13.9 <= clock_worker.now <= 14
    clock_worker.now = 0
    clock_worker.calls.clear()
    second, code = runner.run(settings(fill_unused_budget=True), tmp_path / "filled")
    assert code == 0 and second["stop_reason"] == "compute_budget"
    assert second["run_attempts"] > legacy_count
    assert clock_worker.now == 28
    assert max(deadline for _, deadline, _ in clock_worker.calls) == 28
    assert all(r["research_phase"] == "new_trees" for r in records(tmp_path / "filled"))
    assert audit_run(tmp_path / "filled")["valid"]
    assert "## Research budget use" in (tmp_path / "filled/report.md").read_text()
    assert "research_phase" in (tmp_path / "filled/attempts.csv").read_text().splitlines()[0]


@pytest.mark.parametrize(
    "updates,reason",
    [
        ({"max_cases": 2}, "case_limit"),
        ({"max_generated": 2}, "generation_limit"),
        ({"exhaustive_sizes": [1, 2]}, "sources_exhausted"),
    ],
)
def test_refill_respects_global_caps_and_exhausted_sources(clock_worker, tmp_path, updates, reason):
    manifest, code = runner.run(settings(fill_unused_budget=True, **updates), tmp_path / "run")
    assert code == 0 and manifest["stop_reason"] == reason
    assert len(clock_worker.calls) == 2
    assert clock_worker.now < 14


@pytest.mark.parametrize("probe_seconds,expected", [(None, 2), (7, 7)])
def test_probe_allowance_and_scope_remain_separate(clock_worker, tmp_path, probe_seconds, expected):
    manifest, code = runner.run(
        settings(
            max_cases=2, probe_seconds=probe_seconds, probe_max_attempts=3, fill_unused_budget=True
        ),
        tmp_path / "run",
    )
    assert code == 0
    probes = [request for request, _, _ in clock_worker.calls if request["restriction"]]
    assert len(probes) == 3
    assert all(request["solver_seconds"] == expected for request in probes)
    rows = records(tmp_path / "run")
    assert all(
        (r["scope"] == "extreme_edge") == (r["research_phase"] == "edge_probes") for r in rows
    )
    assert manifest["summary"]["unrestricted_trees"] == 2
    assert manifest["summary"]["restricted_attempts"] == 3
    assert audit_run(tmp_path / "run")["valid"]


def test_cancellation_prevents_new_work_and_refill(clock_worker, tmp_path):
    manifest, code = runner.run(
        settings(fill_unused_budget=True),
        tmp_path / "run",
        cancelled=lambda: clock_worker.now >= 4,
    )
    assert code == 0 and manifest["stop_reason"] == "cancelled"
    assert len(clock_worker.calls) == 2


def test_reopened_retries_are_once_per_run_with_continuing_seeds(clock_worker, tmp_path):
    clock_worker.positive = False
    original = settings(max_cases=2, max_attempts_per_case=1)
    first, code = runner.run(original, tmp_path / "original")
    assert code == 0
    before = records(tmp_path / "original")
    clock_worker.now = 0
    clock_worker.calls.clear()
    manifest, code = runner.run(
        replace(
            original,
            retry_policy="oldest_unresolved",
            retry_budget_fraction=0.6,
            probe_budget_fraction=0.25,
            retry_seconds=90,
            fill_unused_budget=True,
        ),
        tmp_path / "resumed",
        tmp_path / "original/research.sqlite",
    )
    after = records(tmp_path / "resumed")
    assert code == 0 and manifest["retry_queue_size"] == 2
    assert len(after) == len(clock_worker.calls) == 2
    assert {r["tree_id"] for r in after} == {r["tree_id"] for r in before}
    assert all(r["research_phase"] == "retries" and r["attempt_number"] == 2 for r in after)
    assert all(a["seed"] != b["seed"] for a, b in zip(before, after, strict=True))
    assert all(deadline <= 16.8 + 1e-9 for _, deadline, _ in clock_worker.calls)
    assert audit_run(tmp_path / "resumed")["valid"]


def test_phase_audit_rejects_tampering_but_accepts_old_manifests():
    rows = [{"research_phase": "edge_probes", "scope": "extreme_edge"}]
    manifest = {
        "elapsed_seconds": 3,
        "retry_queue_size": 0,
        "phase_summary": {
            "retries": {"attempts": 0, "elapsed_seconds": 0},
            "new_trees": {"attempts": 0, "elapsed_seconds": 0},
            "edge_probes": {"attempts": 1, "elapsed_seconds": 2},
        },
    }
    assert check_phases({}, rows) == []
    assert check_phases(manifest, rows) == []
    damaged = copy.deepcopy(manifest)
    damaged["phase_summary"]["retries"]["attempts"] = 1
    assert check_phases(damaged, rows)
    damaged = copy.deepcopy(manifest)
    damaged["phase_summary"]["edge_probes"]["elapsed_seconds"] = float("nan")
    assert check_phases(damaged, rows)
    damaged["phase_summary"]["edge_probes"]["elapsed_seconds"] = 4
    assert check_phases(damaged, rows)
    assert check_phases(manifest, [{"research_phase": "retries", "scope": "extreme_edge"}])
    for value in (None, -1, True, "0"):
        assert check_phases({**manifest, "retry_queue_size": value}, rows)
