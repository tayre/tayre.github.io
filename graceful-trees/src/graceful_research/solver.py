"""Candidate witnesses followed by the exact model, in a bounded worker."""

import hashlib
import time
from pathlib import Path

from .constructive import caterpillar_labeling
from .io import write_json
from .verify import verify_labeling, verify_tree


def build_model(n, edges, *, complement_break=True, redundant_sum=True, restriction=None):
    from ortools.sat.python import cp_model

    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    model = cp_model.CpModel()
    labels = [model.new_int_var(0, n - 1, f"x_{v}") for v in range(n)]
    model.add_all_different(labels)
    differences = []
    for u, v in edges:
        difference = model.new_int_var(1, n - 1, f"d_{u}_{v}")
        model.add_abs_equality(difference, labels[u] - labels[v])
        differences.append(difference)
    if differences:
        model.add_all_different(differences)
        if redundant_sum:
            model.add(sum(differences) == n * (n - 1) // 2)
    if n > 1 and complement_break:
        model.add(labels[0] < labels[1])
    if restriction is not None:
        if restriction.get("kind") != "extreme_edge":
            raise ValueError("unsupported restricted experiment")
        edge = restriction.get("edge")
        if not isinstance(edge, list) or len(edge) != 2:
            raise ValueError("invalid restricted edge")
        matches = [i for i, e in enumerate(edges) if sorted(e) == sorted(edge)]
        if len(matches) != 1:
            raise ValueError("restricted edge not in the tree")
        model.add(differences[matches[0]] == n - 1)
    return model, labels


def solve(request):
    started = time.monotonic()
    data = request["input"]
    directory = Path(request["directory"])
    directory.mkdir(parents=True, exist_ok=True)
    if request.get("backend", "cp-sat") not in {"cp-sat", "sat"}:
        raise ValueError("unsupported solver backend")
    # An old saved request without this option must replay the original CP-SAT path.
    # Restricted probes always use the exact model, including negative controls.
    if request.get("constructive_search", False) and request["restriction"] is None:
        labels = caterpillar_labeling(data["n"], data["edges"])
        if labels is not None:
            if request["complement_break"] and len(labels) > 1 and labels[0] > labels[1]:
                labels = [data["n"] - 1 - value for value in labels]
            verification = verify_labeling(data["n"], data["edges"], labels)
            write_json(directory / "construction.json", {"algorithm": "caterpillar-v1"})
            return {
                "status": "verified_graceful" if verification["valid"] else "invalid_solution",
                "raw_status": "CONSTRUCTED_WITNESS",
                "search_method": "caterpillar-construction",
                "labels": labels,
                "verification": verification,
                "proof_certificate_verified": False,
                "proof_certificate": None,
                "termination": "constructed_witness",
                "timed_out": False,
                "wall_seconds": time.monotonic() - started,
            }

    if request.get("backend", "cp-sat") == "sat":
        from .sat_solver import solve_sat

        return solve_sat(request)

    frontier = None
    if request.get("frontier_search", False) and request["restriction"] is None:
        # Requests saved before the second method retain their original algorithm.
        algorithm = request.get("frontier_algorithm", "descending-frontier-v1")
        if algorithm == "descending-frontier-v1":
            from .frontier import search
        elif algorithm == "memo-frontier-v2":
            from .frontier_memo import search
        elif algorithm in {"portfolio-frontier-v3", "leaf-portfolio-v4"}:
            from .frontier_portfolio import search
        elif algorithm == "label-swap-v1":
            from .swap_search import search
        elif algorithm == "swap-portfolio-v5":
            from .swap_portfolio import search
        else:
            raise ValueError("unsupported frontier_algorithm")

        swap_route = algorithm in {"label-swap-v1", "swap-portfolio-v5"}
        default_nodes = {
            "descending-frontier-v1": 20000,
            "memo-frontier-v2": 20000,
            "portfolio-frontier-v3": 40000,
            "leaf-portfolio-v4": 40000,
            "label-swap-v1": 40000,
            "swap-portfolio-v5": 80000,
        }[algorithm]
        frontier = search(
            **data,
            seed=request["seed"],
            max_nodes=request.get("frontier_max_nodes", default_nodes),
            seconds=min(0.1, request["solver_seconds"] * 0.1),
            **({"leaf_tail": True} if algorithm == "leaf-portfolio-v4" else {}),
            **(
                {
                    "objective": request.get("swap_objective", "missing_sum"),
                    "proposal_policy": request.get("swap_proposal_policy", "uniform"),
                }
                if swap_route
                else {}
            ),
        )
        write_json(directory / "frontier.json", frontier)
        if frontier["labels"] is not None:
            labels = frontier["labels"]
            if request["complement_break"] and len(labels) > 1 and labels[0] > labels[1]:
                labels = [data["n"] - 1 - value for value in labels]
            verification = verify_labeling(**data, labels=labels)
            return {
                "status": "verified_graceful" if verification["valid"] else "invalid_solution",
                "raw_status": "CANDIDATE_WITNESS",
                "search_method": (
                    "swap-portfolio-search"
                    if algorithm == "swap-portfolio-v5"
                    else "label-swap-search"
                    if swap_route
                    else "frontier-search"
                ),
                "labels": labels,
                "verification": verification,
                "proof_certificate_verified": False,
                "proof_certificate": None,
                "termination": "candidate_witness",
                "timed_out": False,
                "frontier": frontier,
                "wall_seconds": time.monotonic() - started,
            }

    # Avoid loading the solver and its dependencies for construction-only workers.
    from google.protobuf import text_format
    from ortools.sat.python import cp_model

    model, variables = build_model(
        data["n"],
        data["edges"],
        complement_break=request["complement_break"],
        redundant_sum=request["redundant_sum"],
        restriction=request["restriction"],
    )
    model_text = text_format.MessageToString(model.proto)
    (directory / "model.pbtxt").write_text(model_text)
    solver = cp_model.CpSolver()
    solver_seconds = request["solver_seconds"]
    if frontier is not None:
        # Candidate search shares the attempt allowance; it does not buy extra compute.
        solver_seconds = max(0.001, solver_seconds - (time.monotonic() - started))
    solver.parameters.max_time_in_seconds = solver_seconds
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = request["seed"]
    solver.parameters.symmetry_level = 0
    solver.parameters.log_search_progress = False
    solver.parameters.log_to_stdout = False
    parameter_text = text_format.MessageToString(solver.parameters)
    (directory / "parameters.pbtxt").write_text(parameter_text)
    validation_error = model.validate()
    if validation_error:
        return {
            "status": "model_invalid",
            "search_method": "cp-sat",
            "error": validation_error,
            "wall_seconds": time.monotonic() - started,
            "labels": None,
            "verification": None,
            "proof_certificate_verified": False,
        }
    status = solver.solve(model)
    raw_status = solver.status_name(status)
    mapping = {
        cp_model.OPTIMAL: "verified_graceful",
        cp_model.FEASIBLE: "verified_graceful",
        cp_model.INFEASIBLE: "solver_infeasible",
        cp_model.UNKNOWN: "unknown",
        cp_model.MODEL_INVALID: "model_invalid",
    }
    labels = None
    verification = None
    outcome = mapping.get(status, "error")
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        labels = [solver.value(v) for v in variables]
        verification = verify_labeling(data["n"], data["edges"], labels, request["restriction"])
        if not verification["valid"]:
            outcome = "invalid_solution"
    response_text = text_format.MessageToString(solver.response_proto)
    (directory / "response.pbtxt").write_text(response_text)
    # UNKNOWN is never promoted to infeasible. CP-SAT can stop for reasons other
    # than its wall limit; call it a timeout only when we observed that limit.
    timed_out = status == cp_model.UNKNOWN and solver.wall_time >= solver_seconds * 0.95
    return {
        "status": outcome,
        "search_method": "cp-sat",
        "raw_status": raw_status,
        "labels": labels,
        "verification": verification,
        "proof_certificate_verified": False,
        "proof_certificate": None,
        "termination": "solver_time_limit" if timed_out else raw_status,
        "timed_out": timed_out,
        "wall_seconds": time.monotonic() - started,
        "solver_wall_seconds": solver.wall_time,
        "deterministic_time": solver.response_proto.deterministic_time,
        "branches": solver.num_branches,
        "conflicts": solver.num_conflicts,
        "model_sha256": hashlib.sha256(model_text.encode()).hexdigest(),
        "parameters": parameter_text,
        "response_stats": solver.response_stats(),
        **({"frontier": frontier} if frontier is not None else {}),
    }
