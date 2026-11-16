#!/usr/bin/env python3
"""Create a new documentary workspace. Never overwrite an existing destination."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil

FRAMEWORK = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--title", default="")
    args = parser.parse_args()
    dest = args.destination.expanduser().resolve()
    if dest == FRAMEWORK or FRAMEWORK in dest.parents:
        parser.error("Choose a project directory outside the framework folder.")
    if dest.exists():
        parser.error("Destination already exists; no files were changed.")
    dest.mkdir(parents=True, exist_ok=False)
    shutil.copytree(FRAMEWORK, dest / "framework",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
    folders = ["production", "research", "assets/originals", "assets/derivatives",
               "audio/narration", "audio/music", "audio/stems", "blender/scenes",
               "blender/scripts", "blender/data", "edit", "renders", "masters",
               "exports", "qc", "checkpoints"]
    for folder in folders:
        (dest / folder).mkdir(parents=True, exist_ok=True)
    copies = {
        "project-brief.json": "production/brief.json",
        "sources.csv": "research/sources.csv",
        "claims.csv": "research/claims.csv",
        "assets.csv": "assets/register.csv",
        "pronunciations.csv": "audio/pronunciations.csv",
        "sequence-plan.csv": "production/sequence-plan.csv",
        "review-log.csv": "production/review-log.csv",
        "timeline.json": "edit/timeline.json",
        "RECOVERY.md": "production/RECOVERY.md",
        "project-AGENTS.md": "AGENTS.md",
        "project.gitignore": ".gitignore",
    }
    for source, target in copies.items():
        shutil.copy2(FRAMEWORK / "templates" / source, dest / target)
    brief_path = dest / "production/brief.json"
    brief = json.loads(brief_path.read_text())
    brief["title"] = args.title
    brief_path.write_text(json.dumps(brief, indent=2) + "\n")
    (dest / "production/decisions.md").write_text(
        "# Production decisions\n\nRecord dated choices, their reasons and accepted scope.\n")
    files = {}
    for path in sorted((dest / "framework").rglob("*")):
        if path.is_file():
            files[str(path.relative_to(dest / "framework"))] = hashlib.sha256(path.read_bytes()).hexdigest()
    (dest / "framework-snapshot.json").write_text(json.dumps({
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "files_sha256": files,
    }, indent=2) + "\n")
    print(f"Created {dest}")
    print("Next: complete production/brief.json, then read framework/SKILL.md.")


if __name__ == "__main__":
    main()
