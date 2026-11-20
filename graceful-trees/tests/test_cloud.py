import hashlib
import importlib.util
import io
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from graceful_research.config import Config
from graceful_research.storage import Store

PROJECT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, PROJECT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(PROJECT / "scripts"))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
    return module


restore = load_script("restore_checkpoint")
cloud = load_script("cloud_run")
publish = load_script("publish_summary")
notifier = load_script("notify_findings")


def archive_bytes(tmp_path, campaign="test"):
    database = tmp_path / "original.sqlite"
    store = Store(database, Config(campaign=campaign))
    store.close()
    data = database.read_bytes()
    manifest = {
        "schema_version": 1,
        "campaign": campaign,
        "run_id": "old-run",
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        archive.writestr("research.sqlite", data)
        archive.writestr("checkpoint.json", json.dumps(manifest))
    return result.getvalue()


@pytest.mark.parametrize("event", ["schedule", "workflow_dispatch", "push"])
def test_restore_matching_artifact_and_ignore_other_branches(tmp_path, event):
    data = archive_bytes(tmp_path)
    calls = []

    def fetch(url, token, *, binary=False):
        assert token == "test-token"
        calls.append(url)
        if "/workflows/" in url:
            return {
                "workflow_runs": [
                    {
                        "id": 3,
                        "head_branch": "feature",
                        "conclusion": "success",
                        "event": "workflow_dispatch",
                    },
                    {
                        "id": 2,
                        "head_branch": "master",
                        "conclusion": "failure",
                        "event": "schedule",
                    },
                    {
                        "id": 1,
                        "head_branch": "master",
                        "conclusion": "success",
                        "event": event,
                    },
                ]
            }
        if "/runs/1/artifacts" in url:
            return {"artifacts": [{"name": "graceful-checkpoint-test", "expired": False, "id": 7}]}
        assert url.endswith("/artifacts/7/zip") and binary
        return data

    destination = tmp_path / "restored.sqlite"
    result = restore.restore("owner/repo", "master", "test", 4, "test-token", destination, fetch)
    assert result["restored"]
    assert result["workflow_run"] == 1
    assert destination.read_bytes() == (tmp_path / "original.sqlite").read_bytes()
    assert len(calls) == 3


def test_no_checkpoint_is_explicit_and_network_failure_not_swallowed(tmp_path):
    result = restore.restore(
        "owner/repo",
        "master",
        "new",
        1,
        "t",
        tmp_path / "no.sqlite",
        lambda *args, **kwargs: {"workflow_runs": []},
    )
    assert not result["restored"]

    def failure(*args, **kwargs):
        raise OSError("offline")

    with pytest.raises(OSError):
        restore.restore("owner/repo", "master", "new", 1, "t", tmp_path / "no.sqlite", failure)


def test_restore_checks_campaign_and_archive_paths(tmp_path):
    data = archive_bytes(tmp_path)
    with pytest.raises(ValueError, match="campaign"):
        restore.unpack_checkpoint(data, tmp_path / "wrong.sqlite", "different")
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("../../escape", "bad")
    with pytest.raises(ValueError, match="contents"):
        restore.unpack_checkpoint(stream.getvalue(), tmp_path / "bad.sqlite", "test")


def test_download_redirect_does_not_forward_github_token():
    request = urllib.request.Request(
        "https://api.github.com/artifact", headers={"Authorization": "Bearer secret"}
    )
    redirected = restore.SafeRedirect().redirect_request(
        request, None, 302, "Found", {}, "https://storage.example/signed-artifact"
    )
    assert not redirected.has_header("Authorization")
    with pytest.raises(ValueError):
        restore.SafeRedirect().redirect_request(
            request, None, 302, "Found", {}, "http://example.com"
        )


@pytest.mark.parametrize(
    "experiment,minutes",
    [
        ("nightly", "nan"),
        ("nightly", "0"),
        ("nightly", "61"),
        ("nightly", "inf"),
        ("../../etc/passwd", "1"),
        ("$(echo unsafe)", "1"),
    ],
)
def test_cloud_inputs_validated(experiment, minutes):
    with pytest.raises(ValueError):
        cloud.dispatch_config(experiment, minutes)


@pytest.mark.parametrize("minutes", [None, "", "60"])
def test_cloud_nightly_uses_full_configured_budget(minutes):
    config, seconds = cloud.dispatch_config("nightly", minutes)
    assert seconds == Config.read(PROJECT / config).budget_seconds == 3600


@pytest.mark.parametrize("minutes", [None, "", "2"])
def test_cloud_launch_budget_reaches_cli(monkeypatch, tmp_path, minutes):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("EXPERIMENT", "nightly")
    if minutes is None:
        monkeypatch.delenv("MINUTES", raising=False)
    else:
        monkeypatch.setenv("MINUTES", minutes)
    monkeypatch.setattr(sys, "argv", ["cloud_run.py"])
    monkeypatch.setattr(Config, "read", lambda *_: Config(budget_seconds=3600))
    commands = []
    monkeypatch.setattr(cloud.subprocess, "call", lambda command: commands.append(command) or 0)
    assert cloud.main() == 0
    command = commands[0]
    assert float(command[command.index("--budget-seconds") + 1]) == (
        120 if minutes == "2" else 3600
    )


def test_example_configs_and_workflow_contracts():
    for config in (PROJECT / "configs").glob("*.json"):
        Config.read(config)
    # BaseLoader preserves the YAML 'on' key (PyYAML's default YAML 1.1 loader
    # otherwise turns it into True).
    path = PROJECT.parent / ".github/workflows/graceful-research.yml"
    if not path.exists():
        path = PROJECT / "workflows/graceful-research.yml"  # Standalone source snapshot.
    workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
    assert workflow["on"]["schedule"][0]["cron"] == "23 6 * * *"
    assert workflow["on"]["push"]["branches"] == ["master"]
    assert workflow["on"]["push"]["paths"] == [
        ".github/workflows/graceful-research.yml",
        "graceful-trees/configs/nightly.json",
    ]
    default_minutes = workflow["on"]["workflow_dispatch"]["inputs"]["budget_minutes"]["default"]
    assert (
        float(default_minutes) * 60 == Config.read(PROJECT / "configs/nightly.json").budget_seconds
    )
    assert cloud.dispatch_config("nightly", str(cloud.MAX_CLOUD_MINUTES))[1] == 3600
    assert (
        set(workflow["on"]["workflow_dispatch"]["inputs"]["experiment"]["options"])
        == cloud.EXPERIMENTS
    )
    for experiment in cloud.EXPERIMENTS:
        config_path, budget = cloud.dispatch_config(experiment, "2")
        assert Config.read(PROJECT / config_path).budget_seconds > 0 and budget == 120
    assert workflow["permissions"] == {"contents": "read", "actions": "read"}
    dashboard = workflow["jobs"]["dashboard"]
    assert dashboard["needs"] == "research" and dashboard["continue-on-error"] == "true"
    assert dashboard["permissions"] == {"contents": "write", "actions": "read"}
    assert "audit_outcome == 'success'" in dashboard["if"]
    assert "campaign == 'nightly-v1'" in dashboard["if"]
    assert "refs/heads/master" in dashboard["if"]
    assert dashboard["steps"][-1]["run"] == "python3 scripts/publish_dashboard.py"
    notify = workflow["jobs"]["notify"]
    assert notify["needs"] == "research" and notify["if"] == "always()"
    assert notify["continue-on-error"] == "true"
    assert notify["permissions"] == {"contents": "read", "actions": "read", "issues": "write"}
    assert notify["steps"][-1]["continue-on-error"] == "true"
    assert notify["steps"][-1]["run"] == "python3 scripts/notify_findings.py"
    job = workflow["jobs"]["research"]
    assert int(job["timeout-minutes"]) >= cloud.MAX_CLOUD_MINUTES + 15
    assert job["runs-on"] == "ubuntu-24.04"
    assert (
        job["env"]["MINUTES"]
        == "${{ github.event_name == 'push' && '2' || inputs.budget_minutes }}"
    )
    upload_steps = [s for s in job["steps"] if "upload-artifact@" in s.get("uses", "")]
    assert len(upload_steps) == 3
    assert any(s.get("if") == "always()" for s in upload_steps)
    assert any(s.get("id") == "results" for s in upload_steps)
    bundle = next(s for s in job["steps"] if s.get("id") == "publication_bundle")
    assert "steps.audit.outcome == 'success'" in bundle["if"]
    publication = next(s for s in upload_steps if s.get("id") == "publication")
    assert "steps.publication_bundle.outcome == 'success'" in publication["if"]
    assert publication["with"]["path"] == "graceful-trees/results/publication/"
    for name in ("dashboard", "notify"):
        consumer = workflow["jobs"][name]["steps"][-1]
        assert (
            consumer["env"]["PUBLICATION_ARTIFACT_ID"]
            == "${{ needs.research.outputs.publication_artifact_id }}"
        )
        assert consumer["env"]["RESULTS_ARTIFACT_ID"] == "${{ needs.research.outputs.artifact_id }}"
    assert job["steps"][-1]["run"] == "python scripts/publish_summary.py"
    assert (
        job["steps"][-1]["env"]["RESULTS_ARTIFACT_URL"]
        == "${{ steps.results.outputs.artifact-url }}"
    )
    for step in job["steps"]:
        if "uses" in step:
            assert len(step["uses"].split("@")[1]) == 40


def test_workflow_summary_links_artifact_without_broken_local_figures():
    report = "\n".join(
        [
            "# Research",
            "[Open the offline visual progress report](report.html)",
            "![Charts](figures/overview.png)",
            "| [abc](inputs/abc.json) | 4 | unknown |",
            "A timeout is unresolved.",
        ]
    )
    url = "https://github.com/owner/repo/actions/runs/12/artifacts/34"
    rendered = publish.workflow_summary(report, url)
    assert url in rendered
    assert "report.html" in rendered
    assert "figures/overview.png" not in rendered
    assert "inputs/abc.json" not in rendered
    assert "`abc`" in rendered
    assert "A timeout is unresolved." in rendered
    assert "javascript:" not in publish.workflow_summary(report, "javascript:alert(1)")
    assert "Artifacts" in publish.workflow_summary(report)


def test_notifications_are_quiet_without_findings_and_deduplicate_closed_issues():
    issues = []
    requests = []

    def fetch(url, token, **kwargs):
        requests.append(url)
        assert "state=all" in url
        return issues

    def create(url, token, payload):
        assert url == "https://api.github.com/repos/owner/repo/issues"
        assert "@owner" in payload["body"]
        issues.append({**payload, "state": "closed", "user": {"login": "github-actions[bot]"}})
        return {"html_url": "https://github.com/owner/repo/issues/1"}

    empty = notifier.publish("owner/repo", "master", "owner", "t", [], 1, 2, fetch, create)
    assert empty["new_findings"] == 0 and requests == []
    finding = notifier.operational_finding("test", "rev", "Audit failed.")
    first = notifier.publish("owner/repo", "master", "owner", "t", [finding], 1, 2, fetch, create)
    assert first["new_findings"] == 1
    assert "current/report.html" in issues[0]["body"]
    assert "not a mathematical finding" in issues[0]["body"]
    again = notifier.publish("owner/repo", "master", "owner", "t", [finding], 3, 4, fetch, create)
    assert again["issues_created"] == []
    assert len(issues) == 1


def test_notification_read_failure_cannot_silently_spam_duplicates():
    def fetch(*args, **kwargs):
        raise OSError("offline")

    def forbidden(*args, **kwargs):
        pytest.fail("must not post when history cannot be read")

    with pytest.raises(OSError):
        notifier.publish(
            "owner/repo",
            "master",
            "owner",
            "t",
            [notifier.operational_finding("c", "rev", "Audit failed.")],
            1,
            2,
            fetch,
            forbidden,
        )


def test_ambiguous_delivery_is_deduplicated_on_next_review():
    issues = []
    finding = notifier.operational_finding("test", "rev", "Audit failed.")

    def created_but_response_lost(url, token, payload):
        issues.append({**payload, "user": {"login": "github-actions[bot]"}})
        raise TimeoutError("response lost")

    def fetch(*args, **kwargs):
        return issues

    with pytest.raises(TimeoutError):
        notifier.publish(
            "owner/repo", "master", "owner", "t", [finding], 1, 2, fetch, created_but_response_lost
        )
    result = notifier.publish(
        "owner/repo", "master", "owner", "t", [finding], 3, 4, fetch, created_but_response_lost
    )
    assert result["new_findings"] == 0 and len(issues) == 1


def test_notification_artifact_requires_matching_run_checksums_and_audit():
    def archive(run="5", valid=True, corrupt=False):
        contents = {
            "manifest.json": json.dumps(
                {
                    "run_id": "r",
                    "config": {"campaign": "c"},
                    "provenance": {"github": {"GITHUB_RUN_ID": run}},
                }
            ).encode(),
            "findings.json": json.dumps(
                {"schema_version": 1, "run_id": "r", "campaign": "c", "findings": []}
            ).encode(),
            "audit.json": json.dumps({"valid": valid}).encode(),
        }
        contents["checksums.json"] = json.dumps(
            {k: hashlib.sha256(v).hexdigest() for k, v in contents.items()}
        ).encode()
        if corrupt:
            contents["findings.json"] += b" "
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as bundle:
            for name, data in contents.items():
                bundle.writestr("current/" + name, data)
        return stream.getvalue()

    assert notifier.read_evidence(archive(), 5)["findings"] == []
    for data, message in [
        (archive(run="6"), "another workflow"),
        (archive(valid=False), "audit failed"),
        (archive(corrupt=True), "checksum mismatch"),
    ]:
        with pytest.raises(ValueError, match=message):
            notifier.read_evidence(data, 5)


def test_failed_audit_reports_operations_without_claiming_a_discovery():
    payloads = []
    env = {
        "GITHUB_REPOSITORY": "owner/repo",
        "GITHUB_TOKEN": "t",
        "GITHUB_RUN_ID": "5",
        "GITHUB_SHA": "revision",
        "GITHUB_REF_NAME": "master",
        "CAMPAIGN": "c",
        "ALERT_RECIPIENT": "owner",
        "AUDIT_OUTCOME": "failure",
        "RESEARCH_OUTCOME": "failure",
    }

    def create(url, token, payload):
        payloads.append(payload)
        return {"html_url": "https://github.com/owner/repo/issues/1"}

    result = notifier.review(env, lambda *args, **kwargs: [], create)
    assert result["new_findings"] == 1
    assert "operational alert" in payloads[0]["body"]
    assert "audit failed" in payloads[0]["body"]


def test_expired_checkpoint_does_not_silently_restart(tmp_path):
    def fetch(url, token, *, binary=False):
        if "/workflows/" in url:
            return {
                "workflow_runs": [
                    {"id": 1, "head_branch": "master", "conclusion": "success", "event": "schedule"}
                ]
            }
        return {"artifacts": [{"name": "graceful-checkpoint-old", "expired": True, "id": 1}]}

    with pytest.raises(RuntimeError, match="expired"):
        restore.restore("owner/repo", "master", "old", 2, "token", tmp_path / "state.sqlite", fetch)


def test_file_backed_restore_streams_database_and_cleans_temporaries(tmp_path, monkeypatch):
    data = archive_bytes(tmp_path)
    source = tmp_path / "artifact.zip"
    source.write_bytes(data)
    destination = tmp_path / "new directory" / "restored.sqlite"
    original_read = zipfile.ZipFile.read
    reads = []
    original_member_read = zipfile.ZipExtFile.read
    monkeypatch.setattr(restore, "CHUNK_BYTES", 4096)

    def read(self, name, *args, **kwargs):
        assert name != "research.sqlite", "database must never be read in one allocation"
        return original_read(self, name, *args, **kwargs)

    def member_read(self, size=-1):
        if self.name == "research.sqlite":
            reads.append(size)
            assert size == 4096
        return original_member_read(self, size)

    monkeypatch.setattr(zipfile.ZipFile, "read", read)
    monkeypatch.setattr(zipfile.ZipExtFile, "read", member_read)
    metadata = restore.unpack_checkpoint(source, destination, "test")
    assert metadata["run_id"] == "old-run"
    assert len(reads) > 2
    assert destination.read_bytes() == (tmp_path / "original.sqlite").read_bytes()
    assert list(destination.parent.iterdir()) == [destination]
    assert restore.MAX_DATABASE_BYTES == 4 * 1024**3
    assert restore.MAX_ARCHIVE_BYTES == 1024**3
    assert restore.MAX_MEMORY_DOWNLOAD_BYTES == 256 * 1024**2


def rebuilt_archive(data, *, manifest_changes=None, database=None, duplicate=False):
    with zipfile.ZipFile(io.BytesIO(data)) as original:
        raw = original.read("research.sqlite") if database is None else database
        metadata = json.loads(original.read("checkpoint.json"))
    metadata.update(manifest_changes or {})
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("research.sqlite", raw)
        archive.writestr("checkpoint.json", json.dumps(metadata))
        if duplicate:
            archive.writestr("research.sqlite", raw)
    return stream.getvalue()


@pytest.mark.parametrize("failure", ["hash", "sqlite", "ledger_campaign", "duplicate", "size"])
def test_invalid_checkpoint_never_leaves_a_partial_destination(tmp_path, monkeypatch, failure):
    data = archive_bytes(tmp_path)
    if failure == "hash":
        data = rebuilt_archive(data, manifest_changes={"sha256": "0" * 64})
    elif failure == "sqlite":
        database = b"not a SQLite database" * 100
        data = rebuilt_archive(
            data,
            database=database,
            manifest_changes={"sha256": hashlib.sha256(database).hexdigest()},
        )
    elif failure == "ledger_campaign":
        data = rebuilt_archive(data, manifest_changes={"campaign": "different"})
    elif failure == "duplicate":
        with pytest.warns(UserWarning, match="Duplicate"):
            data = rebuilt_archive(data, duplicate=True)
    else:
        monkeypatch.setattr(restore, "MAX_DATABASE_BYTES", 10)
    destination = tmp_path / "output" / "restored.sqlite"
    with pytest.raises((ValueError, sqlite3.DatabaseError)):
        restore.unpack_checkpoint(
            data, destination, "different" if failure == "ledger_campaign" else "test"
        )
    assert not destination.exists()
    assert not list(tmp_path.rglob(".checkpoint-restore-*"))


@pytest.mark.parametrize("database_copies_available", [0, 1])
def test_insufficient_space_is_measured_before_database_extraction(
    tmp_path, monkeypatch, database_copies_available
):
    data = archive_bytes(tmp_path)
    size = (tmp_path / "original.sqlite").stat().st_size
    monkeypatch.setattr(
        restore.shutil,
        "disk_usage",
        lambda _: SimpleNamespace(
            free=restore.DISK_RESERVE_BYTES + database_copies_available * size
        ),
    )
    with pytest.raises(restore.RestoreError) as failure:
        restore.unpack_checkpoint(data, tmp_path / "restored.sqlite", "test")
    assert failure.value.code == "insufficient_disk_space"
    assert failure.value.details["needed_bytes"] == 2 * size
    assert not list(tmp_path.glob(".checkpoint-restore-*"))


@pytest.mark.parametrize("existing", ["file", "broken_symlink", "race"])
def test_restore_never_overwrites_existing_or_concurrently_created_destinations(
    tmp_path, monkeypatch, existing
):
    data = archive_bytes(tmp_path)
    destination = tmp_path / "restored.sqlite"
    preserved = b"existing checkpoint must survive"
    if existing == "file":
        destination.write_bytes(preserved)
    elif existing == "broken_symlink":
        destination.symlink_to(tmp_path / "missing-target")
    else:
        original_link = os.link

        def concurrent(source, target):
            Path(target).write_bytes(preserved)
            original_link(source, target)

        monkeypatch.setattr(restore.os, "link", concurrent)
    with pytest.raises((ValueError, FileExistsError)):
        restore.unpack_checkpoint(data, destination, "test")
    if existing == "broken_symlink":
        assert destination.is_symlink()
    else:
        assert destination.read_bytes() == preserved
    assert not list(tmp_path.glob(".checkpoint-restore-*"))


class DownloadResponse:
    def __init__(self, data, headers=None, fail_after=None):
        self.data = io.BytesIO(data)
        self.headers = headers or {}
        self.fail_after = fail_after
        self.reads = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.data.close()

    def read(self, size):
        assert 0 < size <= restore.CHUNK_BYTES
        self.reads.append(size)
        if self.fail_after is not None and len(self.reads) > self.fail_after:
            raise OSError("network interruption with sensitive-url?token=secret")
        return self.data.read(size)


def install_response(monkeypatch, response):
    monkeypatch.setattr(
        restore.urllib.request,
        "build_opener",
        lambda *_: SimpleNamespace(open=lambda *args, **kwargs: response),
    )


def test_archive_download_is_chunked_and_supports_missing_content_length(tmp_path, monkeypatch):
    monkeypatch.setattr(restore, "CHUNK_BYTES", 4096)
    raw = b"archive fixture" * 3000
    response = DownloadResponse(raw)
    install_response(monkeypatch, response)
    destination = tmp_path / "archive.zip"
    assert restore.download_archive(
        "https://api.github.com/artifact", "secret", destination
    ) == len(raw)
    assert len(response.reads) > 2
    assert destination.read_bytes() == raw


@pytest.mark.parametrize(
    "failure", ["declared_limit", "actual_limit", "truncated", "interrupted", "deadline"]
)
def test_failed_download_removes_only_its_own_partial_file(tmp_path, monkeypatch, failure):
    raw = b"x" * 100
    monkeypatch.setattr(restore, "CHUNK_BYTES", 16)
    headers = {}
    if failure == "declared_limit":
        headers["Content-Length"] = str(restore.MAX_ARCHIVE_BYTES + 1)
    elif failure == "actual_limit":
        monkeypatch.setattr(restore, "MAX_ARCHIVE_BYTES", 40)
    elif failure == "truncated":
        headers["Content-Length"] = "110"
    elif failure == "deadline":
        ticks = iter([0.0, restore.DOWNLOAD_SECONDS + 1.0])
        monkeypatch.setattr(restore, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    response = DownloadResponse(raw, headers, fail_after=1 if failure == "interrupted" else None)
    install_response(monkeypatch, response)
    destination = tmp_path / "archive.zip"
    with pytest.raises((ValueError, OSError)):
        restore.download_archive("https://api.github.com/artifact", "secret", destination)
    assert not destination.exists()
    if failure == "declared_limit":
        assert response.reads == []


def test_download_cannot_delete_an_existing_file(tmp_path, monkeypatch):
    install_response(monkeypatch, DownloadResponse(b"new"))
    destination = tmp_path / "archive.zip"
    destination.write_bytes(b"keep")
    with pytest.raises(FileExistsError):
        restore.download_archive("https://api.github.com/artifact", "secret", destination)
    assert destination.read_bytes() == b"keep"


def test_default_restore_downloads_to_disk_and_records_source_diagnostics(tmp_path, monkeypatch):
    raw = archive_bytes(tmp_path)
    calls = []

    def fetch(url, token, **kwargs):
        assert not kwargs.get("binary"), "default restore must not request an in-memory ZIP"
        if "/workflows/" in url:
            return {
                "workflow_runs": [
                    {"id": 1, "head_branch": "master", "conclusion": "success", "event": "schedule"}
                ]
            }
        return {"artifacts": [{"name": "graceful-checkpoint-test", "expired": False, "id": 7}]}

    def download(url, token, destination):
        calls.append(destination)
        destination.write_bytes(raw)

    monkeypatch.setattr(restore, "get", fetch)
    monkeypatch.setattr(restore, "download_archive", download)
    diagnostics = {}
    result = restore.restore(
        "owner/repo",
        "master",
        "test",
        2,
        "secret",
        tmp_path / "restored.sqlite",
        diagnostics=diagnostics,
    )
    assert result["restored"] and len(calls) == 1
    assert not calls[0].exists() and not calls[0].parent.exists()
    assert diagnostics["workflow_run"] == 1 and diagnostics["artifact_id"] == 7
    assert diagnostics["database_bytes"] == (tmp_path / "original.sqlite").stat().st_size


@pytest.mark.parametrize("failure", ["size", "http", "unknown"])
def test_cli_writes_machine_readable_failure_without_exception_secrets(
    tmp_path, monkeypatch, capsys, failure
):
    for key in ("GITHUB_REPOSITORY", "GITHUB_REF_NAME", "GITHUB_RUN_ID", "GITHUB_TOKEN"):
        monkeypatch.setenv(key, "do-not-expose-this-value")

    def fail(*args, diagnostics, **kwargs):
        diagnostics.update(stage="unpack", artifact_id=7, database_bytes=5 * 1024**3)
        if failure == "size":
            raise restore.RestoreError(
                "database_size_limit",
                "checkpoint database exceeds configured restore bound",
                database_bytes=5 * 1024**3,
                limit_bytes=restore.MAX_DATABASE_BYTES,
            )
        if failure == "http":
            raise urllib.error.HTTPError(
                "https://private.invalid?token=secret", 401, "do-not-expose-this-value", {}, None
            )
        raise RuntimeError("do-not-expose-this-value token=secret")

    monkeypatch.setattr(restore, "restore", fail)
    destination = tmp_path / "results" / "previous.sqlite"
    assert restore.main(["--campaign", "test", "--destination", str(destination)]) == 1
    raw = (destination.parent / "restore-status.json").read_text()
    saved = json.loads(raw)
    assert saved["status"] == "failed" and saved["restored"] is False
    assert saved["artifact_id"] == 7
    assert saved["limits"]["database_bytes"] == 4 * 1024**3
    if failure == "http":
        assert saved["http_status"] == 401
    for output in (raw, capsys.readouterr().out):
        assert "secret" not in output and "do-not-expose-this-value" not in output
        assert "private.invalid" not in output
