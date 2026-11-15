"""Budget, scope, independent evidence and deterministic-corpus checks."""

import copy
import math
from types import SimpleNamespace

import networkx as nx
import pytest

from graceful_research import focused_matching as focused
from graceful_research.constructive import caterpillar_labeling
from graceful_research.trees import graph_input
from graceful_research.verify import verify_labeling


def request(tmp_path, variant="matching_first", **changes):
    return {
        "input": graph_input(nx.path_graph(4)),
        "seed": 191,
        "solver_seconds": 4.0,
        "directory": str(tmp_path),
        "variant": variant,
        "complement_break": False,
        "redundant_sum": False,
        "constructive_search": False,
        "frontier_search": True,
        "frontier_algorithm": "portfolio-frontier-v3",
        "frontier_max_nodes": 1234,
        **changes,
    }


def unknown(**extra):
    return {
        "status": "unknown",
        "labels": None,
        "termination": "node_limit",
        "timed_out": False,
        **extra,
    }


def failed_matching(**extra):
    return {
        "labels": None,
        "termination": "no_perfect_matching",
        "has_perfect_matching": False,
        "tree_infeasibility_claimed": False,
        "contraction_depth": 0,
        "levels": [],
        "nodes": 0,
        "work_units": 17,
        **extra,
    }


def clock(monkeypatch):
    ticks = [0.0]
    monkeypatch.setattr(focused, "time", SimpleNamespace(monotonic=lambda: ticks[0]))
    return ticks


def test_corpus_is_reproducible_and_every_block_spans_orders_and_strata():
    cases = [focused.case_for_index(index, 478) for index in range(40)]
    assert cases == [focused.case_for_index(index, 478) for index in range(40)]
    expected = {(n, stratum) for n in focused.ORDERS for stratum in focused.STRATA}
    for block in (cases[:20], cases[20:]):
        assert {(case["input"]["n"], case["stratum"]) for case in block} == expected
    assert cases[0]["input"] != focused.case_for_index(0, 479)["input"]
    assert len({case["input_seed"] for case in cases}) == len(cases)
    for case in cases:
        graph = nx.Graph(case["input"]["edges"])
        perfect = 2 * len(nx.max_weight_matching(graph, maxcardinality=True)) == len(graph)
        if case["expected_perfect_matching"] is not None:
            assert perfect is case["expected_perfect_matching"]
        assert nx.is_tree(graph)
        assert case["tree_id"]


@pytest.mark.parametrize("index,seed", [(-1, 1), (True, 1), (0, False), (0, "1")])
def test_invalid_generation_arguments(index, seed):
    with pytest.raises(ValueError):
        focused.case_for_index(index, seed)


def test_failed_matching_debits_actual_time_and_preserves_fallback_options(monkeypatch, tmp_path):
    ticks = clock(monkeypatch)
    matching_calls, solver_calls = [], []

    def match(**kwargs):
        matching_calls.append(kwargs)
        ticks[0] += 0.25
        return failed_matching()

    def solve(data):
        solver_calls.append(copy.deepcopy(data))
        data["frontier_algorithm"] = "mutated-by-worker"
        ticks[0] += 0.5
        return unknown()

    monkeypatch.setattr(focused.matching_lift, "search", match)
    monkeypatch.setattr(focused.solver, "solve", solve)
    source = request(tmp_path)
    frozen = copy.deepcopy(source)
    result = focused.run_trial(source)
    assert source == frozen
    assert matching_calls[0]["seconds"] == pytest.approx(0.4)
    assert matching_calls[0]["seed"] == source["seed"]
    sent = solver_calls[0]
    assert sent["solver_seconds"] == pytest.approx(3.75)
    for key in (
        "input",
        "seed",
        "complement_break",
        "redundant_sum",
        "constructive_search",
        "frontier_search",
        "frontier_algorithm",
        "frontier_max_nodes",
    ):
        assert sent[key] == source[key]
    assert "variant" not in sent
    assert sent["restriction"] is None
    assert result["matching_wall_seconds"] == pytest.approx(0.25)
    assert result["solver_wall_seconds"] == pytest.approx(0.5)
    assert result["worker_total_seconds"] == pytest.approx(0.75)
    assert result["censored"] and result["status"] == "unknown"
    assert result["matching"]["work_units"] == 17
    assert not focused.verify_trial(source["input"], result)


def test_baseline_receives_same_total_allowance_and_never_runs_matching(monkeypatch, tmp_path):
    clock(monkeypatch)
    calls = []
    monkeypatch.setattr(
        focused.matching_lift, "search", lambda **kwargs: pytest.fail("baseline called matching")
    )
    monkeypatch.setattr(focused.solver, "solve", lambda data: calls.append(data) or unknown())
    result = focused.run_trial(request(tmp_path, variant="baseline"))
    assert calls[0]["solver_seconds"] == 4
    assert result["matching"] is None
    assert result["matching_allowance_seconds"] == 0
    assert result["allowance_seconds"] == 4


def test_solver_mutation_cannot_replace_the_tree_under_verification(monkeypatch, tmp_path):
    clock(monkeypatch)

    def solve(data):
        data["input"].update(n=1, edges=[])
        return {"status": "verified_graceful", "labels": [0], "verification": {"valid": True}}

    monkeypatch.setattr(focused.solver, "solve", solve)
    source = request(tmp_path, variant="baseline")
    result = focused.run_trial(source)
    assert source["input"]["n"] == 4
    assert result["status"] == "invalid_solution"


def test_verification_and_detection_overhead_reduce_the_shared_remainder(monkeypatch, tmp_path):
    ticks = clock(monkeypatch)
    calls = []

    def match(**kwargs):
        ticks[0] += 0.35
        return failed_matching(termination="work_limit", wall_seconds=0.01)

    monkeypatch.setattr(focused.matching_lift, "search", match)
    monkeypatch.setattr(focused.solver, "solve", lambda data: calls.append(data) or unknown())
    result = focused.run_trial(request(tmp_path))
    assert calls[0]["solver_seconds"] == pytest.approx(3.65)
    assert result["matching_wall_seconds"] == pytest.approx(0.35)
    # The nested algorithm's self-reported time is not used to buy fallback time.
    assert result["matching"]["wall_seconds"] == 0.01


@pytest.mark.parametrize(
    "reason", ["no_perfect_matching", "node_limit", "work_limit", "time_limit"]
)
def test_every_matching_nonsuccess_permits_fallback(monkeypatch, tmp_path, reason):
    clock(monkeypatch)
    calls = []
    monkeypatch.setattr(
        focused.matching_lift,
        "search",
        lambda **kwargs: failed_matching(termination=reason, has_perfect_matching=None),
    )
    monkeypatch.setattr(focused.solver, "solve", lambda data: calls.append(data) or unknown())
    result = focused.run_trial(request(tmp_path))
    assert len(calls) == 1
    assert result["status"] == "unknown"
    assert not focused.verify_trial(request(tmp_path)["input"], result)


def test_expired_matching_stage_never_buys_extra_solver_time(monkeypatch, tmp_path):
    ticks = clock(monkeypatch)

    def overrun(**kwargs):
        assert kwargs["seconds"] <= 4
        ticks[0] += 4.2
        return failed_matching(termination="time_limit")

    monkeypatch.setattr(focused.matching_lift, "search", overrun)
    monkeypatch.setattr(focused.solver, "solve", lambda data: pytest.fail("no time remains"))
    result = focused.run_trial(request(tmp_path, matching_seconds=100))
    assert result["solver_allowance_seconds"] == 0
    assert result["matching_allowance_seconds"] == 4
    assert result["wall_seconds"] == 4.2
    assert result["status"] == "unknown" and result["censored"]


def test_successful_matching_witness_is_verified_and_skips_fallback(monkeypatch, tmp_path):
    ticks = clock(monkeypatch)
    source = request(tmp_path)
    labels = caterpillar_labeling(**source["input"])

    def match(**kwargs):
        ticks[0] += 0.2
        return failed_matching(labels=labels, termination="witness", has_perfect_matching=True)

    monkeypatch.setattr(focused.matching_lift, "search", match)
    monkeypatch.setattr(focused.solver, "solve", lambda data: pytest.fail("witness already found"))
    result = focused.run_trial(source)
    assert result["status"] == "verified_graceful"
    assert result["verification"]["valid"] and not result["censored"]
    assert result["worker_total_seconds"] == 0.2
    assert not focused.verify_trial(source["input"], result)


@pytest.mark.parametrize("variant", ["baseline", "matching_first"])
def test_invalid_witness_is_rejected_despite_claimed_verification(monkeypatch, tmp_path, variant):
    clock(monkeypatch)
    false_witness = {"labels": [0, 0, 0, 0], "verification": {"valid": True}}
    if variant == "matching_first":
        monkeypatch.setattr(
            focused.matching_lift, "search", lambda **kwargs: failed_matching(**false_witness)
        )
        monkeypatch.setattr(focused.solver, "solve", lambda data: pytest.fail("invalid witness"))
    else:
        monkeypatch.setattr(
            focused.solver,
            "solve",
            lambda data: {"status": "verified_graceful", **false_witness},
        )
    source = request(tmp_path, variant=variant)
    result = focused.run_trial(source)
    assert result["status"] == "invalid_solution"
    assert not result["verification"]["valid"]
    assert focused.verify_trial(source["input"], result)


@pytest.mark.parametrize("variant", ["baseline", "matching_first"])
@pytest.mark.parametrize("graph", [nx.path_graph(8), nx.star_graph(7)])
def test_real_small_construction_and_fallback_are_independently_valid(tmp_path, variant, graph):
    source = request(
        tmp_path,
        variant=variant,
        input=graph_input(graph),
        solver_seconds=5,
        constructive_search=True,
    )
    result = focused.run_trial(source)
    assert result["status"] == "verified_graceful"
    assert verify_labeling(**source["input"], labels=result["labels"])["valid"]
    assert not focused.verify_trial(source["input"], result)
    if variant == "matching_first" and nx.is_isomorphic(graph, nx.star_graph(7)):
        assert result["matching"]["has_perfect_matching"] is False
        assert result["solver"]["status"] == "verified_graceful"


@pytest.mark.parametrize(
    "change",
    [
        {"solver_seconds": 0},
        {"solver_seconds": math.inf},
        {"solver_seconds": math.nan},
        {"solver_seconds": True},
        {"matching_seconds": -1},
        {"matching_max_nodes": True},
        {"variant": "unmatched"},
        {"restriction": {"kind": "extreme_edge", "edge": [0, 1]}},
    ],
)
def test_invalid_requests_fail_before_any_solver(monkeypatch, tmp_path, change):
    monkeypatch.setattr(focused.solver, "solve", lambda data: pytest.fail("invalid request"))
    monkeypatch.setattr(
        focused.matching_lift, "search", lambda **kwargs: pytest.fail("invalid request")
    )
    with pytest.raises(ValueError):
        focused.run_trial(request(tmp_path, **change))


def paired_record(baseline, matching, stratum="natural_prufer"):
    data = graph_input(nx.path_graph(4))
    labels = caterpillar_labeling(**data)

    def outcome(value, seconds):
        return {
            "status": "verified_graceful" if value else "unknown",
            "labels": labels if value else None,
            "wall_seconds": seconds,
        }

    return {
        "input": data,
        "seed": 3,
        "stratum": stratum,
        "allowance_seconds": 10,
        "trials": {"baseline": outcome(baseline, 8), "matching_first": outcome(matching, 3)},
    }


def test_summary_counts_paired_gains_losses_and_excludes_censored_times():
    records = [
        paired_record(True, True),
        paired_record(False, True),
        paired_record(True, False),
        paired_record(False, False, "no_matching_control"),
        paired_record(False, False),
    ]
    del records[-1]["trials"]["matching_first"]
    result = focused.compare_summary(records)
    assert result == focused.compare_summary(list(reversed(records)))
    assert result["complete_pairs"] == 4 and result["incomplete_pairs"] == 1
    assert result["both_verified"] == result["matching_only"] == result["baseline_only"] == 1
    assert result["neither_verified"] == 1
    times = result["fully_solved_times"]
    assert times["pairs"] == 1
    assert times["baseline"]["total_seconds"] == 8
    assert times["matching_first"]["total_seconds"] == 3
    assert result["by_stratum"]["natural_prufer"]["matching_only"] == 1
    assert result["by_stratum"]["no_matching_control"]["neither_verified"] == 1


def test_evidence_verifier_does_not_trust_status_or_stored_verification():
    row = paired_record(True, True)
    trial = row["trials"]["baseline"]
    trial["verification"] = {"valid": True}
    trial["labels"] = [0, 1, 2, 3]
    assert focused.verify_trial(row["input"], trial)
    with pytest.raises(ValueError, match="invalid comparison evidence"):
        focused.compare_summary([row])
    assert focused.verify_trial(row["input"], unknown(status="solver_infeasible"))
    assert focused.verify_trial(row["input"], unknown(censored=False))
    assert focused.verify_trial(row["input"], unknown(wall_seconds=math.nan))
    assert not focused.verify_trial(row["input"], unknown(termination="parent_time_limit"))


@pytest.mark.parametrize("field,value", [("seed", 4), ("allowance_seconds", 9)])
def test_summary_rejects_unmatched_trial_parameters(field, value):
    row = paired_record(True, True)
    row["trials"]["baseline"][field] = value
    with pytest.raises(ValueError, match="paired"):
        focused.compare_summary([row])


def test_worker_handshake_error_response_and_continuation(monkeypatch):
    class Connection:
        def __init__(self):
            self.pending = iter([{"bad": True}, {"bad": False}, None])
            self.sent = []
            self.closed = False

        def recv(self):
            return next(self.pending)

        def send(self, value):
            self.sent.append(value)

        def close(self):
            self.closed = True

    def run(data):
        if data["bad"]:
            raise ValueError("invalid request fixture")
        return unknown()

    monkeypatch.setattr(focused, "run_trial", run)
    connection = Connection()
    focused.worker_main(connection)
    assert connection.sent[0] == {"ready": True}
    assert connection.sent[1]["status"] == "error"
    assert "invalid request fixture" in connection.sent[1]["error"]
    assert connection.sent[2]["status"] == "unknown"
    assert connection.closed
