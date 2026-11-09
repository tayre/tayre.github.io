import hashlib
import importlib.util
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

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
        ("nightly", "31"),
        ("../../etc/passwd", "1"),
        ("$(echo unsafe)", "1"),
    ],
)
def test_cloud_inputs_validated(experiment, minutes):
    with pytest.raises(ValueError):
        cloud.dispatch_config(experiment, minutes)


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
    assert workflow["on"]["workflow_dispatch"]["inputs"]["budget_minutes"]["default"] == "30"
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
    assert int(job["timeout-minutes"]) > 30
    assert job["runs-on"] == "ubuntu-24.04"
    assert (
        job["env"]["MINUTES"]
        == "${{ github.event_name == 'push' && '2' || inputs.budget_minutes }}"
    )
    upload_steps = [s for s in job["steps"] if "upload-artifact@" in s.get("uses", "")]
    assert len(upload_steps) == 2
    assert any(s.get("if") == "always()" for s in upload_steps)
    assert any(s.get("id") == "results" for s in upload_steps)
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
