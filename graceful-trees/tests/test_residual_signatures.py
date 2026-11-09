"""Definition-level oracles for the experimental branch compatibility tables."""

import itertools
import random

import pytest

from graceful_research.leaf_tail import complete_leaf_tail
from graceful_research.residual_signatures import complete_forest
from graceful_research.verify import verify_labeling


def direct_check(unused, differences, components, placements):
    if len(components) != len(placements):
        return False
    flattened = [label for row in placements for label in row]
    if sorted(flattened) != sorted(unused):
        return False
    actual = []
    for component, row in zip(components, placements, strict=True):
        if len(row) != len(component["parents"]):
            return False
        for index, parent in enumerate(component["parents"]):
            other = component["parent_label"] if parent == -1 else row[parent]
            actual.append(abs(row[index] - other))
    return sorted(actual) == sorted(differences)


def permutation_oracle(unused, differences, components):
    for values in itertools.permutations(unused):
        cursor, placements = 0, []
        for component in components:
            size = len(component["parents"])
            placements.append(values[cursor : cursor + size])
            cursor += size
        if direct_check(unused, differences, components, placements):
            return True
    return False


@pytest.mark.parametrize(
    "shapes",
    [
        [[-1]],
        [[-1, 0]],
        [[-1, 0, 1]],
        [[-1, 0, 0]],
        [[-1], [-1]],
        [[-1, 0], [-1]],
        [[-1, 0], [-1, 0]],
    ],
)
def test_all_resource_subsets_in_a_small_ambient_interval(shapes):
    components = [{"parent_label": 0, "parents": shape} for shape in shapes]
    size = sum(map(len, shapes))
    for unused in itertools.combinations(range(1, 6), size):
        for differences in itertools.combinations(range(1, 6), size):
            result = complete_forest(unused, differences, components)
            assert result["feasible"] == permutation_oracle(unused, differences, components)
            assert result["scope"] == "fixed_residual_forest"
            assert "proof_certificate_verified" not in result
            if result["feasible"]:
                assert direct_check(unused, differences, components, result["placements"])
            else:
                assert result["placements"] == []


def test_eight_vertex_boundary_and_disconnected_label_gaps():
    components = [
        {"parent_label": 0, "parents": [-1, 0, 1]},
        {"parent_label": 3, "parents": [-1, 0, 0]},
        {"parent_label": 10, "parents": [-1, 0]},
    ]
    unused = [1, 2, 4, 5, 6, 7, 8, 9]
    differences = [1, 2, 3, 4, 5, 6, 7, 9]
    result = complete_forest(unused, differences, components)
    assert result["feasible"] == permutation_oracle(unused, differences, components)
    assert result["component_assignments_enumerated"] == [336, 336, 56]
    if result["feasible"]:
        assert direct_check(unused, differences, components, result["placements"])


def test_real_graceful_path_partial_reconstructs_a_full_witness():
    labels = [0, 6, 1, 5, 2, 4, 3]
    edges = [[v, v + 1] for v in range(6)]
    assert verify_labeling(7, edges, labels)["valid"]
    # Keep the connected middle vertices 2,3,4; both remaining arms have size two.
    components = [
        {"parent_label": labels[2], "parents": [-1, 0]},
        {"parent_label": labels[4], "parents": [-1, 0]},
    ]
    unused = [labels[v] for v in (0, 1, 5, 6)]
    differences = [1, 2, 5, 6]
    result = complete_forest(unused, differences, components)
    assert result["feasible"]
    rebuilt = labels.copy()
    for vertices, row in zip(([1, 0], [5, 6]), result["placements"], strict=True):
        for vertex, label in zip(vertices, row, strict=True):
            rebuilt[vertex] = label
    assert verify_labeling(7, edges, rebuilt)["valid"]


def test_real_star_partial_and_shared_boundary_parent():
    components = [{"parent_label": 0, "parents": [-1]} for _ in range(6)]
    result = complete_forest(range(1, 7), range(1, 7), components)
    assert result["feasible"]
    labels = [0] + [row[0] for row in result["placements"]]
    assert verify_labeling(7, [[0, v] for v in range(1, 7)], labels)["valid"]


def test_all_leaf_cases_agree_with_exact_leaf_tail_solver():
    rng = random.Random(731947)
    for n in range(3, 10):
        for _ in range(12):
            p, q = sorted(rng.sample(range(n), 2))
            available = [u for u in range(n) if u not in (p, q)]
            size = rng.randrange(len(available) + 1)
            unused = rng.sample(available, size)
            differences = rng.sample(range(1, n), size)
            for first in range(size + 1):
                parents = {p: first, q: size - first}
                components = [
                    {"parent_label": parent, "parents": [-1]}
                    for parent, count in parents.items()
                    for _ in range(count)
                ]
                result = complete_forest(unused, differences, components)
                assert (
                    result["feasible"]
                    == complete_leaf_tail(unused, differences, parents)["feasible"]
                )


def test_signature_tables_are_deduplicated_and_each_entry_is_realized():
    components = [{"parent_label": 0, "parents": [-1, 0, 0]}]
    result = complete_forest([1, 2, 3], [1, 2, 3], components)
    table = result["signature_tables"][0]
    assert len(table) == len({(s["label_mask"], s["difference_mask"]) for s in table})
    for signature in table:
        labels = [u for i, u in enumerate(result["unused"]) if signature["label_mask"] >> i & 1]
        diffs = [
            d for i, d in enumerate(result["differences"]) if signature["difference_mask"] >> i & 1
        ]
        assert direct_check(labels, diffs, components, [signature["labels"]])


def test_resource_input_order_is_canonical_and_empty_forest_completes():
    components = [{"parent_label": 0, "parents": [-1]}, {"parent_label": 3, "parents": [-1]}]
    assert complete_forest([1, 2], [1, 2], components) == complete_forest(
        [2, 1], [2, 1], components
    )
    result = complete_forest([], [], [])
    assert result["feasible"] and result["placements"] == []


@pytest.mark.parametrize(
    "unused,differences,components",
    [
        (None, [], []),
        ([], None, []),
        ([True], [1], [{"parent_label": 0, "parents": [-1]}]),
        ([1], [False], [{"parent_label": 0, "parents": [-1]}]),
        ([-1], [1], [{"parent_label": 0, "parents": [-1]}]),
        ([1], [0], [{"parent_label": 0, "parents": [-1]}]),
        ([1, 1], [1, 2], [{"parent_label": 0, "parents": [-1, 0]}]),
        ([1, 2], [1, 1], [{"parent_label": 0, "parents": [-1, 0]}]),
        ([1], [], [{"parent_label": 0, "parents": [-1]}]),
        ([], [], None),
        ([], [], [{}]),
        ([], [], [{"parent_label": 0, "parents": [], "unexpected": 1}]),
        ([], [], [{"parent_label": 0, "parents": []}]),
        ([1], [1], [{"parent_label": True, "parents": [-1]}]),
        ([1], [1], [{"parent_label": -1, "parents": [-1]}]),
        ([1], [1], [{"parent_label": 1, "parents": [-1]}]),
        ([1], [1], [{"parent_label": 0, "parents": [False]}]),
        ([1], [1], [{"parent_label": 0, "parents": [0]}]),
        ([1, 2], [1, 2], [{"parent_label": 0, "parents": [-1, -1]}]),
        ([1, 2], [1, 2], [{"parent_label": 0, "parents": [-1, 1]}]),
        ([1, 2], [1, 2], [{"parent_label": 0, "parents": [-1, True]}]),
        ([1, 2, 3, 4], [1, 2, 3, 4], [{"parent_label": 0, "parents": [-1, 0, 1, 2]}]),
        (list(range(1, 10)), list(range(1, 10)), [{"parent_label": 0, "parents": [-1]}] * 9),
    ],
)
def test_invalid_shapes_types_resources_and_limits(unused, differences, components):
    with pytest.raises(ValueError):
        complete_forest(unused, differences, components)
