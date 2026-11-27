"""Finite proof support and rejection of altered tables/boundary witnesses."""

import copy
import importlib.util
import json
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "mixed_core_tail_checker", PROJECT / "scripts/check_mixed_core_alpha_tail.py"
)
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)
EVIDENCE = json.loads((PROJECT / "examples/mixed-core-alpha-tail.json").read_text())


def test_finite_support_and_archived_boundary():
    result = CHECKER.verify_evidence(EVIDENCE)
    assert result["gap_four"]["anchor_count"] == 10
    assert result["gap_four"]["partition_checks"] == 100
    assert result["boundary"]["graceful"] and result["boundary"]["root_zero"]
    assert result["boundary"]["alpha_threshold"] == 19
    assert not result["infinite_theorem_machine_verified"]
    assert not result["lean_verified"]
    assert not result["new_solver_run"]


@pytest.mark.parametrize("change", ["missing", "extra", "duplicate", "wrong_gap"])
def test_rejects_incomplete_or_altered_anchor_table(change):
    data = copy.deepcopy(EVIDENCE)
    rows = data["gap_four"]["anchors"]
    if change == "missing":
        rows.pop()
    elif change == "extra":
        rows.append([3, 7, 0, 2, 3])  # Old row excluded by min(U,V)=1.
    elif change == "duplicate":
        rows.append(rows[0][:])
    else:
        rows[0][3] += 1
    with pytest.raises(ValueError):
        CHECKER.verify_evidence(data)


@pytest.mark.parametrize("change", ["graph", "root", "labels", "threshold"])
def test_rejects_invalid_boundary_evidence(change):
    data = copy.deepcopy(EVIDENCE)
    boundary = data["boundary"]
    if change == "graph":
        boundary["input"]["edges"][-1][0] = 9
    elif change == "root":
        boundary["root"] = 0
    elif change == "labels":
        boundary["labels"][0] = 0
    else:
        boundary["threshold"] = 20
    with pytest.raises(ValueError):
        CHECKER.verify_evidence(data)


def test_rejects_graceful_but_nonalpha_boundary_witness():
    data = copy.deepcopy(EVIDENCE)
    # Separate ordinary witness from the same archived Nov25 input request.
    data["boundary"]["labels"] = [
        27,
        0,
        8,
        14,
        20,
        1,
        6,
        23,
        24,
        2,
        19,
        3,
        5,
        9,
        22,
        13,
        26,
        18,
        25,
        16,
        10,
        11,
        15,
        21,
        12,
        7,
        17,
        4,
    ]
    with pytest.raises(ValueError, match="not alpha"):
        CHECKER.verify_evidence(data)
