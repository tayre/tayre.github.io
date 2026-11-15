import json
import sqlite3

import pytest

from graceful_research.findings import build_findings, coverage_through


@pytest.fixture
def evidence():
    database = sqlite3.connect(":memory:")
    database.executescript("""
        CREATE TABLE runs(run_id TEXT, manifest TEXT);
        CREATE TABLE attempts(attempt_id INTEGER PRIMARY KEY, data TEXT);
    """)
    manifests = [{"run_id": str(i), "config": {"campaign": "test"}} for i in range(1, 5)]
    database.executemany(
        "INSERT INTO runs VALUES (?,?)", [(m["run_id"], json.dumps(m)) for m in manifests]
    )
    yield database, manifests[-1]
    database.close()


def add(database, index, status, *, scope="graceful", run_id=None, labels=None):
    record = {
        "attempt_id": index,
        "run_id": run_id or str(index),
        "tree_id": "star20",
        "family": "star",
        "scope": scope,
        "status": status,
        "input": {"n": 20, "edges": [[0, leaf] for leaf in range(1, 20)]},
        "labels": labels,
    }
    database.execute("INSERT INTO attempts VALUES (?,?)", (index, json.dumps(record)))


def test_routine_timeouts_and_restricted_infeasibility_are_not_alerts(evidence):
    database, manifest = evidence
    add(database, 1, "unknown")
    add(database, 2, "solver_infeasible", scope="extreme_edge")
    assert build_findings(database, manifest)["findings"] == []


@pytest.mark.parametrize(
    "status,stratum,expected",
    [
        ("supported", "target_deficiency_ge2", False),
        ("incomplete", "target_deficiency_ge2", False),
        ("uncertified", "target_deficiency_ge2", False),
        ("certified_restricted_counterexample", "control_caterpillar", False),
        ("certified_restricted_counterexample", "target_deficiency_ge2", True),
    ],
)
def test_focused_alert_requires_complete_restricted_target_profile(
    evidence, status, stratum, expected
):
    # Findings consume profiles; the separate mandatory audit rederives profiles
    # and independently rechecks every certificate before notification is enabled.
    database, manifest = evidence
    database.execute("CREATE TABLE focused_records(record_id INTEGER,study TEXT,data TEXT)")
    record = {
        "run_id": "1",
        "data": {
            "case": {"tree_id": "fixture", "n": 12, "family": "lobster"},
            "profile": {
                "status": status,
                "focus_stratum": stratum,
                "ordinary_witness_attempt_ids": [1],
                "orbits": [{"evidence_attempt_ids": [2, 3]}],
            },
        },
    }
    for identity in (1, 2):
        database.execute(
            "INSERT INTO focused_records VALUES (?,'pendant',?)", (identity, json.dumps(record))
        )
    findings = build_findings(database, manifest)["findings"]
    assert len(findings) == int(expected)
    if expected:
        assert findings[0]["kind"] == "restricted_property_counterexample"
        assert findings[0]["attempt_ids"] == [1, 2, 3]
        assert "only the stated restricted property" in findings[0]["significance"]


def test_unrestricted_infeasibility_is_a_review_candidate_not_a_proof(evidence):
    database, manifest = evidence
    add(database, 1, "solver_infeasible")
    add(database, 2, "solver_infeasible")
    findings = build_findings(database, manifest)["findings"]
    assert len(findings) == 1
    assert findings[0]["kind"] == "unrestricted_infeasibility"
    assert "not a certified counterexample" in findings[0]["significance"]


@pytest.mark.parametrize(
    "count,valid,distinct,expected",
    [(3, True, True, 1), (2, True, True, 0), (3, False, True, 0), (3, True, False, 0)],
)
def test_resolved_case_needs_repeated_difficulty_and_a_valid_witness(
    evidence, count, valid, distinct, expected
):
    database, manifest = evidence
    for index in range(1, count + 1):
        add(database, index, "unknown", run_id=str(index) if distinct else "1")
    add(database, count + 1, "verified_graceful", labels=list(range(20)) if valid else [0] * 20)
    findings = build_findings(database, manifest)["findings"]
    assert len(findings) == expected
    if expected:
        assert findings[0]["kind"] == "difficult_case_resolved"
        assert "novelty is not established" in findings[0]["significance"]
        # Pending findings remain eligible for later delivery after a network failure.
        future = {"run_id": "5", "config": {"campaign": "test"}}
        database.execute("INSERT INTO runs VALUES (?,?)", ("5", json.dumps(future)))
        assert build_findings(database, future)["findings"] == findings


def test_coverage_requires_contiguous_exhausted_fully_witnessed_orders(evidence):
    database, manifest = evidence
    manifest["exhaustive_coverage"] = [
        {
            "n": n,
            "generator_exhausted": True,
            "enumerated_count": 1,
            "catalogued_classes": 1,
            "classes_with_witness": 1,
        }
        for n in range(1, 11)
    ]
    assert coverage_through(manifest) == 10
    findings = build_findings(database, manifest)["findings"]
    assert len(findings) == 1 and findings[0]["through_n"] == 10
    assert "not a new literature bound" in findings[0]["significance"]
    manifest["exhaustive_coverage"][4]["classes_with_witness"] = 0
    assert coverage_through(manifest) == 4
    assert build_findings(database, manifest)["findings"] == []
