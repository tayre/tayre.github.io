"""The extra method must share the existing time budget and preserve evidence scope."""

from types import SimpleNamespace

import networkx as nx
import pytest

from graceful_research import frontier_portfolio as portfolio
from graceful_research.trees import generate_family, graph_input
from graceful_research.verify import verify_labeling


def test_original_witness_stops_before_the_second_method(monkeypatch):
    def unexpected(*args, **kwargs):
        raise AssertionError("Do not spend more compute after finding a witness")

    monkeypatch.setattr(portfolio, "memo_search", unexpected)
    data = graph_input(nx.path_graph(4))
    result = portfolio.search(**data, seed=1)
    assert verify_labeling(**data, labels=result["labels"])["valid"]
    assert len(result["stages"]) == 1
    assert result["stages"][0]["algorithm"] == "descending-frontier-v1"


def test_second_method_gets_only_remaining_wall_time_and_nodes(monkeypatch):
    calls = []
    clock = iter([0, 0.01, 0.06, 0.07])
    monkeypatch.setattr(portfolio, "time", SimpleNamespace(monotonic=lambda: next(clock)))

    def first(*args, **kwargs):
        calls.append(kwargs)
        return {"labels": None, "nodes": 11, "termination": "node_limit"}

    def second(*args, **kwargs):
        calls.append(kwargs)
        return {"labels": [0, 3, 1, 2], "nodes": 16, "termination": "witness"}

    monkeypatch.setattr(portfolio, "legacy_search", first)
    monkeypatch.setattr(portfolio, "memo_search", second)
    result = portfolio.search(**graph_input(nx.path_graph(4)), seed=1, max_nodes=50, seconds=0.1)
    assert calls[0]["seconds"] == pytest.approx(0.09)
    assert calls[1]["seconds"] == pytest.approx(0.04)
    assert calls[0]["max_nodes"] == 50 and calls[1]["max_nodes"] == 39
    assert result["nodes"] == 27 and not result["search_complete"]


@pytest.mark.parametrize("limit", [{"seconds": 0}, {"max_nodes": 0}])
def test_empty_budgets_stay_unresolved(limit):
    result = portfolio.search(**graph_input(nx.path_graph(4)), seed=1, **limit)
    assert result["labels"] is None and result["nodes"] == 0
    assert len(result["stages"]) == 1 and "status" not in result


def test_both_methods_work_on_a_saved_hard_case():
    data = graph_input(generate_family("prufer", 75, 104729))
    result = portfolio.search(**data, seed=1455168780, seconds=30)
    assert len(result["stages"]) == 2
    assert result["nodes"] <= 40000
    assert all(stage["nodes"] <= 20000 for stage in result["stages"])
    assert verify_labeling(**data, labels=result["labels"])["valid"]


def test_malformed_input_is_validated_even_with_no_budget():
    with pytest.raises(ValueError, match="invalid tree"):
        portfolio.search(4, [[0, 1], [1, 2], [2, 0]], seed=1, seconds=0)


@pytest.mark.parametrize(
    "options", [{"seconds": float("nan")}, {"max_nodes": -1}, {"max_nodes": True}]
)
def test_invalid_portfolio_limits(options):
    with pytest.raises(ValueError):
        portfolio.search(**graph_input(nx.path_graph(4)), seed=1, **options)
