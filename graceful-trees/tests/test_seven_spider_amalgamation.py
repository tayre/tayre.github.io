"""The finite seeds and graph witnesses must satisfy independent checks."""

import copy

import pytest
from test_cloud import load_script

from graceful_research.verify import verify_labeling

check = load_script("check_seven_spider_amalgamation")


def test_seed_claims_and_known_ten_edge_control():
    check.check_alpha(check.TEN_EDGE_CONTROL, 4, 5, 7)
    check.check_alpha(check.ENDPOINT_SEED, 3, 0, 6)
    for depth, labels in check.SEEDS.items():
        check.check_alpha(labels, 6, 7, 7 + depth)
        assert labels[0] + labels[-1] == 21
        with pytest.raises(ValueError, match="incorrect seed pair"):
            check.check_alpha(labels, 6, 7, 8)


@pytest.mark.parametrize("k", [1, 2, 3, 4, 5, 10, 31])
def test_every_vertex_of_small_spiders_and_adjacent_partner(k):
    for leg in range(k):
        for depth in range(8):
            data = check.construct(k, depth, leg)
            assert check.verify(data, k, depth, leg)["valid"]
            assert verify_labeling(**data)["valid"]
            counterpart = check.construct(k, depth ^ 1, leg)
            assert counterpart["labels"] == [7 * k - x for x in data["labels"]]


@pytest.mark.parametrize("mutation", ["labels", "edges", "disconnected", "position"])
def test_checker_rejects_corrupted_witness_and_scope(mutation):
    data = copy.deepcopy(check.construct(3, 2))
    if mutation == "labels":
        data["labels"][0] = data["labels"][1]
    elif mutation == "edges":
        data["edges"][0] = data["edges"][1]
    elif mutation == "disconnected":
        data["edges"][0] = [1, 7]
    with pytest.raises(ValueError):
        check.verify(data, 3, 4 if mutation == "position" else 2, 0)


@pytest.mark.parametrize("args", [(0, 0, 0), (True, 0, 0), (2, 8, 0), (2, 2, 2)])
def test_reject_invalid_construction_scope(args):
    with pytest.raises(ValueError):
        check.construct(*args)
