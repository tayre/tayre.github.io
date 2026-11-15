"""Rotating, bounded studies with separate evidence and persistent cursors.

Benchmark and partial-state observations never enter the ordinary tree counts.
Pendant probes use the ordinary scoped solver ledger and its proof audit.
"""

import json
import time
from collections import Counter

from .io import write_json
from .storage import dump
from .trees import derived_seed, generate_family, graph_input
from .worker import Supervisor

STUDIES = ("pendant", "matching", "residual")
QUESTIONS = {
    "pendant": "Can a non-caterpillar lobster with matching deficiency at least two put its maximum difference on a leaf edge?",
    "matching": "Does matching contraction improve verified successes under the same total per-input allowance?",
    "residual": "Which small partial assignments observed in real search fail despite individually feasible branches?",
}
VERSION = "focused-v1"


def select_study(config, store):
    index = store.meta(VERSION + ":rotation", 0)
    return (
        STUDIES[index % len(STUDIES)] if config.focused_study == "rotate" else config.focused_study
    ), index


def _save(store, output, run_id, study, data):
    record = {"schema_version": 1, "run_id": run_id, "study": study, "data": data}
    cursor = store.connection.execute(
        "INSERT INTO focused_records(run_id,study,data) VALUES (?,?,?)",
        (run_id, study, dump(record)),
    )
    record["record_id"] = cursor.lastrowid
    store.connection.execute(
        "UPDATE focused_records SET data=? WHERE record_id=?", (dump(record), record["record_id"])
    )
    store.commit()
    write_json(output / "focused" / "records" / f"{record['record_id']:08d}.json", record)
    return record


def summarize(study, records):
    payloads = [r["data"] for r in records]
    if study == "pendant":
        statuses = Counter(r["profile"]["status"] for r in payloads)
        return {
            "trees_reviewed": len(payloads),
            "outcomes": dict(sorted(statuses.items())),
            "targets": sum(
                r["profile"]["focus_stratum"] == "target_deficiency_ge2" for r in payloads
            ),
        }
    if study == "matching":
        from .focused_matching import compare_summary

        complete = [r for r in payloads if set(r["trials"]) == {"baseline", "matching_first"}]
        return {
            "pairs_started": len(payloads),
            "pairs_completed": len(complete),
            "comparison": compare_summary(complete),
        }
    from .focused_residual import summarize as residual_summary

    outcomes = Counter()
    snapshots = []
    for payload in payloads:
        result = payload["result"]
        outcomes["trace_inputs"] += 1
        if result["status"] != "completed":
            outcomes["unknown_trace_inputs"] += 1
        snapshots.extend(result.get("residual_records", []))
        outcomes["unclassified_snapshots"] += len(result.get("unclassified_snapshots", []))
    return {**dict(sorted(outcomes.items())), **residual_summary(snapshots)}


def run_study(config, store, output, run_id, deadline, attempt, cancelled=lambda: False):
    study, rotation = select_study(config, store)
    key = VERSION + ":" + study
    start_cursor = cursor = store.meta(key, 0)
    records = []
    supervisor = None
    reason = "batch_limit"

    def available(margin=0.05):
        return not cancelled() and time.monotonic() + margin < deadline

    def save(data):
        records.append(_save(store, output, run_id, study, data))

    try:
        if study == "pendant":
            from .focused_pendant import (
                candidates,
                case_for_index,
                describe,
                pending_orbits,
                profile,
            )

            visited = set(store.meta(key + ":settled", []))
            catalogued = list(
                candidates(
                    store,
                    max_n=max(config.probe_max_n, 20),
                    deadline=deadline,
                    cancelled=cancelled,
                    exclude_ids=visited,
                )
            )
            if available():
                # Queue ordering needs IDs only; never decode historical proof
                # payloads merely to decide which tree to visit next.
                latest = dict(
                    store.connection.execute(
                        "SELECT tree_id,MAX(attempt_id) FROM attempts GROUP BY tree_id"
                    )
                )
                catalogued.sort(key=lambda c: (latest.get(c["tree_id"], 0), c["n"], c["tree_id"]))
            pool = iter(catalogued)
            seen = set()
            for _ in range(config.focused_max_cases * 20):
                if len(records) >= config.focused_max_cases or not available():
                    break
                case = next(pool, None)
                if case is None:
                    case = case_for_index(cursor, config.seed)
                    cursor += 1
                    store.set_meta(key, cursor)
                    # Retain a small deterministic control cohort beside fresh targets.
                    if case["focus_stratum"] != "target_deficiency_ge2" and cursor % 10:
                        continue
                    if case["tree_id"] in visited:
                        continue
                    if not store.add_case(case):
                        # Isomorphic generated inputs can use different vertex indices.
                        # Preserve the established ledger's graph and witness coordinates.
                        case = store.case(case["tree_id"])
                        case = {**case, **describe(case)}
                    store.commit()
                if case["tree_id"] in seen:
                    continue
                seen.add(case["tree_id"])
                rows = store.attempts(tree_id=case["tree_id"])
                if not any(
                    r["scope"] == "graceful" and r["status"] == "verified_graceful" for r in rows
                ):
                    if not available():
                        break
                    attempt(
                        case,
                        deadline,
                        min(config.focused_attempt_seconds, deadline - time.monotonic()),
                    )
                    rows = store.attempts(tree_id=case["tree_id"])
                for orbit in pending_orbits(case, rows, deadline=deadline):
                    if not available():
                        break
                    attempt(
                        case,
                        deadline,
                        config.probe_seconds or config.focused_attempt_seconds,
                        {"kind": "extreme_edge", "edge": orbit["representative"]},
                        orbit,
                    )
                    rows = store.attempts(tree_id=case["tree_id"])
                    if profile(case, rows, deadline=deadline)["status"] == "supported":
                        break
                if not available():
                    break  # Scoped attempts already persisted; classify on the next visit.
                result = profile(case, rows, deadline=deadline)
                if not available():
                    break
                if result["status"] == "integrity_error":
                    raise RuntimeError(f"focused pendant evidence rejected: {result.get('errors')}")
                save(
                    {
                        "case": case,
                        "cutoff_attempt_id": max((r["attempt_id"] for r in rows), default=0),
                        "profile": result,
                    }
                )
                if result["status"] in {"supported", "certified_restricted_counterexample"}:
                    visited.add(case["tree_id"])
                    store.set_meta(key + ":settled", sorted(visited))
                store.commit()
        else:
            from . import focused_matching, focused_residual

            module = focused_matching if study == "matching" else focused_residual
            supervisor = Supervisor(cancelled=cancelled, target=module.worker_main)
            supervisor.start(deadline)
            for _ in range(config.focused_max_cases):
                allowance = config.focused_attempt_seconds
                if not available((2 * allowance + 2) if study == "matching" else allowance + 1):
                    break
                directory = output / "focused" / "work" / f"{cursor:08d}"
                directory.mkdir(parents=True, exist_ok=True)
                if study == "matching":
                    case = focused_matching.case_for_index(cursor // 3, config.seed)
                    seed = derived_seed(config.seed, VERSION, study, cursor)
                    order = (
                        ["baseline", "matching_first"]
                        if cursor % 2 == 0
                        else ["matching_first", "baseline"]
                    )
                    payload = {
                        **case,
                        "index": cursor,
                        "replicate": cursor % 3,
                        "seed": seed,
                        "allowance_seconds": allowance,
                        "order": order,
                        "trials": {},
                    }
                    write_json(directory / "input.json", payload)
                    for variant in order:
                        if not available(allowance + 1):
                            break
                        request = {
                            "input": case["input"],
                            "restriction": None,
                            "seed": seed,
                            "solver_seconds": allowance,
                            "directory": str(directory / variant),
                            "variant": variant,
                            "backend": config.backend,
                            "constructive_search": config.constructive_search,
                            "frontier_search": config.frontier_search,
                            "frontier_algorithm": config.frontier_algorithm,
                            "frontier_max_nodes": config.frontier_max_nodes,
                            "complement_break": config.complement_break,
                            "redundant_sum": config.redundant_sum,
                        }
                        write_json(directory / f"{variant}-request.json", request)
                        result = supervisor.solve(
                            request, min(deadline, time.monotonic() + allowance + 1)
                        )
                        result.setdefault("variant", variant)
                        result.setdefault("algorithm", focused_matching.ALGORITHMS[variant])
                        result.setdefault("allowance_seconds", allowance)
                        result.setdefault("censored", result["status"] == "unknown")
                        # Preserve anomalous solver responses before failing the
                        # study, so the operational alert has reviewable evidence.
                        write_json(directory / f"{variant}-result.json", result)
                        errors = focused_matching.verify_trial(case["input"], result)
                        if errors:
                            raise RuntimeError(f"focused matching evidence rejected: {errors}")
                        payload["trials"][variant] = result
                    save(payload)
                    if len(payload["trials"]) != 2:
                        break  # Retry this pair with both variants next study night.
                else:
                    seed = derived_seed(config.seed, VERSION, study, cursor)
                    family = ("prufer", "recursive", "lobster", "spider")[cursor % 4]
                    n = (12, 16, 20, 24)[(cursor // 4) % 4]
                    data = graph_input(generate_family(family, n, seed))
                    request = {
                        "input": data,
                        "seed": seed,
                        "solver_seconds": allowance,
                        "directory": str(directory),
                    }
                    write_json(directory / "request.json", request)
                    result = supervisor.solve(
                        request, min(deadline, time.monotonic() + allowance + 1)
                    )
                    write_json(directory / "result.json", result)
                    if result["status"] not in {"completed", "unknown"}:
                        raise RuntimeError(f"focused residual worker failed: {result.get('error')}")
                    save(
                        {
                            "index": cursor,
                            "input": data,
                            "seed": seed,
                            "family": family,
                            "allowance_seconds": allowance,
                            "result": result,
                        }
                    )
                cursor += 1
                store.set_meta(key, cursor)
                store.commit()
        if cancelled():
            reason = "cancelled"
        elif not available():
            reason = "budget"
        elif len(records) < config.focused_max_cases:
            reason = "bounded_input_scan"
    finally:
        if supervisor is not None:
            supervisor.stop()
    # Configuration-push smoke checks exercise the selected study without moving
    # the daily rotation. Real scheduled/manual runs persist the next study.
    advance = config.focused_study == "rotate" and config.budget_seconds >= 600 and bool(records)
    if advance:
        store.set_meta(VERSION + ":rotation", rotation + 1)
    store.commit()
    result = {
        "schema_version": 1,
        "study": study,
        "question": QUESTIONS[study],
        "rotation_index": rotation,
        "rotation_advanced": advance,
        "stop_reason": reason,
        "cursor_before": start_cursor,
        "cursor_after": cursor,
        "record_ids": [r["record_id"] for r in records],
        "summary": summarize(study, records),
        "scope": "focused_experiments_not_exhaustive_tree_coverage",
        "novelty_claimed": False,
    }
    write_json(output / "focused" / "summary.json", result)
    return result


def audit_focused(database, output, manifest):
    """Recheck cumulative focused evidence, including prior checkpoint records."""
    tables = {r[0] for r in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "focused_records" not in tables:
        return ["missing focused ledger"] if manifest.get("focused_study") else []
    from .focused_matching import compare_summary, verify_trial
    from .focused_pendant import profile
    from .focused_residual import summarize as residual_summary
    from .focused_residual import verify_record
    from .verify import verify_labeling

    errors, current = [], []
    for identity, run_id, study, raw in database.execute(
        "SELECT record_id,run_id,study,data FROM focused_records ORDER BY record_id"
    ):
        record = json.loads(raw)
        if (
            record.get("record_id"),
            record.get("run_id"),
            record.get("study"),
            record.get("schema_version"),
        ) != (identity, run_id, study, 1):
            errors.append(f"focused record {identity}: ledger identity mismatch")
        payload = record["data"]
        if study == "pendant":
            case = payload["case"]
            stored = database.execute(
                "SELECT data FROM cases WHERE tree_id=?", (case["tree_id"],)
            ).fetchone()
            if stored is None or any(
                json.loads(stored[0])[key] != case[key] for key in ("n", "edges", "tree_id")
            ):
                errors.append(f"focused record {identity}: pendant input differs from case ledger")
            rows = [
                json.loads(r[0])
                for r in database.execute(
                    "SELECT data FROM attempts WHERE tree_id=? AND attempt_id<=? ORDER BY attempt_id",
                    (case["tree_id"], payload["cutoff_attempt_id"]),
                )
            ]
            if profile(case, rows) != payload["profile"]:
                errors.append(f"focused record {identity}: pendant profile mismatch")
        elif study == "matching":
            try:
                compare_summary([payload])
            except (ValueError, KeyError, TypeError) as exc:
                errors.append(f"focused record {identity}: invalid comparison: {exc}")
            if not set(payload["trials"]) <= {"baseline", "matching_first"}:
                errors.append(f"focused record {identity}: unknown benchmark variant")
            for variant, trial in payload["trials"].items():
                errors.extend(verify_trial(payload["input"], trial))
                if (
                    trial.get("variant") != variant
                    or trial.get("allowance_seconds") != payload["allowance_seconds"]
                ):
                    errors.append(f"focused record {identity}: unequal benchmark allowances")
        elif study == "residual":
            result = payload["result"]
            if result["status"] not in {"completed", "unknown"}:
                errors.append(f"focused record {identity}: invalid trace status")
            for snapshot in result.get("residual_records", []):
                errors.extend(verify_record(snapshot))
                if snapshot.get("full_input") != payload["input"]:
                    errors.append(f"focused record {identity}: residual came from another tree")
            if result["status"] != "completed" and result.get("residual_records"):
                errors.append(f"focused record {identity}: uncompleted trace has claimed residuals")
            if result["status"] == "completed":
                if result.get("input") != payload["input"] or result.get("seed") != payload["seed"]:
                    errors.append(f"focused record {identity}: trace input or seed mismatch")
                if result.get("summary") != residual_summary(result.get("residual_records", [])):
                    errors.append(f"focused record {identity}: trace summary mismatch")
                trace = result.get("trace", {})
                labels = trace.get("labels")
                verification = (
                    verify_labeling(**payload["input"], labels=labels)
                    if labels is not None
                    else None
                )
                if result.get("trace_verification") != verification or (
                    verification is not None and not verification["valid"]
                ):
                    errors.append(f"focused record {identity}: invalid trace witness")
        else:
            errors.append(f"focused record {identity}: unknown study")
        if run_id == manifest["run_id"]:
            current.append(record)
            path = output / "focused" / "records" / f"{identity:08d}.json"
            if not path.is_file() or json.loads(path.read_text()) != record:
                errors.append(f"focused record {identity}: exported evidence mismatch")
    focus = manifest.get("focused_study")
    if focus:
        if focus["record_ids"] != [r["record_id"] for r in current] or any(
            r["study"] != focus["study"] for r in current
        ):
            errors.append("focused study record set mismatch")
        try:
            if focus["summary"] != summarize(focus["study"], current):
                errors.append("focused summary mismatch")
        except (ValueError, KeyError, TypeError) as exc:
            errors.append(f"focused summary contains invalid evidence: {exc}")
        if json.loads((output / "focused/summary.json").read_text()) != focus:
            errors.append("focused summary export mismatch")
    elif current:
        errors.append("focused records without study manifest")
    return errors


def report_lines(focus):
    if not focus:
        return []
    lines = [
        "",
        "## Focused nightly investigation",
        "",
        focus["question"],
        "",
        f"Study: **{focus['study']}**. Saved {len(focus['record_ids'])} records; stop: `{focus['stop_reason']}`.",
        "",
        "[Machine-readable study summary](focused/summary.json). Detailed inputs and evidence are under `focused/records/`.",
        "",
        "These observations do not extend exhaustive coverage or assert mathematical novelty.",
        "",
        "```json",
        json.dumps(focus["summary"], indent=2, sort_keys=True),
        "```",
    ]
    return lines
