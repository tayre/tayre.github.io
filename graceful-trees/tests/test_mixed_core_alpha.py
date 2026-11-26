"""Check the saved finite proof and rejection of changed claims/evidence."""

import copy
import gzip
import importlib.util
import json
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "mixed_core_checker", PROJECT / "scripts/check_mixed_core_alpha.py"
)
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)
EVIDENCE = json.loads((PROJECT / "examples/mixed-core-alpha-obstruction.json").read_text())
CERTIFICATE = PROJECT / "examples/mixed-core-alpha-certificate.json.gz"


def verify(path):
    tree = EVIDENCE["input"]
    return CHECKER.verify_certificate(tree["n"], tree["edges"], EVIDENCE["root"], path)


def mutated_certificate(tmp_path, mutate):
    data = json.loads(gzip.decompress(CERTIFICATE.read_bytes()))
    mutate(data)
    path = tmp_path / "changed.json.gz"
    path.write_bytes(gzip.compress(json.dumps(data).encode(), mtime=0))
    return path


def test_saved_positive_and_negative_evidence():
    result = CHECKER.verify_evidence(EVIDENCE, CERTIFICATE)
    assert result["ordinary_graceful_witness"]["root_zero"]
    assert not result["ordinary_graceful_witness"]["alpha_with_zero_root"]
    negative = result["rooted_alpha_exclusion"]
    assert negative["custom_finite_certificate_verified"]
    assert negative["pattern_count"] == 14860
    assert negative["rejection_counts"] == {
        "repeat": 7976,
        "isolated_label": 6660,
        "isolated_difference": 223,
        "hall": 1,
    }


@pytest.mark.parametrize("change", ["missing", "duplicate", "false_hall", "false_repeat"])
def test_rejects_bad_certificate_even_without_transport_hash(tmp_path, change):
    def mutate(data):
        if change == "missing":
            data["rows"].pop()
        elif change == "duplicate":
            data["rows"].append(copy.deepcopy(data["rows"][0]))
        elif change == "false_hall":
            row = next(row for row in data["rows"] if row[1][0] == "hall")
            row[1][2] = []
        else:
            row = next(row for row in data["rows"] if row[1][0] == "repeat")
            row[1] = ["repeat", 0, 1]  # Distinct high labels on d-c and d-C.

    with pytest.raises(ValueError):
        verify(mutated_certificate(tmp_path, mutate))


@pytest.mark.parametrize("change", ["graph", "root", "witness", "hash"])
def test_rejects_changed_evidence_scope_or_witness(change):
    data = copy.deepcopy(EVIDENCE)
    if change == "graph":
        data["input"]["edges"][-1][0] = 9
    elif change == "root":
        data["root"] = 0
    elif change == "witness":
        data["ordinary_labels"][0] = 0
    else:
        data["certificate"]["sha256"] = "0" * 64
    with pytest.raises(ValueError):
        CHECKER.verify_evidence(data, CERTIFICATE)
