import hashlib
import importlib.util
import io
import json
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
    spec.loader.exec_module(module)
    return module


restore = load_script("restore_checkpoint")
cloud = load_script("cloud_run")


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
    assert workflow["permissions"] == {"contents": "read", "actions": "read"}
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
    for step in job["steps"]:
        if "uses" in step:
            assert len(step["uses"].split("@")[1]) == 40


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
