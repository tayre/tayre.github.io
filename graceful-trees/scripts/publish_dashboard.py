"""Publish a small, audited public feed without modifying the website's source branch.

The orphan graceful-progress branch contains JSON only. GitHub Pages reads it via
raw.githubusercontent.com, so updates need neither a Pages rebuild nor a PAT.
Publication is a non-forced Git ref update; concurrent writes fail safely.
"""

import base64
import hashlib
import io
import json
import os
import re
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from restore_checkpoint import SafeRedirect, get

BRANCH = "graceful-progress"
MAX_FEED_BYTES = 4 * 1024 * 1024
EVIDENCE = ("manifest.json", "progress.json", "analysis.json", "findings.json")


def request(url, token, payload, *, method="POST"):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, allow_nan=False).encode(),
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graceful-tree-research",
        },
    )
    with urllib.request.build_opener(SafeRedirect()).open(req, timeout=30) as response:
        return json.load(response)


def read_evidence(data, environ):
    """Verify the exact audited workflow artifact before exporting any public data."""
    if environ.get("AUDIT_OUTCOME") != "success":
        raise ValueError("publication requires a successful independent audit step")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        contents = {}
        for name in (*EVIDENCE, "checksums.json", "audit.json"):
            path = f"current/{name}"
            if archive.namelist().count(path) != 1:
                raise ValueError(f"missing or duplicated evidence: {name}")
            if archive.getinfo(path).file_size > 8 * 1024 * 1024:
                raise ValueError(f"oversized evidence: {name}")
            contents[name] = archive.read(path)
    parsed = {name: json.loads(raw) for name, raw in contents.items()}
    for name in EVIDENCE:
        if hashlib.sha256(contents[name]).hexdigest() != parsed["checksums.json"].get(name):
            raise ValueError(f"evidence checksum mismatch: {name}")
    manifest = parsed["manifest.json"]
    github = manifest["provenance"]["github"]
    for key in (
        "GITHUB_REPOSITORY",
        "GITHUB_SHA",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_REF",
    ):
        if not environ.get(key) or str(github.get(key)) != str(environ[key]):
            raise ValueError(f"evidence provenance mismatch: {key}")
    if environ["GITHUB_REF"] != "refs/heads/master":
        raise ValueError("only master research may update the public dashboard")
    if parsed["audit.json"].get("valid") is not True:
        raise ValueError("evidence audit failed")
    for name in ("progress.json", "findings.json"):
        document = parsed[name]
        if (
            document.get("schema_version") != 1
            or document.get("run_id") != manifest["run_id"]
            or document.get("campaign") != manifest["config"]["campaign"]
        ):
            raise ValueError(f"evidence identity mismatch: {name}")
    return parsed


def snapshot(evidence, artifact_id):
    """Whitelist display fields; exclude paths, raw solver responses, and environment."""
    manifest, progress = evidence["manifest.json"], evidence["progress.json"]
    analysis, audit = evidence["analysis.json"], evidence["audit.json"]
    github = manifest["provenance"]["github"]
    config = manifest["config"]
    repository = github["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("invalid repository")
    run_url = f"https://github.com/{repository}/actions/runs/{int(github['GITHUB_RUN_ID'])}"
    difficult = []
    for record in analysis["observations"]["difficult"][:8]:
        difficult.append(
            {
                **{k: record[k] for k in ("tree_id", "attempt_id", "family", "status")},
                "n": record["input"]["n"],
                "wall_seconds": record.get("wall_seconds"),
                "branches": record.get("branches"),
                "timed_out": bool(record.get("timed_out")),
                "proof_certificate_verified": bool(record.get("proof_certificate_verified")),
                "features": {
                    k: record["features"].get(k) for k in ("leaves", "diameter", "max_degree")
                },
            }
        )
    return {
        "schema_version": 1,
        "source": "github-actions",
        "repository": repository,
        "source_commit": github["GITHUB_SHA"],
        "campaign": config["campaign"],
        "run_id": manifest["run_id"],
        "started_at": manifest["started_at"],
        "finished_at": manifest["finished_at"],
        "elapsed_seconds": manifest["elapsed_seconds"],
        "stop_reason": manifest["stop_reason"],
        "workflow": {
            "run_id": int(github["GITHUB_RUN_ID"]),
            "attempt": int(github["GITHUB_RUN_ATTEMPT"]),
            "url": run_url,
            "artifact_url": f"{run_url}/artifacts/{int(artifact_id)}",
        },
        "config": {
            k: config[k]
            for k in (
                "seed",
                "budget_seconds",
                "exhaustive_sizes",
                "sample_sizes",
                "families",
                "max_cases",
                "max_generated",
                "retry_policy",
                "retry_seconds",
                "retry_budget_fraction",
                "probe_budget_fraction",
                "probe_seconds",
                "probe_max_n",
                "probe_max_attempts",
                "fill_unused_budget",
            )
            if k in config
        },
        **(
            {
                "phase_summary": {
                    name: {
                        key: manifest["phase_summary"][name][key]
                        for key in ("attempts", "elapsed_seconds")
                    }
                    for name in ("retries", "new_trees", "edge_probes")
                },
                "retry_queue_size": manifest["retry_queue_size"],
            }
            if "phase_summary" in manifest
            else {}
        ),
        "versions": {k: manifest["provenance"]["dependencies"][k] for k in ("networkx", "ortools")},
        "audit": {
            "passed": audit["valid"],
            **{
                k: audit[k]
                for k in (
                    "certificates_checked",
                    "cumulative_labelings_checked",
                    "infeasibility_proofs_checked",
                )
            },
        },
        **{
            k: progress[k]
            for k in (
                "basis",
                "cumulative",
                "current_run",
                "history",
                "sizes",
                "families",
                "family_sizes",
                "certificate_verified_infeasible",
            )
        },
        "coverage": manifest["exhaustive_coverage"],
        **{
            k: progress[k]
            for k in ("proof_evidence_schema_version", "proof_counts")
            if k in progress
        },
        "findings": evidence["findings.json"]["findings"],
        "suggestions": analysis["suggestions"],
        "difficult": difficult,
        "evidence_sha256": {name: evidence["checksums.json"][name] for name in EVIDENCE},
    }


def ensure_extension(previous, current):
    """A rerun may not silently replace an established campaign with another lineage."""
    if previous["schema_version"] != 1 or previous["campaign"] != current["campaign"]:
        raise ValueError("public feed schema or campaign mismatch")
    if previous["run_id"] == current["run_id"]:
        if previous != current:
            raise ValueError("different evidence for the same research run")
        return False
    if datetime.fromisoformat(current["finished_at"]) <= datetime.fromisoformat(
        previous["finished_at"]
    ):
        return False
    history = previous["history"]
    if len(current["history"]) <= len(history) or current["history"][: len(history)] != history:
        raise ValueError("public history would be reset or rewritten; preserve the previous feed")
    return True


def publish(feed, token, *, fetch=get, send=request):
    campaign = feed["campaign"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", campaign):
        raise ValueError("invalid campaign")
    repository = feed["repository"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("invalid repository")
    encoded = json.dumps(feed, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    if len(encoded.encode()) > MAX_FEED_BYTES:
        raise ValueError("feed exceeds 4 MiB; archive or paginate history before publishing")
    base = f"https://api.github.com/repos/{repository}"
    path = f"campaigns/{campaign}.json"
    previous_head = None
    tree_request = {"tree": [{"path": path, "mode": "100644", "type": "blob", "content": encoded}]}
    try:
        ref = fetch(f"{base}/git/ref/heads/{BRANCH}", token)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    else:
        previous_head = ref["object"]["sha"]
        commit = fetch(f"{base}/git/commits/{previous_head}", token)
        tree_request["base_tree"] = commit["tree"]["sha"]
        # Read immutable Git objects; CDN cache misses must not reset public history.
        entries = fetch(f"{base}/git/trees/{commit['tree']['sha']}?recursive=1", token)
        if entries.get("truncated"):
            raise ValueError("public data tree is truncated")
        for entry in entries["tree"]:
            if entry["type"] != "tree" and not (
                entry["type"] == "blob"
                and entry["mode"] == "100644"
                and re.fullmatch(r"campaigns/[A-Za-z0-9_-]{1,64}\.json", entry["path"])
            ):
                raise ValueError("data branch contains unexpected files; refusing publication")
        matches = [entry for entry in entries["tree"] if entry["path"] == path]
        if matches:
            blob = fetch(f"{base}/git/blobs/{matches[0]['sha']}", token)
            if blob["encoding"] != "base64" or blob["size"] > MAX_FEED_BYTES:
                raise ValueError("invalid public data blob")
            raw = base64.b64decode(blob["content"])
            if not ensure_extension(json.loads(raw), feed):
                return {
                    "published": False,
                    "reason": "already published or older than the public snapshot",
                }
    tree = send(f"{base}/git/trees", token, tree_request)
    commit = send(
        f"{base}/git/commits",
        token,
        {
            "message": f"Publish audited {campaign} progress from run {feed['workflow']['run_id']}",
            "tree": tree["sha"],
            "parents": [previous_head] if previous_head else [],
        },
    )
    if previous_head:
        send(
            f"{base}/git/refs/heads/{BRANCH}",
            token,
            {"sha": commit["sha"], "force": False},
            method="PATCH",
        )
    else:
        send(f"{base}/git/refs", token, {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
    return {
        "published": True,
        "commit": commit["sha"],
        "url": f"https://raw.githubusercontent.com/{repository}/{BRANCH}/{path}",
    }


def main():
    try:
        repository, token = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"]
        artifact_id = int(os.environ["RESULTS_ARTIFACT_ID"])
        data = get(
            f"https://api.github.com/repos/{repository}/actions/artifacts/{artifact_id}/zip",
            token,
            binary=True,
        )
        feed = snapshot(read_evidence(data, os.environ), artifact_id)
        result = publish(feed, token)
        print(json.dumps(result, indent=2))
        message = (
            f"[Public progress data]({result['url']}) updated from the independently audited artifact."
            if result["published"]
            else result["reason"]
        )
        status = 0
    except Exception as exc:
        detail = str(exc) if isinstance(exc, ValueError) else str(getattr(exc, "code", ""))
        print(f"::warning::Public dashboard update failed ({type(exc).__name__}: {detail}).")
        message = "Publication failed. The previous public snapshot remains available; research evidence is preserved in Actions."
        status = 1
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as handle:
        handle.write(f"## Public dashboard\n\n{message}\n")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
