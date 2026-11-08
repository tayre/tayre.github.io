"""Exact CP-SAT backend. This module is only imported inside a disposable worker."""

import hashlib
import time
from pathlib import Path

from google.protobuf import text_format
from ortools.sat.python import cp_model

from .verify import verify_labeling, verify_tree


def build_model(n, edges, *, complement_break=True, redundant_sum=True, restriction=None):
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
    model, variables = build_model(
        data["n"],
        data["edges"],
        complement_break=request["complement_break"],
        redundant_sum=request["redundant_sum"],
        restriction=request["restriction"],
    )
    directory = Path(request["directory"])
    directory.mkdir(parents=True, exist_ok=True)
    model_text = text_format.MessageToString(model.proto)
    (directory / "model.pbtxt").write_text(model_text)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request["solver_seconds"]
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
    timed_out = status == cp_model.UNKNOWN and solver.wall_time >= request["solver_seconds"] * 0.95
    return {
        "status": outcome,
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
    }
