"""Extract byte-identical, audited publication metadata from a full results run.

The full artifact remains the evidence download. This smaller directory is only
transport for dashboard/notification readers, with their existing current/ ZIP
layout. The original audit excludes audit.json and checksums.json from its hash
index; require its positive result, verify the other selected hashes, then include
the audit's exact bytes in the new subset index as well.
"""

import argparse
import hashlib
import json
import os
import shutil
import stat
import tempfile
from pathlib import Path

MAX_METADATA_BYTES = 32 * 1024 * 1024
MAX_CHECKSUM_BYTES = 64 * 1024 * 1024
HASHED_EVIDENCE = ("manifest.json", "analysis.json", "progress.json", "findings.json")
SELECTED = (*HASHED_EVIDENCE, "audit.json")


def _no_symlinks(path):
    path = Path(os.path.abspath(path))
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError("publication paths must not contain symlinks")
    return path


def _read_json(source, name, limit):
    if name not in (*SELECTED, "checksums.json"):
        raise ValueError("unexpected publication filename")
    path = _no_symlinks(source / name)
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError(f"publication evidence must be a regular file: {name}")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError(f"oversized or nonregular publication evidence: {name}")
        raw = handle.read(limit + 1)
    if len(raw) > limit:
        raise ValueError(f"oversized publication evidence: {name}")
    document = json.loads(raw)
    if not isinstance(document, dict):
        raise ValueError(f"publication evidence must be a JSON object: {name}")
    return raw, document


def package_publication(source, output):
    source, output = _no_symlinks(source), _no_symlinks(output)
    if not source.is_dir():
        raise ValueError("publication source must be a directory")
    if output == source or source in output.parents:
        raise ValueError("publication output must be outside the audited source")
    if output.exists():
        raise ValueError("refusing to replace an existing publication bundle")

    audit_raw, audit = _read_json(source, "audit.json", MAX_METADATA_BYTES)
    if audit.get("valid") is not True:
        raise ValueError("publication requires a valid independent audit")
    _, original_checksums = _read_json(source, "checksums.json", MAX_CHECKSUM_BYTES)
    contents = {"audit.json": audit_raw}
    for name in HASHED_EVIDENCE:
        raw, _ = _read_json(source, name, MAX_METADATA_BYTES)
        if hashlib.sha256(raw).hexdigest() != original_checksums.get(name):
            raise ValueError(f"publication evidence checksum mismatch: {name}")
        contents[name] = raw
    if "audit.json" in original_checksums and (
        hashlib.sha256(audit_raw).hexdigest() != original_checksums["audit.json"]
    ):
        raise ValueError("publication evidence checksum mismatch: audit.json")
    subset = {name: hashlib.sha256(raw).hexdigest() for name, raw in contents.items()}
    contents["checksums.json"] = (
        json.dumps(subset, indent=2, sort_keys=True, allow_nan=False) + "\n"
    ).encode()

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".publication-", dir=output.parent))
    try:
        current = temporary / "current"
        current.mkdir()
        for name, raw in contents.items():
            (current / name).write_bytes(raw)
        # Never overwrite an existing output, including a concurrently created
        # bundle. The final directory appears only after all writes succeed.
        if output.exists() or output.is_symlink():
            raise ValueError("publication output appeared during packaging")
        temporary.rename(output)
    except BaseException:
        shutil.rmtree(temporary)
        raise
    return {
        "output": str(output),
        "files": [f"current/{name}" for name in sorted(contents)],
        "bytes": sum(map(len, contents.values())),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    print(json.dumps(package_publication(args.source, args.output), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
