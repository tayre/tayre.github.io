"""Selection and evidence boundaries for the scoped pendant-edge question."""

import copy
import time
from types import SimpleNamespace

import networkx as nx
import pytest

from graceful_research import focused_pendant as pendant
from graceful_research.config import Config
from graceful_research.solver import solve
from graceful_research.storage import Store
from graceful_research.trees import canonical_code, edge_orbits, features, graph_input, tree_id
from graceful_research.verify import verify_labeling


def case(graph):
    data = graph_input(graph)
    graph = nx.Graph(data["edges"])
    graph.add_nodes_from(range(data["n"]))
    code = canonical_code(graph)
    return {
        **data,
        "tree_id": tree_id(code),
        "canonical_code": code,
        "family": "fixture",
        "features": features(graph),
    }


TARGET_GRAPH = nx.Graph([(0, 1), (0, 4), (0, 6), (1, 2), (1, 3), (4, 5), (6, 7)])
MATCHING_GRAPH = nx.Graph([(0, 1), (1, 2), (0, 3), (3, 4), (0, 5), (5, 6)])
BROOM = nx.Graph([(0, 1), (0, 3), (0, 4), (1, 2)])
BROOM_LABELS = [0, 4, 2, 1, 3]  # Maximum difference on the internal edge (0, 1).


def attempt(data, identity, *, labels=None, edge=None, status=None, certified=False):
    restriction = {"kind": "extreme_edge", "edge": edge} if edge is not None else None
    return {
        "attempt_id": identity,
        "tree_id": data["tree_id"],
        "input": {key: data[key] for key in ("n", "edges")},
        "scope": "extreme_edge" if restriction else "graceful",
        "edge_key": "-".join(map(str, sorted(edge))) if edge is not None else "",
        "restriction": restriction,
        "labels": labels,
        "status": status or ("verified_graceful" if labels is not None else "unknown"),
        "proof_certificate_verified": certified,
    }


def test_selection_recomputes_structural_scope_and_keeps_small_controls():
    inputs = [case(nx.path_graph(n)) for n in range(2, 6)]
    target, known = case(TARGET_GRAPH), case(MATCHING_GRAPH)
    target["features"] = {"is_caterpillar": True, "is_lobster": False}
    target["family"] = "path"  # These saved descriptions must not decide eligibility.
    inputs += [target, known]
    store = SimpleNamespace(
        cases=lambda max_n: [row for row in reversed(inputs) if row["n"] <= max_n]
    )
    selected = pendant.candidates(store, controls_per_stratum=1)
    assert [row["focus_stratum"] for row in selected] == [
        pendant.TARGET,
        pendant.CONTROL_CATERPILLAR,
        pendant.CONTROL_MATCHING,
    ]
    assert selected[0]["matching_deficiency"] == 2
    assert selected[1]["n"] == 2
    assert selected[2]["matching_deficiency"] == 1
    assert pendant.describe(case(nx.path_graph(4)))["focus_stratum"] == pendant.CONTROL_CATERPILLAR


def test_fresh_samples_reproduce_inputs_and_do_not_claim_exhaustiveness():
    cases = [pendant.case_for_index(index, 71) for index in range(20)]
    assert cases == [pendant.case_for_index(index, 71) for index in range(20)]
    assert set(row["n"] for row in cases) == set(pendant.SAMPLE_SIZES)
    assert any(row["focus_stratum"] == pendant.TARGET for row in cases)
    assert all(row["features"]["is_lobster"] for row in cases)
    assert all(row["focus_generation"]["index"] == i for i, row in enumerate(cases))
    assert cases != [pendant.case_for_index(index, 72) for index in range(20)]


def test_expired_or_cancelled_selection_does_not_read_the_catalogue():
    def forbidden(**kwargs):
        raise AssertionError("expired selection read the catalogue")

    store = SimpleNamespace(cases=forbidden)
    assert pendant.candidates(store, deadline=time.monotonic() - 1) == []
    assert pendant.candidates(store, cancelled=lambda: True) == []


def test_settled_cases_are_skipped_before_structural_work(tmp_path, monkeypatch):
    store = Store(tmp_path / "research.sqlite", Config())
    try:
        target, control = case(TARGET_GRAPH), case(nx.path_graph(4))
        store.add_case(target)
        store.add_case(control)
        real_describe = pendant.describe

        def describe(data):
            assert data["tree_id"] != target["tree_id"]
            return real_describe(data)

        monkeypatch.setattr(pendant, "describe", describe)
        selected = pendant.candidates(store, exclude_ids=[target["tree_id"]])
        assert [row["tree_id"] for row in selected] == [control["tree_id"]]
    finally:
        store.close()


@pytest.mark.parametrize("index,seed", [(-1, 1), (1, -1), (True, 1), (1, 1.5)])
def test_invalid_sample_cursor_or_seed_rejected(index, seed):
    with pytest.raises(ValueError):
        pendant.case_for_index(index, seed)


def test_ordinary_witness_can_settle_pendant_support_without_an_extra_solve():
    data = case(nx.path_graph(4))
    record = attempt(data, 1, labels=[0, 3, 1, 2])
    result = pendant.profile(data, [record])
    assert result["status"] == "supported"
    assert result["ordinary_witness_attempt_ids"] == [1]
    assert len(result["orbits"]) == 1
    assert result["orbits"][0]["orbit_size"] == 2
    assert result["orbits"][0]["evidence_attempt_ids"] == [1]
    assert not pendant.pending_orbits(data, [record])
    assert result["whole_tree_counterexample"] is False
    assert result["novelty_claimed"] is False


def test_scoped_witness_does_not_replace_the_explicit_ordinary_witness_requirement():
    data = case(nx.path_graph(4))
    record = attempt(data, 1, labels=[0, 3, 1, 2], edge=[0, 1])
    result = pendant.profile(data, [record])
    assert result["orbits"][0]["status"] == "supported"
    assert result["status"] == "ordinary_witness_required"
    assert pendant.pending_orbits(data, [record]) == []


def test_all_orbit_evidence_is_required_for_a_negative_profile(monkeypatch):
    # Exercise the coverage/classification logic using a proof-checker seam.
    # These synthetic refutation records are NOT mathematical evidence about BROOM.
    data = case(BROOM)
    ordinary = attempt(data, 1, labels=BROOM_LABELS)
    assert verify_labeling(data["n"], data["edges"], BROOM_LABELS)["valid"]
    orbits = [row for row in edge_orbits(BROOM) if row["pendant"]]
    assert len(orbits) == 2
    negatives = [
        attempt(data, i + 2, edge=row["representative"], status="solver_infeasible", certified=True)
        for i, row in enumerate(orbits)
    ]
    checked = []

    def checker(record, **kwargs):
        checked.append(record["attempt_id"])
        return {"valid": True}

    monkeypatch.setattr(pendant, "verify_record", checker)
    partial = pendant.profile(data, [ordinary, negatives[0]])
    assert partial["status"] == "incomplete"
    complete = pendant.profile(data, [ordinary, *negatives])
    assert complete["status"] == "certified_restricted_counterexample"
    assert complete["whole_tree_counterexample"] is False
    assert set(checked) == {2, 3}
    assert not pendant.pending_orbits(data, [ordinary, *negatives])


def test_flags_and_uncertified_unsat_are_not_proofs():
    data = case(BROOM)
    ordinary = attempt(data, 1, labels=BROOM_LABELS)
    negative = attempt(data, 2, edge=[0, 3], status="solver_infeasible")
    assert pendant.profile(data, [ordinary, negative])["status"] == "uncertified"
    negative["proof_certificate_verified"] = True
    checked = pendant.profile(data, [ordinary, negative])
    assert checked["status"] == "integrity_error"
    assert any("proof check failed" in error for error in checked["errors"])


def test_contradictory_scoped_evidence_is_an_integrity_failure(monkeypatch):
    data = case(nx.path_graph(4))
    ordinary = attempt(data, 1, labels=[0, 3, 1, 2])
    negative = attempt(data, 2, edge=[0, 1], status="solver_infeasible", certified=True)
    monkeypatch.setattr(pendant, "verify_record", lambda *args, **kwargs: {"valid": True})
    result = pendant.profile(data, [ordinary, negative])
    assert result["status"] == "integrity_error"
    assert any("contradictory" in error for error in result["errors"])


def test_forged_tree_identity_is_rejected():
    data = case(nx.path_graph(4))
    data["tree_id"] = "f" * 64
    with pytest.raises(ValueError, match="identity"):
        pendant.profile(data, [])


def test_expired_proof_verification_stays_unresolved():
    data = case(BROOM)
    ordinary = attempt(data, 1, labels=BROOM_LABELS)
    negative = attempt(data, 2, edge=[0, 3], status="solver_infeasible", certified=True)
    result = pendant.profile(data, [ordinary, negative], deadline=time.monotonic() - 1)
    assert result["status"] == "incomplete"
    assert result["verification_timed_out"] is True
    assert result["errors"] == []


def test_oldest_incomplete_orbit_rotates_without_a_lifetime_cap():
    data = case(BROOM)
    ordinary = attempt(data, 1, labels=BROOM_LABELS)
    attempts = [ordinary] + [attempt(data, i, edge=[0, 3]) for i in range(2, 10)]
    attempts += [attempt(data, 10, edge=[1, 2], status="solver_infeasible")]
    rows = pendant.pending_orbits(data, attempts)
    assert [row["representative"] for row in rows] == [[0, 3], [1, 2]]
    assert [row["latest_attempt_id"] for row in rows] == [9, 10]
    assert [row["status"] for row in rows] == ["unknown", "uncertified"]


@pytest.mark.parametrize("tamper", ["input", "restriction", "edge_key", "scope", "labels"])
def test_cross_scope_or_invalid_witness_evidence_is_rejected(tamper):
    data = case(nx.path_graph(4))
    record = attempt(data, 1, labels=[0, 3, 1, 2], edge=[0, 1])
    if tamper == "input":
        record["input"] = graph_input(nx.star_graph(3))
    elif tamper == "restriction":
        record["restriction"]["edge"] = [0, 3]
    elif tamper == "edge_key":
        record["edge_key"] = "1-2"
    elif tamper == "scope":
        record["scope"] = "graceful"
    else:
        record["labels"] = [0, 0, 1, 2]
    result = pendant.profile(data, [record])
    assert result["status"] == "integrity_error"
    assert result["errors"]


def test_foreign_tree_evidence_is_not_counted():
    data = case(nx.path_graph(4))
    record = attempt(data, 1, labels=[0, 3, 1, 2])
    record["tree_id"] = case(nx.star_graph(3))["tree_id"]
    assert pendant.profile(data, [record])["status"] == "ordinary_witness_required"


def test_real_nonpendant_refutation_cannot_exclude_pendant_edges(tmp_path):
    data = case(nx.path_graph(4))
    ordinary = attempt(data, 1, labels=[0, 3, 1, 2])
    request = {
        "input": {key: data[key] for key in ("n", "edges")},
        "restriction": {"kind": "extreme_edge", "edge": [1, 2]},
        "seed": 19,
        "solver_seconds": 5,
        "directory": str(tmp_path),
        "backend": "sat",
        "constructive_search": False,
    }
    result = solve(request)
    assert result["status"] == "solver_infeasible" and result["proof_certificate_verified"]
    record = {
        **attempt(data, 2, edge=[1, 2], status="solver_infeasible"),
        **result,
    }
    result = pendant.profile(data, [ordinary, record])
    assert result["status"] == "supported"
    assert result["errors"] == []
    # Moving a real nonpendant refutation to a pendant restriction does not make
    # it evidence for that different formula.
    mismatched = copy.deepcopy(record)
    mismatched["restriction"]["edge"] = [0, 1]
    mismatched["edge_key"] = "0-1"
    assert pendant.profile(data, [ordinary, mismatched])["status"] == "integrity_error"
