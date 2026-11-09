"""Checks for benchmark isolation, independent checks, and paired summaries."""

import importlib.util
import json
from collections import Counter
from pathlib import Path

import networkx as nx
import pytest

from graceful_research.constructive import caterpillar_labeling
from graceful_research.trees import canonical_code, tree_id

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "benchmark_swaps", PROJECT / "scripts/benchmark_swaps.py"
)
benchmark_swaps = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark_swaps)


def test_fresh_corpus_is_unique_disjoint_and_prespecified():
    cases, excluded = benchmark_swaps.fresh_inputs()
    again, again_excluded = benchmark_swaps.fresh_inputs()
    assert cases == again and excluded == again_excluded
    assert len(cases) == len({case["tree_id"] for case in cases}) == 48
    assert not {case["tree_id"] for case in cases} & set(excluded)
    assert Counter((case["family"], case["input"]["n"]) for case in cases) == {
        (family, n): 6 for family in ("prufer", "recursive", "spider", "lobster") for n in (35, 75)
    }
    prior = {
        case["tree_id"]
        for name in benchmark_swaps.PRIOR_CORPORA
        for case in json.loads((PROJECT / "examples" / name).read_text())["inputs"]
    }
    assert set(excluded) == prior
    for case in cases:
        graph = nx.Graph()
        graph.add_nodes_from(range(case["input"]["n"]))
        graph.add_edges_from(case["input"]["edges"])
        assert case["tree_id"] == tree_id(canonical_code(graph))
        assert caterpillar_labeling(**case["input"]) is None


def case():
    return {
        "input": {"n": 3, "edges": [[0, 1], [1, 2]]},
        "tree_id": "test-path",
        "family": "test",
        "solver_seed": 7,
    }


def test_whole_routes_keep_budgets_and_fallback_model(tmp_path, monkeypatch):
    calls = []
    expected = benchmark_swaps.model_hash(case()["input"])

    def solve(request):
        calls.append(request)
        return {
            "status": "unknown",
            "labels": None,
            "search_method": "cp-sat",
            "wall_seconds": 0.01,
            "model_sha256": expected,
        }

    monkeypatch.setattr(benchmark_swaps, "solve", solve)
    result = benchmark_swaps.holdout_suite(
        [case()],
        tmp_path,
        seconds=1,
        repeats=3,
        objective="missing_count",
        policy="missing_difference",
    )
    assert len(calls) == len(result["records"]) == 9
    assert {c["solver_seconds"] for c in calls} == {1}
    assert {c["swap_objective"] for c in calls} == {"missing_count"}
    assert {c["swap_proposal_policy"] for c in calls} == {"missing_difference"}
    assert [c["frontier_algorithm"] for c in calls[:3]] == [
        "portfolio-frontier-v3",
        "label-swap-v1",
        "swap-portfolio-v5",
    ]
    assert [c["frontier_max_nodes"] for c in calls[:3]] == [40000, 40000, 80000]
    assert [c["frontier_algorithm"] for c in calls[3:6]] == [
        "label-swap-v1",
        "swap-portfolio-v5",
        "portfolio-frontier-v3",
    ]
    assert all(r["unknown"] == 1 and r["verified"] == 0 for r in result["totals"])
    assert len(list((tmp_path / "attempts").glob("*/request.json"))) == 9


def test_changed_fallback_rejected_even_without_another_fallback(tmp_path, monkeypatch):
    def solve(request):
        if request["frontier_algorithm"] == "portfolio-frontier-v3":
            return {
                "status": "verified_graceful",
                "labels": [0, 2, 1],
                "search_method": "frontier-search",
                "wall_seconds": 0.001,
            }
        return {
            "status": "unknown",
            "labels": None,
            "search_method": "cp-sat",
            "wall_seconds": 0.01,
            "model_sha256": "wrong-model",
        }

    monkeypatch.setattr(benchmark_swaps, "solve", solve)
    with pytest.raises(RuntimeError, match="fallback model changed"):
        benchmark_swaps.holdout_suite(
            [case()], tmp_path, seconds=1, repeats=1, objective="missing_sum"
        )


@pytest.mark.parametrize(
    "result",
    [
        {"status": "verified_graceful", "labels": [0, 1, 2]},
        {"status": "solver_infeasible", "labels": None},
        {"status": "unknown", "labels": [0, 2, 1]},
    ],
)
def test_invalid_and_unexpected_outcomes_stop_the_experiment(result):
    with pytest.raises(RuntimeError):
        benchmark_swaps._verified_result(case(), result)


def test_summary_preserves_repetition_instability():
    # Baseline loses case1 consistently and case2 only in one repetition.
    records = []
    positive = {
        ("baseline", 0): {0},
        ("baseline", 1): {0, 2},
        ("new", 0): {1, 2},
        ("new", 1): {1, 2},
    }
    for (variant, repeat), successes in positive.items():
        for index in range(3):
            records.append(
                {
                    "variant": variant,
                    "repeat": repeat,
                    "case": index,
                    "status": "verified_graceful" if index in successes else "unknown",
                    "family": "test",
                    "n": 3,
                    "wall_seconds": 1,
                    "search_method": "test",
                }
            )
    result = benchmark_swaps.summarize(records, ["baseline", "new"], 2, baseline="baseline")
    assert result["verified_every_repeat"] == {"baseline": [0], "new": [1, 2]}
    comparison = result["comparisons_against_baseline"]["new"]
    assert comparison["consistent_gains"] == [1]
    assert comparison["consistent_losses"] == [0]
    assert comparison["gains_by_repeat"] == [[1, 2], [1]]
    assert result["median_seconds"] == {"baseline": 3, "new": 3}


@pytest.mark.parametrize(
    "kwargs",
    [
        {"phase": "other"},
        {"objective": "other"},
        {"policy": "other"},
        {"seconds": 0},
        {"seconds": float("nan")},
        {"seconds": True},
        {"repeats": 0},
        {"repeats": True},
    ],
)
def test_invalid_protocol_rejected_before_creating_archive(tmp_path, kwargs):
    path = tmp_path / "archive"
    with pytest.raises(ValueError):
        benchmark_swaps.benchmark(path, **kwargs)
    assert not path.exists()


def test_existing_archive_is_not_overwritten(tmp_path):
    with pytest.raises(FileExistsError):
        benchmark_swaps.benchmark(tmp_path)


def test_static_report_distinguishes_unknowns(tmp_path):
    records = [
        {
            "variant": "baseline",
            "repeat": 0,
            "case": 0,
            "status": "unknown",
            "family": "test",
            "n": 3,
            "wall_seconds": 1,
            "search_method": "test",
        }
    ]
    result = benchmark_swaps.summarize(records, ["baseline"], 1, baseline="baseline")
    result["metadata"] = {"phase": "holdout", "cases": 1, "repeats": 1, "protocol": "Control."}
    benchmark_swaps.render_report(tmp_path, result)
    assert "<svg" in (tmp_path / "comparison.svg").read_text()
    assert (tmp_path / "comparison.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
    report = (tmp_path / "report.md").read_text()
    assert "| baseline | 0 / 1 |" in report
    assert "failures are unknown" in report


def test_plot_cache_is_writable_and_respects_override(tmp_path, monkeypatch):
    monkeypatch.delenv("MPLCONFIGDIR", raising=False)
    monkeypatch.setattr(benchmark_swaps.tempfile, "gettempdir", lambda: str(tmp_path))
    benchmark_swaps._prepare_plot_cache()
    cached = Path(benchmark_swaps.os.environ["MPLCONFIGDIR"])
    assert cached.parent == tmp_path and cached.is_dir()
    override = tmp_path / "operator-cache"
    monkeypatch.setenv("MPLCONFIGDIR", str(override))
    benchmark_swaps._prepare_plot_cache()
    assert benchmark_swaps.os.environ["MPLCONFIGDIR"] == str(override)


def test_development_forwards_fixed_policy_to_both_objectives(tmp_path, monkeypatch):
    from graceful_research import swap_search

    calls = []

    def search(**request):
        calls.append(request)
        return {"labels": None, "wall_seconds": 0.01, "proposal_policy": request["proposal_policy"]}

    monkeypatch.setattr(swap_search, "search", search)
    result = benchmark_swaps.development_suite(
        [case()], tmp_path, seconds=1, repeats=1, policy="missing_difference"
    )
    assert len(calls) == 2
    assert {c["proposal_policy"] for c in calls} == {"missing_difference"}
    assert {c["objective"] for c in calls} == set(benchmark_swaps.OBJECTIVES)
    assert all(r["candidate"]["proposal_policy"] == "missing_difference" for r in result["records"])
