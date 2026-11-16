#!/usr/bin/env python3
"""Inspect tool availability and project disk headroom without starting production."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def version(executable, flag):
    binary = shutil.which(executable)
    if not binary:
        return {"available": False, "requested": executable}
    try:
        result = subprocess.run([binary, flag], capture_output=True, text=True, timeout=15)
        lines = (result.stdout + result.stderr).splitlines()
        return {"available": result.returncode == 0, "path": binary,
                "version": lines[0] if lines else "", "returncode": result.returncode}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"available": False, "path": binary, "error": str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--require", nargs="*", choices=["blender", "ffmpeg", "ffprobe"], default=[])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = args.project.expanduser().resolve()
    brief = json.loads((root / "production/brief.json").read_text())
    reserve = float(brief["limits"]["protected_free_gib"])
    if reserve < 0:
        parser.error("protected_free_gib must be nonnegative")
    free = shutil.disk_usage(root).free / 2**30
    tools = {name: version(executable, flag) for name, executable, flag in [
        ("blender", args.blender, "--version"), ("ffmpeg", "ffmpeg", "-version"),
        ("ffprobe", "ffprobe", "-version")]}
    missing = [name for name in args.require if not tools[name]["available"]]
    report = {
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "python": sys.version.split()[0], "cpu_count": os.cpu_count(),
        "free_gib": round(free, 2), "protected_free_gib": reserve,
        "disk_reserve_passed": free >= reserve, "tools": tools,
        "missing_required_tools": missing,
        "account_usage": "unknown; check through the active account's live tool",
        "render_started": False,
        "scope": "Tool availability and current disk reserve only; not a render benchmark or delivery certification.",
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        target = args.output if args.output.is_absolute() else root / args.output
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    print(text, end="")
    return 1 if missing or free < reserve else 0


if __name__ == "__main__":
    raise SystemExit(main())
