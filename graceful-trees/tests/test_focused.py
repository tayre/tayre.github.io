"""Rotation, shared deadlines, resume and separate experiment evidence."""

import copy
import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

from graceful_research import focused, focused_matching
from graceful_research.config import Config
from graceful_research.storage import Store


def configuration(**updates):
    return replace(
        Config(),
        focused_study="rotate",
        focused_budget_fraction=0.5,
        retry_budget_fraction=0.25,
        probe_budget_fraction=0.05,
        focused_max_cases=3,
        **updates,
    ).validate()


@pytest.mark.parametrize(
    "updates",
    [
        {"focused_study": []},
        {"focused_study": "invalid"},
        {"focused_study": "matching"},
        {"focused_budget_fraction": 0.2},
        {"focused_study": "matching", "focused_budget_fraction": 0.6},
        {"focused_max_cases": True},
        {"focused_attempt_seconds": float("nan")},
    ],
)
def test_invalid_focused_configuration(updates):
    with pytest.raises(ValueError):
        replace(Config(), **updates).validate()


def test_focus_settings_preserve_generator_identity():
    assert configuration().generation_fingerprint() == Config().generation_fingerprint()


@pytest.fixture
def clock_worker(monkeypatch):
    clock = SimpleNamespace(now=0.0, calls=[], cancelled=False, cancel_after=None)
    monkeypatch.setattr(focused, "time", SimpleNamespace(monotonic=lambda: clock.now))
    data = {"n": 4, "edges": [[0, 1], [1, 2], [2, 3]]}
    monkeypatch.setattr(
        focused_matching,
        "case_for_index",
        lambda index, seed: {"input": data, "stratum": "fixture", "index": index, "seed": seed},
    )

    class Worker:
        def __init__(self, **kwargs):
            pass

        def start(self, deadline):
            return True

        def solve(self, request, deadline):
            assert clock.now < deadline
            clock.calls.append(copy.deepcopy(request))
            clock.now += 0.1
            if clock.cancel_after == len(clock.calls):
                clock.cancelled = True
            return {
                "status": "verified_graceful",
                "labels": [0, 3, 1, 2],
                "seed": request["seed"],
                "wall_seconds": 0.1,
            }

        def stop(self):
            pass

    monkeypatch.setattr(focused, "Supervisor", Worker)
    return clock


def prepare(tmp_path, config):
    output = tmp_path / "output"
    output.mkdir()
    store = Store(tmp_path / "research.sqlite", config)
    manifest = {"run_id": "test", "config": config.as_dict()}
    store.save_run("test", manifest)
    store.set_meta("focused-v1:rotation", 1)
    return output, store, manifest


def test_paired_budgets_rotation_resume_and_audit(clock_worker, tmp_path):
    config = configuration()
    output, store, manifest = prepare(tmp_path, config)
    try:
        result = focused.run_study(config, store, output, "test", 100, None)
        manifest["focused_study"] = result
        assert result["study"] == "matching" and result["rotation_advanced"]
        assert result["cursor_before"] == 0 and result["cursor_after"] == 3
        assert result["summary"]["pairs_completed"] == 3
        assert store.meta("focused-v1:rotation") == 2
        assert [r["variant"] for r in clock_worker.calls] == [
            "baseline",
            "matching_first",
            "matching_first",
            "baseline",
            "baseline",
            "matching_first",
        ]
        for a, b in zip(clock_worker.calls[::2], clock_worker.calls[1::2], strict=True):
            assert a["seed"] == b["seed"] and a["solver_seconds"] == b["solver_seconds"]
        assert store.connection.execute("SELECT count(*) FROM attempts").fetchone()[0] == 0
        assert focused.audit_focused(store.connection, output, manifest) == []
        row = store.connection.execute(
            "SELECT record_id,data FROM focused_records LIMIT 1"
        ).fetchone()
        altered = json.loads(row[1])
        altered["data"]["trials"]["baseline"]["labels"] = [0, 0, 1, 2]
        store.connection.execute(
            "UPDATE focused_records SET data=? WHERE record_id=?", (json.dumps(altered), row[0])
        )
        assert focused.audit_focused(store.connection, output, manifest)
    finally:
        store.close()


def test_smoke_does_not_advance_daily_rotation(clock_worker, tmp_path):
    config = configuration(budget_seconds=120)
    output, store, _ = prepare(tmp_path, config)
    try:
        result = focused.run_study(config, store, output, "test", 100, None)
        assert not result["rotation_advanced"]
        assert store.meta("focused-v1:rotation") == 1
    finally:
        store.close()


def test_rejected_trial_remains_available_for_independent_investigation(
    clock_worker, tmp_path, monkeypatch
):
    config = configuration()
    output, store, _ = prepare(tmp_path, config)
    monkeypatch.setattr(
        focused_matching, "verify_trial", lambda *args: ["unexpected solver outcome"]
    )
    try:
        with pytest.raises(RuntimeError, match="unexpected solver outcome"):
            focused.run_study(config, store, output, "test", 100, None)
        evidence = output / "focused/work/00000000/baseline-result.json"
        assert json.loads(evidence.read_text())["labels"] == [0, 3, 1, 2]
        assert store.meta("focused-v1:matching", 0) == 0
    finally:
        store.close()


def test_interrupted_pair_is_saved_without_advancing_pair_cursor(clock_worker, tmp_path):
    config = configuration()
    output, store, _ = prepare(tmp_path, config)
    clock_worker.cancel_after = 1
    try:
        result = focused.run_study(
            config, store, output, "test", 100, None, lambda: clock_worker.cancelled
        )
        assert result["stop_reason"] == "cancelled"
        assert result["cursor_after"] == 0
        assert result["summary"]["pairs_started"] == 1
        assert result["summary"]["pairs_completed"] == 0
    finally:
        store.close()


def test_no_pair_begins_without_room_for_both_trials(clock_worker, tmp_path):
    config = configuration()
    output, store, _ = prepare(tmp_path, config)
    try:
        result = focused.run_study(config, store, output, "test", 3, None)
        assert not clock_worker.calls
        assert result["cursor_after"] == 0
        assert not result["rotation_advanced"]
    finally:
        store.close()


def test_real_studies_resume_one_checkpoint_and_audit_all_evidence(tmp_path):
    from test_system import small_config

    from graceful_research.audit import audit_run
    from graceful_research.runner import run

    base = small_config(
        focused_study="pendant",
        focused_budget_fraction=0.5,
        retry_budget_fraction=0.25,
        probe_budget_fraction=0.05,
        focused_max_cases=1,
        focused_attempt_seconds=1,
        probe_backend="sat",
        max_cases=4,
        probe_max_attempts=0,
    )
    resume = None
    history = []
    for study in focused.STUDIES:
        output = tmp_path / study
        manifest, code = run(replace(base, focused_study=study), output, resume=resume)
        assert code == 0 and audit_run(output)["valid"]
        assert manifest["focused_study"]["study"] == study
        assert len(manifest["focused_study"]["record_ids"]) == 1
        progress = json.loads((output / "progress.json").read_text())
        assert progress["history"][:-1] == history
        history = progress["history"]
        assert study in progress["focused_studies"]
        resume = output / "research.sqlite"
    assert set(progress["focused_studies"]) == set(focused.STUDIES)

    # Historical pair seeds must still be checked when the current study differs.
    import sqlite3

    with sqlite3.connect(resume) as database:
        identity, raw = database.execute(
            "SELECT record_id,data FROM focused_records WHERE study='matching'"
        ).fetchone()
        row = json.loads(raw)
        row["data"]["trials"]["baseline"]["seed"] += 1
        database.execute(
            "UPDATE focused_records SET data=? WHERE record_id=?", (json.dumps(row), identity)
        )
        errors = focused.audit_focused(database, output, manifest)
        assert any("seed differs" in error for error in errors)
