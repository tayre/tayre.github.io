"""Independent, standard-library-only checker for scoped graceful-tree DRUP proofs.

This module imports neither PySAT nor the production CNF encoder. It regenerates
the exact formula from the graph, then checks every added clause by reverse unit
propagation. Deletions are validated syntactically but ignored: retaining already
proved consequences is sound, at the cost of memory. No RAT steps are accepted.
"""

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

try:
    from .verify import verify_tree
except ImportError:  # Standalone archive: python3 -S proof_verify.py certificate.json
    from verify import verify_tree

ENCODING = "graceful-onehot-v1"
MAX_N = 75
MAX_PROOF_BYTES = 8 * 1024 * 1024


def expected_formula(n, edges, restriction):
    """Independent enumeration of the documented clause schema and variable map."""
    vertex = [list(range(v * n + 1, (v + 1) * n + 1)) for v in range(n)]
    m = n - 1
    edge_vars = [list(range(n * n + e * m + 1, n * n + (e + 1) * m + 1)) for e in range(m)]
    for row in vertex:
        yield row
        for i in range(len(row)):
            for j in range(i + 1, len(row)):
                yield [-row[i], -row[j]]
    for label in range(n):
        for u in range(n):
            for v in range(u + 1, n):
                yield [-vertex[u][label], -vertex[v][label]]
    for index, endpoints in enumerate(edges):
        left, right = (vertex[endpoints[0]], vertex[endpoints[1]])
        for a in range(n):
            for b in range(n):
                if a != b:
                    difference = max(a, b) - min(a, b)
                    yield [-left[a], -right[b], edge_vars[index][difference - 1]]
    for difference in range(m):
        for first in range(m):
            for second in range(first + 1, m):
                yield [-edge_vars[first][difference], -edge_vars[second][difference]]
    if restriction is not None:
        for endpoint in restriction["edge"]:
            yield [vertex[endpoint][0], vertex[endpoint][-1]]


class RUPChecker:
    """Two-watched-literal unit propagation; assignments are reset for each RUP step."""

    def __init__(self, variables, deadline=float("inf")):
        self.variables, self.deadline = variables, deadline
        self.clauses, self.units, self.watches = [], [], {}
        self.empty = False
        self.ticks = 0

    def tick(self):
        self.ticks += 1
        if self.ticks % 256 == 0 and time.monotonic() >= self.deadline:
            raise TimeoutError("proof verification time limit")

    def add(self, clause):
        self.tick()
        clause = list(dict.fromkeys(clause))
        if any(type(lit) is not int or not 1 <= abs(lit) <= self.variables for lit in clause):
            raise ValueError("literal outside the declared variable range")
        if not clause:
            self.empty = True
        elif len(clause) == 1:
            self.units.append(clause[0])
        else:
            identity = len(self.clauses)
            self.clauses.append(clause)
            for literal in clause[:2]:
                self.watches.setdefault(literal, []).append(identity)

    def implied(self, clause):
        """F ∧ ¬clause must unit-propagate to contradiction."""
        if self.empty:
            return True
        assigned, queue = {}, []

        def enqueue(literal):
            variable, value = abs(literal), literal > 0
            if variable in assigned:
                return assigned[variable] == value
            assigned[variable] = value
            queue.append(literal)
            return True

        def value(literal):
            result = assigned.get(abs(literal))
            return None if result is None else result == (literal > 0)

        for literal in self.units:
            self.tick()
            if not enqueue(literal):
                return True
        for literal in clause:
            if not enqueue(-literal):
                return True
        position = 0
        while position < len(queue):
            false_literal = -queue[position]
            position += 1
            watched = self.watches.get(false_literal, [])
            i = 0
            while i < len(watched):
                self.tick()
                identity = watched[i]
                current = self.clauses[identity]
                if current[0] == false_literal:
                    current[0], current[1] = current[1], current[0]
                if value(current[0]) is True:
                    i += 1
                    continue
                replacement = None
                for j in range(2, len(current)):
                    self.tick()
                    if value(current[j]) is not False:
                        replacement = j
                        break
                if replacement is not None:
                    current[1], current[replacement] = current[replacement], current[1]
                    watched[i] = watched[-1]
                    watched.pop()
                    self.watches.setdefault(current[1], []).append(identity)
                else:
                    if not enqueue(current[0]):
                        return True
                    i += 1
        return False


def check_drup(variables, clauses, proof, deadline=float("inf")):
    if not isinstance(proof, str) or len(proof) > MAX_PROOF_BYTES or not proof.isascii():
        raise ValueError("proof is not bounded ASCII DRUP text")
    checker = RUPChecker(variables, deadline)
    for clause in clauses:
        checker.add(clause)
    additions, deletions, finished = 0, 0, False
    for line_number, line in enumerate(proof.splitlines(), 1):
        if time.monotonic() >= deadline:
            raise TimeoutError("proof verification time limit")
        words = line.split()
        if not words or words[0] == "c":
            continue
        deletion = words[0] == "d"
        if deletion:
            words = words[1:]
        if not words or words[-1] != "0":
            raise ValueError(f"DRUP line {line_number}: missing terminator")
        try:
            clause = [int(word) for word in words[:-1]]
        except ValueError as exc:
            raise ValueError(f"DRUP line {line_number}: non-integer literal") from exc
        if any(not 1 <= abs(literal) <= variables for literal in clause):
            raise ValueError(f"DRUP line {line_number}: invalid literal")
        if deletion:
            deletions += 1
            continue
        if not checker.implied(clause):
            raise ValueError(f"DRUP line {line_number}: clause fails reverse unit propagation")
        checker.add(clause)
        additions += 1
        finished = finished or not clause
    if not finished:
        raise ValueError("proof does not derive the empty clause")
    return {"additions_checked": additions, "deletions_ignored": deletions}


def verify_unsat(certificate, *, deadline=float("inf")):
    """Reconstruct the scoped graph encoding; a valid proof concerns exactly that scope."""
    result = {"valid": False, "checker": "stdlib-drup-v1", "errors": []}
    try:
        if (
            not isinstance(certificate, dict)
            or type(certificate.get("schema_version")) is not int
            or certificate["schema_version"] != 1
        ):
            raise ValueError("unsupported proof certificate")
        if certificate.get("encoding") != ENCODING or certificate.get("format") != "drup":
            raise ValueError("unsupported encoding or proof format")
        data = certificate["input"]
        n, edges = data["n"], data["edges"]
        if type(n) is not int or not 1 <= n <= MAX_N or verify_tree(n, edges):
            raise ValueError("invalid or oversized input tree")
        restriction = certificate.get("restriction")
        if restriction is not None:
            if not isinstance(restriction, dict) or restriction.get("kind") != "extreme_edge":
                raise ValueError("unsupported restriction")
            edge = restriction.get("edge")
            if (
                not isinstance(edge, list)
                or len(edge) != 2
                or any(type(v) is not int for v in edge)
                or sorted(edge) not in [sorted(e) for e in edges]
            ):
                raise ValueError("restriction is not a tree edge")
        proof = certificate["proof"]
        if not isinstance(proof, str) or len(proof) > MAX_PROOF_BYTES or not proof.isascii():
            raise ValueError("oversized or non-ASCII proof")
        if hashlib.sha256(proof.encode("ascii")).hexdigest() != certificate["proof_sha256"]:
            raise ValueError("proof checksum mismatch")
        m = n - 1
        variables = n * n + m * m
        count = n + n * n * (n - 1) + m * n * (n - 1) + m * m * (m - 1) // 2
        count += 2 if restriction is not None else 0
        digest = hashlib.sha256(f"p cnf {variables} {count}\n".encode("ascii"))

        def clauses():
            generated = 0
            for clause in expected_formula(n, edges, restriction):
                if generated % 256 == 0 and time.monotonic() >= deadline:
                    raise TimeoutError("encoding verification time limit")
                digest.update((" ".join(map(str, clause)) + " 0\n").encode("ascii"))
                generated += 1
                yield clause
            if generated != count or digest.hexdigest() != certificate["cnf_sha256"]:
                raise ValueError("CNF differs from the independently regenerated graph encoding")

        result.update(check_drup(variables, clauses(), proof, deadline))
        result["valid"] = True
        result["scope"] = "extreme_edge" if restriction else "graceful"
    except (ValueError, TypeError, KeyError, TimeoutError) as exc:
        result["errors"].append(str(exc))
        result["timed_out"] = isinstance(exc, TimeoutError)
    return result


def verify_record(record, *, deadline=float("inf")):
    proof = record.get("proof_certificate")
    if (
        record.get("status") != "solver_infeasible"
        or record.get("raw_status") != "INFEASIBLE"
        or record.get("labels") is not None
        or record.get("timed_out")
        or not isinstance(proof, dict)
        or proof.get("input") != record.get("input")
        or proof.get("restriction") != record.get("restriction")
        or (
            "scope" in record
            and record["scope"]
            != ("graceful" if record.get("restriction") is None else "extreme_edge")
        )
    ):
        return {"valid": False, "errors": ["proof claim does not match the record and scope"]}
    return verify_unsat(proof, deadline=deadline)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--seconds", type=float, default=30)
    args = parser.parse_args(argv)
    if not math.isfinite(args.seconds) or args.seconds <= 0:
        parser.error("--seconds must be finite and positive")
    paths = sorted(args.path.glob("*.json")) if args.path.is_dir() else [args.path]
    results = []
    for path in paths:
        try:
            if path.stat().st_size > 2 * MAX_PROOF_BYTES:
                raise ValueError("certificate file too large")
            data = json.loads(path.read_text())
            deadline = time.monotonic() + args.seconds
            if "proof_certificate" in data:
                record = dict(data)
                if isinstance(data.get("request"), dict):
                    record.setdefault("input", data["request"].get("input"))
                    record.setdefault("restriction", data["request"].get("restriction"))
                check = verify_record(record, deadline=deadline)
            else:
                check = verify_unsat(data, deadline=deadline)
        except (OSError, ValueError, AttributeError, TypeError) as exc:
            check = {"valid": False, "errors": [str(exc)]}
        results.append({"file": str(path), **check})
    valid = bool(results) and all(row["valid"] for row in results)
    print(
        json.dumps({"valid": valid, "proofs_checked": len(results), "results": results}, indent=2)
    )
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
