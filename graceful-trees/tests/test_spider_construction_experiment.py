"""Experiment verification cannot accept a wrong requested root or extreme edge."""

import importlib.util
from pathlib import Path

import pytest

from graceful_research.spider_construction import five_edge_spider_depth_two_zero

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "experiment_spider_construction", PROJECT / "scripts/experiment_spider_construction.py"
)
experiment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(experiment)


def test_frozen_corpus_counts_and_deduplication():
    cases = experiment.cases()
    assert len(cases) == 338
    assert len({case["name"] for case in cases}) == 338
    assert sum(case["leg_length"] == 4 for case in cases) == 68
    assert sum(case["leg_length"] == 5 for case in cases) == 270
    assert sum(case["legs"] == 1 for case in cases) == 3
    assert max(case["legs"] for case in cases) == 10000


def test_wrong_requested_root_cannot_pass_a_graceful_witness():
    case = next(case for case in experiment.cases((3,)) if case["name"] == "s3_5_depth2_leg0")
    certificate = experiment.construct(case)
    assert experiment.verify_answer(case, certificate)["valid"]
    case["root_leg"] = 2
    result = experiment.verify_answer(case, certificate)
    assert not result["valid"]
    assert not result["root_valid"]


def test_gracefulness_and_zero_do_not_bypass_required_extreme_edge():
    case = next(case for case in experiment.cases((3,)) if case["name"] == "s3_5_depth2_leg0")
    certificate = five_edge_spider_depth_two_zero(3)
    result = experiment.verify_answer(case, certificate)
    assert result["root_valid"]
    assert result["shape_valid"]
    assert not result["valid"]
    assert "restricted edge does not carry difference n-1" in result["errors"]


def test_independent_rejection_prevents_success_summary(tmp_path, monkeypatch):
    monkeypatch.setattr(experiment, "provenance", lambda output: {"source_hashes": {}})
    original = experiment.construct

    def corrupt(case):
        certificate = original(case)
        certificate["labels"][certificate["root"]] = 1
        return certificate

    monkeypatch.setattr(experiment, "construct", corrupt)
    output = tmp_path / "rejected"
    with pytest.raises(ValueError, match="independent verification rejected"):
        experiment.experiment(output, leg_counts=(1,))
    assert (output / "failure.json").exists()
    assert not (output / "summary.json").exists()


@pytest.mark.parametrize("leg_counts", [[], [1, 1], [0], [True], [10001], "3"])
def test_invalid_corpus_is_rejected_before_output(leg_counts, tmp_path):
    output = tmp_path / "invalid"
    with pytest.raises(ValueError):
        experiment.experiment(output, leg_counts=leg_counts)
    assert not output.exists()
