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
import shutil
import sqlite3
import stat
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import closing
from pathlib import Path

MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
MAX_DATABASE_BYTES = 4 * 1024 * 1024 * 1024
MAX_MEMORY_DOWNLOAD_BYTES = 256 * 1024 * 1024
DISK_RESERVE_BYTES = 256 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024
DOWNLOAD_SECONDS = 600


class RestoreError(ValueError):
    """A safe diagnostic whose details contain locally measured sizes only."""

    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code, self.details = code, details


def require_space(directory, needed):
    free = shutil.disk_usage(directory).free
    if free < needed + DISK_RESERVE_BYTES:
        raise RestoreError(
            "insufficient_disk_space",
            "insufficient disk space for checkpoint restoration and reserve",
            available_bytes=free,
            needed_bytes=needed,
            reserve_bytes=DISK_RESERVE_BYTES,
        )


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).scheme != "https":
            raise ValueError("refusing non-HTTPS artifact redirect")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if urllib.parse.urlparse(req.full_url).hostname != urllib.parse.urlparse(newurl).hostname:
            redirected.remove_header("Authorization")
        return redirected


def authenticated_request(url, token):
    return urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graceful-tree-research",
        },
    )


def get(url, token, *, binary=False):
    """Small API/publication fetches; checkpoint downloads use download_archive."""
    limit = MAX_MEMORY_DOWNLOAD_BYTES if binary else 10 * 1024 * 1024
    with urllib.request.build_opener(SafeRedirect()).open(
        authenticated_request(url, token), timeout=30
    ) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RestoreError("response_size_limit", "response exceeds its bounded memory limit")
    return data if binary else json.loads(data)


def download_archive(url, token, destination):
    """Stream authenticated artifact bytes to a private temporary path.

    Limits apply to actual bytes, not only Content-Length. The total deadline is
    checked between reads; the socket timeout bounds inactivity, not a trickling
    response's wall time. The enclosing workflow supplies the hard outer limit.
    """
    destination = Path(destination)
    created = False
    started = time.monotonic()
    try:
        with urllib.request.build_opener(SafeRedirect()).open(
            authenticated_request(url, token), timeout=30
        ) as response:
            declared = response.headers.get("Content-Length")
            declared = int(declared) if declared is not None else None
            if declared is not None and not 0 <= declared <= MAX_ARCHIVE_BYTES:
                raise RestoreError(
                    "archive_size_limit",
                    "checkpoint archive exceeds download bound",
                    archive_bytes=declared,
                    limit_bytes=MAX_ARCHIVE_BYTES,
                )
            require_space(destination.parent, declared or CHUNK_BYTES)
            total = 0
            with destination.open("xb") as handle:
                created = True
                while True:
                    if time.monotonic() - started > DOWNLOAD_SECONDS:
                        raise RestoreError("download_time_limit", "checkpoint download timed out")
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_ARCHIVE_BYTES:
                        raise RestoreError(
                            "archive_size_limit",
                            "checkpoint archive exceeds download bound",
                            archive_bytes=total,
                            limit_bytes=MAX_ARCHIVE_BYTES,
                        )
                    require_space(destination.parent, len(chunk))
                    handle.write(chunk)
            if declared is not None and total != declared:
                raise RestoreError("incomplete_download", "checkpoint download length mismatch")
        return total
    except BaseException:
        if created:
            destination.unlink(missing_ok=True)
        raise


def unpack_checkpoint(data, destination, campaign, *, diagnostics=None):
    """Verify a file-backed ZIP without materializing its database in memory.

    Bytes remain supported for callers with small fixture archives. A unique
    adjacent temporary file keeps publication on the same filesystem. Linking it
    into place is atomic and fails if any destination appeared during validation.
    """
    destination = Path(destination)
    if os.path.lexists(destination):
        raise RestoreError(
            "destination_exists", "refusing to overwrite an existing restored checkpoint"
        )
    archive_size = len(data) if isinstance(data, bytes) else Path(data).stat().st_size
    if archive_size > MAX_ARCHIVE_BYTES:
        raise RestoreError(
            "archive_size_limit",
            "checkpoint archive exceeds download bound",
            archive_bytes=archive_size,
            limit_bytes=MAX_ARCHIVE_BYTES,
        )
    source = io.BytesIO(data) if isinstance(data, bytes) else data
    temporary = None
    try:
        with zipfile.ZipFile(source) as archive:
            if set(archive.namelist()) != {"research.sqlite", "checkpoint.json"}:
                raise RestoreError(
                    "archive_contents",
                    "unexpected checkpoint contents; refusing arbitrary file extraction",
                )
            if len(archive.namelist()) != 2:
                raise RestoreError("duplicate_entries", "duplicate archive entries")
            for info in archive.infolist():
                if info.is_dir() or stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG):
                    raise RestoreError(
                        "archive_contents", "checkpoint entries must be regular files"
                    )
            size = archive.getinfo("research.sqlite").file_size
            if diagnostics is not None:
                diagnostics.update(archive_bytes=archive_size, database_bytes=size)
            if size > MAX_DATABASE_BYTES:
                raise RestoreError(
                    "database_size_limit",
                    "checkpoint database exceeds configured restore bound",
                    database_bytes=size,
                    limit_bytes=MAX_DATABASE_BYTES,
                )
            if archive.getinfo("checkpoint.json").file_size > 10000:
                raise RestoreError("manifest_size_limit", "oversized checkpoint manifest")
            metadata = json.loads(archive.read("checkpoint.json"))
            if (
                not isinstance(metadata, dict)
                or metadata.get("schema_version") != 1
                or metadata.get("campaign") != campaign
            ):
                raise RestoreError("campaign_mismatch", "checkpoint schema or campaign mismatch")
            if not isinstance(metadata.get("run_id"), str) or not re.fullmatch(
                r"[a-f0-9]{64}", metadata.get("sha256", "")
            ):
                raise RestoreError("invalid_manifest", "invalid checkpoint identity or digest")
            destination.parent.mkdir(parents=True, exist_ok=True)
            # The runner immediately backs up this restored database into its
            # new output directory, so reserve that second copy as well.
            require_space(destination.parent, 2 * size)
            digest, total = hashlib.sha256(), 0
            with tempfile.NamedTemporaryFile(
                prefix=".checkpoint-restore-",
                suffix=".sqlite",
                dir=destination.parent,
                delete=False,
            ) as handle:
                temporary = Path(handle.name)
                with archive.open("research.sqlite") as member:
                    while chunk := member.read(CHUNK_BYTES):
                        total += len(chunk)
                        if total > MAX_DATABASE_BYTES or total > size:
                            raise RestoreError(
                                "database_size_limit",
                                "checkpoint database exceeded declared restore bound",
                                database_bytes=total,
                                limit_bytes=min(size, MAX_DATABASE_BYTES),
                            )
                        require_space(destination.parent, size + len(chunk))
                        digest.update(chunk)
                        handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
            if total != size or digest.hexdigest() != metadata["sha256"]:
                raise RestoreError("checksum_mismatch", "checkpoint checksum mismatch")
        if diagnostics is not None:
            diagnostics["stage"] = "verify_database"
        with closing(
            sqlite3.connect(temporary.resolve().as_uri() + "?mode=ro", uri=True)
        ) as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.execute("PRAGMA cache_size=-8192")
            connection.execute("PRAGMA mmap_size=0")
            connection.execute("PRAGMA temp_store=FILE")
            checked = connection.execute("PRAGMA integrity_check")
            if checked.fetchone() != ("ok",) or checked.fetchone() is not None:
                raise RestoreError("sqlite_integrity", "checkpoint SQLite integrity check failed")
            row = connection.execute(
                "SELECT length(value), substr(value,1,1024) FROM metadata WHERE key='campaign'"
            ).fetchone()
            if row is None or row[0] > 1024 or json.loads(row[1]) != campaign:
                raise RestoreError("ledger_campaign_mismatch", "ledger campaign mismatch")
        if diagnostics is not None:
            diagnostics["stage"] = "publish"
        os.link(temporary, destination)
        return metadata
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def restore(
    repository,
    branch,
    campaign,
    current_run,
    token,
    destination,
    fetch=None,
    *,
    download=None,
    diagnostics=None,
):
    streamed = fetch is None or download is not None
    fetch = get if fetch is None else fetch
    download = download_archive if download is None else download
    diagnostics = {} if diagnostics is None else diagnostics
    diagnostics["stage"] = "lookup"
    destination = Path(destination)
    if os.path.lexists(destination):
        raise RestoreError(
            "destination_exists", "refusing to overwrite an existing restored checkpoint"
        )
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
                or run["event"] not in {"schedule", "workflow_dispatch", "push"}
            ):
                continue
            artifacts = fetch(f"{base}/actions/runs/{run['id']}/artifacts?per_page=100", token)[
                "artifacts"
            ]
            for artifact in artifacts:
                if artifact["name"] == name and artifact["expired"]:
                    expired_match = True
                if artifact["name"] == name and not artifact["expired"]:
                    diagnostics.update(
                        workflow_run=int(run["id"]),
                        artifact_id=int(artifact["id"]),
                        stage="download",
                    )
                    url = f"{base}/actions/artifacts/{int(artifact['id'])}/zip"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with tempfile.TemporaryDirectory(
                        prefix=".checkpoint-download-", dir=destination.parent
                    ) as directory:
                        if streamed:
                            data = Path(directory) / "checkpoint.zip"
                            download(url, token, data)
                        else:
                            # Backward-compatible injected test/client fetch API.
                            data = fetch(url, token, binary=True)
                        diagnostics["stage"] = "unpack"
                        metadata = unpack_checkpoint(
                            data, destination, campaign, diagnostics=diagnostics
                        )
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


def failure_status(exc, diagnostics):
    """Never serialize exception text, URLs, response bodies, or environment."""
    result = {
        "restored": False,
        "status": "failed",
        "error_type": type(exc).__name__,
        "limits": {
            "archive_bytes": MAX_ARCHIVE_BYTES,
            "database_bytes": MAX_DATABASE_BYTES,
            "disk_reserve_bytes": DISK_RESERVE_BYTES,
        },
        **diagnostics,
    }
    if isinstance(exc, RestoreError):
        result.update(error_code=exc.code, reason=str(exc), details=exc.details)
    else:
        result.update(
            error_code="restore_failed",
            reason="checkpoint restoration failed; prior progress was not reset",
        )
        if isinstance(exc, urllib.error.HTTPError):
            result["http_status"] = exc.code
        elif isinstance(exc, OSError) and isinstance(exc.errno, int):
            result["errno"] = exc.errno
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args(argv)
    diagnostics = {}
    try:
        result = restore(
            os.environ["GITHUB_REPOSITORY"],
            os.environ["GITHUB_REF_NAME"],
            args.campaign,
            os.environ["GITHUB_RUN_ID"],
            os.environ["GITHUB_TOKEN"],
            args.destination,
            diagnostics=diagnostics,
        )
        exit_code = 0
    except Exception as exc:
        result = failure_status(exc, diagnostics)
        exit_code = 1
    status = args.destination.parent / "restore-status.json"
    status.parent.mkdir(parents=True, exist_ok=True)
    status.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
