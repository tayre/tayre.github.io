"""Real-search snapshots, independent checks, and strict fixed-partial scope."""

import copy
import json
import math
import time
from types import SimpleNamespace

import pytest

from graceful_research import focused_residual
from graceful_research.focused_residual import (
    IneligibleResidual,
    investigate,
    permutation_oracle,
    reconstruct,
    summarize,
    verify_record,
    worker_main,
)
from graceful_research.frontier import ALGORITHM, search
from graceful_research.residual_congruence import find_certificate
from graceful_research.residual_signatures import complete_forest
from graceful_research.verify import verify_labeling
from graceful_research.worker import Supervisor

HEAP = {"n": 12, "edges": [[(v - 1) // 2, v] for v in range(1, 12)]}
PATH = {"n": 4, "edges": [[0, 1], [1, 2], [2, 3]]}


@pytest.fixture(scope="module")
def fresh_study():
    return investigate({"input": HEAP, "seed": 73, "solver_seconds": 5})


@pytest.fixture
def negative_control():
    # A unit-test control, not input to the fresh-study sampler: maximum
    # difference on P4's middle edge cannot extend to a graceful labeling.
    partial = [-1, 0, 3, -1]
    data, mappings = reconstruct(PATH, partial)
    return {
        "schema_version": 1,
        "snapshot_id": focused_residual._identity(PATH, partial),
        "scope": "fixed_partial_labeling",
        "status": "completed",
        "full_input": PATH,
        "partial_labels": partial,
        "source": {"algorithm": ALGORITHM, "seed": 73, "root": 1, "node": 2, "difference": 2},
        "residual": data,
        "component_maps": mappings,
        "classification": "impossible_partial",
        "exact": complete_forest(**data),
        "oracle": permutation_oracle(PATH, partial),
        "congruence": find_certificate(**data),
        "relaxations": [],
        "whole_tree_conclusion": "none",
    }


def test_real_trace_states_are_saved_before_classification_and_independently_verified(fresh_study):
    assert fresh_study["status"] == "completed"
    assert fresh_study["sampling"] == "first_distinct_eligible_states_before_outcomes"
    assert fresh_study["snapshots_collected"] == 4
    assert fresh_study["snapshots_unclassified"] == 0
    assert fresh_study["unclassified_snapshots"] == []
    assert fresh_study["trace_verification"]["valid"]
    assert fresh_study["whole_tree_conclusion"] == "none"
    observed = []

    def observer(state):
        try:
            reconstruct(HEAP, state["labels"])
        except IneligibleResidual:
            return
        if state["labels"] not in [row["labels"] for row in observed]:
            observed.append(state)

    search(**HEAP, seed=73, seconds=5, residual_observer=observer)
    for saved, actual in zip(fresh_study["residual_records"], observed[:4], strict=True):
        assert saved["full_input"] == HEAP
        assert saved["partial_labels"] == actual["labels"]
        assert saved["source"] == {k: v for k, v in actual.items() if k != "labels"}
        assert 1 <= saved["partial_labels"].count(-1) <= 8
        assert all(len(row["vertices"]) <= 3 for row in saved["component_maps"])
        assert verify_record(saved) == []
    assert fresh_study["summary"] == summarize(fresh_study["residual_records"])
    assert not fresh_study["summary"]["novelty_claimed"]


def test_observer_is_opt_in_and_cannot_change_search_assignments():
    plain = search(**HEAP, seed=73, seconds=5)
    observed = []

    def observer(state):
        observed.append(state["node"])
        state["labels"][:] = [0] * HEAP["n"]
        return [0] * HEAP["n"]  # An observer result must not become a search answer.

    watched = search(**HEAP, seed=73, seconds=5, residual_observer=observer)
    assert observed
    assert {k: v for k, v in plain.items() if k != "wall_seconds"} == {
        k: v for k, v in watched.items() if k != "wall_seconds"
    }
    assert verify_labeling(**HEAP, labels=watched["labels"])["valid"]


def test_negative_partial_is_exhaustive_but_is_never_a_whole_tree_claim(negative_control):
    assert verify_record(negative_control) == []
    assert negative_control["oracle"] == {
        "feasible": False,
        "assignments_checked": math.factorial(2),
        "exhausted": True,
        "labels": None,
    }
    assert negative_control["congruence"]["certificate"] is not None
    assert summarize([negative_control])["whole_tree_infeasibility_claims"] == 0
    # This same original tree has an independently verified graceful witness.
    assert verify_labeling(**PATH, labels=[0, 3, 1, 2])["valid"]


def test_independent_recheck_does_not_use_the_discovery_implementations(
    fresh_study, negative_control, monkeypatch
):
    def forbidden(*args, **kwargs):
        raise AssertionError("verification must not trust or invoke discovery")

    monkeypatch.setattr("graceful_research.residual_signatures.complete_forest", forbidden)
    monkeypatch.setattr("graceful_research.residual_congruence.find_certificate", forbidden)
    monkeypatch.setattr("graceful_research.residual_relaxations.discover", forbidden)
    assert verify_record(fresh_study["residual_records"][0]) == []
    assert verify_record(negative_control) == []


@pytest.mark.parametrize(
    "full,partial,match",
    [
        (PATH, [-1, 0, 0, -1], "repeated"),
        (PATH, [0, -1, -1, 3], "disconnected"),
        (PATH, [0, 1, -1, -1], "descending"),
        (PATH, [0, 3, 1, 2], "unassigned"),
        (PATH, [-1, 0, True, -1], "integer"),
        ({"n": 5, "edges": [[v, v + 1] for v in range(4)]}, [0, -1, -1, -1, -1], "three"),
        ({"n": 10, "edges": [[0, v] for v in range(1, 10)]}, [0] + [-1] * 9, "eight"),
        ({"n": 4, "edges": [[0, 1], [1, 2], [2, 0]]}, [0, 3, -1, -1], "invalid full tree"),
    ],
)
def test_malformed_or_oversized_partial_states_are_rejected(full, partial, match):
    with pytest.raises(ValueError, match=match):
        reconstruct(full, partial)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda r: r["component_maps"][0].update(parent_vertex=0),
        lambda r: r["residual"]["components"][0].update(parent_label=2),
        lambda r: r["oracle"].update(exhausted=False),
        lambda r: r["oracle"].update(assignments_checked=1),
        lambda r: r.update(whole_tree_conclusion="infeasible"),
        lambda r: r.update(classification="counterexample"),
        lambda r: r.update(exact=None),
        lambda r: r.update(congruence=[]),
        lambda r: r.update(relaxations=None),
        lambda r: r.update(schema_version=True),
        lambda r: r["source"].update(root=0),
        lambda r: r["exact"].update(reason="empty_component_table"),
        lambda r: r["exact"].update(signature_counts=[999, 999]),
        lambda r: r["congruence"]["certificate"].update(target_residue=0),
        lambda r: r["exact"]["signature_tables"][0][0].update(label_mask=0),
        lambda r: r["exact"]["signature_tables"][0][0].update(labels=[0]),
        lambda r: r["exact"]["signature_tables"][0].clear(),
    ],
)
def test_saved_state_scope_or_certificate_tampering_is_rejected(negative_control, mutation):
    record = copy.deepcopy(negative_control)
    mutation(record)
    assert verify_record(record)


def test_invalid_observed_state_is_an_error_not_silently_filtered(monkeypatch):
    def invalid_trace(**kwargs):
        kwargs["residual_observer"](
            {"labels": [-1, 0, 0, -1], "seed": 1, "root": 1, "node": 2, "difference": 2}
        )

    monkeypatch.setattr(focused_residual, "search", invalid_trace)
    with pytest.raises(ValueError, match="repeated"):
        investigate({"input": PATH, "seed": 1, "solver_seconds": 1})


def test_soft_budget_preserves_unclassified_input_without_negative_claim(monkeypatch):
    clock = SimpleNamespace(now=0.0)
    monkeypatch.setattr(focused_residual, "time", SimpleNamespace(monotonic=lambda: clock.now))

    def bounded_trace(**kwargs):
        kwargs["residual_observer"](
            {
                "labels": [-1, 0, 3, -1],
                "algorithm": ALGORITHM,
                "seed": 1,
                "root": 1,
                "node": 2,
                "difference": 2,
            }
        )
        clock.now = 2.0
        return {"labels": None}

    monkeypatch.setattr(focused_residual, "search", bounded_trace)
    result = investigate({"input": PATH, "seed": 1, "solver_seconds": 1})
    assert result["snapshots_collected"] == result["snapshots_unclassified"] == 1
    assert result["residual_records"] == []
    pending = result["unclassified_snapshots"][0]
    assert pending["status"] == "unknown"
    assert pending["partial_labels"] == [-1, 0, 3, -1]
    assert "classification" not in pending and "oracle" not in pending
    assert result["summary"]["impossible_partial"] == 0


def test_independent_verification_failure_cannot_return_a_completed_study(monkeypatch):
    monkeypatch.setattr(focused_residual, "verify_record", lambda record: ["injected rejection"])
    with pytest.raises(RuntimeError, match="independent observed-residual check failed"):
        investigate({"input": PATH, "seed": 73, "solver_seconds": 2})


def test_output_is_self_contained_and_does_not_overwrite(tmp_path):
    request = {"input": HEAP, "seed": 73, "solver_seconds": 5, "directory": str(tmp_path)}
    result = investigate(request)
    saved = json.loads((tmp_path / "focused-residual.json").read_text())
    assert result == saved
    assert all(not verify_record(row) for row in saved["residual_records"])
    with pytest.raises(FileExistsError):
        investigate(request)


def test_process_worker_integrates_with_parent_supervisor():
    supervisor = Supervisor(target=worker_main)
    try:
        result = supervisor.solve(
            {"input": HEAP, "seed": 73, "solver_seconds": 5}, time.monotonic() + 15
        )
        assert result["status"] == "completed", result
        assert result["summary"]["residuals"] == 4
        assert all(not verify_record(row) for row in result["residual_records"])
    finally:
        supervisor.stop()


def test_parent_expired_deadline_returns_unknown_without_residual_inferences():
    supervisor = Supervisor(target=worker_main)
    try:
        result = supervisor.solve(
            {"input": HEAP, "seed": 73, "solver_seconds": 5}, time.monotonic() - 1
        )
        assert result["status"] == "unknown"
        assert result["termination"] == "parent_time_limit"
        assert "residual_records" not in result
        assert not result["proof_certificate_verified"]
    finally:
        supervisor.stop()


@pytest.mark.parametrize(
    "change", [{"seed": True}, {"seed": -1}, {"max_snapshots": 5}, {"solver_seconds": float("nan")}]
)
def test_invalid_request_bounds(change):
    with pytest.raises(ValueError):
        investigate({"input": HEAP, "seed": 73, "solver_seconds": 5, **change})
