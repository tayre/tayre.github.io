"""Check the modular relaxation against definitions, tampering and false tables."""

import copy
import hashlib
import importlib.util
import itertools
import json
import subprocess
import sys
from pathlib import Path

import pytest

from graceful_research import residual_congruence, residual_congruence_verify
from graceful_research.residual_congruence import _solve, find_certificate
from graceful_research.residual_congruence_verify import verify_certificate

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "experiment_residual_congruence", PROJECT / "scripts/experiment_residual_congruence.py"
)
experiment_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experiment_module)
CORPUS = json.loads((PROJECT / "examples/residual-signatures.json").read_text())["inputs"]


def data(case):
    return {key: case[key] for key in ("unused", "differences", "components")}


def certificate():
    return find_certificate(**data(CORPUS[28]))["certificate"]


@pytest.mark.parametrize("modulus", [2, 3, 5, 7])
def test_finite_field_solver_matches_exhaustive_linear_systems(modulus):
    # Includes dependence, inconsistent equations, free variables and scaled pivots.
    vectors = list(itertools.product(range(modulus), repeat=2))
    for first in vectors:
        for second in ((0, 0), (1, 1), (modulus - 1, 1)):
            matrix = [first, second]
            for target in ((0, 0), (0, 1), (1, 0), (1, 1)):
                solutions = [
                    values
                    for values in vectors
                    if all(
                        sum(a * b for a, b in zip(row, values, strict=True)) % modulus
                        == rhs % modulus
                        for row, rhs in zip(matrix, target, strict=True)
                    )
                ]
                answer = _solve(matrix, target, 2, modulus)
                assert (answer is not None) == bool(solutions)
                if answer is not None:
                    assert tuple(answer) in solutions
    assert _solve([], [], 3, modulus) == [0, 0, 0]
    assert _solve([[]], [0], 0, modulus) == []
    assert _solve([[]], [1], 0, modulus) is None


def test_all_frozen_cases_against_global_permutation_oracle():
    totals = {"feasible": 0, "certificate": 0}
    missing, covered, nonempty = [], [], []
    for index, case in enumerate(CORPUS):
        result = find_certificate(**data(case))
        oracle = experiment_module.permutation_oracle(case)
        assert result["exact_completion_feasible"] == oracle["feasible"]
        assert result["scope"] == "fixed_residual_forest"
        assert "proof_certificate_verified" not in result
        totals["feasible"] += oracle["feasible"]
        if result["certificate"]:
            totals["certificate"] += 1
            assert not oracle["feasible"] and oracle["exhausted"]
            assert result["status"] == "certified_impossible_residual"
            assert verify_certificate(result["certificate"], expected_input=data(case))["valid"]
            if all(result["signature_counts"]):
                nonempty.append(index)
            if result["all_resources_covered"]:
                covered.append(index)
        else:
            assert result["status"] == "no_congruence_certificate_found"
            assert result["independent_check"] is None
            assert result["moduli_tried"] == [2, 3, 5, 7]
            if not oracle["feasible"]:
                assert oracle["exhausted"]
                missing.append(index)
    assert totals == {"feasible": 25, "certificate": 68}
    assert missing == [32, 50, 54, 55, 71, 72, 93, 95, 100]
    assert len(nonempty) == 21
    assert covered == [3, 28, 47, 70, 74, 91]


@pytest.mark.parametrize(
    "shapes", [[[-1]], [[-1, 0]], [[-1, 0, 1]], [[-1, 0, 0]], [[-1], [-1]], [[-1, 0], [-1]]]
)
def test_small_resource_subsets_never_exclude_a_completion(shapes):
    size = sum(map(len, shapes))
    components = [{"parent_label": 0, "parents": shape} for shape in shapes]
    for unused in itertools.combinations(range(1, 5), size):
        for differences in itertools.combinations(range(1, 5), size):
            case = {
                "unused": list(unused),
                "differences": list(differences),
                "components": components,
            }
            result = find_certificate(**case)
            oracle = experiment_module.permutation_oracle(case)
            assert result["exact_completion_feasible"] == oracle["feasible"]
            if oracle["feasible"]:
                assert result["certificate"] is None
            elif result["certificate"]:
                assert verify_certificate(result["certificate"], expected_input=case)["valid"]


def test_explicit_parity_support_and_instance_identity():
    result = find_certificate(**data(CORPUS[28]))
    assert result["coefficient_support"] == [
        {"kind": "branch", "instance": 0, "coefficient": 1},
        {"kind": "label", "value": 4, "coefficient": 1},
        {"kind": "difference", "value": 2, "coefficient": 1},
    ]
    assert result["all_resources_covered"]
    duplicated = find_certificate(**data(CORPUS[74]))
    assert CORPUS[74]["components"][0] == CORPUS[74]["components"][1]
    assert len(duplicated["certificate"]["coefficients"]["branches"]) == 3
    assert verify_certificate(duplicated["certificate"])["valid"]
    wrong = copy.deepcopy(duplicated["certificate"])
    del wrong["coefficients"]["branches"][0]
    assert not verify_certificate(wrong)["valid"]
    positive = find_certificate([1, 2], [1, 2], [{"parent_label": 0, "parents": [-1]}] * 2)
    assert positive["exact_completion_feasible"]
    assert positive["certificate"] is None


def test_resource_order_is_canonical_and_empty_residual_is_feasible():
    case = data(CORPUS[28])
    expected = find_certificate(**case)
    case["unused"] = list(reversed(case["unused"]))
    case["differences"] = list(reversed(case["differences"]))
    assert find_certificate(**case) == expected
    assert verify_certificate(expected["certificate"], expected_input=case)["valid"]
    result = find_certificate([], [], [])
    assert result["exact_completion_feasible"]
    assert result["certificate"] is None


@pytest.mark.parametrize("modulus", [0, 1, 4, 6, 9, 11, -2, True, 2.0, "2", None])
def test_checker_rejects_unsupported_or_malformed_modulus(modulus):
    proof = certificate()
    proof["modulus"] = modulus
    assert not verify_certificate(proof)["valid"]


@pytest.mark.parametrize("moduli", [[], [2, 2], [4], [2, 11], [True], [2.0], None, "2"])
def test_discovery_rejects_invalid_moduli(moduli):
    with pytest.raises(ValueError, match="moduli"):
        find_certificate(**data(CORPUS[28]), moduli=moduli)


@pytest.mark.parametrize(
    "name,value",
    [
        ("schema_version", 2),
        ("schema_version", True),
        ("kind", "whole_tree"),
        ("scope", "whole_tree"),
        ("target_residue", 0),
        ("target_residue", True),
        ("target_residue", 3),
        ("coefficients", {}),
        ("input", {}),
    ],
)
def test_certificate_metadata_tampering(name, value):
    proof = certificate()
    proof[name] = value
    assert not verify_certificate(proof)["valid"]


@pytest.mark.parametrize(
    "name,value",
    [
        ("branches", [1]),
        ("branches", [2, 0]),
        ("branches", [True, 0]),
        ("branches", [-1, 0]),
        ("labels", [0, 0, 0]),
        ("differences", [0, 1, 1]),
        ("differences", "010"),
    ],
)
def test_coefficient_tampering(name, value):
    proof = certificate()
    proof["coefficients"][name] = value
    assert not verify_certificate(proof)["valid"]


@pytest.mark.parametrize(
    "name,value",
    [
        ("unused", [1, 1, 5]),
        ("unused", [True, 4, 5]),
        ("unused", [-1, 4, 5]),
        ("unused", [1, 4]),
        ("unused", list(range(9))),
        ("differences", [1, 1, 3]),
        ("differences", [0, 2, 3]),
        ("differences", [1, 2, False]),
        ("components", None),
        ("components", [{"parent_label": 0, "parents": [-1, 0, 1, 2]}]),
        ("components", [{"parent_label": 0, "parents": [0, 0, 1]}]),
        ("components", [{"parent_label": 0, "parents": [-1, -1, 0]}]),
        ("components", [{"parent_label": 0, "parents": [-1, 1, 1]}]),
        ("components", [{"parent_label": True, "parents": [-1, 0, 1]}]),
        ("components", [{"parent_label": 1, "parents": [-1, 0, 1]}]),
        ("components", [{"parent_label": -1, "parents": [-1, 0, 1]}]),
    ],
)
def test_checker_independently_validates_input_bounds(name, value):
    proof = certificate()
    proof["input"][name] = value
    assert not verify_certificate(proof)["valid"]


def test_input_binding_and_untrusted_extra_table_are_rejected():
    proof = certificate()
    changed = copy.deepcopy(proof["input"])
    changed["components"][1]["parent_label"] = 3
    assert not verify_certificate(proof, expected_input=changed)["valid"]
    proof["signature_tables"] = []
    assert not verify_certificate(proof)["valid"]


def test_checker_regenerates_omitted_options_and_discovery_fails_closed(monkeypatch):
    # The input is feasible. Removing its sole column falsely permits branch weight 1.
    original = residual_congruence.complete_forest

    def omit_columns(*args):
        result = original(*args)
        result["signature_tables"] = [[]]
        result["signature_counts"] = [0]
        result["feasible"] = False
        return result

    monkeypatch.setattr(residual_congruence, "complete_forest", omit_columns)
    case = {"unused": [1], "differences": [1], "components": [{"parent_label": 0, "parents": [-1]}]}
    proof = {
        "schema_version": 1,
        "kind": "residual_congruence",
        "scope": "fixed_residual_forest",
        "input": case,
        "modulus": 2,
        "coefficients": {"branches": [1], "labels": [0], "differences": [0]},
        "target_residue": 1,
    }
    check = verify_certificate(proof)
    assert not check["valid"]
    assert check["valid_branch_options_checked"] == 1
    assert "nonzero weight" in check["errors"][0]
    with pytest.raises(RuntimeError, match="independent congruence checker rejected"):
        find_certificate(**case)


@pytest.mark.parametrize("modulus", [2, 3, 5, 7])
def test_checker_accepts_valid_certificates_in_each_supported_field(modulus):
    # A single impossible leaf has no options; its branch coefficient is a valid witness.
    case = {"unused": [1], "differences": [2], "components": [{"parent_label": 0, "parents": [-1]}]}
    result = find_certificate(**case, moduli=[modulus])
    assert result["certificate"]["modulus"] == modulus
    assert verify_certificate(result["certificate"], expected_input=case)["valid"]


def run_checker(path, checker=None):
    return subprocess.run(
        [
            sys.executable,
            "-S",
            str(checker or Path(residual_congruence_verify.__file__)),
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_standalone_checker_without_site_packages(tmp_path):
    path = tmp_path / "valid.json"
    path.write_text(json.dumps(certificate()))
    process = run_checker(tmp_path)
    assert process.returncode == 0, process.stderr
    assert json.loads(process.stdout)["certificates_checked"] == 1
    path.write_text("not valid JSON")
    process = run_checker(path)
    assert process.returncode == 1
    assert not json.loads(process.stdout)["valid"]
    path.write_bytes(b" " * (residual_congruence_verify.MAX_FILE_BYTES + 1))
    process = run_checker(path)
    assert process.returncode == 1
    assert "size limit" in json.loads(process.stdout)["results"][0]["errors"][0]


def test_complete_experiment_archive_rechecks_without_discovery(tmp_path):
    output = tmp_path / "run"
    summary = experiment_module.experiment(output)
    assert summary["cases"] == 102
    assert summary["exact_feasible"] == 25
    assert summary["residual_certificates_verified"] == 68
    assert summary["certified_with_all_resources_covered"] == [3, 28, 47, 70, 74, 91]
    assert len(summary["impossible_without_congruence_certificate"]) == 9
    assert summary["whole_tree_counterexamples"] == 0
    assert summary["all_oracles_agreed"]
    process = run_checker(output / "certificates", output / "residual_congruence_verify.py")
    assert process.returncode == 0, process.stderr
    recheck = json.loads(process.stdout)
    assert recheck["valid"] and recheck["certificates_checked"] == 68
    manifest = json.loads((output / "checksums.json").read_text())
    assert "source/src/graceful_research/residual_congruence.py" in manifest
    assert "source/tests/test_residual_congruence.py" in manifest
    assert "residual_congruence_verify.py" in manifest
    for name, digest in manifest.items():
        assert hashlib.sha256((output / name).read_bytes()).hexdigest() == digest
    with pytest.raises(FileExistsError):
        experiment_module.experiment(output)
