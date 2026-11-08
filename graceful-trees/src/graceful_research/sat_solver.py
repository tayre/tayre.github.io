"""Single-threaded Glucose 4.1 with saved CNF and independently checked DRUP."""

import hashlib
import importlib.metadata
import os
import threading
import time
from pathlib import Path

from .io import write_json
from .proof_verify import MAX_PROOF_BYTES, verify_unsat
from .sat_encoding import ENCODING, MAX_N, encode, save_dimacs
from .verify import verify_labeling


def solve_sat(request):
    from pysat.solvers import Glucose4

    started = time.monotonic()
    deadline = started + request["solver_seconds"]
    directory = Path(request["directory"])
    data, restriction = request["input"], request["restriction"]
    parameters = {
        "solver": "Glucose 4.1",
        "binding": "python-sat",
        "binding_version": importlib.metadata.version("python-sat"),
        "encoding": ENCODING,
        "request_seed": request["seed"],
        "randomization": "fixed solver defaults; binding exposes no seed setter",
        "workers": 1,
        "assumptions": [],
        "with_proof": True,
        "symmetry_breaking": False,
        "redundant_sum": False,
        "total_seconds": request["solver_seconds"],
    }
    write_json(directory / "sat-parameters.json", parameters)
    result = {
        "status": "unknown",
        "raw_status": "UNKNOWN",
        "search_method": "sat-drup",
        "labels": None,
        "verification": None,
        "proof_certificate_verified": False,
        "proof_certificate": None,
        "timed_out": False,
        "parameters": parameters,
    }
    if data["n"] > MAX_N:
        return {**result, "termination": "sat_encoding_size_limit", "wall_seconds": 0.0}
    try:
        variables, clauses = encode(**data, restriction=restriction, deadline=deadline)
        result["model_sha256"] = save_dimacs(directory / "model.cnf", variables, clauses, deadline)
        result["variables"], result["clauses"] = variables, len(clauses)
        # Proof tracing must be enabled BEFORE adding clauses, including units.
        # PySAT's bootstrap_with installs clauses before enabling its proof trace.
        with Glucose4(with_proof=True) as solver:
            for i, clause in enumerate(clauses):
                if i % 1024 == 0 and time.monotonic() >= deadline:
                    raise TimeoutError("SAT loading time limit")
                solver.add_clause(clause)
            del clauses
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("SAT loading time limit")
            # Leave part of the same attempt allowance for proof checking.
            timer = threading.Timer(remaining * 0.75, solver.interrupt)
            timer.daemon = True
            search_start = time.monotonic()
            timer.start()
            try:
                answer = solver.solve_limited(expect_interrupt=True)
            finally:
                timer.cancel()
                timer.join()
            result["solver_wall_seconds"] = time.monotonic() - search_start
            result["sat_statistics"] = solver.accum_stats()
            # SAT decisions are not interchangeable with CP-SAT branch counts.
            if answer is True:
                positive = {literal for literal in solver.get_model() if literal > 0}
                labels = []
                for v in range(data["n"]):
                    choices = [a for a in range(data["n"]) if 1 + v * data["n"] + a in positive]
                    if len(choices) != 1:
                        raise ValueError("SAT model does not select exactly one label per vertex")
                    labels.append(choices[0])
                check = verify_labeling(**data, labels=labels, restriction=restriction)
                result.update(
                    status="verified_graceful" if check["valid"] else "invalid_solution",
                    raw_status="SAT",
                    labels=labels,
                    verification=check,
                    termination="SAT",
                )
            elif answer is None:
                result.update(termination="sat_time_limit", timed_out=True)
            else:
                result.update(
                    status="solver_infeasible", raw_status="INFEASIBLE", termination="UNSAT"
                )
                # Pinned binding exposes the proof file; bound it before get_proof
                # materializes it. Proof logging itself is isolated by the parent.
                if os.fstat(solver.prfile.fileno()).st_size > MAX_PROOF_BYTES - 3:
                    result["proof_check"] = {"valid": False, "errors": ["proof size limit"]}
                else:
                    lines = solver.get_proof()
                    # A closing RUP claim also handles contradictions detected during
                    # clause loading. It is checked independently, never trusted.
                    if not lines or lines[-1].strip() != "0":
                        lines.append("0")
                    proof = "\n".join(lines) + "\n"
                    result["proof_certificate"] = {
                        "schema_version": 1,
                        "format": "drup",
                        "encoding": ENCODING,
                        "input": data,
                        "restriction": restriction,
                        "cnf_sha256": result["model_sha256"],
                        "proof_sha256": hashlib.sha256(proof.encode("ascii")).hexdigest(),
                        "proof": proof,
                    }
        if result["proof_certificate"] is not None:
            certificate = result["proof_certificate"]
            (directory / "proof.drup").write_text(certificate["proof"], encoding="ascii")
            write_json(directory / "unsat-certificate.json", certificate)
            check = verify_unsat(certificate, deadline=deadline)
            result["proof_check"] = check
            result["proof_certificate_verified"] = check["valid"]
            if not check["valid"] and not check.get("timed_out"):
                result.update(
                    status="integrity_error", error="SAT proof failed independent checking"
                )
    except TimeoutError as exc:
        result.update(termination=str(exc), timed_out=True)
    result["wall_seconds"] = time.monotonic() - started
    return result
