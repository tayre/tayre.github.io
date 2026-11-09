"""Primal/dual certificates have exact, distinct meanings and reject tampering."""

import copy
import importlib.util
import itertools
import json
import subprocess
import sys
from pathlib import Path

import pytest

from graceful_research.residual_relaxations import discover
from graceful_research.residual_relaxations_verify import verify_certificate

PROJECT = Path(__file__).resolve().parents[1]
CORPUS = json.loads((PROJECT / "examples/residual-signatures.json").read_text())["inputs"]
HARD = (32, 50, 54, 55, 71, 72, 93, 95, 100)


def data(index):
    return {key: CORPUS[index][key] for key in ("unused", "differences", "components")}


def cover(kind, assignments):
    return {
        "schema_version": 1,
        "scope": "fixed_residual_forest",
        "kind": kind,
        "input": data(32),
        "terms": [
            {"branch": branch, "labels": labels, "numerator": numerator, "denominator": denominator}
            for branch, labels, numerator, denominator in assignments
        ],
    }


INTEGER = cover(
    "signed_integer_cover",
    [(0, [2, 3, 5], -1, 1), (0, [3, 1, 2], 1, 1), (0, [5, 2, 3], 1, 1), (1, [4, 5], 1, 1)],
)
RATIONAL = cover(
    "nonnegative_rational_cover",
    [(0, [4, 2, 3], 1, 2), (0, [5, 1, 3], 1, 2), (1, [1, 4], 1, 2), (1, [5, 2], 1, 2)],
)
SEPARATOR = {
    "schema_version": 1,
    "scope": "fixed_residual_forest",
    "kind": "nonnegative_separator",
    "input": data(54),
    "weights": {"branches": [0, 0, 0], "labels": [0, 0, 0, 0, 1], "differences": [0, 0, 0, -1, -1]},
}


@pytest.mark.parametrize("certificate", [INTEGER, RATIONAL, SEPARATOR])
def test_exact_examples(certificate):
    check = verify_certificate(certificate, expected_input=certificate["input"])
    assert check["valid"] and check["valid_options_checked"] > 0


def test_integer_and_rational_are_not_completion_witnesses():
    case = data(32)
    count = 0
    for labels in itertools.permutations(case["unused"]):
        count += 1
        a, b, c, d, e = labels
        assert sorted([a, abs(a - b), abs(a - c), d, abs(d - e)]) != case["differences"]
    assert count == 120
    assert (
        verify_certificate(INTEGER)["conclusion"]
        == "integer_lattice_membership_excludes_all_modular_functionals"
    )
    assert verify_certificate(RATIONAL)["conclusion"] == "nonnegative_rational_relaxation_feasible"


@pytest.mark.parametrize("index", HARD)
def test_all_nine_have_exact_signed_covers(index):
    result = discover(**data(index), kind="signed_integer_cover", seconds=5)
    assert result["certificate"] is not None
    assert verify_certificate(result["certificate"], expected_input=data(index))["valid"]


@pytest.mark.parametrize("index", [i for i in HARD if i != 32])
def test_eight_have_exact_separators(index):
    result = discover(**data(index), kind="nonnegative_separator", seconds=5)
    assert result["certificate"] is not None
    assert verify_certificate(result["certificate"], expected_input=data(index))["valid"]


def test_half_integral_discovery_is_exact():
    result = discover(**data(32), kind="nonnegative_rational_cover", seconds=5)
    assert result["certificate"] is not None
    assert verify_certificate(result["certificate"])["valid"]


@pytest.mark.parametrize(
    "kind", ["signed_integer_cover", "nonnegative_rational_cover", "nonnegative_separator"]
)
def test_zero_budget_is_not_a_negative_relaxation_claim(kind, tmp_path):
    result = discover(**data(32), kind=kind, seconds=0, directory=tmp_path)
    assert result["certificate"] is None
    assert result["raw_discovery_status"] == "NOT_STARTED"
    assert result["status"] == "no_certificate_found_within_bounds"
    assert (tmp_path / "model.pbtxt").exists()


@pytest.mark.parametrize(
    "mutation",
    [
        lambda c: c.update(schema_version=True),
        lambda c: c.update(scope="whole_tree"),
        lambda c: c.update(columns=[]),
        lambda c: c["terms"].pop(),
        lambda c: c["terms"][0].update(numerator=True),
        lambda c: c["terms"][0].update(denominator=2),
        lambda c: c["terms"][0].update(labels=[2, 2, 5]),
        lambda c: c["terms"][0].update(branch=2),
        lambda c: c["input"]["components"][0].update(parent_label=1),
        lambda c: c["input"].update(unused=[1, 1, 3, 4, 5]),
    ],
)
def test_bad_signed_cover_rejected(mutation):
    certificate = copy.deepcopy(INTEGER)
    mutation(certificate)
    assert not verify_certificate(certificate)["valid"]


@pytest.mark.parametrize(
    "mutation",
    [
        lambda c: c["terms"][0].update(numerator=-1),
        lambda c: c["terms"][0].update(denominator=0),
        lambda c: c["terms"][0].update(denominator=3),
        lambda c: c["terms"][0].update(labels=[4, 1, 2]),
    ],
)
def test_bad_fractional_cover_rejected(mutation):
    certificate = copy.deepcopy(RATIONAL)
    mutation(certificate)
    assert not verify_certificate(certificate)["valid"]


def test_separator_regenerates_missing_options_instead_of_trusting_columns():
    certificate = copy.deepcopy(SEPARATOR)
    certificate["weights"]["labels"][4] = 0
    # Target remains negative, but a local option using5or6 has negative weight.
    checked = verify_certificate(certificate)
    assert not checked["valid"]
    assert checked["valid_options_checked"] > 0
    assert "negative weight" in checked["errors"][0]
    certificate = copy.deepcopy(SEPARATOR)
    certificate["weights"]["labels"][4] = 2
    assert not verify_certificate(certificate)["valid"]  # target iszero


def test_strict_weight_and_input_binding():
    certificate = copy.deepcopy(SEPARATOR)
    certificate["weights"]["labels"][0] = True
    assert not verify_certificate(certificate)["valid"]
    assert not verify_certificate(SEPARATOR, expected_input=data(32))["valid"]
    assert not verify_certificate(None)["valid"]
    assert not verify_certificate({"kind": []})["valid"]


def test_standalone_checker_needs_no_site_packages(tmp_path):
    for index, certificate in enumerate((INTEGER, RATIONAL, SEPARATOR)):
        (tmp_path / f"{index}.json").write_text(json.dumps(certificate))
    checker = PROJECT / "src/graceful_research/residual_relaxations_verify.py"
    result = subprocess.run(
        [sys.executable, "-S", str(checker), str(tmp_path)],
        text=True,
        capture_output=True,
        check=True,
    )
    report = json.loads(result.stdout)
    assert report["valid"] and report["certificates_checked"] == 3
    (tmp_path / "broken.json").write_text("{}")
    bad = subprocess.run(
        [sys.executable, "-S", str(checker), str(tmp_path)], text=True, capture_output=True
    )
    assert bad.returncode == 1 and not json.loads(bad.stdout)["valid"]


@pytest.mark.parametrize(
    "options", [{"seconds": -1}, {"seconds": float("nan")}, {"seed": True}, {"kind": "unknown"}]
)
def test_discovery_parameters_are_validated(options):
    kwargs = {"kind": "signed_integer_cover", **options}
    with pytest.raises(ValueError):
        discover(**data(32), **kwargs)


def test_frozen_experiment_oracle_rechecks_known_negative():
    spec = importlib.util.spec_from_file_location(
        "residual_relaxation_experiment", PROJECT / "scripts/experiment_residual_relaxations.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    oracle = module.permutation_oracle(data(32))
    assert oracle == {
        "feasible": False,
        "exhausted": True,
        "assignments_checked": 120,
        "labels": None,
    }
