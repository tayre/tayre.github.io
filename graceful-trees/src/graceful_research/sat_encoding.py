"""Canonical one-hot CNF, without symmetry reductions or solver-specific clauses."""

import hashlib
import itertools
import time

from .verify import verify_tree

ENCODING = "graceful-onehot-v1"
MAX_N = 75


def encode(n, edges, restriction=None, deadline=float("inf")):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if n > MAX_N:
        raise ValueError(f"SAT encoding is limited to {MAX_N} vertices")
    m = n - 1
    variables = n * n + m * m
    clauses = []

    def add(clause):
        if len(clauses) % 1024 == 0 and time.monotonic() >= deadline:
            raise TimeoutError("CNF generation time limit")
        clauses.append(list(clause))

    def x(v, label):
        return 1 + v * n + label

    def y(edge, difference):
        return 1 + n * n + edge * m + difference - 1

    # Exactly one label at each vertex, and no label at two vertices.
    for v in range(n):
        add(x(v, a) for a in range(n))
        for a, b in itertools.combinations(range(n), 2):
            add((-x(v, a), -x(v, b)))
    for a in range(n):
        for u, v in itertools.combinations(range(n), 2):
            add((-x(u, a), -x(v, a)))
    # Each selected endpoint-label pair forces its actual edge difference.
    for e, (u, v) in enumerate(edges):
        for a in range(n):
            for b in range(n):
                if a != b:
                    add((-x(u, a), -x(v, b), y(e, abs(a - b))))
    # A difference cannot be carried by two edges. Extra unconstrained Y values
    # do not admit false positive labelings; selected X values force all n-1 differences.
    for d in range(1, n):
        for e, f in itertools.combinations(range(m), 2):
            add((-y(e, d), -y(f, d)))
    if restriction is not None:
        if not isinstance(restriction, dict) or restriction.get("kind") != "extreme_edge":
            raise ValueError("unsupported SAT restriction")
        edge = restriction.get("edge")
        if (
            not isinstance(edge, list)
            or len(edge) != 2
            or any(type(v) is not int for v in edge)
            or sorted(edge) not in [sorted(e) for e in edges]
        ):
            raise ValueError("restricted edge not in tree")
        # Two different endpoints, each chosen from {0,m}, must carry difference m.
        for v in edge:
            add((x(v, 0), x(v, m)))
    return variables, clauses


def dimacs_lines(variables, clauses):
    yield f"p cnf {variables} {len(clauses)}\n"
    for clause in clauses:
        yield " ".join(map(str, clause)) + " 0\n"


def save_dimacs(path, variables, clauses, deadline=float("inf")):
    digest = hashlib.sha256()
    with path.open("w", encoding="ascii") as handle:
        for i, line in enumerate(dimacs_lines(variables, clauses)):
            if i % 1024 == 0 and time.monotonic() >= deadline:
                raise TimeoutError("DIMACS serialization time limit")
            digest.update(line.encode("ascii"))
            handle.write(line)
    return digest.hexdigest()
