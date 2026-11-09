"""Scoped root probes must not import unsafe complement symmetry breaking."""

import importlib.util
import json
from pathlib import Path

import networkx as nx
import pytest
from google.protobuf import text_format

from graceful_research import rooted_spiders
from graceful_research.io import sha256
from graceful_research.rooted_spiders import rooted_model, solve_rooted, spider, verify_rooted
from graceful_research.trees import graph_input
from graceful_research.verify import verify_labeling

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "experiment_spider_roots", PROJECT / "scripts/experiment_spider_roots.py"
)
experiment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(experiment)


def test_spider_inputs_and_orbit_representatives():
    cases = experiment.cases()
    assert len(cases) == 41
    targets = cases[:6]
    assert [case["legs"] for case in targets] == list(range(3, 9))
    for case in cases[:30]:
        graph = nx.Graph(case["input"]["edges"])
        assert nx.is_tree(graph)
        assert case["input"]["n"] == 4 * case["legs"] + 1
        assert nx.shortest_path_length(graph, 0, case["root"]) == case["root_distance"]
        assert len({case["solver_seed"] for case in cases}) == len(cases)
    assert experiment.cases() == cases


@pytest.mark.parametrize("value", ([], [0], [True], [1.5], [256], "3"))
def test_spider_invalid_lengths(value):
    with pytest.raises(ValueError):
        spider(value)


def test_prescribed_zero_can_violate_the_old_complement_inequality():
    # Forcing x[0] < x[1] here would incorrectly declare the root infeasible.
    result = solve_rooted(2, [[0, 1]], 1, seed=1, seconds=1)
    assert result["status"] == "verified_graceful"
    assert result["labels"] == [1, 0]
    assert result["verification"]["root_valid"]
    assert not result["complement_break"]
    assert result["symmetry_level"] == 0


def test_model_is_order_independent_and_has_no_hints():
    data, _ = spider([1, 2, 2])
    first, _ = rooted_model(**data, root=3)
    second, _ = rooted_model(data["n"], [edge[::-1] for edge in data["edges"][::-1]], 3)
    assert text_format.MessageToString(first.proto) == text_format.MessageToString(second.proto)
    assert not first.proto.HasField("solution_hint")


def test_every_root_of_every_tree_through_six_matches_permutation_oracle():
    negatives = 0
    for n in range(1, 7):
        trees = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
        for graph in trees:
            data = graph_input(graph)
            for root in range(n):
                oracle = experiment.permutation_oracle(**data, root=root)
                result = solve_rooted(**data, root=root, seed=441, seconds=2)
                if oracle["feasible"]:
                    assert result["status"] == "verified_graceful"
                    assert verify_rooted(**data, labels=result["labels"], root=root)["valid"]
                else:
                    negatives += 1
                    assert result["status"] == "solver_infeasible"
                    assert result["scope"] == "prescribed_zero"
                    assert not result["proof_certificate_verified"]
                    assert oracle["exhausted"]
    assert negatives > 0


def test_tiny_control_has_an_oracle_checked_unsupported_root():
    data, _ = spider([1, 1, 3])
    unsupported = []
    for root in range(data["n"]):
        oracle = experiment.permutation_oracle(**data, root=root)
        if not oracle["feasible"]:
            unsupported.append(root)
    assert unsupported == [3]


def test_root_check_is_additional_to_full_gracefulness():
    labels = [0, 3, 1, 2]
    edges = [[0, 1], [1, 2], [2, 3]]
    assert verify_labeling(4, edges, labels)["valid"]
    assert verify_rooted(4, edges, labels, 0)["valid"]
    assert not verify_rooted(4, edges, labels, 1)["valid"]
    assert not verify_rooted(4, edges, [0, 0, 0, 0], 0)["valid"]
    assert not verify_rooted(4, edges, None, 0)["valid"]


def test_solver_cannot_bypass_independent_rejection(monkeypatch):
    monkeypatch.setattr(
        rooted_spiders,
        "verify_rooted",
        lambda *args: {"valid": False, "errors": ["test rejection"]},
    )
    result = solve_rooted(2, [[0, 1]], 1, seed=1, seconds=1)
    assert result["status"] == "invalid_solution"
    assert not result["proof_certificate_verified"]


def test_zero_budget_is_unknown_and_never_calls_solver(monkeypatch, tmp_path):
    from ortools.sat.python import cp_model

    def unexpected(*args):
        raise AssertionError("zero allowance invoked solver")

    monkeypatch.setattr(cp_model.CpSolver, "solve", unexpected)
    result = solve_rooted(2, [[0, 1]], 1, seed=1, seconds=0, directory=tmp_path)
    assert result["status"] == "unknown"
    assert result["termination"] == "budget_exhausted_before_solver"
    assert result["labels"] is None
    assert not result["proof_certificate_verified"]
    assert (tmp_path / "model.pbtxt").exists()
    assert not (tmp_path / "response.pbtxt").exists()


@pytest.mark.parametrize("root", (-1, 2, True, None, "0"))
def test_invalid_roots(root):
    with pytest.raises(ValueError, match="root"):
        solve_rooted(2, [[0, 1]], root, seed=1)


@pytest.mark.parametrize("seconds", (-1, float("inf"), float("nan"), True))
def test_invalid_allowances(seconds):
    with pytest.raises(ValueError, match="seconds"):
        solve_rooted(2, [[0, 1]], 0, seed=1, seconds=seconds)


@pytest.mark.parametrize("seed", (-1, 2**31, True, "1"))
def test_invalid_seeds(seed):
    with pytest.raises(ValueError, match="seed"):
        solve_rooted(2, [[0, 1]], 0, seed=seed)


def test_invalid_tree_cannot_enter_rooted_solver():
    with pytest.raises(ValueError, match="tree"):
        solve_rooted(3, [[0, 1], [0, 1]], 0, seed=1)


def test_experiment_preserves_inputs_models_oracles_and_checksums(tmp_path, monkeypatch):
    original = experiment.cases()
    controls = [case for case in original if case["kind"] == "permutation_control"]
    monkeypatch.setattr(experiment, "cases", lambda: controls)
    output = tmp_path / "run"
    summary = experiment.experiment(output, attempt_seconds=1, budget_seconds=20)
    assert summary["cases"] == 11
    assert summary["outcomes"] == {"verified_graceful": 10, "solver_infeasible": 1}
    assert all(row["permutation_oracle"] for row in summary["records"])
    assert summary["negative_proof_certificates"] == 0
    assert not summary["general_theorem_proved"]
    assert (output / "figures/root-orbit-coverage.svg").exists()
    assert (output / "figures/root-orbit-coverage.png").exists()
    coverage = json.loads((output / "figures/root-orbit-coverage.json").read_text())
    assert coverage["finite_cases_only"]
    assert coverage["records"] == []  # Tiny controls are not length-four root orbits.
    for path, expected in json.loads((output / "checksums.json").read_text()).items():
        assert sha256(output / path) == expected
    with pytest.raises(FileExistsError):
        experiment.experiment(output)


def test_total_budget_skips_without_negative_claim(tmp_path, monkeypatch):
    cases = [experiment.cases()[0]]
    monkeypatch.setattr(experiment, "cases", lambda: cases)

    def unexpected(*args, **kwargs):
        raise AssertionError("exhausted experiment invoked solver")

    monkeypatch.setattr(experiment, "solve_rooted", unexpected)
    summary = experiment.experiment(tmp_path / "budget", budget_seconds=1e-12)
    assert summary["outcomes"] == {"not_run_budget_limit": 1}
    assert summary["negative_proof_certificates"] == 0


def test_tiny_oracle_refuses_large_cases():
    with pytest.raises(ValueError):
        experiment.permutation_oracle(9, [[i, i + 1] for i in range(8)], 0)


def test_coverage_cannot_show_green_for_a_wrong_root(tmp_path):
    case = experiment.cases()[0]
    result = solve_rooted(**case["input"], root=case["root"], seed=1, seconds=2)
    assert result["status"] == "verified_graceful"
    case["root"] = 0
    with pytest.raises(ValueError, match="invalid root witness"):
        experiment.write_coverage(tmp_path, [{"input": case, "result": result}])
