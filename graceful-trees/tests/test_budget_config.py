"""Budget policies are explicit operational settings, not generation changes."""

import json
from dataclasses import replace

import pytest

from graceful_research.config import Config
from graceful_research.storage import Store


def test_new_budget_options_default_to_legacy_behavior(tmp_path):
    path = tmp_path / "legacy.json"
    path.write_text('{"attempt_seconds": 3}')
    config = Config.read(path)
    assert config.retry_policy == "bounded"
    assert config.probe_seconds is None
    assert config.fill_unused_budget is False
    assert config.attempt_seconds == 3
    assert config.max_attempts_per_case == 4


@pytest.mark.parametrize("value", (None, 0.000001, 1, 90.5))
def test_optional_probe_seconds_accepts_positive_finite_values(value):
    config = Config(probe_seconds=value).validate()
    assert config.probe_seconds == value


@pytest.mark.parametrize(
    "value", (0, -1, True, False, "30", [], {}, float("nan"), float("inf"), float("-inf"))
)
def test_optional_probe_seconds_rejects_invalid_values(value):
    with pytest.raises(ValueError, match="probe_seconds"):
        Config(probe_seconds=value).validate()


@pytest.mark.parametrize("policy", ("bounded", "oldest_unresolved"))
def test_retry_policy_is_explicit_and_serialized(policy, tmp_path):
    original = Config(retry_policy=policy, probe_seconds=60, fill_unused_budget=True).validate()
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(original.as_dict()))
    assert Config.read(path) == original


@pytest.mark.parametrize("value", (None, True, 1, "oldest", "", [], {}))
def test_invalid_retry_policy_is_rejected(value):
    with pytest.raises(ValueError, match="retry_policy"):
        Config(retry_policy=value).validate()


@pytest.mark.parametrize("value", (None, 0, 1, "true", [], {}))
def test_fill_unused_budget_requires_a_boolean(value):
    with pytest.raises(ValueError, match="fill_unused_budget"):
        Config(fill_unused_budget=value).validate()


def test_budget_policy_changes_preserve_generation_identity_and_existing_checkpoint(tmp_path):
    original = Config().validate()
    updated = replace(
        original,
        retry_policy="oldest_unresolved",
        retry_seconds=90,
        probe_seconds=30,
        fill_unused_budget=True,
        retry_budget_fraction=0.6,
        probe_budget_fraction=0.2,
        max_cases=10000,
        max_generated=100000,
    ).validate()
    assert updated.generation_fingerprint() == original.generation_fingerprint()
    database = tmp_path / "campaign.sqlite"
    first = Store(database, original)
    first.save_run("previous", {"config": original.as_dict(), "finished_at": "preserved"})
    first.set_cursor("sample:prufer:75", 123)
    case = {"tree_id": "fixture", "canonical_code": "fixture", "n": 1, "family": "fixture"}
    first.add_case(case)
    first.add_attempt(
        {
            "run_id": "previous",
            "tree_id": "fixture",
            "scope": "graceful",
            "edge_key": "",
            "status": "unknown",
        }
    )
    prior_runs = first.connection.execute("SELECT * FROM runs").fetchall()
    prior_attempts = first.connection.execute("SELECT * FROM attempts").fetchall()
    first.close()
    resumed = Store(database, updated)
    try:
        assert resumed.cursor("sample:prufer:75") == 123
        assert resumed.case("fixture") == case
        assert resumed.connection.execute("SELECT * FROM runs").fetchall() == prior_runs
        assert resumed.connection.execute("SELECT * FROM attempts").fetchall() == prior_attempts
    finally:
        resumed.close()
