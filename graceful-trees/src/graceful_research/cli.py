import argparse
import json
import sys
import time
from pathlib import Path

from . import __version__
from .io import provenance, write_json


def parser():
    result = argparse.ArgumentParser(description="Reproducible graceful-tree research")
    result.add_argument("--version", action="version", version=__version__)
    commands = result.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="run or continue a budgeted campaign")
    run.add_argument("--config", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--resume", type=Path, help="previous research.sqlite; copied, never modified")
    run.add_argument("--budget-seconds", type=float)
    run.add_argument("--max-cases", type=int)
    run.add_argument("--seed", type=int)
    run.add_argument("--backend", choices=("cp-sat", "sat"))
    audit = commands.add_parser("audit", help="audit saved evidence, counts and checksums")
    audit.add_argument("directory", type=Path)
    verify = commands.add_parser(
        "verify", help="verify a positive certificate or certificate directory"
    )
    verify.add_argument("path", type=Path)
    proof = commands.add_parser(
        "verify-unsat", help="independently check a scoped DRUP certificate"
    )
    proof.add_argument("path", type=Path)
    proof.add_argument("--seconds", type=float, default=30)
    replay = commands.add_parser(
        "replay", help="replay a saved attempt with its logged seed and model options"
    )
    replay.add_argument("attempt", type=Path, help="result.json or request.json")
    replay.add_argument("--output", type=Path, required=True)
    replay.add_argument("--seconds", type=float, help="optional replacement solver time limit")
    replay.add_argument("--backend", choices=("cp-sat", "sat"), help="optional independent backend")
    return result


def replay(args):
    from .runner import cancellation_signals
    from .verify import verify_labeling
    from .worker import Supervisor

    data = json.loads(args.attempt.read_text())
    request = data.get("request", data)
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("replay output must be empty")
    args.output.mkdir(parents=True, exist_ok=True)
    write_json(args.output / "provenance.json", provenance(args.output.resolve()))
    request["directory"] = str(args.output.resolve())
    if args.backend is not None:
        request["backend"] = args.backend
    if args.seconds is not None:
        if not 0.001 <= args.seconds <= 604800:
            raise ValueError("--seconds must be in [0.001, 604800]")
        request["solver_seconds"] = args.seconds
    write_json(args.output / "request.json", request)
    with cancellation_signals() as cancelled:
        supervisor = Supervisor(cancelled)
        try:
            result = supervisor.solve(request, time.monotonic() + request["solver_seconds"] + 5)
        finally:
            supervisor.stop()
    if result.get("labels") is not None:
        result["verification"] = verify_labeling(
            **request["input"], labels=result["labels"], restriction=request["restriction"]
        )
        if not result["verification"]["valid"]:
            result["status"] = "invalid_solution"
        else:
            write_json(
                args.output / "certificate.json",
                {
                    **request["input"],
                    "labels": result["labels"],
                    "restriction": request["restriction"],
                },
            )
    write_json(args.output / "result.json", {**result, "request": request})
    if result.get("proof_certificate_verified"):
        from .proof_verify import verify_record

        check = verify_record(
            {**result, "input": request["input"], "restriction": request["restriction"]},
            deadline=time.monotonic() + min(30, request["solver_seconds"]),
        )
        if not check["valid"]:
            result.update(proof_certificate_verified=False, proof_check=check)
            if not check.get("timed_out"):
                result["status"] = "integrity_error"
        else:
            write_json(args.output / "unsat-certificate.json", result["proof_certificate"])
        write_json(args.output / "result.json", {**result, "request": request})
    print(json.dumps({"status": result["status"], "output": str(args.output)}, indent=2))
    return int(
        result["status"] in {"error", "invalid_solution", "model_invalid", "integrity_error"}
    )


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "verify":
            from .verify import main as verify_main

            return verify_main([str(args.path)])
        if args.command == "verify-unsat":
            from .proof_verify import main as proof_main

            return proof_main([str(args.path), "--seconds", str(args.seconds)])
        if args.command == "audit":
            from .audit import audit_run

            result = audit_run(args.directory)
            print(json.dumps(result, indent=2))
            write_json(args.directory / "audit.json", result)
            return int(not result["valid"])
        if args.command == "replay":
            return replay(args)
        from .config import Config
        from .runner import cancellation_signals, run

        config = Config.read(args.config)
        for field in ("budget_seconds", "max_cases", "seed", "backend"):
            value = getattr(args, field)
            if value is not None:
                setattr(config, field, value)
        if args.budget_seconds is not None:
            config.finalize_reserve_seconds = min(
                config.finalize_reserve_seconds, args.budget_seconds / 10
            )
        config.validate()
        with cancellation_signals() as cancelled:
            manifest, exit_code = run(config, args.output, args.resume, cancelled)
        print(
            json.dumps(
                {
                    "run_id": manifest["run_id"],
                    "stop_reason": manifest["stop_reason"],
                    "summary": manifest["summary"],
                    "output": str(args.output),
                },
                indent=2,
            )
        )
        if manifest.get("error"):
            print(manifest["error"], file=sys.stderr)
        return exit_code
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
