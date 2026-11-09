"""Exact prescribed-zero probes, separate from the unrestricted campaign.

Complementation does not preserve a specified zero vertex. These models disable
the complement inequality and solver symmetry reduction. Solver infeasibility
concerns only the root restriction and is not a checked proof certificate.
"""

import hashlib
import math
import time
from pathlib import Path

from .io import write_json
from .solver import build_model
from .verify import verify_labeling, verify_tree

ALGORITHM = "prescribed-zero-cpsat-v1"
MAX_VERTICES = 256


def spider(leg_lengths):
    """Hub 0, followed by each leg's vertices in increasing distance order."""
    if (
        not isinstance(leg_lengths, (list, tuple))
        or not leg_lengths
        or any(type(length) is not int or length < 1 for length in leg_lengths)
        or sum(leg_lengths) + 1 > MAX_VERTICES
    ):
        raise ValueError("positive leg lengths and at most 256 total vertices required")
    edges, legs, following = [], [], 1
    for length in leg_lengths:
        leg = list(range(following, following + length))
        edges.append([0, leg[0]])
        edges.extend([a, b] for a, b in zip(leg, leg[1:], strict=False))
        legs.append(leg)
        following += length
    return {"n": following, "edges": edges}, legs


def verify_rooted(n, edges, labels, root):
    """Check the full graceful witness and the additional zero-root condition."""
    result = verify_labeling(n, edges, labels)
    valid_root = type(root) is int and type(n) is int and 0 <= root < n
    root_valid = valid_root and result["vertex_labels_valid"] and labels[root] == 0
    errors = result["errors"].copy()
    if not root_valid:
        errors.append("the prescribed vertex must receive label zero")
    return {
        **result,
        "valid": not errors,
        "root_valid": root_valid,
        "errors": errors,
        "verifier": "stdlib-v1-plus-prescribed-zero-v1",
    }


def rooted_model(n, edges, root):
    """Build exactly the graceful constraints plus x[root]=0; no complement cut."""
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if n > MAX_VERTICES:
        raise ValueError("at most 256 vertices are supported")
    if type(root) is not int or not 0 <= root < n:
        raise ValueError("root must be an integer vertex")
    canonical_edges = sorted([min(u, v), max(u, v)] for u, v in edges)
    model, labels = build_model(
        n,
        canonical_edges,
        complement_break=False,
        redundant_sum=True,
        restriction=None,
    )
    model.add(labels[root] == 0)
    return model, labels


def solve_rooted(n, edges, root, *, seed, seconds=2.0, directory=None):
    """Solve one scoped model with a bounded solver allowance.

    Model preparation counts against ``seconds``. Final serialization and witness
    verification remain mandatory after a solve. A zero budget does not invoke
    CP-SAT. No heuristic or root-complement symmetry breaking is used.
    """
    from google.protobuf import text_format
    from ortools.sat.python import cp_model

    if type(seed) is not int or not 0 <= seed < 2**31:
        raise ValueError("seed must be an integer in 0..2^31-1")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    started = time.monotonic()
    model, labels = rooted_model(n, edges, root)
    model_text = text_format.MessageToString(model.proto)
    result = {
        "schema_version": 1,
        "algorithm": ALGORITHM,
        "scope": "prescribed_zero",
        "restriction": {"kind": "prescribed_zero", "vertex": root},
        "seed": seed,
        "seconds": seconds,
        "complement_break": False,
        "symmetry_level": 0,
        "num_search_workers": 1,
        "model_sha256": hashlib.sha256(model_text.encode()).hexdigest(),
        "labels": None,
        "verification": None,
        "proof_certificate_verified": False,
        "proof_certificate": None,
        "status": "unknown",
        "raw_status": "NOT_STARTED",
        "termination": "budget_exhausted_before_solver",
        "timed_out": False,
    }
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = seed
    solver.parameters.symmetry_level = 0
    solver.parameters.log_search_progress = False
    solver.parameters.log_to_stdout = False
    remaining = max(0.0, seconds - (time.monotonic() - started))
    solver.parameters.max_time_in_seconds = remaining
    parameter_text = text_format.MessageToString(solver.parameters)
    validation = model.validate()
    response_text = None
    if validation:
        result.update(status="model_invalid", raw_status="MODEL_INVALID", error=validation)
    elif remaining > 0:
        status = solver.solve(model)
        raw_status = solver.status_name(status)
        mapping = {
            cp_model.OPTIMAL: "verified_graceful",
            cp_model.FEASIBLE: "verified_graceful",
            cp_model.INFEASIBLE: "solver_infeasible",
            cp_model.UNKNOWN: "unknown",
            cp_model.MODEL_INVALID: "model_invalid",
        }
        timed_out = status == cp_model.UNKNOWN and solver.wall_time >= remaining * 0.95
        result.update(
            status=mapping.get(status, "error"),
            raw_status=raw_status,
            termination="solver_time_limit" if timed_out else raw_status,
            timed_out=timed_out,
            solver_seconds=remaining,
            solver_wall_seconds=solver.wall_time,
            branches=solver.num_branches,
            conflicts=solver.num_conflicts,
            deterministic_time=solver.response_proto.deterministic_time,
        )
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            candidate = [solver.value(variable) for variable in labels]
            verification = verify_rooted(n, edges, candidate, root)
            result.update(labels=candidate, verification=verification)
            if not verification["valid"]:
                result["status"] = "invalid_solution"
        response_text = text_format.MessageToString(solver.response_proto)
    result["wall_seconds"] = time.monotonic() - started
    if directory is not None:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        write_json(
            directory / "request.json",
            {"input": {"n": n, "edges": edges}, "root": root, "seed": seed, "seconds": seconds},
        )
        (directory / "model.pbtxt").write_text(model_text)
        (directory / "parameters.pbtxt").write_text(parameter_text)
        if response_text is not None:
            (directory / "response.pbtxt").write_text(response_text)
        write_json(directory / "result.json", result)
    return result
