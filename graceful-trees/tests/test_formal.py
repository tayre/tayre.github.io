import importlib.util
import json
import os
import shutil
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("check_proofs", PROJECT / "scripts/check_proofs.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
LAKE = os.environ.get("GRACEFUL_LAKE")


def test_source_hashes_exclude_build_cache(tmp_path):
    (tmp_path / ".lake").mkdir()
    (tmp_path / ".lake" / "Fake.lean").write_text("cached file")
    (tmp_path / "Proof.lean").write_text("theorem valid : True := True.intro")
    assert set(checker.source_hashes(tmp_path)) == {"Proof.lean"}


def test_missing_compiler_cannot_claim_verified_proofs(tmp_path):
    report = checker.check(PROJECT / "formal", tmp_path / "report", tmp_path / "missing-lake")
    assert not report["passed"]
    assert "error" in report
    assert not json.loads((tmp_path / "report/proof-check.json").read_text())["passed"]


def test_proof_reports_cannot_overwrite_source_or_old_evidence(tmp_path):
    with pytest.raises(ValueError, match="outside"):
        checker.check(tmp_path, tmp_path / "output", "lake")
    (tmp_path / "existing").mkdir()
    with pytest.raises(FileExistsError):
        checker.check(PROJECT / "formal", tmp_path / "existing", "lake")


@pytest.mark.skipif(not LAKE, reason="set GRACEFUL_LAKE; exercised in the formal-proof CI job")
@pytest.mark.parametrize(
    "injection,error_log,expected",
    [
        ("theorem unfinished : True := by sorry\n", "build", "sorry"),
        ("axiom untrusted : False\n", "axioms", "Disallowed axiom untrusted"),
        ("theorem compiled : (1 : Nat) = 1 := by native_decide\n", "axioms", "Disallowed axiom"),
        ("theorem false_claim : (1 : Nat) = 2 := by decide\n", "build", "error"),
    ],
)
def test_real_checker_rejects_untrusted_or_false_proofs(tmp_path, injection, error_log, expected):
    project = tmp_path / "formal"
    shutil.copytree(PROJECT / "formal", project, ignore=shutil.ignore_patterns(".lake"))
    with (project / "Graceful/Basic.lean").open("a") as handle:
        handle.write("\n" + injection)
    output = tmp_path / "report"
    report = checker.check(project, output, LAKE)
    assert not report["passed"]
    assert expected in (output / f"{error_log}.log").read_text()
