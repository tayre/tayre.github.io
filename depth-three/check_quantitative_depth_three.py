"""Diagnostic checks for depth-three-quantitative-bound.tex.

These checks verify elementary constants exactly and sample the finite
parameter inequalities in the log domain. They do not verify the source
restriction lemma, prove the asymptotic theorem, or certify novelty.
The accompanying TeX note now supplies a separate mathematical proof of
the restriction lemma; these diagnostics do not replace that proof.

K is the unspecified absolute constant in quantitative sparsification.
The sample K values below are illustrative, not certified values of K.
Only the Python standard library is required.
"""

from fractions import Fraction
from math import floor, log, sqrt


def add(left, right):
    size = max(len(left), len(right))
    return [
        (left[i] if i < len(left) else 0)
        + (right[i] if i < len(right) else 0)
        for i in range(size)
    ]


def multiply(left, right):
    result = [0] * (len(left) + len(right) - 1)
    for i, a in enumerate(left):
        for j, b in enumerate(right):
            result[i + j] += a * b
    return result


def exact_constants():
    # Write s = u + 1, u >= 0. Coefficients are in ascending order.
    s = [1, 1]
    s_plus_one = [2, 1]
    q = [256 * a for a in multiply(s_plus_one, [7, 3])]
    budget = [4096 * a for a in multiply(s, s)]
    difference = add(budget, [-a for a in q])
    assert difference == [512, 4864, 3328]
    assert all(a >= 0 for a in difference)
    # Therefore Q <= 4096 s^2 = b/16 when b = (256s)^2.
    assert Fraction(256**2, 16) == 4096

    # e < 3 and Q <= b/16 give this upper bound for b >= 1.
    tail_bound = Fraction(3, 16) ** 2 / (1 - Fraction(3, 16))
    assert tail_bound == Fraction(9, 208)
    assert tail_bound < Fraction(1, 2)

    # Exponents after substituting log_2(S) <= s sqrt(d).
    assert add(s, [-4 * a for a in s_plus_one]) == [-7, -3]
    assert add([2 * a for a in s], [-3 * a for a in s_plus_one]) == [-4, -1]

    # d >= n/6 and b >= ln(n)/(96 K ln ln(n)) give the final coefficient.
    assert 256**2 * 6 * 96 == 6144**2


def finite_parameter_diagnostics(log_d, K):
    # log_d = ln(d); d itself need not be materialized.
    b = floor(log_d / (24 * K * log(log_d)))
    s = sqrt(b) / 256
    B = 64 * (s + 1)
    Q = 4 * B * (3 * (s + 1) + 1)
    assert b >= 65536 and s >= 1
    assert log(B) - log_d / 2 <= log(0.5)  # p <= 1/2
    assert Q <= b / 16

    log_M_bound = K * b * log(K * b)
    assert log_M_bound <= log_d / 12
    # Source finite envelope: each of the two positive summands <= 1/16
    # suffices for its sum to be <= 1/8, uniformly in the live-size window.
    log_window = (log(4 * B + 1) + log_d / 2) / log(2)
    log_first = log(2) + log_M_bound + log(1 + b * log_window) - log_d / 6
    log_second = log(log_d / (3 * B * log(2))) - log_d / 2
    assert log_first < log(1 / 16)
    assert log_second < log(1 / 16)
    # r >= (33/16) mu, using r >= d^(2/3).
    assert log_d / 6 - log(B) >= log(33 / 16)
    # The largest even integer <= d^(1/6) is >= d^(1/6)/2.
    assert log_d / 6 >= log(4)


if __name__ == "__main__":
    exact_constants()
    cases = [(L, K) for L in (10**12, 10**15, 10**18) for K in (2, 10, 100)]
    for L, K in cases:
        finite_parameter_diagnostics(L, K)
    print("Exact constant checks passed; 9 log-domain parameter diagnostics passed.")
    print("Diagnostic only: these checks do not certify the source lemma or novelty.")
