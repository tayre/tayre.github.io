"""Budgeted campaigns with incremental durable evidence and fair new-case exploration."""

import json
import shutil
import signal
import sqlite3
import time
import traceback
import uuid
from contextlib import contextmanager
from pathlib import Path

from .analysis import extreme_profiles, write_reports
from .findings import build_findings
from .io import provenance, sha256, utc_now, write_checksums, write_json
from .progress import build_progress
from .proof_verify import verify_record
from .storage import ERROR_STATUSES, Store
from .trees import TreeStream, derived_seed, edge_orbits, to_graph
from .verify import verify_labeling
from .visuals import write_visual_report
from .worker import Supervisor


@contextmanager
def cancellation_signals():
    state = {"cancelled": False}

    def handler(signum, frame):
        state["cancelled"] = True

    previous = {s: signal.signal(s, handler) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        yield lambda: state["cancelled"]
    finally:
        for s, old in previous.items():
            signal.signal(s, old)


def copy_checkpoint(source, destination):
    # SQLite backup also handles a source with an outstanding WAL safely.
    with sqlite3.connect(f"file:{Path(source).resolve()}?mode=ro", uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)


def run(config, output, resume=None, cancelled=lambda: False):
    config.validate()
    started = time.monotonic()
    compute_deadline = started + config.budget_seconds - config.finalize_reserve_seconds
    output = Path(output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError("output directory must be empty; use --resume with a NEW output directory")
    output.mkdir(parents=True, exist_ok=True)
    database = output / "research.sqlite"
    if resume is not None:
        copy_checkpoint(resume, database)
    store = Store(database, config)
    run_id = utc_now().replace(":", "").replace("+", "_") + "-" + uuid.uuid4().hex[:8]
    manifest = {
        "schema_version": 1,
        "run_id": run_id,
        "started_at": utc_now(),
        "config": config.as_dict(),
        "provenance": provenance(output),
        "resumed": resume is not None,
        "stop_reason": "running",
        "generated": 0,
        "duplicates": 0,
        "proof_certificates_supported": True,
        "proof_evidence_schema_version": 1,
    }
    write_json(output / "config.json", config.as_dict())
    write_json(output / "manifest.json", manifest)
    store.save_run(run_id, manifest)
    supervisor = Supervisor(cancelled=cancelled)
    records = []
    base_cases = 0
    failed = False

    def available(deadline):
        return time.monotonic() + 0.01 < deadline and not cancelled()

    def attempt(case, deadline, seconds, restriction=None, orbit=None):
        scope = "extreme_edge" if restriction else "graceful"
        edge_key = "-".join(map(str, restriction["edge"])) if restriction else ""
        previous = store.attempts(tree_id=case["tree_id"], scope=scope, edge_key=edge_key)
        index = len(records) + 1
        directory = output / "attempts" / f"{index:06d}"
        directory.mkdir(parents=True, exist_ok=True)
        seed = derived_seed(config.seed, case["tree_id"], scope, edge_key, len(previous))
        investigate_infeasible = any(r["status"] == "solver_infeasible" for r in previous)
        backend = config.backend
        if restriction and config.probe_backend != "same":
            backend = config.probe_backend
        if investigate_infeasible and config.certify_infeasible and case["n"] <= 75:
            backend = "sat"
        allowance = min(seconds, max(0.001, deadline - time.monotonic() - 0.02))
        request = {
            "input": {"n": case["n"], "edges": case["edges"]},
            "restriction": restriction,
            "seed": seed,
            "solver_seconds": allowance,
            "directory": str(directory),
            "complement_break": config.complement_break and not investigate_infeasible,
            "redundant_sum": config.redundant_sum and not investigate_infeasible,
            "constructive_search": config.constructive_search,
            "frontier_search": config.frontier_search and not investigate_infeasible,
            "frontier_max_nodes": config.frontier_max_nodes,
            "frontier_algorithm": config.frontier_algorithm,
            "swap_objective": config.swap_objective,
            "swap_proposal_policy": config.swap_proposal_policy,
            "backend": backend,
        }
        write_json(directory / "request.json", request)
        write_json(output / "inputs" / f"{case['tree_id']}.json", case)
        result = supervisor.solve(request, deadline)
        if result.get("proof_certificate_verified") is True:
            proof_record = {**result, "input": request["input"], "restriction": restriction}
            check = verify_record(proof_record, deadline=deadline)
            result["proof_check"] = check
            result["proof_certificate_verified"] = check["valid"]
            if not check["valid"] and not check.get("timed_out"):
                result.update(status="integrity_error", error="parent rejected UNSAT certificate")
        if result.get("labels") is not None:
            result["verification"] = verify_labeling(
                case["n"], case["edges"], result["labels"], restriction
            )
            if not result["verification"]["valid"]:
                result["status"] = "invalid_solution"
        if result["status"] == "verified_graceful" and not (result.get("verification") or {}).get(
            "valid"
        ):
            result["status"] = "invalid_solution"
        if (
            result["status"] == "verified_graceful"
            and investigate_infeasible
            or result["status"] == "solver_infeasible"
            and any(r["status"] == "verified_graceful" for r in previous)
        ):
            result["original_status"] = result["status"]
            result["status"] = "integrity_error"
            result["error"] = (
                "contradictory positive and infeasible results for the same scoped input"
            )
        record = {
            **result,
            "run_id": run_id,
            "tree_id": case["tree_id"],
            "scope": scope,
            "edge_key": edge_key,
            "restriction": restriction,
            "orbit": orbit,
            "input": request["input"],
            "family": case["family"],
            "features": case["features"],
            "seed": seed,
            "request": request,
            "attempt_number": len(previous) + 1,
            "recorded_at": utc_now(),
            "files": f"attempts/{index:06d}",
        }
        store.add_attempt(record)
        records.append(record)
        write_json(directory / "result.json", record)
        if record.get("proof_certificate_verified"):
            write_json(
                output / "unsat-certificates" / f"{index:06d}.json", record["proof_certificate"]
            )
        with (output / "attempts.jsonl").open("a") as handle:
            handle.write(json.dumps(record, sort_keys=True, allow_nan=False) + "\n")
            handle.flush()
        if record.get("verification") and record["verification"]["valid"]:
            certificate = {
                "schema_version": 1,
                "tree_id": case["tree_id"],
                **request["input"],
                "labels": record["labels"],
                "restriction": restriction,
                "verification": record["verification"],
                "attempt_id": record["attempt_id"],
            }
            write_json(output / "certificates" / f"{index:06d}.json", certificate)
        if record["status"] in ERROR_STATUSES:
            raise RuntimeError(
                f"attempt {record['attempt_id']}: {record['status']}: {record.get('error', '')}"
            )
        if len(records) % 25 == 0:
            print(
                f"{len(records)} attempts saved; {max(0, compute_deadline - time.monotonic()):.1f}s compute remaining",
                flush=True,
            )

    try:
        window = max(0, compute_deadline - time.monotonic())
        retry_deadline = min(
            compute_deadline, time.monotonic() + window * config.retry_budget_fraction
        )
        for case in store.retry_cases(config)[: config.max_retries]:
            if not available(retry_deadline) or base_cases >= config.max_cases:
                break
            attempt(case, retry_deadline, config.retry_seconds)
            base_cases += 1
        new_deadline = compute_deadline - window * config.probe_budget_fraction
        stream = TreeStream(config, store)
        manifest["stop_reason"] = "compute_budget"
        while available(new_deadline):
            if base_cases >= config.max_cases:
                manifest["stop_reason"] = "case_limit"
                break
            if manifest["generated"] >= config.max_generated:
                manifest["stop_reason"] = "generation_limit"
                break
            item = stream.next()
            if item is None:
                manifest["stop_reason"] = "sources_exhausted"
                break
            case, inserted = item
            manifest["generated"] += 1
            if not inserted:
                manifest["duplicates"] += 1
                continue
            if not available(new_deadline):
                break  # Persisted pending input is retried on the next run.
            attempt(case, new_deadline, config.attempt_seconds)
            base_cases += 1
        probe_count = 0
        if config.probe_budget_fraction > 0 and config.probe_max_attempts > 0:
            for case in store.cases(max_n=config.probe_max_n):
                if not available(compute_deadline) or probe_count >= config.probe_max_attempts:
                    break
                main_records = store.attempts(tree_id=case["tree_id"], scope="graceful")
                if not any(r["status"] == "verified_graceful" for r in main_records):
                    continue
                for orbit in edge_orbits(to_graph(case)):
                    if not available(compute_deadline) or probe_count >= config.probe_max_attempts:
                        break
                    key = "-".join(map(str, orbit["representative"]))
                    prior = store.attempts(
                        tree_id=case["tree_id"], scope="extreme_edge", edge_key=key
                    )
                    if any(r["status"] == "verified_graceful" for r in prior):
                        continue
                    if any(r.get("proof_certificate_verified") for r in prior):
                        continue
                    if any(r["status"] == "solver_infeasible" for r in prior) and not (
                        config.certify_infeasible
                        or config.probe_backend == "sat"
                        or config.backend == "sat"
                    ):
                        continue
                    if len(prior) >= config.max_attempts_per_case:
                        continue
                    attempt(
                        case,
                        compute_deadline,
                        config.attempt_seconds,
                        {"kind": "extreme_edge", "edge": orbit["representative"]},
                        orbit,
                    )
                    probe_count += 1
        if cancelled():
            manifest["stop_reason"] = "cancelled"
        elif time.monotonic() >= compute_deadline:
            manifest["stop_reason"] = "compute_budget"
    except Exception:
        failed = True
        manifest["stop_reason"] = "error"
        manifest["error"] = traceback.format_exc()
    finally:
        supervisor.stop()
        store.commit()
        (output / "attempts.jsonl").touch(exist_ok=True)
        manifest["finished_at"] = utc_now()
        manifest["elapsed_seconds"] = time.monotonic() - started
        manifest["cumulative_cases"] = store.connection.execute(
            "SELECT count(*) FROM cases"
        ).fetchone()[0]
        manifest["cumulative_attempts"] = store.connection.execute(
            "SELECT count(*) FROM attempts"
        ).fetchone()[0]
        manifest["generation_cursors"] = dict(
            store.connection.execute("SELECT stream,position FROM cursors")
        )
        manifest["run_attempts"] = len(records)
        witnessed_ids = {
            row[0]
            for row in store.connection.execute(
                "SELECT DISTINCT tree_id FROM attempts WHERE scope='graceful' AND status='verified_graceful'"
            )
        }
        manifest["exhaustive_coverage"] = []
        for n in config.exhaustive_sizes:
            name = f"exhaustive:{n}"
            count = store.meta("enumerated:" + name)
            cases = [case for case in store.cases(max_n=n) if case["n"] == n]
            manifest["exhaustive_coverage"].append(
                {
                    "n": n,
                    "generator_exhausted": store.cursor(name) == -1,
                    "enumerated_count": count,
                    "catalogued_classes": len(cases),
                    "classes_with_witness": sum(case["tree_id"] in witnessed_ids for case in cases),
                }
            )
        profiles = extreme_profiles(store, config.probe_max_n)
        findings = build_findings(store.connection, manifest)
        manifest["findings_schema_version"] = 1
        write_json(output / "findings.json", findings)
        summary = write_reports(output, manifest, records, profiles)
        manifest["summary"] = {
            k: v for k, v in summary.items() if k not in {"difficult", "families"}
        }
        manifest["visual_report_schema_version"] = 1
        try:
            progress = build_progress(store.connection, manifest)
            write_visual_report(output, manifest, progress, summary)
        except Exception:
            # A renderer failure must not discard verified solver evidence or
            # leave SQLite open. Fail the run so a partial report is not promoted.
            failed = True
            manifest["stop_reason"] = "report_error"
            manifest["visual_report_error"] = traceback.format_exc()
            manifest["error"] = manifest.get("error", "") + manifest["visual_report_error"]
            write_reports(output, manifest, records, profiles)
        manifest["elapsed_seconds"] = time.monotonic() - started
        store.save_run(run_id, manifest)
        store.close()
        write_json(output / "manifest.json", manifest)
        write_json(
            output / "checkpoint.json",
            {
                "schema_version": 1,
                "campaign": config.campaign,
                "run_id": run_id,
                "generation_fingerprint": config.generation_fingerprint(),
                "sha256": sha256(database),
            },
        )
        shutil.copyfile(Path(__file__).with_name("verify.py"), output / "verify.py")
        shutil.copyfile(Path(__file__).with_name("proof_verify.py"), output / "proof_verify.py")
        write_checksums(output)
    return manifest, int(failed)
