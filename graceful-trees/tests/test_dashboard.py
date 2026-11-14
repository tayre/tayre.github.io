"""Public data must retain the audit boundary and the campaign's history."""

import base64
import copy
import hashlib
import io
import json
import urllib.error
import zipfile

import pytest
from test_cloud import load_script
from test_system import small_config

from graceful_research.audit import audit_run
from graceful_research.io import write_json
from graceful_research.runner import run

dashboard = load_script("publish_dashboard")


@pytest.fixture(scope="module")
def audited(tmp_path_factory):
    output = tmp_path_factory.mktemp("dashboard") / "run"
    environment = {
        "GITHUB_REPOSITORY": "tayre/tayre.github.io",
        "GITHUB_SHA": "a" * 40,
        "GITHUB_RUN_ID": "123",
        "GITHUB_RUN_ATTEMPT": "1",
        "GITHUB_REF": "refs/heads/master",
        "AUDIT_OUTCOME": "success",
    }
    with pytest.MonkeyPatch.context() as patch:
        for key, value in environment.items():
            patch.setenv(key, value)
        run(small_config(campaign="nightly-v1", max_cases=5), output)
    audit = audit_run(output)
    assert audit["valid"]
    write_json(output / "audit.json", audit)
    raw = {
        name: (output / name).read_bytes()
        for name in (*dashboard.EVIDENCE, "checksums.json", "audit.json")
    }
    return raw, environment


def archive(raw, *, duplicate=None):
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as z:
        for name, data in raw.items():
            z.writestr(f"current/{name}", data)
        if duplicate:
            z.writestr(f"current/{duplicate}", raw[duplicate])
    return result.getvalue()


def make_feed(audited):
    raw, env = audited
    return dashboard.snapshot(dashboard.read_evidence(archive(raw), env), 456)


def test_actual_run_exports_only_audited_statistics(audited):
    feed = make_feed(audited)
    assert feed["cumulative"]["trees"] == 5
    assert feed["cumulative"]["verified_graceful"] == 5
    assert feed["certificate_verified_infeasible"] == 0
    assert feed["audit"]["passed"] is True
    assert feed["proof_evidence_schema_version"] == 1
    assert feed["proof_counts"]["total_attempts"] == feed["audit"]["infeasibility_proofs_checked"]
    assert feed["workflow"]["artifact_url"].endswith("/runs/123/artifacts/456")
    assert (
        sum(row["attempts"] for row in feed["phase_summary"].values())
        == feed["current_run"]["attempts"]
    )
    assert feed["retry_queue_size"] == 0
    assert feed["config"]["retry_policy"] == "bounded"
    assert feed["config"]["max_cases"] == 5
    assert all(
        set(row) == {"attempts", "elapsed_seconds"} for row in feed["phase_summary"].values()
    )
    for secret_field in ("directory", "git_status", "processor", "GITHUB_TOKEN", "request"):
        assert secret_field not in json.dumps(feed)
    assert (
        feed["evidence_sha256"]["progress.json"]
        == hashlib.sha256(audited[0]["progress.json"]).hexdigest()
    )


@pytest.mark.parametrize("name", dashboard.EVIDENCE)
def test_tampered_statistics_never_publish(audited, name):
    raw, env = audited
    changed = {**raw, name: b"{}"}
    with pytest.raises(ValueError, match="checksum mismatch"):
        dashboard.read_evidence(archive(changed), env)


@pytest.mark.parametrize(
    "key",
    [
        "GITHUB_REPOSITORY",
        "GITHUB_SHA",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_REF",
        "AUDIT_OUTCOME",
    ],
)
def test_wrong_workflow_identity_or_audit_blocks_publication(audited, key):
    raw, env = audited
    with pytest.raises(ValueError):
        dashboard.read_evidence(archive(raw), {**env, key: "different"})


def test_failed_or_duplicated_audit_evidence_is_rejected(audited):
    raw, env = audited
    with pytest.raises(ValueError, match="audit failed"):
        dashboard.read_evidence(archive({**raw, "audit.json": b'{"valid":false}'}), env)
    with pytest.warns(UserWarning, match="Duplicate"):
        data = archive(raw, duplicate="progress.json")
    with pytest.raises(ValueError, match="duplicated"):
        dashboard.read_evidence(data, env)


def newer(feed):
    result = copy.deepcopy(feed)
    result["run_id"] = "next-run"
    result["finished_at"] = "2099-01-01T00:00:00+00:00"
    result["history"].append({**result["history"][-1], "run_id": "next-run", "run": 2})
    return result


def test_existing_history_cannot_be_reset_rewritten_or_republished(audited):
    feed = make_feed(audited)
    assert not dashboard.ensure_extension(feed, copy.deepcopy(feed))
    next_feed = newer(feed)
    assert dashboard.ensure_extension(feed, next_feed)
    assert not dashboard.ensure_extension(next_feed, feed)
    next_feed["history"][0]["verified_graceful"] = 999
    with pytest.raises(ValueError, match="reset or rewritten"):
        dashboard.ensure_extension(feed, next_feed)
    altered = copy.deepcopy(feed)
    altered["cumulative"]["verified_graceful"] = 999
    with pytest.raises(ValueError, match="same research run"):
        dashboard.ensure_extension(feed, altered)


def missing(url):
    return urllib.error.HTTPError(url, 404, "missing", {}, None)


def test_first_publication_uses_a_new_data_only_root_commit(audited):
    calls = []

    def fetch(url, token):
        assert url.endswith("/git/ref/heads/graceful-progress")
        raise missing(url)

    def send(url, token, payload, **kwargs):
        calls.append((url, payload, kwargs))
        return {"sha": "b" * 40}

    result = dashboard.publish(make_feed(audited), "secret", fetch=fetch, send=send)
    assert result["published"]
    assert calls[0][1]["tree"][0]["path"] == "campaigns/nightly-v1.json"
    assert calls[1][1]["parents"] == []
    assert calls[2][1]["ref"] == "refs/heads/graceful-progress"
    assert "master" not in json.dumps(calls)
    assert "secret" not in json.dumps(calls)


def test_updates_use_immutable_objects_and_nonforced_ref_update(audited):
    feed = make_feed(audited)
    calls = []

    def fetch(url, token):
        if "/ref/" in url:
            return {"object": {"sha": "old-head"}}
        if "/commits/" in url:
            assert url.endswith("old-head")
            return {"tree": {"sha": "old-tree"}}
        if "/trees/" in url:
            assert "old-tree?recursive=1" in url
            return {
                "tree": [
                    {
                        "path": "campaigns/nightly-v1.json",
                        "type": "blob",
                        "mode": "100644",
                        "sha": "old-blob",
                    }
                ]
            }
        assert url.endswith("/blobs/old-blob")
        return {
            "encoding": "base64",
            "size": 100,
            "content": base64.b64encode(json.dumps(feed).encode()).decode(),
        }

    def send(url, token, payload, **kwargs):
        calls.append((url, payload, kwargs))
        return {"sha": "new-head"}

    assert not dashboard.publish(feed, "t", fetch=fetch, send=send)["published"]
    assert calls == []
    assert dashboard.publish(newer(feed), "t", fetch=fetch, send=send)["published"]
    assert calls[0][1]["base_tree"] == "old-tree"
    assert calls[1][1]["parents"] == ["old-head"]
    assert calls[-1][1] == {"sha": "new-head", "force": False}
    assert calls[-1][2] == {"method": "PATCH"}


def test_network_failure_cannot_start_a_fresh_public_history(audited):
    def fetch(*args):
        raise TimeoutError("offline")

    def send(*args, **kwargs):
        pytest.fail("must never write after a failed history read")

    with pytest.raises(TimeoutError):
        dashboard.publish(make_feed(audited), "t", fetch=fetch, send=send)


def test_ref_conflicts_are_not_force_pushed(audited):
    methods = []

    def fetch(url, token):
        raise missing(url)

    def send(url, token, payload, **kwargs):
        methods.append(kwargs.get("method", "POST"))
        if url.endswith("/refs"):
            raise urllib.error.HTTPError(url, 422, "branch created concurrently", {}, None)
        return {"sha": "new"}

    with pytest.raises(urllib.error.HTTPError):
        dashboard.publish(make_feed(audited), "t", fetch=fetch, send=send)
    assert methods == ["POST", "POST", "POST"]
