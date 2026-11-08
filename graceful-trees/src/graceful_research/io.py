import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


def utc_now():
    return datetime.now(UTC).isoformat()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")
    temporary.replace(path)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_output(project, *args):
    try:
        return subprocess.check_output(
            ["git", "-C", str(project), *args], text=True, stderr=subprocess.DEVNULL, timeout=5
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return None


def provenance(output):
    project = Path(__file__).resolve().parents[2]
    dependencies = dict(
        sorted((dist.metadata["Name"], dist.version) for dist in importlib.metadata.distributions())
    )
    source_hashes = {}
    # Snapshot actual code, including uncommitted changes; Git SHA alone is insufficient.
    for directory in ("src", "configs", "docs", "scripts", "tests", "examples", "formal"):
        for path in sorted((project / directory).rglob("*")):
            if (
                not path.is_file()
                or "__pycache__" in path.parts
                or ".lake" in path.parts
                or path.suffix == ".pyc"
                or any(part.endswith(".egg-info") for part in path.parts)
                or path.suffix in {".zip", ".sqlite"}
            ):
                continue
            relative = path.relative_to(project)
            target = output / "source" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
            source_hashes[str(relative)] = sha256(target)
    # Installed wheels need the same actual-code snapshot, even without a checkout.
    if not any(name.startswith("src/graceful_research/") for name in source_hashes):
        for path in sorted(Path(__file__).parent.glob("*.py")):
            relative = Path("src/graceful_research") / path.name
            target = output / "source" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
            source_hashes[str(relative)] = sha256(target)
    for name in ("pyproject.toml", "requirements.lock", "README.md"):
        path = project / name
        if path.exists():
            target = output / "source" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
            source_hashes[name] = sha256(target)
    for path in sorted((project.parent / ".github/workflows").glob("graceful-*.yml")):
        target = output / "source" / "workflows" / path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        source_hashes["workflows/" + path.name] = sha256(target)
    (output / "dependencies.txt").write_text(
        "\n".join(f"{name}=={version}" for name, version in dependencies.items()) + "\n"
    )
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cpu_count": os.cpu_count(),
        "dependencies": dependencies,
        "git_commit": git_output(project, "rev-parse", "HEAD"),
        "git_status": git_output(project, "status", "--porcelain", "--", ".", "../.github"),
        "source_hashes": source_hashes,
        "github": {
            key: os.environ[key]
            for key in (
                "GITHUB_REPOSITORY",
                "GITHUB_SHA",
                "GITHUB_RUN_ID",
                "GITHUB_RUN_ATTEMPT",
                "GITHUB_RUN_NUMBER",
                "GITHUB_WORKFLOW",
                "GITHUB_REF",
                "ImageOS",
                "ImageVersion",
            )
            if key in os.environ
        },
    }


def write_checksums(output):
    entries = {}
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name not in {"checksums.json", "audit.json"}:
            entries[str(path.relative_to(output))] = sha256(path)
    write_json(output / "checksums.json", entries)
