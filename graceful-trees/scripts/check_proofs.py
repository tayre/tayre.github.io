"""Build the pinned Lean proofs and audit their transitive axiom dependencies."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1] / "formal"


def source_hashes(project):
    return {
        str(path.relative_to(project)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(project.rglob("*"))
        if path.is_file()
        and ".lake" not in path.relative_to(project).parts
        and (path.suffix in {".lean", ".toml", ".json", ".md"} or path.name == "lean-toolchain")
    }


def check(project, output, lake):
    project, output = Path(project).resolve(), Path(output).resolve()
    if output == project or output.is_relative_to(project):
        raise ValueError("proof reports must be outside the formal source directory")
    output.mkdir(parents=True, exist_ok=False)
    report = {
        "schema_version": 1,
        "passed": False,
        "started_at": datetime.now(UTC).isoformat(),
        "source_sha256": source_hashes(project),
        "allowed_axioms": ["propext", "Classical.choice", "Quot.sound"],
        "scope": "Model lemmas, construction arithmetic, search capacity bounds, conditional residual leaf allocation, one fixed rooted-branch obstruction, modular resource certificates, and universal exact vertex/edge permutation certificates for two equal-five-edge-leg spider formulas with interior extrema and complementation; not graph recognition/treehood, the abstract spider IsGraceful wrapper, Rofa's other four zero-position classes, the full conjecture, or Python code.",
    }

    def command(label, args):
        result = subprocess.run(
            [str(lake), *args],
            cwd=project,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=180,
        )
        (output / f"{label}.log").write_text(result.stdout)
        if result.returncode:
            raise RuntimeError(f"{label} failed; see {output / (label + '.log')}")
        return result.stdout.strip()

    try:
        for relative in report["source_sha256"]:
            target = output / "source" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(project / relative, target)
        expected = (project / "lean-toolchain").read_text().strip()
        report["toolchain"] = expected
        report["lean_version"] = command("version", ["env", "lean", "--version"])
        actual = command("short-version", ["env", "lean", "--short-version"])
        if expected != f"leanprover/lean4:v{actual}":
            raise RuntimeError(f"Lean version mismatch: {expected}, got {actual}")
        # Recompile project sources so cached .olean files cannot stand in for a build.
        command("clean", ["clean"])
        command("build", ["build"])
        audit = command("axioms", ["env", "lean", "-DwarningAsError=true", "Audit.lean"])
        marker = re.search(r"AXIOM_AUDIT_OK declarations=(\d+) theorems=(\d+)", audit)
        if marker is None or int(marker[2]) < 1:
            raise RuntimeError("missing axiom audit completion marker")
        report["declarations_checked"] = int(marker[1])
        report["theorems_checked_including_generated"] = int(marker[2])
        report["axiom_dependencies"] = {
            name: [axiom.strip() for axiom in axioms.split(",") if axiom.strip()]
            for name, axioms in re.findall(r"^CHECKED ([^:]+): \[([^\]]*)\]$", audit, re.MULTILINE)
        }
        if len(report["axiom_dependencies"]) != int(marker[2]):
            raise RuntimeError("incomplete theorem dependency report")
        if any(
            axiom not in report["allowed_axioms"]
            for axioms in report["axiom_dependencies"].values()
            for axiom in axioms
        ):
            raise RuntimeError("unexpected axiom in audit output")
        if source_hashes(project) != report["source_sha256"]:
            raise RuntimeError("proof source changed while checking")
        report["passed"] = True
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        report["error"] = str(exc)
    finally:
        report["finished_at"] = datetime.now(UTC).isoformat()
        (output / "proof-check.json").write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n"
        )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lake", default="lake", help="Lake executable from the pinned toolchain")
    parser.add_argument("--output", type=Path, required=True, help="new report directory")
    args = parser.parse_args()
    try:
        report = check(PROJECT, args.output, args.lake)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
