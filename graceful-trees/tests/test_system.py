import copy
import json
import multiprocessing
import signal
import sqlite3
import subprocess
import sys
import time
from dataclasses import replace
from pathlib import Path

import pytest

from graceful_research.analysis import summarize
from graceful_research.audit import audit_run
from graceful_research.config import Config
from graceful_research.io import provenance, write_checksums
from graceful_research.runner import run
from graceful_research.storage import Store
from graceful_research.worker import Supervisor


def hanging_worker(connection):
    connection.send({"ready": True})
    connection.recv()
    time.sleep(20)


def broken_worker(connection):
    connection.close()


def small_config(**kwargs):
    defaults = dict(
        campaign="tests",
        budget_seconds=30,
        finalize_reserve_seconds=2,
        attempt_seconds=1,
        retry_seconds=2,
        max_cases=10,
        max_generated=200,
        exhaustive_sizes=[1, 2, 3, 4, 5, 6],
        sample_sizes=[],
        families=[],
        probe_max_n=4,
        probe_max_attempts=6,
    )
    return Config(**{**defaults, **kwargs}).validate()


def test_provenance_includes_proof_sources_without_build_cache(tmp_path):
    saved = provenance(tmp_path)
    assert "formal/Graceful/Complement.lean" in saved["source_hashes"]
    assert "formal/Audit.lean" in saved["source_hashes"]
    assert "formal/lean-toolchain" in saved["source_hashes"]
    assert not any(".lake/" in name for name in saved["source_hashes"])


@pytest.mark.parametrize(
    "field,value",
    [
        ("budget_seconds", float("nan")),
        ("attempt_seconds", 0),
        ("budget_seconds", 0),
        ("seed", -1),
        ("max_cases", True),
        ("complement_break", 1),
        ("constructive_search", "true"),
        ("exhaustive_sizes", [17]),
        ("sample_sizes", [257]),
        ("exhaustive_sizes", [2, 2]),
        ("families", ["typo"]),
        ("campaign", "../bad"),
        ("finalize_reserve_seconds", 1801),
    ],
)
def test_invalid_configuration(field, value):
    with pytest.raises(ValueError):
        replace(Config(), **{field: value}).validate()


def test_config_rejects_unknown_fields(tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"atempt_seconds": 7}')
    with pytest.raises(ValueError, match="unknown"):
        Config.read(path)


def test_parent_deadline_kills_stuck_worker():
    supervisor = Supervisor(target=hanging_worker)
    started = time.monotonic()
    try:
        result = supervisor.solve({"solver_seconds": 10}, started + 0.6)
        assert result["status"] == "unknown"
        assert result["termination"] == "parent_time_limit"
        assert result["proof_certificate_verified"] is False
        assert supervisor.process is None
        assert time.monotonic() - started < 3
    finally:
        supervisor.stop(force=True)


def test_worker_crash_is_error():
    supervisor = Supervisor(target=broken_worker)
    try:
        result = supervisor.solve({"solver_seconds": 1}, time.monotonic() + 3)
        assert result["status"] == "error"
    finally:
        supervisor.stop(force=True)


@pytest.fixture(scope="module")
def experiment(tmp_path_factory):
    output = tmp_path_factory.mktemp("campaign") / "run"
    manifest, status = run(small_config(), output)
    assert status == 0, manifest.get("error")
    return output, manifest


def test_end_to_end_certificates_and_independent_cli(experiment):
    output, manifest = experiment
    assert manifest["summary"]["verified_graceful"] == 10
    assert manifest["summary"]["restricted_solver_infeasible"] >= 1
    assert manifest["summary"]["solver_infeasible"] == 0
    assert audit_run(output)["valid"]
    result = subprocess.run(
        [sys.executable, "-S", str(output / "verify.py"), str(output / "certificates")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr + result.stdout
    assert json.loads(result.stdout)["valid"]
    report = (output / "report.md").read_text()
    assert "not an" in report and "independently checked proof certificate" in report
    assert "report.html" in report and "figures/overview.png" in report
    progress = json.loads((output / "progress.json").read_text())
    assert progress["current_run"]["verified_graceful"] == 10
    assert progress["cumulative"]["verified_graceful"] == 10
    assert "report.html" in json.loads((output / "checksums.json").read_text())


def test_resume_progresses_and_preserves_ledger(experiment, tmp_path):
    previous, prior_manifest = experiment
    output = tmp_path / "continued"
    manifest, code = run(small_config(max_cases=20), output, previous / "research.sqlite")
    assert code == 0, manifest.get("error")
    assert manifest["stop_reason"] == "sources_exhausted"
    assert manifest["cumulative_cases"] == 14
    assert manifest["cumulative_attempts"] > prior_manifest["cumulative_attempts"]
    assert audit_run(output)["valid"]
    progress = json.loads((output / "progress.json").read_text())
    assert progress["cumulative"]["trees"] == 14
    assert progress["current_run"]["trees"] == 4
    assert [r["trees"] for r in progress["history"]] == [10, 14]
    with sqlite3.connect(output / "research.sqlite") as db:
        assert db.execute("SELECT count(*) FROM runs").fetchone()[0] == 2
        all_base = db.execute(
            "SELECT tree_id,count(*) FROM attempts WHERE scope='graceful' GROUP BY tree_id"
        ).fetchall()
        assert len(all_base) == 14
        assert all(count == 1 for _, count in all_base)


def test_visual_counts_checked_against_ledger_even_after_rehash(experiment, tmp_path):
    import shutil

    original, _ = experiment
    output = tmp_path / "wrong-chart-counts"
    shutil.copytree(original, output)
    data = json.loads((output / "progress.json").read_text())
    data["cumulative"]["verified_graceful"] += 1000
    (output / "progress.json").write_text(json.dumps(data))
    write_checksums(output)
    result = audit_run(output)
    assert not result["valid"]
    assert "visual progress data differs from cumulative ledger" in result["errors"]


def test_fabricated_alert_cannot_pass_audit(experiment, tmp_path):
    import shutil

    original, _ = experiment
    output = tmp_path / "fabricated-finding"
    shutil.copytree(original, output)
    data = json.loads((output / "findings.json").read_text())
    assert data["findings"] == []
    data["findings"] = [{"kind": "unrestricted_infeasibility", "key": "invented"}]
    (output / "findings.json").write_text(json.dumps(data))
    write_checksums(output)
    assert "notable findings differ from cumulative ledger" in audit_run(output)["errors"]


def test_plot_failure_preserves_verified_evidence(tmp_path, monkeypatch):
    def broken_plot(*args, **kwargs):
        raise RuntimeError("plot backend unavailable")

    monkeypatch.setattr("graceful_research.runner.write_visual_report", broken_plot)
    output = tmp_path / "failed-plot"
    manifest, code = run(small_config(max_cases=1, probe_max_attempts=0), output)
    assert code == 1
    assert manifest["stop_reason"] == "report_error"
    assert manifest["summary"]["verified_graceful"] == 1
    assert "plot backend unavailable" in (output / "report.md").read_text()
    assert (output / "checksums.json").is_file()
    assert (output / "checkpoint.json").is_file()
    with sqlite3.connect(output / "research.sqlite") as database:
        assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not audit_run(output)["valid"]  # Incomplete visuals must not pass audit.


def test_checkpoint_config_mismatch_rejected(experiment, tmp_path):
    previous, _ = experiment
    with pytest.raises(ValueError, match="generation config differs"):
        run(small_config(seed=99), tmp_path / "different", previous / "research.sqlite")


def test_corruption_detected(experiment, tmp_path):
    import shutil

    previous, _ = experiment
    output = tmp_path / "corrupt"
    shutil.copytree(previous, output)
    path = next((output / "certificates").glob("*.json"))
    data = json.loads(path.read_text())
    data["labels"][0] = -1
    path.write_text(json.dumps(data))
    # Even recomputed transport checksums cannot make a false witness valid.
    write_checksums(output)
    assert not audit_run(output)["valid"]


def test_scoped_infeasibility_and_timeouts_not_counterexamples(experiment):
    output, _ = experiment
    records = [json.loads(line) for line in (output / "attempts.jsonl").read_text().splitlines()]
    positive = next(r for r in records if r["scope"] == "graceful")
    unknown = copy.deepcopy(positive)
    unknown.update(
        status="unknown",
        tree_id="different",
        labels=None,
        verification=None,
        timed_out=True,
        termination="parent_time_limit",
    )
    restricted = next(
        r for r in records if r["scope"] == "extreme_edge" and r["status"] == "solver_infeasible"
    )
    summary = summarize([positive, unknown, restricted])
    assert summary["verified_graceful"] == 1
    assert summary["unknown"] == 1
    assert summary["timeout_attempts"] == 1
    assert summary["solver_infeasible"] == 0
    assert summary["restricted_solver_infeasible"] == 1
    assert summary["certificate_verified_infeasible"] == 0


def test_pending_case_survives_and_is_retried(tmp_path):
    from graceful_research.trees import TreeStream

    config = small_config(max_cases=1)
    source = tmp_path / "pending.sqlite"
    store = Store(source, config)
    case, _ = TreeStream(config, store).next()
    store.close()
    output = tmp_path / "resumed"
    manifest, code = run(config, output, source)
    assert code == 0
    records = [json.loads(line) for line in (output / "attempts.jsonl").read_text().splitlines()]
    assert records[0]["tree_id"] == case["tree_id"]
    assert records[0]["status"] == "verified_graceful"
    assert manifest["summary"]["unrestricted_trees"] == 1


def test_tiny_budget_and_no_orphan_children(tmp_path):
    started = time.monotonic()
    config = small_config(budget_seconds=0.2, finalize_reserve_seconds=0.02, probe_max_attempts=0)
    manifest, code = run(config, tmp_path / "tiny")
    assert code == 0
    assert time.monotonic() - started < 3
    assert manifest["summary"]["solver_infeasible"] == 0
    assert not multiprocessing.active_children()


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX signal integration")
def test_sigterm_finishes_with_saved_report(tmp_path):
    project = Path(__file__).resolve().parents[1]
    output = tmp_path / "interrupted"
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "graceful_research",
            "run",
            "--config",
            str(project / "configs/nightly.json"),
            "--output",
            str(output),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        deadline = time.monotonic() + 10
        while not (output / "manifest.json").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert (output / "manifest.json").exists()
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=5)
        assert process.returncode == 0, stderr.decode() + stdout.decode()
        assert json.loads((output / "manifest.json").read_text())["stop_reason"] == "cancelled"
        assert audit_run(output)["valid"]
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def test_generator_dependency_change_rejected(experiment, monkeypatch, tmp_path):
    previous, _ = experiment
    monkeypatch.setattr(
        "graceful_research.config.importlib.metadata.version", lambda name: "changed"
    )
    with pytest.raises(ValueError, match="generation config differs"):
        run(small_config(), tmp_path / "version-change", previous / "research.sqlite")


def test_audit_rechecks_historical_witnesses(experiment, tmp_path):
    previous, _ = experiment
    output = tmp_path / "continued-corrupt"
    manifest, code = run(small_config(max_cases=1), output, previous / "research.sqlite")
    assert code == 0
    with sqlite3.connect(output / "research.sqlite") as database:
        row = database.execute(
            "SELECT attempt_id,data FROM attempts WHERE run_id != ? AND status='verified_graceful' LIMIT 1",
            (manifest["run_id"],),
        ).fetchone()
        record = json.loads(row[1])
        record["labels"][0] = -1
        database.execute(
            "UPDATE attempts SET data=? WHERE attempt_id=?", (json.dumps(record), row[0])
        )
    write_checksums(output)
    result = audit_run(output)
    assert not result["valid"]
    assert any("ledger attempt" in error for error in result["errors"])


def test_replay_cli_preserves_scope_and_writes_versions(tmp_path):
    project = Path(__file__).resolve().parents[1]
    output = tmp_path / "replay"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "graceful_research",
            "replay",
            str(project / "examples/path4-central-edge-request.json"),
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    record = json.loads((output / "result.json").read_text())
    assert record["status"] == "solver_infeasible"
    assert record["request"]["restriction"]["kind"] == "extreme_edge"
    assert record["proof_certificate_verified"] is False
    versions = json.loads((output / "provenance.json").read_text())["dependencies"]
    assert versions["ortools"] == "9.14.6206"


def test_audit_mixed_single_and_multi_digit_orders(tmp_path):
    output = tmp_path / "mixed-orders"
    config = small_config(
        exhaustive_sizes=[1],
        sample_sizes=[12, 20],
        families=["path"],
        max_cases=3,
        probe_max_attempts=0,
    )
    manifest, code = run(config, output)
    assert code == 0
    assert manifest["summary"]["size_distribution"] == {1: 1, 12: 1, 20: 1}
    assert audit_run(output)["valid"]


def test_false_success_without_witness_is_saved_and_fails(tmp_path, monkeypatch):
    def bad_result(self, request, deadline):
        return {
            "status": "verified_graceful",
            "labels": None,
            "verification": None,
            "proof_certificate_verified": False,
        }

    monkeypatch.setattr(Supervisor, "solve", bad_result)
    output = tmp_path / "false-success"
    manifest, code = run(small_config(max_cases=1, probe_max_attempts=0), output)
    assert code == 1
    assert manifest["stop_reason"] == "error"
    records = [json.loads(line) for line in (output / "attempts.jsonl").read_text().splitlines()]
    assert records[0]["status"] == "invalid_solution"
    assert not audit_run(output)["valid"]
