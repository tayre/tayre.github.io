"""Compare terminal completion with definition-level exhaustive assignments."""

from collections import Counter
from itertools import combinations, product

import pytest

from graceful_research.leaf_tail import complete_leaf_tail


def check_witness(unused, differences, parents, result):
    placements = result["placements"]
    assert Counter(u for u, _ in placements) == Counter(unused)
    assert Counter(p for _, p in placements) == Counter({p: c for p, c in parents.items() if c})
    assert sorted(abs(u - p) for u, p in placements) == sorted(differences)


def exhaustive_leaf_oracle(max_n):
    """Check every U,D and every parent capacity; usable for larger offline audits.

    The oracle enumerates all binary parent assignments, without graph components,
    cycle classification, parity shortcuts, or calls to another constraint solver.
    """
    cases = calls = witnesses = 0
    for n in range(2, max_n + 1):
        for p, q in combinations(range(n), 2):
            available = [u for u in range(n) if u not in (p, q)]
            for r in range(len(available) + 1):
                for unused in combinations(available, r):
                    truth = {}
                    for assignment in product((p, q), repeat=r):
                        diffs = [abs(u - a) for u, a in zip(unused, assignment, strict=True)]
                        if len(set(diffs)) == r:
                            truth.setdefault(tuple(sorted(diffs)), set()).add(assignment.count(p))
                    for differences in combinations(range(1, n), r):
                        expected = truth.get(differences, set())
                        for capacity in range(r + 1):
                            parents = {p: capacity, q: r - capacity}
                            result = complete_leaf_tail(unused, differences, parents)
                            assert result["feasible"] == (capacity in expected), (
                                n,
                                p,
                                q,
                                unused,
                                differences,
                                parents,
                                result,
                                expected,
                            )
                            if result["feasible"]:
                                check_witness(unused, differences, parents, result)
                                witnesses += 1
                            else:
                                assert result["placements"] == []
                            calls += 1
                        cases += 1
    return {
        "ambient_max_n": max_n,
        "residual_cases": cases,
        "capacity_checks": calls,
        "witnesses_checked": witnesses,
    }


def test_all_residuals_through_six_and_all_parent_capacities():
    summary = exhaustive_leaf_oracle(6)
    assert summary["residual_cases"] == 2310
    assert summary["witnesses_checked"] > 0


@pytest.mark.parametrize(
    "unused,differences,parents",
    [
        ([], [], {}),
        ([], [], {0: 0, 1: 0}),
        ([1, 2, 3], [1, 2, 3], {0: 3}),
        ([0, 1, 2], [1, 2, 3], {3: 3}),
        ([1, 2, 3, 4], [1, 2, 3, 4], {0: 2, 5: 2}),
        ([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], {0: 3, 6: 2}),
    ],
)
def test_witnesses_empty_single_pair_and_midpoint(unused, differences, parents):
    result = complete_leaf_tail(unused, differences, parents)
    assert result["feasible"]
    check_witness(unused, differences, parents, result)


@pytest.mark.parametrize(
    "unused,differences,parents,reason",
    [
        ([1, 3], [1, 2], {2: 2}, "single_parent_differences"),
        ([1, 3], [2, 4], {0: 1, 4: 1}, "label_without_choice"),
        ([1, 6], [1, 2], {0: 1, 7: 1}, "component_imbalance"),
        ([1, 2], [1, 2], {0: 1, 3: 1}, "parent_capacity_parity"),
        ([1, 2, 3], [1, 2, 3], {0: 2, 7: 1}, "parent_capacity_parity"),
    ],
)
def test_impossible_tail_has_only_scoped_failure(unused, differences, parents, reason):
    result = complete_leaf_tail(unused, differences, parents)
    assert not result["feasible"] and result["reason"] == reason
    assert result["placements"] == [] and "status" not in result


@pytest.mark.parametrize(
    "p,q,unused,differences",
    [
        (0, 7, [1, 2, 5, 6], [1, 2, 5, 6]),
        (0, 6, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
        (3, 10, [0, 1, 2, 4, 5], [1, 2, 3, 5, 6]),
    ],
)
def test_input_order_does_not_change_feasibility(p, q, unused, differences):
    for capacity in range(len(unused) + 1):
        parents = {p: capacity, q: len(unused) - capacity}
        first = complete_leaf_tail(unused, differences, parents)
        second = complete_leaf_tail(
            reversed(unused), reversed(differences), dict(reversed(list(parents.items())))
        )
        assert first["feasible"] == second["feasible"]
        if second["feasible"]:
            check_witness(unused, differences, parents, second)


def test_large_reflected_pairs_and_midpoint():
    unused = list(range(1, 1001))
    good = complete_leaf_tail(unused, unused, {0: 334, 1001: 666})
    assert good["feasible"] and good["pairs"] == 500 and not good["midpoint"]
    assert good["forced"] == 0
    check_witness(unused, unused, {0: 334, 1001: 666}, good)
    assert not complete_leaf_tail(unused, unused, {0: 333, 1001: 667})["feasible"]
    unused = list(range(1, 1000))
    good = complete_leaf_tail(unused, unused, {0: 333, 1000: 666})
    assert good["pairs"] == 499 and good["midpoint"]
    check_witness(unused, unused, {0: 333, 1000: 666}, good)


@pytest.mark.parametrize(
    "unused,differences,parents",
    [
        (None, [], {}),
        ([], None, {}),
        ([True], [1], {0: 1}),
        ([1.0], [1], {0: 1}),
        ([-1], [1], {0: 1}),
        ([1], [True], {0: 1}),
        ([1], [0], {0: 1}),
        ([1], [-1], {0: 1}),
        ([1, 1], [1, 2], {0: 2}),
        ([1, 2], [1, 1], {0: 2}),
        ([1], [1], [(0, 1)]),
        ([1], [1], {False: 1}),
        ([1], [1], {-1: 1}),
        ([1], [1], {0: True}),
        ([1], [1], {0: -1}),
        ([1], [1], {0: 1.0}),
        ([1], [1], {1: 1}),
        ([1], [1], {0: 1, 1: 0}),
        ([1], [], {0: 1}),
        ([1], [1], {}),
        ([1], [1], {0: 2}),
        ([3, 4, 5], [1, 2, 3], {0: 1, 1: 1, 2: 1}),
    ],
)
def test_malformed_or_unsupported_inputs_raise(unused, differences, parents):
    with pytest.raises(ValueError):
        complete_leaf_tail(unused, differences, parents)
