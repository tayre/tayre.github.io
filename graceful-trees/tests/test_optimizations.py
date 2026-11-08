"""Cross-check fast paths against independent graph algorithms and saved evidence."""

import json
import random
from dataclasses import replace

import networkx as nx
import pytest
from test_system import small_config

from graceful_research.analysis import summarize
from graceful_research.audit import audit_run
from graceful_research.config import FAMILIES
from graceful_research.constructive import caterpillar_labeling
from graceful_research.runner import run
from graceful_research.solver import solve
from graceful_research.trees import features, generate_family, graph_input, tree_diameter
from graceful_research.verify import verify_labeling


def check_construction(graph):
    data = graph_input(graph)
    labels = caterpillar_labeling(**data)
    # The independent structural criterion is not used by the construction.
    core = graph.copy()
    core.remove_nodes_from([v for v, degree in graph.degree if degree == 1])
    expected = len(core) <= 1 or max(dict(core.degree).values()) <= 2
    assert (labels is not None) == expected
    if labels is not None:
        assert verify_labeling(**data, labels=labels)["valid"]
        if len(graph) > 1:
            largest = next(
                e for e in data["edges"] if abs(labels[e[0]] - labels[e[1]]) == len(graph) - 1
            )
            assert any(graph.degree(v) == 1 for v in largest)


@pytest.mark.parametrize("n", range(1, 11))
def test_fast_algorithms_on_every_small_tree(n):
    graphs = [nx.empty_graph(1)] if n == 1 else nx.nonisomorphic_trees(n)
    for graph in graphs:
        check_construction(graph)
        assert tree_diameter(graph) == nx.diameter(graph)


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("n", [3, 12, 35, 75, 256])
def test_fast_algorithms_on_large_reordered_inputs(family, n):
    for seed in range(3):
        graph = generate_family(family, n, seed)
        rng = random.Random(seed)
        nodes = list(range(n))
        rng.shuffle(nodes)
        relabeled = nx.relabel_nodes(graph, dict(enumerate(nodes)))
        check_construction(relabeled)
        data = graph_input(relabeled)
        rng.shuffle(data["edges"])
        data["edges"] = [list(reversed(edge)) for edge in data["edges"]]
        labels = caterpillar_labeling(**data)
        if labels is not None:
            assert verify_labeling(**data, labels=labels)["valid"]
        assert features(relabeled)["diameter"] == nx.diameter(graph)


def test_fast_algorithms_reject_non_trees():
    with pytest.raises(ValueError, match="invalid tree"):
        caterpillar_labeling(4, [[0, 1], [1, 2], [2, 0]])
    with pytest.raises(ValueError, match="requires a tree"):
        tree_diameter(nx.cycle_graph(4))


def request(tmp_path, **changes):
    return {
        "input": graph_input(nx.path_graph(4)),
        "seed": 23,
        "solver_seconds": 2,
        "directory": str(tmp_path),
        "restriction": None,
        "complement_break": True,
        "redundant_sum": True,
        "constructive_search": True,
        **changes,
    }


def test_constructed_witness_has_honest_method_and_independent_verification(tmp_path):
    result = solve(request(tmp_path))
    assert result["status"] == "verified_graceful"
    assert result["search_method"] == "caterpillar-construction"
    assert result["verification"]["valid"]
    assert result["labels"][0] < result["labels"][1]
    assert not result["proof_certificate_verified"]
    assert not result["timed_out"]
    assert not {"branches", "solver_wall_seconds", "model_sha256"} & result.keys()
    assert (tmp_path / "construction.json").exists()
    assert not (tmp_path / "model.pbtxt").exists()


@pytest.mark.parametrize("legacy_request", [False, True])
def test_construction_can_be_disabled_and_old_requests_replay_exact_solver(
    tmp_path, legacy_request
):
    data = request(tmp_path, constructive_search=False)
    if legacy_request:
        data.pop("constructive_search")
    result = solve(data)
    assert result["status"] == "verified_graceful"
    assert result["search_method"] == "cp-sat"
    assert (tmp_path / "model.pbtxt").exists()
    assert not (tmp_path / "construction.json").exists()


def test_restricted_negative_control_still_uses_exact_solver(tmp_path):
    result = solve(request(tmp_path, restriction={"kind": "extreme_edge", "edge": [1, 2]}))
    assert result["status"] == "solver_infeasible"
    assert result["search_method"] == "cp-sat"
    assert not result["proof_certificate_verified"]


def test_non_caterpillar_falls_back_to_exact_solver(tmp_path):
    graph = nx.Graph([(0, 1), (0, 2), (0, 3), (1, 4), (2, 5), (3, 6)])
    assert caterpillar_labeling(**graph_input(graph)) is None
    result = solve(request(tmp_path, input=graph_input(graph)))
    assert result["search_method"] == "cp-sat"
    assert result["status"] == "verified_graceful"
    assert result["verification"]["valid"]


def test_invalid_construction_is_not_hidden_by_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr("graceful_research.solver.caterpillar_labeling", lambda n, edges: [0] * n)
    result = solve(request(tmp_path))
    assert result["status"] == "invalid_solution"
    assert not result["verification"]["valid"]


def test_constructed_witnesses_do_not_bias_solver_outliers():
    def record(i, branches=None):
        result = {
            "tree_id": str(i),
            "scope": "graceful",
            "family": "exhaustive",
            "input": {"n": 10},
            "status": "verified_graceful",
            "search_method": "caterpillar-construction" if branches is None else "cp-sat",
        }
        if branches is not None:
            result.update(branches=branches, solver_wall_seconds=0.5)
        return result

    records = [record(i) for i in range(10)] + [record(i, 100) for i in range(10, 15)]
    summary = summarize(records)
    assert summary["outliers"] == []
    assert summary["families"][0]["solved_median_branches"] == 100
    assert summary["families"][0]["solved_median_seconds"] == 0.5
    assert summary["search_methods"] == {"caterpillar-construction": 10, "cp-sat": 5}


def test_enabling_construction_resumes_without_rewriting_history(tmp_path):
    original = small_config(max_cases=5, constructive_search=False, probe_max_attempts=0)
    updated = replace(original, constructive_search=True)
    assert original.generation_fingerprint() == updated.generation_fingerprint()
    before, after = tmp_path / "before", tmp_path / "after"
    run(original, before)
    run(updated, after, resume=before / "research.sqlite")
    first = json.loads((before / "progress.json").read_text())
    second = json.loads((after / "progress.json").read_text())
    assert second["history"][:-1] == first["history"]
    assert second["cumulative"]["trees"] == 10
    assert audit_run(before)["valid"]
    assert audit_run(after)["valid"]
    records = [json.loads(line) for line in (after / "attempts.jsonl").read_text().splitlines()]
    assert all(record["request"]["constructive_search"] for record in records)
    assert any(record["search_method"] == "caterpillar-construction" for record in records)
