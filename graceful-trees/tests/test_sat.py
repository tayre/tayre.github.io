"""Independent small-instance oracles and adversarial negative-certificate checks."""

import copy
import hashlib
import itertools
import json
import random
import shutil
import sqlite3
import subprocess
import sys
import time
from dataclasses import replace
from pathlib import Path

import networkx as nx
import pytest
from pysat.solvers import Glucose4
from test_math import permutation_oracle, small_trees
from test_system import small_config

from graceful_research import proof_verify
from graceful_research.audit import audit_run
from graceful_research.config import Config
from graceful_research.io import write_checksums
from graceful_research.runner import run
from graceful_research.sat_encoding import dimacs_lines, encode
from graceful_research.solver import solve
from graceful_research.trees import edge_orbits, graph_input
from graceful_research.worker import Supervisor


def request(directory, graph=None, edge=None, seconds=5):
    return {
        "input": graph_input(nx.path_graph(4) if graph is None else graph),
        "restriction": {"kind": "extreme_edge", "edge": edge} if edge else None,
        "seed": 123,
        "solver_seconds": seconds,
        "directory": str(directory),
        "backend": "sat",
        "constructive_search": False,
        "complement_break": True,
        "redundant_sum": True,
    }


@pytest.mark.parametrize("graph", list(small_trees(6)))
def test_sat_matches_permutation_oracle_for_every_small_edge_orbit(tmp_path, graph):
    for i, edge in enumerate([None] + [o["representative"] for o in edge_orbits(graph)]):
        req = request(tmp_path / str(i), graph, edge)
        variables, clauses = encode(**req["input"], restriction=req["restriction"])
        assert clauses == list(
            proof_verify.expected_formula(**req["input"], restriction=req["restriction"])
        )
        assert max(abs(lit) for clause in clauses for lit in clause) <= variables
        expected = permutation_oracle(graph, edge)
        result = solve(req)
        if expected is None:
            assert result["status"] == "solver_infeasible"
            assert result["proof_certificate_verified"]
            assert proof_verify.verify_unsat(result["proof_certificate"])["valid"]
        else:
            assert result["status"] == "verified_graceful"
            assert result["verification"]["valid"]
            assert not result["proof_certificate_verified"]
        assert result["parameters"]["symmetry_breaking"] is False


@pytest.mark.parametrize("graph", list(small_trees(5)))
def test_every_small_graceful_labeling_satisfies_cnf_without_reductions(graph):
    n = len(graph)
    data = graph_input(graph)
    for labels in itertools.permutations(range(n)):
        diffs = [abs(labels[u] - labels[v]) for u, v in data["edges"]]
        if sorted(diffs) != list(range(1, n)):
            continue
        positive = {1 + v * n + labels[v] for v in range(n)}
        positive.update(n * n + e * (n - 1) + d for e, d in enumerate(diffs))
        restrictions = [None] + [
            {"kind": "extreme_edge", "edge": e}
            for e, d in zip(data["edges"], diffs, strict=True)
            if d == n - 1
        ]
        for restriction in restrictions:
            _, clauses = encode(**data, restriction=restriction)
            assert all(
                any((lit in positive) if lit > 0 else (-lit not in positive) for lit in clause)
                for clause in clauses
            )


def naive_unit_conflict(clauses, candidate):
    """Slow set-based oracle, independent of watched literals and production code."""
    remaining = [set(c) for c in clauses] + [{-lit} for lit in candidate]
    while True:
        if any(not c for c in remaining):
            return True
        units = [next(iter(c)) for c in remaining if len(c) == 1]
        if not units:
            return False
        literal = units[0]
        remaining = [c - {-literal} for c in remaining if literal not in c]


def models(n, clauses):
    return [
        bits
        for bits in itertools.product([False, True], repeat=n)
        if all(any(bits[abs(lit) - 1] == (lit > 0) for lit in c) for c in clauses)
    ]


def test_watched_rup_matches_naive_propagation_and_truth_tables():
    rng = random.Random(3317)
    for _ in range(300):
        n = rng.randrange(1, 6)
        literals = list(range(1, n + 1)) + list(range(-n, 0))
        clauses = [
            rng.choices(literals, k=rng.randrange(1, 5)) for _ in range(rng.randrange(1, 12))
        ]
        checker = proof_verify.RUPChecker(n)
        for c in clauses:
            checker.add(c)
        for _ in range(20):
            candidate = rng.choices(literals, k=rng.randrange(0, 5))
            accepted = checker.implied(candidate)
            assert accepted == naive_unit_conflict(clauses, candidate)
            if accepted:
                assert all(
                    any(bits[abs(lit) - 1] == (lit > 0) for lit in candidate)
                    for bits in models(n, clauses)
                )
                checker.add(candidate)
                clauses.append(candidate)


def test_glucose_proofs_for_random_unsatisfiable_formulas():
    rng = random.Random(244)
    checked = 0
    for _ in range(100):
        n = 4
        clauses = [rng.sample(list(range(1, n + 1)) + list(range(-n, 0)), 3) for _ in range(45)]
        with Glucose4(with_proof=True) as solver:
            for c in clauses:
                solver.add_clause(c)
            answer = solver.solve()
            assert answer == bool(models(n, clauses))
            if not answer:
                proof = "\n".join(solver.get_proof()) + "\n0\n"
                assert proof_verify.check_drup(n, clauses, proof)["additions_checked"] > 0
                checked += 1
    assert checked >= 20


@pytest.fixture
def negative(tmp_path):
    result = solve(request(tmp_path / "negative", edge=[1, 2]))
    assert result["proof_certificate_verified"]
    return result["proof_certificate"]


@pytest.mark.parametrize(
    "proof", ["", "0\n", "1\n", "999999 0\n0\n", "1 -1 0\n", "a 0\n0\n", "0 0\n", "é\n", "d 0\n"]
)
def test_false_or_incomplete_proofs_are_rejected_even_with_rehashed_bytes(negative, proof):
    negative["proof"] = proof
    negative["proof_sha256"] = hashlib.sha256(proof.encode()).hexdigest()
    assert not proof_verify.verify_unsat(negative)["valid"]


@pytest.mark.parametrize(
    "change", ["input", "restriction", "cnf_hash", "proof_hash", "schema", "tree"]
)
def test_certificate_is_bound_to_input_scope_encoding_and_proof(negative, change):
    if change == "input":
        negative["input"]["edges"] = [[0, 1], [0, 2], [0, 3]]
        negative["restriction"] = {"kind": "extreme_edge", "edge": [0, 1]}
    elif change == "restriction":
        negative["restriction"] = None
    elif change == "cnf_hash":
        negative["cnf_sha256"] = "0" * 64
    elif change == "proof_hash":
        negative["proof_sha256"] = "0" * 64
    elif change == "schema":
        negative["schema_version"] = True
    elif change == "tree":
        negative["input"]["edges"][-1] = [2, 0]
    if change in {"input", "restriction"}:
        v, cs = encode(**negative["input"], restriction=negative["restriction"])
        negative["cnf_sha256"] = hashlib.sha256("".join(dimacs_lines(v, cs)).encode()).hexdigest()
    assert not proof_verify.verify_unsat(negative)["valid"]


def test_redundant_deletions_are_safe_and_checked_syntactically(negative):
    negative["proof"] = "c deletions do not strengthen the formula\nd 1 0\n" + negative["proof"]
    negative["proof_sha256"] = hashlib.sha256(negative["proof"].encode()).hexdigest()
    result = proof_verify.verify_unsat(negative)
    assert result["valid"] and result["deletions_ignored"] >= 1
    negative["proof"] = "d 0 0\n" + negative["proof"]
    negative["proof_sha256"] = hashlib.sha256(negative["proof"].encode()).hexdigest()
    assert not proof_verify.verify_unsat(negative)["valid"]


def test_expired_proof_budget_and_sat_budget_never_certify(tmp_path, negative):
    checked = proof_verify.verify_unsat(negative, deadline=time.monotonic() - 1)
    assert not checked["valid"] and checked["timed_out"]
    req = request(tmp_path / "expired", nx.path_graph(75), seconds=0)
    result = solve(req)
    assert result["status"] == "unknown" and result["timed_out"]
    assert not result["proof_certificate_verified"]


def test_checker_runs_without_site_packages(tmp_path, negative):
    source = Path(proof_verify.__file__).parent
    for name in ("proof_verify.py", "verify.py"):
        shutil.copyfile(source / name, tmp_path / name)
    (tmp_path / "certificate.json").write_text(json.dumps(negative))
    process = subprocess.run(
        [
            sys.executable,
            "-S",
            str(tmp_path / "proof_verify.py"),
            str(tmp_path / "certificate.json"),
        ],
        capture_output=True,
        text=True,
    )
    assert process.returncode == 0, process.stdout + process.stderr
    assert json.loads(process.stdout)["proofs_checked"] == 1


def test_sat_worker_can_be_reused_after_interrupted_request(tmp_path):
    supervisor = Supervisor()
    try:
        result = supervisor.solve(
            request(tmp_path / "short", nx.path_graph(75), seconds=0.001), time.monotonic() + 5
        )
        assert result["status"] == "unknown" and not result["proof_certificate_verified"]
        result = supervisor.solve(request(tmp_path / "next", edge=[1, 2]), time.monotonic() + 10)
        assert result["status"] == "solver_infeasible" and result["proof_certificate_verified"]
    finally:
        supervisor.stop(force=True)


@pytest.mark.parametrize(
    "field,value",
    [("backend", []), ("backend", "typo"), ("probe_backend", {}), ("certify_infeasible", 1)],
)
def test_invalid_sat_options(field, value):
    with pytest.raises(ValueError):
        replace(Config(), **{field: value}).validate()


def test_sat_size_limit_and_unchanged_generation_identity():
    default = Config()
    assert (
        default.generation_fingerprint()
        == replace(default, backend="sat", probe_backend="sat").generation_fingerprint()
    )
    with pytest.raises(ValueError, match="75"):
        replace(default, backend="sat", sample_sizes=[76]).validate()


def test_sat_run_resume_audit_and_tampered_ledger(tmp_path):
    config = small_config(
        backend="sat",
        probe_backend="sat",
        constructive_search=False,
        exhaustive_sizes=[1, 2, 3, 4],
        max_cases=5,
        probe_max_attempts=20,
    )
    first = tmp_path / "first"
    manifest, _ = run(config, first)
    checked = audit_run(first)
    assert checked["valid"], checked
    assert checked["infeasibility_proofs_checked"] >= 1
    assert manifest["summary"]["certificate_verified_infeasible"] == 0
    progress = json.loads((first / "progress.json").read_text())
    assert progress["proof_counts"]["restricted_attempts"] >= 1
    assert progress["proof_counts"]["unrestricted_attempts"] == 0
    assert progress["certificate_verified_infeasible"] == 0
    assert not json.loads((first / "findings.json").read_text())["findings"]
    records = [json.loads(line) for line in (first / "attempts.jsonl").read_text().splitlines()]
    certified = next(r for r in records if r["proof_certificate_verified"])
    for filename in ("model.cnf", "proof.drup", "certificate"):
        changed = tmp_path / ("damaged-" + filename)
        shutil.copytree(first, changed)
        if filename == "certificate":
            (changed / "unsat-certificates" / (Path(certified["files"]).name + ".json")).unlink()
        else:
            path = changed / certified["files"] / filename
            path.write_text(path.read_text() + "c unbound replacement bytes\n")
        write_checksums(changed)
        rejected = audit_run(changed)
        assert not rejected["valid"]
        assert any(
            "UNSAT certificate" in err or "saved SAT evidence" in err for err in rejected["errors"]
        )
    second = tmp_path / "second"
    run(config, second, resume=first / "research.sqlite")
    checked_again = audit_run(second)
    assert checked_again["valid"], checked_again
    assert checked_again["infeasibility_proofs_checked"] == checked["infeasibility_proofs_checked"]
    # Historical proof bytes, not expired earlier artifact files, back this count.
    with sqlite3.connect(second / "research.sqlite") as db:
        rows = db.execute("SELECT attempt_id,data FROM attempts").fetchall()
        key, record = next(
            (k, json.loads(r)) for k, r in rows if json.loads(r).get("proof_certificate_verified")
        )
        record["proof_certificate"]["proof"] = "0\n"
        record["proof_certificate"]["proof_sha256"] = hashlib.sha256(b"0\n").hexdigest()
        db.execute("UPDATE attempts SET data=? WHERE attempt_id=?", (json.dumps(record), key))
    write_checksums(second)
    rejected = audit_run(second)
    assert not rejected["valid"]
    assert any("invalid UNSAT proof" in err for err in rejected["errors"])


def test_scope_cannot_be_laundered_via_record_flag(negative):
    record = {
        "status": "solver_infeasible",
        "raw_status": "INFEASIBLE",
        "labels": None,
        "timed_out": False,
        "input": negative["input"],
        "restriction": None,
        "proof_certificate": copy.deepcopy(negative),
        "proof_certificate_verified": True,
    }
    assert not proof_verify.verify_record(record)["valid"]


def test_committed_negative_example_remains_independently_verifiable():
    path = Path(__file__).resolve().parents[1] / "examples/sat-path4-middle/unsat-certificate.json"
    check = proof_verify.verify_unsat(json.loads(path.read_text()))
    assert check["valid"] and check["scope"] == "extreme_edge"


@pytest.mark.parametrize("timed_out", [True, False])
def test_unchecked_solver_unsat_is_never_counted_as_certified(tmp_path, monkeypatch, timed_out):
    from graceful_research import sat_solver

    monkeypatch.setattr(
        sat_solver,
        "verify_unsat",
        lambda *args, **kwargs: {
            "valid": False,
            "timed_out": timed_out,
            "errors": ["test rejection"],
        },
    )
    result = solve(request(tmp_path / "unchecked", edge=[1, 2]))
    assert not result["proof_certificate_verified"]
    assert result["status"] == ("solver_infeasible" if timed_out else "integrity_error")
