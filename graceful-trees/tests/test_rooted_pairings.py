"""Definition-level checks for the bounded rooted Skolem pairing experiment."""

import itertools
import json
import runpy
from pathlib import Path

import pytest

from graceful_research.io import sha256
from graceful_research.rooted_pairings import classify, pairing_conditions, verify_completion
from graceful_research.verify import verify_labeling

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "experiment_rooted_pairings.py"
EXPERIMENT = runpy.run_path(str(SCRIPT))


def oracle(unused, internal, attachment, parents):
    return EXPERIMENT["permutation_oracle"](
        {"unused": unused, "internal": internal, "attachment": attachment, "parents": parents}
    )


def assert_against_oracle(unused, internal, attachment, parents):
    result = classify(unused, internal, attachment, parents)
    expected = oracle(unused, internal, attachment, parents)
    assert (result["pairable"], result["feasible"]) == (expected["pairable"], expected["feasible"])
    assert result["scope"] == "fixed_rooted_pairing_residual"
    assert result["complete_within_declared_bounds"]
    assert result["proof_certificate_verified"] is False
    if result["feasible"]:
        assert verify_completion(unused, internal, attachment, parents, result["placements"])
        assert EXPERIMENT["verify_placement"](
            {"unused": unused, "internal": internal, "attachment": attachment, "parents": parents},
            result["placements"],
        )
    else:
        assert result["placements"] == []
        assert expected["exhausted"]
    return result


def test_all_small_resource_splits_and_one_or_two_parents():
    # Exhaust this declared finite domain, not arbitrary resource sets.
    for branches in (1, 2):
        for unused in itertools.combinations(range(1, 6), 2 * branches):
            for internal in itertools.combinations(range(1, 6), branches):
                remaining = [d for d in range(1, 6) if d not in internal]
                for attachment in itertools.combinations(remaining, branches):
                    parent_choices = [[0] * branches]
                    if branches == 2:
                        parent_choices.append([0, 6])
                    for parents in parent_choices:
                        assert_against_oracle(unused, internal, attachment, parents)


def test_named_controls_and_eight_vertex_bound():
    cases = EXPERIMENT["cases"]()
    for case in cases:
        if case["kind"] == "known_control" or (
            len(case["parents"]) in (3, 4) and case.get("generation_mode") == "positive_control"
        ):
            result = assert_against_oracle(
                **{key: case[key] for key in EXPERIMENT["RESOURCE_KEYS"]}
            )
            if "expected" in case:
                assert result["classification"] == case["expected"]
    assert any(len(case["unused"]) == 8 for case in cases)


def test_nordh_conditions_are_necessary_not_sufficient():
    result = classify([1, 2, 4, 5], [1, 3], [2, 4], [0, 0])
    assert result["conditions"]["passes"]
    assert not result["pairable"]
    assert result["classification"] == "pairing_obstruction_beyond_conditions"
    assert pairing_conditions([1, 2], [2])["parity"] is False
    assert pairing_conditions([1, 2], [3])["density"] is False


def test_pairing_possible_but_attachment_resources_compete():
    result = classify([1, 2, 4, 6], [2, 5], [1, 6], [0, 0])
    assert result["pairable"] and result["pairing_count"] == 1
    assert result["pairings"] == [[[1, 6], [2, 4]]]
    assert result["classification"] == "attachment_obstruction"
    diagnostic = result["local_diagnostics"]
    assert diagnostic["passes_branch_and_attachment_checks"]
    assert diagnostic["missing_internal_differences"] == []
    assert diagnostic["missing_attachment_differences"] == []
    assert diagnostic["missing_unused_labels"] == [2]
    assert not diagnostic["passes_all_local_resource_checks"]


def test_joint_conflict_can_survive_all_local_resource_checks():
    result = assert_against_oracle([1, 4, 5, 6, 7, 8], [1, 4, 6], [2, 3, 5], [0, 9, 9])
    assert result["classification"] == "attachment_obstruction"
    diagnostic = result["local_diagnostics"]
    assert diagnostic["passes_all_local_resource_checks"]
    assert diagnostic["sufficient"] is False
    # Parent 0 forces root 5; the other attachment differences force roots 6,7.
    # No remaining leaf 1,4,8 can form an allowed internal difference at root 6.
    assert not {abs(6 - leaf) for leaf in (1, 4, 8)} & {1, 4, 6}


def test_unavailable_attachment_is_reported_separately():
    result = classify([1, 2], [1], [3], [0])
    diagnostic = result["local_diagnostics"]
    assert not diagnostic["all_branches_have_options"]
    assert diagnostic["missing_attachment_differences"] == [3]
    assert not diagnostic["passes_branch_and_attachment_checks"]


def test_local_option_tables_are_complete_for_their_stated_relaxation():
    for case in EXPERIMENT["cases"]():
        result = classify(**{key: case[key] for key in EXPERIMENT["RESOURCE_KEYS"]})
        diagnostic = result["local_diagnostics"]
        for index, table in enumerate(diagnostic["branch_tables"]):
            expected = {
                (x, y, abs(x - y), abs(case["parents"][index] - x))
                for x, y in itertools.permutations(case["unused"], 2)
                if abs(x - y) in case["internal"]
                and abs(case["parents"][index] - x) in case["attachment"]
            }
            actual = {
                (*option["labels"], option["internal_difference"], option["attachment_difference"])
                for option in table["options"]
            }
            assert actual == expected and len(table["options"]) == len(expected)
        if result["feasible"]:
            assert diagnostic["passes_all_local_resource_checks"]


def test_a_real_tree_residual_reconstructs_an_independently_verified_labeling():
    unused, internal, attachment, parents = [0, 3, 4, 6], [1, 6], [2, 5], [1, 2]
    result = classify(unused, internal, attachment, parents)
    labels = [None, None, 1, 5, 2, None, None]
    for vertices, row in zip(([1, 0], [5, 6]), result["placements"], strict=True):
        for vertex, value in zip(vertices, row, strict=True):
            labels[vertex] = value
    assert verify_labeling(7, [[i, i + 1] for i in range(6)], labels)["valid"]
    # Combining the two difference sets would conceal this role error.
    assert not verify_completion(unused, attachment, internal, parents, result["placements"])


def test_case56_tree_has_a_graceful_completion_when_the_difference_split_is_relaxed():
    # The closed assigned region uses labels 0,9,10,2,3 and differences 7..10.
    # This explicit full witness changes the internal/attachment split only.
    labels = [0, 9, 10, 2, 3, 1, 7, 4, 6, 5, 8]
    edges = [
        [0, 1],
        [0, 2],
        [2, 3],
        [2, 4],
        [0, 5],
        [5, 6],
        [1, 7],
        [7, 8],
        [1, 9],
        [9, 10],
    ]
    assert verify_labeling(11, edges, labels)["valid"]
    placements = [[1, 7], [4, 6], [5, 8]]
    assert verify_completion([1, 4, 5, 6, 7, 8], [2, 3, 6], [1, 4, 5], [0, 9, 9], placements)
    assert not verify_completion([1, 4, 5, 6, 7, 8], [1, 4, 6], [2, 3, 5], [0, 9, 9], placements)


def test_all_returned_pairings_use_each_resource_once_and_are_unique():
    for case in EXPERIMENT["cases"]():
        result = classify(**{key: case[key] for key in EXPERIMENT["RESOURCE_KEYS"]})
        assert len({tuple(tuple(pair) for pair in pairs) for pairs in result["pairings"]}) == len(
            result["pairings"]
        )
        for pairs in result["pairings"]:
            assert sorted(value for pair in pairs for value in pair) == sorted(case["unused"])
            assert sorted(abs(x - y) for x, y in pairs) == sorted(case["internal"])


def test_empty_completion_and_input_order_invariance():
    result = classify([], [], [], [])
    assert result["feasible"] and result["pairable"] and result["placements"] == []
    assert classify([1, 2, 4, 6], [2, 5], [1, 4], [0, 0]) == classify(
        [6, 2, 4, 1], [5, 2], [4, 1], [0, 0]
    )


@pytest.mark.parametrize(
    "unused,internal,attachment,parents",
    [
        (None, [], [], []),
        ([], None, [], []),
        ([], [], None, []),
        ([], [], [], None),
        ([True, 2], [1], [2], [0]),
        ([1, 2], [False], [2], [0]),
        ([1, 2], [1], [True], [0]),
        ([1, 2], [1], [2], [False]),
        ([-1, 2], [1], [2], [0]),
        ([1, 2], [0], [2], [0]),
        ([1, 2], [1], [0], [0]),
        ([1, 2], [1], [2], [-1]),
        ([1, 1], [1], [2], [0]),
        ([1, 2, 3, 4], [1, 1], [2, 3], [0, 0]),
        ([1, 2, 3, 4], [1, 2], [3, 3], [0, 0]),
        ([1, 2], [1], [1], [0]),
        ([1, 2], [1], [2], [1]),
        ([1, 2], [1], [], [0]),
        ([1, 2], [1], [2], []),
        ([1, 2, 3], [1], [2], [0]),
        (list(range(1, 11)), list(range(1, 6)), list(range(6, 11)), [0] * 5),
        ([1, 2, 3, 4, 5, 6], [1, 2, 3], [4, 5, 6], [0, 7, 8]),
    ],
)
def test_invalid_resources_are_rejected(unused, internal, attachment, parents):
    with pytest.raises(ValueError):
        classify(unused, internal, attachment, parents)


@pytest.mark.parametrize("placements", [None, [], [[1]], [[1, 1]], [[True, 2]], [[1, 2, 3]]])
def test_verifier_rejects_malformed_or_incomplete_placements(placements):
    assert not verify_completion([1, 2], [1], [2], [0], placements)


def test_corpus_is_deterministic_and_duplicate_free_with_explicit_generation_bias():
    cases = EXPERIMENT["cases"]()
    assert cases == EXPERIMENT["cases"]()
    assert len(cases) == len({case["case_id"] for case in cases}) == 82
    assert sum(1 + len(case.get("duplicate_proposals", [])) for case in cases) == 89
    assert {len(case["parents"]) for case in cases} == {1, 2, 3, 4}
    for case in cases:
        if case.get("construction_witness") is not None:
            assert EXPERIMENT["verify_placement"](case, case["construction_witness"])


def test_experiment_preserves_inputs_oracle_results_and_checksums(tmp_path, monkeypatch):
    function = EXPERIMENT["experiment"]
    # Exercise all archive/report paths with the five independently specified controls.
    monkeypatch.setitem(function.__globals__, "cases", lambda: EXPERIMENT["cases"]()[:5])
    output = tmp_path / "experiment"
    summary = function(output)
    assert summary["cases"] == 5 and summary["all_oracles_agreed"]
    assert summary["negative_proof_certificates"] == 0
    assert summary["novelty_claimed"] is False
    assert len(json.loads((output / "inputs.json").read_text())) == 5
    checksums = json.loads((output / "checksums.json").read_text())
    for path, expected in checksums.items():
        assert sha256(output / path) == expected
    assert "not a nongraceful tree" in (output / "report.md").read_text()
    with pytest.raises(FileExistsError):
        function(output)
