"""Retry preselection preserves scheduling while avoiding solved-history reads."""

import random

import pytest

import graceful_research.storage as storage
from graceful_research.config import Config
from graceful_research.storage import Store


def legacy_retry_cases(store, config):
    """Original queue algorithm, retained here as an ordering oracle."""
    candidates = []
    for case in store.cases():
        records = store.attempts(tree_id=case["tree_id"], scope="graceful")
        if any(r["status"] == "verified_graceful" for r in records):
            continue
        if len(records) >= config.max_attempts_per_case:
            continue
        if not records:
            priority = (0, 0, case["tree_id"])
        else:
            suspected = any(r["status"] == "solver_infeasible" for r in records)
            priority = (
                0 if suspected else 1,
                len(records),
                -records[-1].get("wall_seconds", 0),
            )
        candidates.append((priority, case))
    return [case for _, case in sorted(candidates, key=lambda item: item[0])]


@pytest.fixture
def store():
    ledger = Store(":memory:", Config())
    ledger.save_run("run", {})
    yield ledger
    ledger.close()


def add_case(store, name, n):
    case = {"tree_id": name, "canonical_code": name, "n": n, "family": "fixture"}
    store.add_case(case)
    return case


def add_attempt(store, name, status, *, scope="graceful", seconds=1.0):
    record = {
        "run_id": "run",
        "tree_id": name,
        "scope": scope,
        "edge_key": "0-1" if scope == "extreme_edge" else "",
        "status": status,
    }
    if seconds is not None:
        record["wall_seconds"] = seconds
    store.add_attempt(record)


@pytest.mark.parametrize("seed", range(8))
@pytest.mark.parametrize("limit", (1, 2, 4, 8))
def test_retry_queue_matches_original_for_mixed_histories(store, seed, limit):
    rng = random.Random(seed)
    names = [f"case-{index:03d}" for index in range(32)]
    rng.shuffle(names)
    for name in names:
        add_case(store, name, rng.randrange(1, 20))
        for _ in range(rng.randrange(7)):
            add_attempt(
                store,
                name,
                rng.choice(("unknown", "solver_infeasible", "verified_graceful", "error")),
                scope=rng.choice(("graceful", "graceful", "extreme_edge")),
                seconds=rng.choice((None, 0.0, 0.25, 1.0, 4.0)),
            )
    config = Config(max_attempts_per_case=limit, max_retries=1)
    assert store.retry_cases(config) == legacy_retry_cases(store, config)


def test_pending_suspected_and_tied_cases_retain_original_priority(store):
    for name, n in (
        ("unknown-b", 10),
        ("pending-z", 2),
        ("unknown-a", 10),
        ("suspected", 20),
        ("pending-a", 40),
        ("restricted-positive", 6),
        ("solved-earlier", 2),
        ("exhausted", 2),
    ):
        add_case(store, name, n)
    for name in ("unknown-b", "unknown-a"):
        add_attempt(store, name, "unknown", seconds=2.0)
    add_attempt(store, "suspected", "solver_infeasible")
    add_attempt(store, "restricted-positive", "verified_graceful", scope="extreme_edge")
    add_attempt(store, "solved-earlier", "verified_graceful")
    add_attempt(store, "solved-earlier", "unknown")
    for _ in range(3):
        add_attempt(store, "exhausted", "unknown")
    config = Config(max_attempts_per_case=3, max_retries=1)
    actual = store.retry_cases(config)
    assert actual == legacy_retry_cases(store, config)
    assert [case["tree_id"] for case in actual] == [
        "pending-a",
        "pending-z",
        "restricted-positive",
        "suspected",
        "unknown-a",
        "unknown-b",
    ]
    assert len(actual) > config.max_retries  # The caller owns this separate limit.


@pytest.mark.parametrize("policy", ("bounded", "oldest_unresolved"))
def test_solved_history_needs_one_select_and_no_json_decoding(store, monkeypatch, policy):
    for index in range(40):
        name = f"solved-{index}"
        add_case(store, name, index + 1)
        add_attempt(store, name, "verified_graceful")
        add_attempt(store, name, "unknown")
    queries = []
    decoded = []
    loads = storage.json.loads

    def decode(value):
        decoded.append(value)
        return loads(value)

    monkeypatch.setattr(storage.json, "loads", decode)
    store.connection.set_trace_callback(queries.append)
    assert store.retry_cases(Config(retry_policy=policy)) == []
    store.connection.set_trace_callback(None)
    assert len(queries) == 1
    assert decoded == []


def test_exhausted_unknown_history_is_not_decoded(store, monkeypatch):
    add_case(store, "exhausted", 5)
    for _ in range(4):
        add_attempt(store, "exhausted", "unknown")

    def forbidden_decode(value):
        pytest.fail("ineligible history should not be decoded")

    monkeypatch.setattr(storage.json, "loads", forbidden_decode)
    assert store.retry_cases(Config(max_attempts_per_case=4)) == []


def test_oldest_policy_reopens_capped_unknowns_and_rotates_after_a_retry(store):
    add_case(store, "older-capped", 75)
    add_case(store, "newer-once", 5)
    for _ in range(4):
        add_attempt(store, "older-capped", "unknown", seconds=30)
    add_attempt(store, "newer-once", "unknown", seconds=1)
    bounded = Config(max_attempts_per_case=4)
    oldest = Config(retry_policy="oldest_unresolved", max_attempts_per_case=4, max_retries=1)
    assert [case["tree_id"] for case in store.retry_cases(bounded)] == ["newer-once"]
    assert [case["tree_id"] for case in store.retry_cases(oldest)] == [
        "older-capped",
        "newer-once",
    ]
    # Scheduling is read-only and the caller, not this queue, applies max_retries.
    before = store.attempts()
    assert len(store.retry_cases(oldest)) > oldest.max_retries
    assert store.attempts() == before
    add_attempt(store, "older-capped", "unknown", seconds=90)
    assert [case["tree_id"] for case in store.retry_cases(oldest)] == [
        "newer-once",
        "older-capped",
    ]
    assert len(store.attempts(tree_id="older-capped", scope="graceful")) == 5


def test_oldest_policy_excludes_historical_positives_and_ignores_other_scopes(store):
    for name in ("older-unknown", "newer-unknown", "solved-earlier"):
        add_case(store, name, 10)
    add_attempt(store, "older-unknown", "unknown")
    add_attempt(store, "newer-unknown", "unknown")
    # A later scoped witness neither solves nor changes the age of the base case.
    add_attempt(store, "older-unknown", "verified_graceful", scope="extreme_edge")
    add_attempt(store, "solved-earlier", "verified_graceful")
    for _ in range(5):
        add_attempt(store, "solved-earlier", "unknown")
    config = Config(retry_policy="oldest_unresolved", max_attempts_per_case=1)
    assert [case["tree_id"] for case in store.retry_cases(config)] == [
        "older-unknown",
        "newer-unknown",
    ]
    add_attempt(store, "older-unknown", "verified_graceful")
    assert [case["tree_id"] for case in store.retry_cases(config)] == ["newer-unknown"]


def test_oldest_policy_prioritizes_pending_and_suspected_before_ordinary_unknowns(store):
    for name, n in (
        ("unknown-old", 75),
        ("restricted-negative", 4),
        ("suspected", 20),
        ("pending-z", 1),
        ("pending-a", 100),
        ("restricted-only", 2),
        ("unknown-new", 3),
    ):
        add_case(store, name, n)
    add_attempt(store, "unknown-old", "unknown")
    add_attempt(store, "restricted-negative", "unknown")
    add_attempt(store, "restricted-negative", "solver_infeasible", scope="extreme_edge")
    add_attempt(store, "suspected", "solver_infeasible")
    add_attempt(store, "suspected", "unknown")
    add_attempt(store, "restricted-only", "verified_graceful", scope="extreme_edge")
    add_attempt(store, "unknown-new", "unknown")
    config = Config(retry_policy="oldest_unresolved", max_attempts_per_case=1)
    assert [case["tree_id"] for case in store.retry_cases(config)] == [
        "pending-a",
        "pending-z",
        "restricted-only",
        "suspected",
        "unknown-old",
        "restricted-negative",
        "unknown-new",
    ]
