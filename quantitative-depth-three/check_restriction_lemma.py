"""Exact finite diagnostics for the manuscript's CNF restriction lemma.

Run with Python 3; only the standard library is required. This exhausts all
512 sets of non-tautological clauses on two variables (including the empty
clause), with b=1 and p=1/5. It also exhausts every restriction and every
completion of selected formulas on at most six variables, including repeated
clauses, opposite literals, tautologies, false/true formulas, overlaps, b=2,
and paths with two or three steps.

For these cases, rational arithmetic checks the pointwise signed expansion,
the actual finite marker-mixture distribution, its width bound, the
full-assignment reweighting identity, the reverse encoding, and the stronger
fixed-full-assignment estimate E_T[path mass] <= theta**j. Therefore it also
checks E W_j <= theta**j and E W <= 1/(1-theta).

These finite diagnostics are neither a proof for arbitrary dimensions nor a
formal verification, and they do not establish novelty or the circuit theorem.
"""

from dataclasses import dataclass
from fractions import Fraction
from functools import lru_cache
from itertools import product
from math import comb, factorial


@dataclass(frozen=True)
class Clause:
    scope: int
    falsifying: int

    def violated(self, assignment):
        return ((assignment ^ self.falsifying) & self.scope) == 0


def normalize(raw_clauses, d):
    """Signed integer literals; () is false; tautologies are removed."""
    clauses = []
    for raw in raw_clauses:
        literals = set(raw)
        assert all(1 <= abs(literal) <= d for literal in literals)
        if any(-literal in literals for literal in literals):
            continue
        scope = sum(1 << (abs(literal) - 1) for literal in literals)
        falsifying = sum(1 << (-literal - 1) for literal in literals if literal < 0)
        clauses.append(Clause(scope, falsifying))
    return tuple(clauses)


def subsets(mask):
    current = mask
    while True:
        yield current
        if current == 0:
            return
        current = (current - 1) & mask


@lru_cache(maxsize=None)
def marker_distribution(a, c):
    """Probability of each exact set of clause objects before the first marker.

    For a set S of size s, there are s! orders before the first marker, c
    choices of that marker, and (a+c-s-1)! orders afterwards. Objects remain
    individually labeled even when their clauses have identical contents.
    """
    assert c >= 1
    weights = tuple(
        Fraction(c * factorial(mask.bit_count()) * factorial(a + c - mask.bit_count() - 1),
                 factorial(a + c))
        for mask in range(1 << a)
    )
    assert sum(weights) == 1
    return weights


@lru_cache(maxsize=None)
def marker_acceptance(a, c, violated_mask):
    value = sum(
        weight for mask, weight in enumerate(marker_distribution(a, c))
        if (mask & violated_mask) == 0
    )
    assert value == Fraction(c, c + violated_mask.bit_count())
    return value


def all_paths(clauses, live, b):
    paths = []

    def visit(indices, unions):
        used = unions[-1] if unions else 0
        for i, clause in enumerate(clauses):
            if (clause.scope & live & ~used).bit_count() > b:
                new_unions = unions + (used | (clause.scope & live),)
                new_indices = indices + (i,)
                paths.append((new_indices, new_unions))
                visit(new_indices, new_unions)

    visit((), ())
    return paths


def compatible_pattern(clauses, indices, live, fixed_assignment, full_mask):
    prescribed_mask = full_mask ^ live
    prescribed = fixed_assignment
    for i in indices:
        clause = clauses[i]
        if ((prescribed ^ clause.falsifying) & prescribed_mask & clause.scope) != 0:
            return None
        prescribed = (prescribed & ~clause.scope) | clause.falsifying
        prescribed_mask |= clause.scope
    return prescribed & live


def reduced_clause(clause, live_remaining, assignment):
    """Return None for true, or its residual clause (possibly empty/false)."""
    if ((assignment ^ clause.falsifying) & clause.scope & ~live_remaining) != 0:
        return None
    scope = clause.scope & live_remaining
    return Clause(scope, clause.falsifying & scope)


def check_formula(name, d, raw_clauses, b, p, counters):
    clauses = normalize(raw_clauses, d)
    full_mask = (1 << d) - 1
    k = max((clause.scope.bit_count() for clause in clauses), default=0)
    alpha = 2 * p / (1 - p)
    theta = sum((comb(k, ell) * alpha**ell for ell in range(b + 1, k + 1)), Fraction(0))
    assert theta < 1, (name, theta)
    length = d // (b + 1)
    expected_w = [Fraction(0) for _ in range(length + 1)]
    by_assignment = [[Fraction(0) for _ in range(length + 1)] for _ in range(1 << d)]

    for live in range(1 << d):
        m = live.bit_count()
        fixed = full_mask ^ live
        probability_live = p**m * (1 - p)**(d - m)
        probability_restriction = probability_live / 2**(d - m)
        paths = all_paths(clauses, live, b)
        easy = [i for i, clause in enumerate(clauses) if (clause.scope & live).bit_count() <= b]

        for rho in subsets(fixed):
            counters["restrictions"] += 1
            expected_w[0] += probability_restriction
            compatible = {}
            for indices, unions in paths:
                pattern = compatible_pattern(clauses, indices, live, rho, full_mask)
                if pattern is None:
                    continue
                final_union = unions[-1]
                cylinder_point = rho | pattern
                counts = tuple(
                    sum(clause.violated(cylinder_point) for clause in clauses
                        if (clause.scope & live & ~used) == 0)
                    for used in unions
                )
                assert all(c >= h for h, c in enumerate(counts, 1))
                omega = Fraction(1)
                mixtures = []
                for used, c in zip(unions, counts):
                    omega /= c
                    family = tuple(
                        reduced_clause(clause, live & ~final_union, cylinder_point)
                        for clause in clauses
                        if 0 < (clause.scope & live & ~used).bit_count() <= b
                    )
                    assert all(clause is None or clause.scope.bit_count() <= b for clause in family)
                    mixtures.append((c, family))
                compatible[indices] = (pattern, omega, mixtures)
                expected_w[len(indices)] += probability_restriction * omega
                counters["compatible_paths"] += 1
                counters["max_path_length"] = max(counters["max_path_length"], len(indices))

            for completion in subsets(live):
                assignment = rho | completion
                counters["completions"] += 1
                violated = tuple(clause.violated(assignment) for clause in clauses)
                H = int(not any(violated))
                K = int(not any(violated[i] for i in easy))
                expansion = Fraction(K)
                by_assignment[assignment][0] += probability_live

                for indices, unions in paths:
                    numerator = all(violated[i] for i in indices)
                    term = Fraction(0)
                    direct_omega = Fraction(1)
                    if numerator:
                        term = Fraction(K)
                        for used in unions:
                            easy_count = sum(violated[i] for i, clause in enumerate(clauses)
                                             if (clause.scope & live & ~used).bit_count() <= b)
                            closed_count = sum(violated[i] for i, clause in enumerate(clauses)
                                               if (clause.scope & live & ~used) == 0)
                            assert easy_count >= closed_count >= 1
                            term /= easy_count
                            direct_omega /= closed_count
                        if term:
                            counters["max_nonzero_path_length"] = max(counters["max_nonzero_path_length"], len(indices))

                        # Independently recover the weighted full-assignment
                        # summand from this completion, then verify reverse data.
                        reweighted = 2**unions[-1].bit_count() * direct_omega
                        by_assignment[assignment][len(indices)] += probability_live * reweighted
                        remaining = live & ~unions[-1]
                        reverse_weight = p**remaining.bit_count() * (1 - p)**(d - remaining.bit_count())
                        for h in reversed(range(len(indices))):
                            previous_union = unions[h - 1] if h else 0
                            added = unions[h] & ~previous_union
                            i = indices[h]
                            eligible = [j for j, clause in enumerate(clauses)
                                        if violated[j] and (clause.scope & remaining) == 0]
                            assert i in eligible and added.bit_count() > b
                            assert (added & ~clauses[i].scope) == 0
                            assert (remaining & added) == 0
                            reverse_weight *= alpha**added.bit_count() / len(eligible)
                            remaining |= added
                        assert remaining == live
                        assert reverse_weight == probability_live * reweighted

                    mixture_term = Fraction(0)
                    if indices in compatible:
                        pattern, omega, mixtures = compatible[indices]
                        if K and (assignment & unions[-1]) == pattern:
                            mixture_term = omega
                            for c, family in mixtures:
                                counters["max_mixture_size"] = max(counters["max_mixture_size"], len(family))
                                violation_mask = sum(
                                    1 << i for i, clause in enumerate(family)
                                    if clause is not None and clause.violated(assignment)
                                )
                                mixture_term *= marker_acceptance(len(family), c, violation_mask)
                                counters["mixture_evaluations"] += 1
                    assert mixture_term == term, (name, "mixture", live, rho, assignment, indices)
                    expansion += (-1)**len(indices) * term
                assert expansion == H, (name, "expansion", live, rho, assignment)

    for j, lhs in enumerate(expected_w):
        rhs = sum(row[j] for row in by_assignment) / 2**d
        assert lhs == rhs, (name, "full-assignment identity", j, lhs, rhs)
        assert lhs <= theta**j, (name, "expected W_j", j, lhs, theta**j)
        for assignment, row in enumerate(by_assignment):
            assert row[j] <= theta**j, (name, "fixed assignment bound", j, assignment, row[j], theta**j)
    assert sum(expected_w) <= 1 / (1 - theta)
    counters["formulas"] += 1


def main():
    counters = dict(formulas=0, restrictions=0, completions=0,
                    compatible_paths=0, max_path_length=0, mixture_evaluations=0,
                    max_mixture_size=0, max_nonzero_path_length=0)
    # Every non-tautological clause on two variables, including false.
    clauses = [tuple(sign * (i + 1) for i, sign in enumerate(signs) if sign)
               for signs in product((-1, 0, 1), repeat=2)]
    assert len(clauses) == 9
    for formula_mask in range(1 << len(clauses)):
        formula = [clause for i, clause in enumerate(clauses) if formula_mask & (1 << i)]
        check_formula(f"exhaustive-d2-{formula_mask}", 2, formula, 1, Fraction(1, 5), counters)

    selected = [
        ("zero-dimensional true", 0, [], 1),
        ("zero-dimensional false", 0, [()], 1),
        ("empty formula", 4, [], 1),
        ("false plus hard clauses", 4, [(), (1, 2), (3, 4)], 1),
        ("tautologies and literal duplicates", 4, [(1, -1), (2, 2, 3), (2, 3), (-3, 4)], 1),
        ("opposite clauses and overlaps", 4, [(1, 2), (-1, -2), (2, 3), (-2, 4), (1, 3, 4)], 1),
        ("three steps with repeats", 6, [(1, 2), (3, 4), (5, 6), (1, 2), (-1, 3), (1, 3, 5), (-2, 4, -6), (-2,)], 1),
        ("nontrivial mixtures", 6, [(1, 2, 3), (4, 5), (1, 4), (-2, 6), (3,), (-5,), (1, 2, 3)], 1),
        ("b2 two steps", 6, [(1, 2, 3), (4, 5, 6), (1, -4, 5), (-1, -2, -3), (2, -5, 6), (1,), (-4,), (1, 2, 3)], 2),
        ("width four", 6, [(1, 2, 3, 4), (3, 4, 5, 6), (-1, 5), (2, -6), (3,), (2, -6)], 1),
        ("width below b", 4, [(1, 2), (-1, 3), (4,), (1, 2)], 3),
    ]
    for name, d, formula, b in selected:
        for p in (Fraction(1, 20), Fraction(1, 10)):
            check_formula(f"{name}, p={p}", d, formula, b, p, counters)
    assert counters["max_path_length"] == 3
    assert counters["max_nonzero_path_length"] == 3
    assert counters["max_mixture_size"] >= 2
    print("Exact restriction-lemma diagnostics passed.")
    print("Scope: all 512 clause subsets on two variables; 11 selected cases at two rational probabilities.")
    print("; ".join(f"{key}={value}" for key, value in counters.items()))
    print("Finite diagnostic only; the general lemma requires the written proof.")


if __name__ == "__main__":
    main()
