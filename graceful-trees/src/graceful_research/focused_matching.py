"""Isolated, paired measurements of a known perfect-matching construction.

These workers do not change the campaign solver. Both routes have one total
allowance; matching detection, contraction, reconstruction and verification all
consume the matching-first route's allowance before the unchanged solver gets
its remainder. A parent Supervisor supplies the hard process deadline. Solver
limits are cooperative, so recorded elapsed time is never clipped to a budget.

Inputs are deterministic proposals, not uniform unlabeled-tree samples. The
coordinator must freeze/deduplicate them, alternate paired execution order and
retain cancelled/incomplete pairs. Summaries describe finite measurements and
make no speed, novelty, or whole-tree infeasibility claim.
"""

import copy
import math
import random
import statistics
import time
import traceback
from collections import Counter
from pathlib import Path

import networkx as nx

from . import matching_lift, solver
from .trees import canonical_code, derived_seed, generate_family, graph_input, tree_id
from .verify import verify_labeling, verify_tree

ORDERS = (20, 36, 50, 74)
STRATA = (
    "natural_prufer",
    "natural_recursive",
    "natural_lobster",
    "matching_rich",
    "no_matching_control",
)
ALGORITHMS = {
    "baseline": "focused-matching-baseline-v1",
    "matching_first": "focused-matching-first-v1",
}


def case_for_index(index, seed):
    """Return one reproducible proposal; every block of 20 spans all strata/orders.

    The rich stratum replaces core vertices with matched pairs. The negative
    control attaches three leaves to one vertex, which prevents a perfect
    matching without imposing any claim about gracefulness. Controls vary with
    the input seed instead of repeatedly presenting the same star.
    """
    if type(index) is not int or index < 0 or type(seed) is not int:
        raise ValueError("index must be nonnegative and seed must be an integer")
    n = ORDERS[(index // len(STRATA)) % len(ORDERS)]
    stratum = STRATA[index % len(STRATA)]
    input_seed = derived_seed("focused-matching-input-v1", seed, index)
    rng = random.Random(input_seed)
    family = stratum.removeprefix("natural_")
    expected = None
    if stratum.startswith("natural_"):
        graph = generate_family(family, n, input_seed)
    elif stratum == "matching_rich":
        family = ("prufer", "recursive", "lobster")[(index // len(STRATA)) % 3]
        core = graph_input(generate_family(family, n // 2, input_seed))
        graph = nx.empty_graph(n)
        graph.add_edges_from((2 * v, 2 * v + 1) for v in range(n // 2))
        graph.add_edges_from(
            (2 * u + rng.randrange(2), 2 * v + rng.randrange(2)) for u, v in core["edges"]
        )
        expected = True
    else:
        family = "three_leaves_on_random_core"
        graph = generate_family("prufer", n - 3, input_seed)
        parent = rng.randrange(n - 3)
        graph.add_edges_from((parent, v) for v in range(n - 3, n))
        expected = False
    permutation = list(range(n))
    rng.shuffle(permutation)
    graph = nx.relabel_nodes(graph, dict(enumerate(permutation)))
    return {
        "index": index,
        "input": graph_input(graph),
        "tree_id": tree_id(canonical_code(graph)),
        "stratum": stratum,
        "family": family,
        "input_seed": input_seed,
        "seed": derived_seed("focused-matching-solver-v1", seed, index),
        "expected_perfect_matching": expected,
    }


def _finite_nonnegative(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def run_trial(request):
    """Run a single unrestricted trial, copying all caller-owned request data.

    In addition to ordinary solver options, accept ``variant``, optional
    ``matching_seconds`` (default min(0.5, 10% of the total allowance)),
    ``matching_max_nodes`` and ``matching_max_work``. A failed matching attempt
    is only non-success of that construction and always permits ordinary fallback
    when time remains. An invalid witness is an error, never a fallback success.
    """
    started = time.monotonic()
    request = copy.deepcopy(request)
    data = request["input"]
    errors = verify_tree(data.get("n"), data.get("edges"))
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    variant = request["variant"]
    if variant not in ALGORITHMS:
        raise ValueError("unsupported matching comparison variant")
    seconds = request["solver_seconds"]
    if not _finite_nonnegative(seconds) or seconds == 0:
        raise ValueError("solver_seconds must be positive and finite")
    if type(request["seed"]) is not int:
        raise ValueError("seed must be an integer")
    if request.get("restriction") is not None:
        raise ValueError("matching comparisons require unrestricted inputs")
    requested_matching = request.get("matching_seconds", min(0.5, seconds * 0.1))
    if not _finite_nonnegative(requested_matching):
        raise ValueError("matching_seconds must be finite and nonnegative")
    max_nodes = request.get("matching_max_nodes", 40000)
    max_work = request.get("matching_max_work", 100000)
    if any(type(value) is not int or value < 0 for value in (max_nodes, max_work)):
        raise ValueError("matching work/node limits must be nonnegative integers")

    result = {
        "schema_version": 1,
        "scope": "unrestricted_tree",
        "variant": variant,
        "algorithm": ALGORITHMS[variant],
        "seed": request["seed"],
        "allowance_seconds": seconds,
        "matching_allowance_seconds": 0.0,
        "matching_wall_seconds": 0.0,
        "solver_allowance_seconds": 0.0,
        "solver_wall_seconds": 0.0,
        "matching": None,
        "solver": None,
        "status": "unknown",
        "labels": None,
        "verification": None,
        "proof_certificate_verified": False,
        "proof_certificate": None,
        "termination": "shared_time_limit",
        "timed_out": True,
    }

    def remaining():
        return max(0.0, seconds - (time.monotonic() - started))

    def finish():
        result["censored"] = result["status"] == "unknown"
        # Supervisor replaces wall_seconds with dispatch-to-return time. Retain
        # the worker's total, including its verification, in a separate field.
        elapsed = time.monotonic() - started
        result.update(wall_seconds=elapsed, worker_total_seconds=elapsed)
        return result

    if variant == "matching_first":
        allowance = min(requested_matching, remaining())
        result["matching_allowance_seconds"] = allowance
        if allowance > 0:
            stage_started = time.monotonic()
            matching = matching_lift.search(
                **data,
                seed=request["seed"],
                seconds=allowance,
                max_nodes=max_nodes,
                max_work=max_work,
            )
            result["matching"] = matching
            labels = matching.get("labels")
            if labels is not None:
                check = verify_labeling(**data, labels=labels)
                result.update(
                    status="verified_graceful" if check["valid"] else "invalid_solution",
                    labels=labels,
                    verification=check,
                    termination="matching_witness"
                    if check["valid"]
                    else "invalid_matching_witness",
                    timed_out=False,
                )
            result["matching_wall_seconds"] = time.monotonic() - stage_started
            if labels is not None:
                return finish()

    allowance = remaining()
    result["solver_allowance_seconds"] = allowance
    if allowance <= 0:
        return finish()
    fallback_request = {
        "backend": "cp-sat",
        "restriction": None,
        "complement_break": True,
        "redundant_sum": True,
        "constructive_search": True,
        "frontier_search": True,
        "frontier_algorithm": "bitset-portfolio-v6",
        "frontier_max_nodes": 40000,
        **request,
        "solver_seconds": allowance,
        "directory": str(Path(request["directory"]) / "solver"),
    }
    for key in ("variant", "matching_seconds", "matching_max_nodes", "matching_max_work"):
        fallback_request.pop(key, None)
    stage_started = time.monotonic()
    outcome = solver.solve(copy.deepcopy(fallback_request))
    result["solver"] = outcome
    labels = outcome.get("labels")
    check = verify_labeling(**data, labels=labels) if labels is not None else None
    status = outcome["status"]
    if (status == "verified_graceful" and not (check and check["valid"])) or (
        labels is not None and (not check["valid"] or status != "verified_graceful")
    ):
        status = "invalid_solution"
    result.update(
        status=status,
        labels=labels,
        verification=check,
        termination=outcome.get("termination", status),
        timed_out=outcome.get("timed_out", False),
        proof_certificate_verified=outcome.get("proof_certificate_verified", False),
        proof_certificate=outcome.get("proof_certificate"),
        solver_wall_seconds=time.monotonic() - stage_started,
    )
    return finish()


def verify_trial(data, result):
    """Recheck witnesses/status consistency; elapsed times are untrusted measurements.

    Supervisor-generated timeout records need not contain worker metadata. A
    solver-infeasible response is an investigation trigger, not a benchmark win
    or an independently certified mathematical conclusion.
    """
    errors = list(verify_tree(data.get("n"), data.get("edges")))
    if not isinstance(result, dict):
        return errors + ["trial must be an object"]
    status = result.get("status")
    if status not in {"verified_graceful", "unknown"}:
        errors.append(f"unexpected trial status requires investigation: {status}")
    labels = result.get("labels")
    if status == "verified_graceful" or labels is not None:
        checked = verify_labeling(data.get("n"), data.get("edges"), labels)
        errors.extend(f"trial witness: {error}" for error in checked["errors"])
    if status != "verified_graceful" and labels is not None:
        errors.append("non-successful trial contains a witness")
    if "censored" in result and result["censored"] is not (status == "unknown"):
        errors.append("censoring disagrees with trial status")
    if result.get("scope", "unrestricted_tree") != "unrestricted_tree":
        errors.append("comparison trial has the wrong scientific scope")
    for key in (
        "wall_seconds",
        "worker_total_seconds",
        "allowance_seconds",
        "matching_allowance_seconds",
        "matching_wall_seconds",
        "solver_allowance_seconds",
        "solver_wall_seconds",
    ):
        if key in result and not _finite_nonnegative(result[key]):
            errors.append(f"invalid {key}")
    variant = result.get("variant")
    if variant is not None:
        if variant not in ALGORITHMS or result.get("algorithm") != ALGORITHMS[variant]:
            errors.append("variant and algorithm disagree")
    matching = result.get("matching")
    if matching is not None:
        if not isinstance(matching, dict):
            errors.append("matching evidence must be an object")
        else:
            if variant == "baseline":
                errors.append("baseline unexpectedly contains matching evidence")
            if matching.get("tree_infeasibility_claimed"):
                errors.append("matching construction cannot claim tree infeasibility")
            for work, bound in (("nodes", "max_nodes"), ("work_units", "max_work")):
                if work in matching and (type(matching[work]) is not int or matching[work] < 0):
                    errors.append(f"invalid matching {work}")
                elif (
                    work in matching
                    and bound in matching
                    and (type(matching[bound]) is not int or matching[work] > matching[bound])
                ):
                    errors.append(f"matching {work} exceeds declared limit")
            if matching.get("labels") is not None:
                checked = verify_labeling(**data, labels=matching["labels"])
                errors.extend(f"matching witness: {error}" for error in checked["errors"])
                if status != "verified_graceful":
                    errors.append("matching witness disagrees with trial outcome")
                if matching["labels"] != labels:
                    errors.append("matching and trial witnesses disagree")
            if matching.get("core_labels") is not None:
                core = matching.get("core_input", {})
                checked = verify_labeling(core.get("n"), core.get("edges"), matching["core_labels"])
                errors.extend(f"core witness: {error}" for error in checked["errors"])
            for level in matching.get("levels", []):
                if level.get("labels") is not None:
                    source = level.get("input", {})
                    checked = verify_labeling(source.get("n"), source.get("edges"), level["labels"])
                    errors.extend(f"lift witness: {error}" for error in checked["errors"])
    outcome = result.get("solver")
    if outcome is not None:
        if not isinstance(outcome, dict):
            errors.append("solver evidence must be an object")
        else:
            if outcome.get("status") != status:
                errors.append("solver and trial outcomes disagree")
            if outcome.get("labels") != labels:
                errors.append("solver and trial witnesses disagree")
    return errors


def compare_summary(records):
    """Count paired outcomes without imputing solve times for censored trials."""

    def summarize(rows):
        counts = Counter()
        statuses = {variant: Counter() for variant in ALGORITHMS}
        times = {variant: [] for variant in ALGORITHMS}
        for row in rows:
            trials = row.get("trials", {})
            for variant in ALGORITHMS:
                if variant in trials:
                    statuses[variant][trials[variant]["status"]] += 1
            if not all(variant in trials for variant in ALGORITHMS):
                counts["incomplete_pairs"] += 1
                continue
            counts["complete_pairs"] += 1
            baseline = trials["baseline"]["status"] == "verified_graceful"
            matching = trials["matching_first"]["status"] == "verified_graceful"
            category = (
                "both_verified"
                if baseline and matching
                else "matching_only"
                if matching
                else "baseline_only"
                if baseline
                else "neither_verified"
            )
            counts[category] += 1
            if (
                baseline
                and matching
                and all(
                    _finite_nonnegative(trials[variant].get("wall_seconds"))
                    for variant in ALGORITHMS
                )
            ):
                for variant in ALGORITHMS:
                    times[variant].append(trials[variant]["wall_seconds"])
        return {
            "records": len(rows),
            **{
                key: counts[key]
                for key in (
                    "complete_pairs",
                    "incomplete_pairs",
                    "both_verified",
                    "matching_only",
                    "baseline_only",
                    "neither_verified",
                )
            },
            "status_counts": {key: dict(sorted(value.items())) for key, value in statuses.items()},
            "fully_solved_times": {
                "pairs": len(times["baseline"]),
                "scope": "only pairs with two verified witnesses and two recorded elapsed times",
                **{
                    variant: {
                        "total_seconds": math.fsum(sorted(values)),
                        "median_seconds": statistics.median(values) if values else None,
                    }
                    for variant, values in times.items()
                },
            },
        }

    records = list(records)
    for record in records:
        for variant, result in record.get("trials", {}).items():
            if variant not in ALGORITHMS:
                raise ValueError("unknown trial variant")
            errors = verify_trial(record["input"], result)
            if result.get("variant", variant) != variant:
                errors.append("trial stored under wrong variant")
            if "seed" in result and result["seed"] != record.get("seed"):
                errors.append("trial seed differs from paired seed")
            if "allowance_seconds" in result and result["allowance_seconds"] != record.get(
                "allowance_seconds"
            ):
                errors.append("trial allowance differs from paired allowance")
            if errors:
                raise ValueError(f"invalid comparison evidence: {errors}")
    return {
        "scope": "finite paired measurements; unknown results are censored",
        **summarize(records),
        "by_stratum": {
            stratum: summarize(
                [row for row in records if row.get("stratum", "unspecified") == stratum]
            )
            for stratum in sorted({row.get("stratum", "unspecified") for row in records})
        },
    }


def worker_main(connection):
    """Supervisor-compatible persistent worker with the standard ready handshake."""
    connection.send({"ready": True})
    try:
        while True:
            request = connection.recv()
            if request is None:
                return
            try:
                result = run_trial(request)
            except Exception:
                result = {
                    "status": "error",
                    "error": traceback.format_exc(),
                    "labels": None,
                    "verification": None,
                    "proof_certificate_verified": False,
                }
            connection.send(result)
    except (EOFError, BrokenPipeError):
        return
    finally:
        connection.close()
