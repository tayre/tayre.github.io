"""Independent matching, quotient, reconstruction and bounded-search checks."""

import importlib.util
import itertools
import json
import random
from pathlib import Path
from types import SimpleNamespace

import networkx as nx
import pytest

from graceful_research import matching_lift
from graceful_research.io import sha256
from graceful_research.trees import graph_input
from graceful_research.verify import verify_labeling, verify_tree

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "matching_experiment", PROJECT / "scripts/experiment_matching_lift.py"
)
experiment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experiment)


def permutation_witness(data):
    return next(
        list(labels)
        for labels in itertools.permutations(range(data["n"]))
        if verify_labeling(**data, labels=labels)["valid"]
    )


@pytest.mark.parametrize("n", range(1, 11))
def test_every_small_tree_matching_quotient_and_lift(n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        data = graph_input(graph)
        matching = matching_lift.perfect_matching(**data)
        oracle = nx.max_weight_matching(graph, maxcardinality=True)
        assert (matching is not None) == (2 * len(oracle) == n)
        if matching is None:
            assert matching_lift.contract_matching(**data) is None
            continue
        assert {tuple(pair) for pair in matching} == {tuple(sorted(pair)) for pair in oracle}
        contraction = matching_lift.contract_matching(**data, matching=matching)
        core = contraction["core_input"]
        mapping = contraction["vertex_to_core"]
        assert not verify_tree(**core)
        assert core["n"] * 2 == n
        assert set(map(tuple, core["edges"])) == {
            tuple(sorted((mapping[u], mapping[v])))
            for u, v in data["edges"]
            if mapping[u] != mapping[v]
        }
        labels = matching_lift.lift_labeling(
            **data, core_labels=permutation_witness(core), matching=matching
        )
        assert verify_labeling(**data, labels=labels)["valid"]
        assert all(labels[u] + labels[v] == n - 1 for u, v in matching)
        assert sorted(abs(labels[u] - labels[v]) for u, v in matching) == list(range(1, n, 2))


@pytest.mark.parametrize("seed", range(5))
def test_arbitrary_pair_orientations_and_reordered_edges(seed):
    rng = random.Random(seed)
    base = nx.path_graph(5)
    expanded = experiment.expand_pairs(base, rng)
    data = graph_input(expanded)
    original = matching_lift.contract_matching(**data)
    shuffled = data["edges"].copy()
    rng.shuffle(shuffled)
    shuffled = [edge[::-1] for edge in shuffled]
    reversed_matching = [pair[::-1] for pair in reversed(original["matching"])]
    alternate = matching_lift.contract_matching(data["n"], shuffled, reversed_matching)
    assert alternate == original
    core_labels = permutation_witness(original["core_input"])
    labels = matching_lift.lift_labeling(**data, core_labels=core_labels)
    assert (
        matching_lift.lift_labeling(data["n"], shuffled, core_labels, reversed_matching) == labels
    )
    assert verify_labeling(**data, labels=labels)["valid"]


@pytest.mark.parametrize("n", (2, 4, 8, 16, 32, 64, 128))
def test_recursive_path_contraction_reaches_singleton(n):
    data = graph_input(nx.path_graph(n))
    result = matching_lift.search(**data, seed=7, seconds=30)
    assert result["termination"] == "witness"
    assert result["contraction_depth"] == n.bit_length() - 1
    assert result["core_input"] == {"n": 1, "edges": []}
    assert result["core_method"] == "caterpillar-construction"
    assert result["nodes"] == 0
    assert result["work_units"] <= result["max_work"]
    assert verify_labeling(**data, labels=result["labels"])["valid"]
    assert all(level["lift_verification"]["valid"] for level in result["levels"])
    assert not result["search_complete"] and not result["tree_infeasibility_claimed"]


def test_absence_of_matching_is_only_nonapplicability():
    result = matching_lift.search(**graph_input(nx.star_graph(7)), seed=3, seconds=30)
    assert result["termination"] == "no_perfect_matching"
    assert result["has_perfect_matching"] is False
    assert result["labels"] is None
    assert not result["tree_infeasibility_claimed"]
    assert "status" not in result


def test_singleton_witness_does_not_claim_a_perfect_matching():
    result = matching_lift.search(1, [], seed=0, seconds=30)
    assert result["labels"] == [0]
    assert result["has_perfect_matching"] is False


@pytest.mark.parametrize("labels", ([0, 0, 0, 0], [0, 1, 2, 3], [True, 3, 1, 2], [0, 3, 1]))
def test_invalid_contree_witness_is_rejected(labels):
    # This expansion's core is a four-vertex path, up to presentation.
    data = graph_input(nx.path_graph(8))
    with pytest.raises(ValueError, match="contree witness"):
        matching_lift.lift_labeling(**data, core_labels=labels)


@pytest.mark.parametrize(
    "matching", ([], [[0, 1], [1, 2]], [[0, 2], [1, 3]], [[0, True], [2, 3]], [[0, 1], [2, 9]])
)
def test_invalid_matching_is_rejected(matching):
    with pytest.raises(ValueError, match="matching"):
        matching_lift.contract_matching(**graph_input(nx.path_graph(4)), matching=matching)


@pytest.mark.parametrize(
    "function", (matching_lift.perfect_matching, matching_lift.contract_matching)
)
def test_malformed_tree_is_rejected(function):
    with pytest.raises(ValueError, match="invalid tree"):
        function(4, [[0, 1], [1, 2], [2, 0]])


@pytest.mark.parametrize(
    "limits,reason",
    [
        ({"seconds": 0}, "time_limit"),
        ({"max_work": 0}, "work_limit"),
        ({"max_work": 5}, "work_limit"),
    ],
)
def test_empty_and_insufficient_budgets_never_return_unverified_labels(limits, reason):
    result = matching_lift.search(**graph_input(nx.path_graph(8)), seed=1, **limits)
    assert result["termination"] == reason
    assert result["labels"] is None
    assert result["work_units"] <= result["max_work"]
    assert not result["search_complete"]


def test_deadline_applies_during_contraction(monkeypatch):
    ticks = itertools.count()
    monkeypatch.setattr(
        matching_lift, "time", SimpleNamespace(monotonic=lambda: next(ticks) / 1000)
    )
    result = matching_lift.search(**graph_input(nx.path_graph(128)), seed=3, seconds=0.005)
    assert result["termination"] == "time_limit"
    assert result["labels"] is None and result["nodes"] == 0


def noncaterpillar_expansion():
    core = nx.Graph([(0, 1), (1, 2), (0, 3), (3, 4), (0, 5), (5, 6)])
    return graph_input(experiment.expand_pairs(core, random.Random(11)))


def test_core_search_receives_only_remaining_budget_and_keeps_scope(monkeypatch):
    calls = []

    def bounded(**kwargs):
        calls.append(kwargs)
        return {"labels": None, "nodes": kwargs["max_nodes"], "termination": "node_limit"}

    monkeypatch.setattr(matching_lift, "frontier_search", bounded)
    result = matching_lift.search(**noncaterpillar_expansion(), seed=19, seconds=30, max_work=1000)
    assert len(calls) == 1
    assert calls[0]["n"] == 7
    assert 0 < calls[0]["seconds"] < 30
    assert 0 < calls[0]["max_nodes"] < 1000
    assert result["work_units"] + result["reconstruction_work_reserved"] == 1000
    assert result["termination"] == "core_node_limit"
    assert result["labels"] is None
    assert not result["tree_infeasibility_claimed"]


def test_core_candidate_requires_independent_verification(monkeypatch):
    monkeypatch.setattr(
        matching_lift,
        "frontier_search",
        lambda **kwargs: {"labels": [0] * 7, "nodes": 1, "termination": "witness"},
    )
    with pytest.raises(RuntimeError, match="invalid witness"):
        matching_lift.search(**noncaterpillar_expansion(), seed=1, seconds=30)


def test_reconstruction_deadline_discards_a_partial_core_witness(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(matching_lift, "time", SimpleNamespace(monotonic=lambda: clock[0]))

    def solve_at_deadline(n, edges, **kwargs):
        witness = permutation_witness({"n": n, "edges": edges})
        clock[0] = 2.0
        return {"labels": witness, "nodes": 1, "termination": "witness"}

    monkeypatch.setattr(matching_lift, "frontier_search", solve_at_deadline)
    result = matching_lift.search(**noncaterpillar_expansion(), seed=1, seconds=1)
    assert result["termination"] == "time_limit"
    assert result["labels"] is None


def test_node_bounded_replay_is_identical_except_elapsed_time():
    data = noncaterpillar_expansion()
    results = [matching_lift.search(**data, seed=17, seconds=30, max_nodes=2000) for _ in range(2)]

    def strip(value):
        if isinstance(value, dict):
            return {k: strip(v) for k, v in value.items() if k not in ("wall_seconds", "seconds")}
        return [strip(v) for v in value] if isinstance(value, list) else value

    assert strip(results[0]) == strip(results[1])
    assert verify_labeling(**data, labels=results[0]["labels"])["valid"]


@pytest.mark.parametrize(
    "options",
    (
        {"seconds": float("nan")},
        {"seconds": True},
        {"max_work": -1},
        {"max_nodes": True},
        {"seed": "bad"},
    ),
)
def test_invalid_limits_rejected(options):
    with pytest.raises(ValueError):
        matching_lift.search(1, [], **{"seed": 1, **options})


def test_corpus_is_fixed_unique_and_contains_declared_orders():
    first, second = experiment.cases(), experiment.cases()
    assert first == second
    assert len({case["tree_id"] for case in first}) == len(first)
    generated = [case for case in first if case["kind"] == "matching_rich_generated"]
    assert {case["input"]["n"] for case in generated} == {32, 64, 128}
    assert {case["expansions"] for case in generated} == {1, 2}
    assert all(matching_lift.perfect_matching(**case["input"]) is not None for case in generated)


def test_experiment_saves_reproducible_complete_evidence(tmp_path, monkeypatch):
    chosen = experiment.cases()[:5]
    monkeypatch.setattr(experiment, "cases", lambda: chosen)
    output = tmp_path / "run"
    result = experiment.experiment(output, seconds=1)
    assert result["cases"] == 5 and result["verified_witnesses"] == 4
    assert result["whole_tree_negative_claims"] == 0
    assert not result["performance_claimed"]
    assert (output / "source/src/graceful_research/matching_lift.py").exists()
    for name, expected in json.loads((output / "checksums.json").read_text()).items():
        assert sha256(output / name) == expected
    with pytest.raises(FileExistsError):
        experiment.experiment(output)
