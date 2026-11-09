"""Independent whole-tree checks of the formula, separate from its proof."""

import random
from functools import partial

import pytest

from graceful_research.spider_construction import (
    five_edge_spider_depth_two_zero,
    five_edge_spider_internal_zero,
    midpoint_zero_spider,
)
from graceful_research.verify import verify_labeling

CONSTRUCTORS = [
    midpoint_zero_spider,
    five_edge_spider_depth_two_zero,
    five_edge_spider_internal_zero,
    partial(five_edge_spider_internal_zero, root_distance=3),
]


def check_witness(witness):
    result = verify_labeling(
        witness["n"], witness["edges"], witness["labels"], witness.get("restriction")
    )
    assert result["valid"], result["errors"]
    assert witness["labels"][witness["root"]] == 0
    # Check the requested graph and position independently of the formula.
    expected_edges = []
    length = witness["leg_length"]
    for leg in range(witness["legs"]):
        chain = [0, *(length * leg + offset for offset in range(1, length + 1))]
        expected_edges.extend([u, v] for u, v in zip(chain, chain[1:], strict=False))
    assert witness["edges"] == expected_edges
    assert witness["root"] == length * witness["root_leg"] + witness["root_distance"]


@pytest.mark.parametrize("construct", CONSTRUCTORS)
def test_every_leg_count_through_one_thousand(construct):
    for legs in range(1, 1001):
        check_witness(construct(legs))


@pytest.mark.parametrize("construct", CONSTRUCTORS)
def test_every_supported_root_of_small_spiders(construct):
    for legs in range(1, 17):
        for root_leg in range(legs):
            check_witness(construct(legs, root_leg=root_leg))


@pytest.mark.parametrize("construct", CONSTRUCTORS)
def test_certificate_remains_valid_after_arbitrary_vertex_renumbering(construct):
    witness = construct(17, root_leg=12)
    permutation = list(range(witness["n"]))
    random.Random(20261109).shuffle(permutation)
    labels = [None] * witness["n"]
    for vertex, label in enumerate(witness["labels"]):
        labels[permutation[vertex]] = label
    edges = [[permutation[v], permutation[u]] for u, v in reversed(witness["edges"])]
    assert verify_labeling(witness["n"], edges, labels)["valid"]
    assert labels[permutation[witness["root"]]] == 0


@pytest.mark.parametrize("construct", CONSTRUCTORS)
def test_independent_verifier_rejects_a_corrupted_difference(construct):
    witness = construct(3)
    labels = witness["labels"].copy()
    labels[1], labels[3] = labels[3], labels[1]
    result = verify_labeling(witness["n"], witness["edges"], labels)
    assert result["tree_valid"]
    assert result["vertex_labels_valid"]
    assert not result["valid"]


@pytest.mark.parametrize("construct", CONSTRUCTORS)
@pytest.mark.parametrize("legs", [0, -1, True, 1.5, "3", None])
def test_reject_invalid_leg_counts(legs, construct):
    with pytest.raises(ValueError, match="legs"):
        construct(legs)


@pytest.mark.parametrize("construct", CONSTRUCTORS)
@pytest.mark.parametrize("root_leg", [-1, 3, True, 1.5, "0", None])
def test_reject_invalid_root_legs(root_leg, construct):
    with pytest.raises(ValueError, match="root_leg"):
        construct(3, root_leg=root_leg)


@pytest.mark.parametrize("construct", CONSTRUCTORS)
@pytest.mark.parametrize("max_vertices", [0, -1, True, 4.5, "100", None])
def test_reject_invalid_allocation_limits(max_vertices, construct):
    with pytest.raises(ValueError, match="max_vertices"):
        construct(3, max_vertices=max_vertices)


@pytest.mark.parametrize("construct", CONSTRUCTORS)
def test_allocation_limit_is_checked_before_construction(construct):
    with pytest.raises(ValueError, match="exceeds max_vertices"):
        construct(10**100)
    with pytest.raises(ValueError, match="exceeds max_vertices"):
        construct(3, max_vertices=12)
    check_witness(construct(3, max_vertices=16))


@pytest.mark.parametrize("root_distance", [0, 1, 4, True, 2.0, "2", None])
def test_reject_invalid_internal_root_distances(root_distance):
    with pytest.raises(ValueError, match="root_distance"):
        five_edge_spider_internal_zero(3, root_distance=root_distance)


def test_internal_complement_moves_zero_and_preserves_every_edge_weight():
    for legs in (1, 2, 3, 17, 1000):
        first = five_edge_spider_internal_zero(legs, root_distance=2)
        second = five_edge_spider_internal_zero(legs, root_distance=3)
        assert first["edges"] == second["edges"]
        assert second["labels"] == [5 * legs - value for value in first["labels"]]
        assert first["labels"][3] == second["labels"][2] == 5 * legs
        assert first["labels"][2] == second["labels"][3] == 0
