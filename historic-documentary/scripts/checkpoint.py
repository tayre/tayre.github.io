#!/usr/bin/env python3
"""Snapshot editable project files; inventory large media without duplicating it."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import uuid

EDITABLE = {".md", ".txt", ".json", ".csv", ".py", ".toml", ".yaml", ".yml",
            ".srt", ".vtt", ".svg", ".blend", ".otio", ".otioz", ".fcpxml",
            ".mlt", ".kdenlive", ".prproj", ".drp", ".veg", ".aep", ".edl"}
FOLDERS = ["production", "research", "assets", "audio", "blender", "edit", "masters", "exports", "qc"]


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def atomic_text(path, text):
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temp.write_text(text)
    temp.replace(path)


def explicit_files(root, brief):
    """Native project bundles and uncommon editor formats are recoverable too."""
    names = list(brief.get("checkpoint", {}).get("additional_editable_paths", []))
    if brief.get("authoritative_timeline"):
        names.append(brief["authoritative_timeline"])
    files = set()
    for name in names:
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts or not relative.parts:
            raise ValueError(f"Checkpoint selection must be project-relative: {name}")
        path = root / relative
        if relative.parts[0] == "checkpoints" or path.resolve() != path:
            raise ValueError(f"Checkpoint selection cannot include checkpoints or symlinks: {name}")
        if not path.exists():
            raise FileNotFoundError(f"Selected editable file is missing: {name}")
        selected = [path] if path.is_file() else list(path.rglob("*"))
        for item in selected:
            if item.is_symlink():
                raise ValueError(f"Selected project contains a symlink: {item}")
            if item.is_file():
                files.add(item)
    return files


def candidates(root, forced):
    paths = [root / "AGENTS.md", root / "framework-snapshot.json"]
    for name in FOLDERS:
        paths.extend((root / name).rglob("*"))
    for path in sorted(set(paths) | forced):
        if not path.is_file() or path.is_symlink():
            continue
        if path in forced:
            yield path
            continue
        if any(part.startswith(".") or part == "__pycache__" for part in path.relative_to(root).parts):
            continue
        if path.name.endswith((".tmp", ".partial.mp4", ".pyc")):
            continue
        if path.name.lower().startswith(("credentials", "secret", "token")):
            continue
        yield path


def save(root, label):
    brief = json.loads((root / "production/brief.json").read_text())
    reserve = float(brief["limits"]["protected_free_gib"]) * 2**30
    if reserve < 0:
        raise ValueError("protected_free_gib must be nonnegative")
    store = root / "checkpoints"
    objects = store / "objects"
    objects.mkdir(parents=True, exist_ok=True)
    editable, media = [], []
    forced = explicit_files(root, brief)
    for path in candidates(root, forced):
        relative = str(path.relative_to(root))
        stat = path.stat()
        if path.suffix.lower() not in EDITABLE and path not in forced:
            media.append({"path": relative, "bytes": stat.st_size, "mtime_ns": stat.st_mtime_ns,
                          "storage": "original location; not copied into checkpoint"})
            continue
        key = digest(path)
        target = objects / key
        if not target.exists():
            if shutil.disk_usage(root).free - stat.st_size < reserve:
                raise RuntimeError("Protected disk reserve reached; latest checkpoint unchanged.")
            temp = objects / (key + "." + uuid.uuid4().hex + ".tmp")
            shutil.copyfile(path, temp)
            if digest(temp) != key:
                temp.unlink()
                raise RuntimeError(f"File changed during checkpoint: {relative}; retry after its writer finishes.")
            temp.replace(target)
        editable.append({"path": relative, "bytes": stat.st_size, "sha256": key})
    now = datetime.now(timezone.utc)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", label).strip("-") or "checkpoint"
    name = now.strftime("%Y%m%dT%H%M%S-%fZ") + "-" + safe + ".json"
    report = {"created_utc": now.isoformat(), "label": label, "editable_files": editable,
              "media_inventory": media,
              "coverage": "Editable files in listed production folders, the configured authoritative timeline and explicitly selected files/bundles. Media is inventoried in place. Render caches and the framework snapshot directory are not copied; retain their separate backups."}
    atomic_text(store / name, json.dumps(report, indent=2) + "\n")
    atomic_text(store / "LATEST.txt", name + "\n")
    print(f"Saved {store / name}: {len(editable)} recoverable files, {len(media)} media references")


def verify(root):
    store = root / "checkpoints"
    name = (store / "LATEST.txt").read_text().strip()
    if Path(name).name != name:
        raise ValueError("Invalid checkpoint manifest name")
    report = json.loads((store / name).read_text())
    for item in report["editable_files"]:
        key = item["sha256"]
        if not re.fullmatch(r"[0-9a-f]{64}", key):
            raise ValueError("Invalid object hash")
        path = store / "objects" / key
        if not path.exists() or path.stat().st_size != item["bytes"] or digest(path) != key:
            raise RuntimeError(f"Checkpoint object missing or damaged: {item['path']}")
    print(f"Verified {name}: {len(report['editable_files'])} recoverable files")
    print("Original media and external backups require their own verification.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    sub = parser.add_subparsers(dest="action", required=True)
    create = sub.add_parser("save")
    create.add_argument("--label", default="manual")
    sub.add_parser("verify")
    args = parser.parse_args()
    root = args.project.expanduser().resolve()
    if args.action == "save":
        save(root, args.label)
    else:
        verify(root)


if __name__ == "__main__":
    main()
