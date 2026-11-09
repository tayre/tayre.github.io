"""Discover exact primal/dual certificates for bounded residual relaxations.

Discovery uses bounded integer variables and CP-SAT. Every positive certificate
is checked independently with exact arithmetic; a failed discovery attempt says
nothing about the unbounded relaxation. None of these records is a whole-tree
counterexample. Signed and fractional covers are not completion witnesses.
"""

import math
import time
from pathlib import Path

from .io import write_json
from .residual_relaxations_verify import verify_certificate
from .residual_signatures import complete_forest

KINDS = ("signed_integer_cover", "nonnegative_rational_cover", "nonnegative_separator")


def discover(unused, differences, components, *, kind, seed=0, seconds=2.0, directory=None):
    from google.protobuf import text_format
    from ortools.sat.python import cp_model

    if kind not in KINDS:
        raise ValueError("unsupported relaxation certificate kind")
    if type(seed) is not int or not 0 <= seed < 2**31:
        raise ValueError("invalid seed")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    started = time.monotonic()
    exact = complete_forest(unused, differences, components)
    data = {
        "unused": exact["unused"],
        "differences": exact["differences"],
        "components": [
            {"parent_label": c["parent_label"], "parents": list(c["parents"])} for c in components
        ],
    }
    branches, size = len(components), len(exact["unused"])
    columns, options = [], []
    for branch, table in enumerate(exact["signature_tables"]):
        for signature in table:
            columns.append(
                [int(index == branch) for index in range(branches)]
                + [(signature["label_mask"] >> index) & 1 for index in range(size)]
                + [(signature["difference_mask"] >> index) & 1 for index in range(size)]
            )
            options.append({"branch": branch, "labels": signature["labels"]})
    dimension = branches + 2 * size
    model = cp_model.CpModel()
    if kind == "nonnegative_separator":
        variables = [model.new_int_var(-3, 3, f"weight_{i}") for i in range(dimension)]
        for column in columns:
            model.add(
                sum(value * weight for value, weight in zip(column, variables, strict=True)) >= 0
            )
        model.add(sum(variables) <= -1)
        magnitude = [model.new_int_var(0, 3, f"abs_{i}") for i in range(dimension)]
        for absolute, weight in zip(magnitude, variables, strict=True):
            model.add_abs_equality(absolute, weight)
        model.minimize(sum(magnitude))
        bounds = {"coefficient_min": -3, "coefficient_max": 3}
    else:
        denominator = 1 if kind == "signed_integer_cover" else 2
        minimum = -1 if kind == "signed_integer_cover" else 0
        variables = [
            model.new_int_var(minimum, denominator, f"coefficient_{i}") for i in range(len(columns))
        ]
        for row in range(dimension):
            model.add(
                sum(
                    variable * column[row]
                    for variable, column in zip(variables, columns, strict=True)
                )
                == denominator
            )
        magnitude = [model.new_int_var(0, denominator, f"abs_{i}") for i in range(len(columns))]
        for absolute, value in zip(magnitude, variables, strict=True):
            model.add_abs_equality(absolute, value)
        model.minimize(sum(magnitude))
        bounds = {
            "coefficient_min": minimum,
            "coefficient_max": denominator,
            "denominator": denominator,
        }
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = seed
    solver.parameters.symmetry_level = 0
    solver.parameters.max_time_in_seconds = max(0.0, seconds - (time.monotonic() - started))
    status = None
    if solver.parameters.max_time_in_seconds > 0:
        status = solver.solve(model)
    certificate = check = None
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        values = [solver.value(value) for value in variables]
        certificate = {
            "schema_version": 1,
            "kind": kind,
            "scope": "fixed_residual_forest",
            "input": data,
        }
        if kind == "nonnegative_separator":
            certificate["weights"] = {
                "branches": values[:branches],
                "labels": values[branches : branches + size],
                "differences": values[branches + size :],
            }
        else:
            certificate["terms"] = [
                {**option, "numerator": value, "denominator": denominator}
                for option, value in zip(options, values, strict=True)
                if value
            ]
        check = verify_certificate(certificate, expected_input=data)
        if not check["valid"]:
            raise RuntimeError(f"independent certificate rejection: {check['errors']}")
        if kind == "nonnegative_separator" and exact["feasible"]:
            raise RuntimeError("separator contradicts exact completion")
    result = {
        "kind": kind,
        "seed": seed,
        "seconds": seconds,
        "discovery_bounds": bounds,
        "raw_discovery_status": solver.status_name(status) if status is not None else "NOT_STARTED",
        "status": "certificate_verified"
        if certificate is not None
        else "no_certificate_found_within_bounds",
        "certificate": certificate,
        "independent_check": check,
        "rows": dimension,
        "columns": len(columns),
        "wall_seconds": time.monotonic() - started,
        "exact_completion_feasible": exact["feasible"],
        "failure_scope": "bounded discovery only; no unbounded relaxation claim",
    }
    if directory is not None:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        write_json(
            directory / "request.json",
            {"input": data, "kind": kind, "seed": seed, "seconds": seconds, "bounds": bounds},
        )
        (directory / "model.pbtxt").write_text(text_format.MessageToString(model.proto))
        (directory / "parameters.pbtxt").write_text(text_format.MessageToString(solver.parameters))
        if status is not None:
            (directory / "response.pbtxt").write_text(
                text_format.MessageToString(solver.response_proto)
            )
        write_json(directory / "result.json", result)
    return result
