"""Restore the newest successful same-branch campaign checkpoint using GITHUB_TOKEN.

No third-party action, personal access token or paid service is required. Network
failures fail closed; they must not silently reset an established campaign.
"""

import argparse
import hashlib
import io
import json
import os
import re
import sqlite3
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_DATABASE_BYTES = 1024 * 1024 * 1024


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).scheme != "https":
            raise ValueError("refusing non-HTTPS artifact redirect")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if urllib.parse.urlparse(req.full_url).hostname != urllib.parse.urlparse(newurl).hostname:
            redirected.remove_header("Authorization")
        return redirected


def get(url, token, *, binary=False):
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graceful-tree-research",
        },
    )
    with urllib.request.build_opener(SafeRedirect()).open(request, timeout=30) as response:
        data = response.read(MAX_ARCHIVE_BYTES + 1 if binary else 10 * 1024 * 1024)
    if binary:
        if len(data) > MAX_ARCHIVE_BYTES:
            raise ValueError("checkpoint archive exceeds the configured download bound")
        return data
    return json.loads(data)


def unpack_checkpoint(data, destination, campaign):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if set(archive.namelist()) != {"research.sqlite", "checkpoint.json"}:
            raise ValueError("unexpected checkpoint contents; refusing arbitrary file extraction")
        if len(archive.namelist()) != 2:
            raise ValueError("duplicate archive entries")
        if archive.getinfo("research.sqlite").file_size > MAX_DATABASE_BYTES:
            raise ValueError("checkpoint exceeds 1 GiB; move to a larger storage backend")
        if archive.getinfo("checkpoint.json").file_size > 10000:
            raise ValueError("oversized checkpoint manifest")
        metadata = json.loads(archive.read("checkpoint.json"))
        database = archive.read("research.sqlite")
    if metadata.get("schema_version") != 1 or metadata.get("campaign") != campaign:
        raise ValueError("checkpoint schema or campaign mismatch")
    if hashlib.sha256(database).hexdigest() != metadata.get("sha256"):
        raise ValueError("checkpoint checksum mismatch")
    destination = Path(destination)
    if destination.exists():
        raise ValueError("refusing to overwrite an existing restored checkpoint")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(database)
    with sqlite3.connect(f"file:{temporary.resolve()}?mode=ro", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("checkpoint SQLite integrity check failed")
        saved_campaign = json.loads(
            connection.execute("SELECT value FROM metadata WHERE key='campaign'").fetchone()[0]
        )
        if saved_campaign != campaign:
            raise ValueError("ledger campaign mismatch")
    temporary.replace(destination)
    return metadata


def restore(repository, branch, campaign, current_run, token, destination, fetch=get):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("invalid repository")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", campaign):
        raise ValueError("invalid campaign")
    base = f"https://api.github.com/repos/{repository}"
    name = f"graceful-checkpoint-{campaign}"
    expired_match = False
    for page in range(1, 11):
        query = urllib.parse.urlencode({"branch": branch, "per_page": 100, "page": page})
        runs = fetch(f"{base}/actions/workflows/graceful-research.yml/runs?{query}", token)[
            "workflow_runs"
        ]
        for run in runs:
            if (
                str(run["id"]) == str(current_run)
                or run["head_branch"] != branch
                or run["conclusion"] != "success"
                or run["event"] not in {"schedule", "workflow_dispatch"}
            ):
                continue
            artifacts = fetch(f"{base}/actions/runs/{run['id']}/artifacts?per_page=100", token)[
                "artifacts"
            ]
            for artifact in artifacts:
                if artifact["name"] == name and artifact["expired"]:
                    expired_match = True
                if artifact["name"] == name and not artifact["expired"]:
                    data = fetch(
                        f"{base}/actions/artifacts/{int(artifact['id'])}/zip", token, binary=True
                    )
                    metadata = unpack_checkpoint(data, destination, campaign)
                    return {
                        "restored": True,
                        "workflow_run": run["id"],
                        "artifact_id": artifact["id"],
                        "checkpoint_run": metadata["run_id"],
                    }
        if len(runs) < 100:
            if expired_match:
                raise RuntimeError(
                    "campaign checkpoint expired; restore an archive instead of resetting progress"
                )
            return {
                "restored": False,
                "reason": "no retained successful checkpoint for this campaign",
            }
    raise RuntimeError(
        "checkpoint lookup exceeded 1000 runs; restore an archived checkpoint explicitly"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    result = restore(
        os.environ["GITHUB_REPOSITORY"],
        os.environ["GITHUB_REF_NAME"],
        args.campaign,
        os.environ["GITHUB_RUN_ID"],
        os.environ["GITHUB_TOKEN"],
        args.destination,
    )
    print(json.dumps(result, indent=2))
    status = args.destination.parent / "restore-status.json"
    status.parent.mkdir(parents=True, exist_ok=True)
    status.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
