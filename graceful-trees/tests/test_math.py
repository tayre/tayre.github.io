import itertools
import random

import networkx as nx
import pytest
from ortools.sat.python import cp_model

from graceful_research.config import FAMILIES
from graceful_research.solver import build_model, solve
from graceful_research.trees import (
    canonical_code,
    edge_orbits,
    generate_family,
    graph_input,
    tree_id,
)
from graceful_research.verify import verify_certificate, verify_labeling, verify_tree


def small_trees(max_n):
    yield nx.empty_graph(1)
    for n in range(2, max_n + 1):
        yield from nx.nonisomorphic_trees(n)


def permutation_oracle(graph, edge=None):
    """No model constraints, symmetry assumptions, or production verifier calls."""
    n = len(graph)
    for labels in itertools.permutations(range(n)):
        differences = [abs(labels[u] - labels[v]) for u, v in graph.edges]
        if sorted(differences) == list(range(1, n)):
            if edge is None or abs(labels[edge[0]] - labels[edge[1]]) == n - 1:
                return labels
    return None


@pytest.mark.parametrize("graph", list(small_trees(6)))
@pytest.mark.parametrize(
    "complement,redundant", [(False, False), (True, False), (False, True), (True, True)]
)
def test_model_agrees_with_exhaustive_permutations(graph, complement, redundant):
    data = graph_input(graph)
    for edge in [None] + [o["representative"] for o in edge_orbits(graph)]:
        restriction = {"kind": "extreme_edge", "edge": edge} if edge else None
        model, variables = build_model(
            **data, complement_break=complement, redundant_sum=redundant, restriction=restriction
        )
        solver = cp_model.CpSolver()
        solver.parameters.num_search_workers = 1
        solver.parameters.symmetry_level = 0
        solver.parameters.max_time_in_seconds = 5
        status = solver.solve(model)
        expected = permutation_oracle(graph, edge)
        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE, cp_model.INFEASIBLE)
        assert (status != cp_model.INFEASIBLE) == (expected is not None)
        if expected is not None:
            assert verify_labeling(
                **data, labels=[solver.value(v) for v in variables], restriction=restriction
            )["valid"]


@pytest.mark.parametrize("n", range(2, 9))
def test_canonical_codes_match_free_tree_counts_and_relabelings(n):
    expected_counts = {2: 1, 3: 1, 4: 2, 5: 3, 6: 6, 7: 11, 8: 23}
    codes = []
    for graph in nx.nonisomorphic_trees(n):
        code = canonical_code(graph)
        codes.append(code)
        for seed in range(3):
            shuffled = list(range(n))
            random.Random(seed).shuffle(shuffled)
            relabeled = nx.relabel_nodes(graph, dict(enumerate(shuffled)))
            assert canonical_code(relabeled) == code
            assert tree_id(canonical_code(relabeled)) == tree_id(code)
    assert len(set(codes)) == expected_counts[n]


@pytest.mark.parametrize("graph", list(small_trees(7)))
def test_edge_orbit_encoding_matches_enumerated_automorphisms(graph):
    automorphisms = list(nx.isomorphism.GraphMatcher(graph, graph).isomorphisms_iter())
    for orbit in edge_orbits(graph):
        u, v = orbit["representative"]
        independently_found = {tuple(sorted((m[u], m[v]))) for m in automorphisms}
        assert independently_found == {tuple(e) for e in orbit["edges"]}


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("n", [1, 2, 3, 10, 36, 75])
def test_families_are_reproducible_trees(family, n):
    first = graph_input(generate_family(family, n, 123))
    assert first == graph_input(generate_family(family, n, 123))
    assert first["n"] == n
    assert not verify_tree(**first)


@pytest.mark.parametrize(
    "n,edges,labels",
    [
        (1, [], [0]),
        (2, [[0, 1]], [0, 1]),
        (4, [[0, 1], [1, 2], [2, 3]], [0, 3, 1, 2]),
    ],
)
def test_valid_witnesses(n, edges, labels):
    assert verify_labeling(n, edges, labels)["valid"]


@pytest.mark.parametrize(
    "n,edges,labels",
    [
        (0, [], []),
        (True, [], [0]),
        (1, [], [False]),
        (1, [], [0.0]),
        (2, [[0, 1]], [0, 0]),
        (2, [[0, 1]], [0, 2]),
        (2, [[0, 1]], [-1, 0]),
        (2, [[0, 1]], ["0", 1]),
        (2, [[0, 1]], [0]),
        (2, [[0, 1]], {"0": 0, "1": 1}),
        (3, [[0, 1], [1, 2]], [0, 1, 2]),
        (3, [[0, 1], [1, 0]], [0, 1, 2]),
        (3, [[0, 1], [2, 2]], [0, 1, 2]),
        (3, [[0, 1], [1, 3]], [0, 1, 2]),
        (3, [[0, 1], [1, False]], [0, 1, 2]),
        (4, [[0, 1], [1, 2], [2, 0]], [0, 3, 1, 2]),
        (3, [None, [0, 1]], [0, 1, 2]),
        (1000000000, [], []),
    ],
)
def test_invalid_witnesses_rejected(n, edges, labels):
    assert not verify_labeling(n, edges, labels)["valid"]


def test_restriction_checked_separately():
    certificate = {"n": 4, "edges": [[0, 1], [1, 2], [2, 3]], "labels": [0, 3, 1, 2]}
    assert verify_certificate(certificate)["valid"]
    assert not verify_certificate(
        {**certificate, "restriction": {"kind": "extreme_edge", "edge": [1, 2]}}
    )["valid"]
    assert not verify_certificate(
        {**certificate, "restriction": {"kind": "extreme_edge", "edge": [0, 3]}}
    )["valid"]
    assert not verify_certificate({**certificate, "restriction": {"kind": "unknown"}})["valid"]


def test_solver_statuses_and_proof_scope(tmp_path):
    base = {
        "input": {"n": 4, "edges": [[0, 1], [1, 2], [2, 3]]},
        "seed": 17,
        "solver_seconds": 5,
        "directory": str(tmp_path),
        "complement_break": True,
        "redundant_sum": True,
        "restriction": None,
    }
    positive = solve(base)
    assert positive["status"] == "verified_graceful"
    assert positive["verification"]["valid"]
    restricted = solve({**base, "restriction": {"kind": "extreme_edge", "edge": [1, 2]}})
    assert restricted["status"] == "solver_infeasible"
    assert restricted["raw_status"] == "INFEASIBLE"
    assert restricted["labels"] is None
    assert restricted["proof_certificate_verified"] is False
    assert (tmp_path / "model.pbtxt").exists()
    assert "symmetry_level: 0" in (tmp_path / "parameters.pbtxt").read_text()


def test_model_rejects_non_tree():
    with pytest.raises(ValueError):
        build_model(3, [[0, 1], [1, 2], [2, 0]])
