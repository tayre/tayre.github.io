#!/usr/bin/env python3
"""Finite diagnostics for the spectral remainder. Not a proof.

Requires NumPy. Enumerates every Boolean function in dimensions 1 through 4.
Checks Hellinger, the spectral remainder, and its Fourier expansion.
"""
import numpy as np


def entropy_mean(x):
    p = np.clip((1.0 + x) / 2.0, 0.0, 1.0)
    q = 1.0 - p
    with np.errstate(divide="ignore", invalid="ignore"):
        return -np.where(p > 0, p * np.log(p), 0.0) - np.where(q > 0, q * np.log(q), 0.0)


def main():
    rhos = (0.01, 0.1, 0.3, 0.5, 0.8, 0.95, 0.99, 0.999)
    total = 0
    worst = 0.0
    for n in range(1, 5):
        size = 1 << n
        masks = np.arange(size, dtype=np.uint64)
        degrees = np.array([int(x).bit_count() for x in masks])
        walsh = np.array([[1.0 - 2.0 * ((i & j).bit_count() % 2)
                           for j in range(size)] for i in range(size)])
        function_count = 1 << size
        minimum = float("inf")
        for start in range(0, function_count, 4096):
            ids = np.arange(start, min(start + 4096, function_count), dtype=np.uint64)
            values = 1.0 - 2.0 * ((ids[:, None] >> masks[None, :]) & 1)
            coefficients = values @ walsh / size
            mean = coefficients[:, 0]
            for rho in rhos:
                noisy = (coefficients * rho ** degrees) @ walsh
                information = entropy_mean(mean) - np.mean(entropy_mean(noisy), axis=1)
                deficit = np.log(2.0) - entropy_mean(rho) - information
                variance = np.mean(noisy ** 2, axis=1) - mean ** 2
                rhs = (rho * rho - variance) / 6.0
                spectral = rho * rho / 6.0 * (mean ** 2 + np.sum(
                    coefficients[:, degrees >= 2] ** 2 *
                    (1 - rho ** (2 * degrees[degrees >= 2] - 2)), axis=1))
                assert np.max(np.abs(rhs - spectral)) < 1e-12
                residual = deficit - rhs
                minimum = min(minimum, float(np.min(residual)))
                assert np.min(residual) > -1e-12, (n, start, rho, np.min(residual))
                hres = (1 - np.sqrt(1 - rho * rho) - np.sqrt(1 - mean * mean)
                        + np.mean(np.sqrt(np.maximum(0, 1 - noisy * noisy)), axis=1))
                assert np.min(hres) > -1e-12, (n, start, rho, "Hellinger")
                total += len(ids)
        worst = min(worst, minimum)
        print(f"n={n}: {function_count} Boolean functions, {len(rhos)} correlations, "
              f"minimum spectral remainder residual={minimum:.3g}")
    print(f"PASS: {total} function/correlation cases; worst rounding residual={worst:.3g}")


if __name__ == "__main__":
    main()
