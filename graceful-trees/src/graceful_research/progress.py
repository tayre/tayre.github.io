"""Reproducible chart data derived from the cumulative evidence ledger.

Counts of trees concern unrestricted searches only. Restricted probes are attempt
counts, never extra trees or counterexamples. A positive witness remains positive
after a later inconclusive retry, matching the ordinary report's convention.
"""

import json
from collections import Counter, defaultdict

from .analysis import summarize
from .storage import ERROR_STATUSES

REPORT_FILES = (
    "progress.json",
    "report.html",
    "figures/progress.svg",
    "figures/sizes.svg",
    "figures/families.svg",
    "figures/runtime.svg",
    "figures/overview.png",
)
OUTCOMES = ("verified_graceful", "unknown", "solver_infeasible", "errors")
LABELS = {
    "verified_graceful": "Verified graceful",
    "unknown": "Unresolved",
    "solver_infeasible": "Solver infeasible",
    "errors": "Errors",
}


def outcome(status):
    return "errors" if status in ERROR_STATUSES else status


def compact_record(record):
    """Keep only reporting fields, rather than every saved model and witness."""
    keys = (
        "attempt_id",
        "tree_id",
        "scope",
        "family",
        "status",
        "search_method",
        "features",
        "branches",
        "deterministic_time",
        "wall_seconds",
        "solver_wall_seconds",
        "timed_out",
        "proof_certificate_verified",
    )
    result = {key: record[key] for key in keys if key in record}
    result["input"] = {"n": record["input"]["n"]}
    return result


def remember(final, counts, record):
    previous = final.get(record["tree_id"])
    if (
        previous
        and (
            previous["status"] == "verified_graceful" or previous.get("proof_certificate_verified")
        )
        and record["status"] != "verified_graceful"
    ):
        return
    if previous:
        counts[outcome(previous["status"])] -= 1
    final[record["tree_id"]] = record
    counts[outcome(record["status"])] += 1


def count_snapshot(final, outcomes, attempts):
    return {
        "trees": len(final),
        **{key: outcomes[key] for key in OUTCOMES},
        **{
            key: attempts[key]
            for key in (
                "attempts",
                "unrestricted_attempts",
                "restricted_attempts",
                "timeout_attempts",
                "restricted_solver_infeasible",
            )
        },
    }


def build_progress(database, manifest):
    """Read SQLite without changing it; also used by the independent run audit."""
    final, current_final = {}, {}
    outcomes, current_outcomes = Counter(), Counter()
    totals, current_totals = Counter(), Counter()
    history, runtime = [], []
    proofs, certified_trees = Counter(), set()
    runs = database.execute("SELECT run_id,manifest FROM runs ORDER BY rowid").fetchall()
    for run_id, raw in runs:
        info = manifest if run_id == manifest["run_id"] else json.loads(raw)
        before_trees, before_verified = len(final), outcomes["verified_graceful"]
        run_attempts = 0
        for (raw_record,) in database.execute(
            "SELECT data FROM attempts WHERE run_id=? ORDER BY attempt_id", (run_id,)
        ):
            record = compact_record(json.loads(raw_record))
            if record.get("proof_certificate_verified"):
                proofs["unrestricted" if record["scope"] == "graceful" else "restricted"] += 1
                if record["scope"] == "graceful":
                    certified_trees.add(record["tree_id"])
            current = run_id == manifest["run_id"]
            for counter in (totals, current_totals) if current else (totals,):
                counter["attempts"] += 1
                counter[
                    "unrestricted_attempts"
                    if record["scope"] == "graceful"
                    else "restricted_attempts"
                ] += 1
                counter["timeout_attempts"] += bool(record.get("timed_out"))
                counter["restricted_solver_infeasible"] += (
                    record["scope"] != "graceful" and record["status"] == "solver_infeasible"
                )
            run_attempts += 1
            if record["scope"] != "graceful":
                continue
            remember(final, outcomes, record)
            if current:
                remember(current_final, current_outcomes, record)
                runtime.append(
                    {
                        "attempt_id": record["attempt_id"],
                        "tree_id": record["tree_id"],
                        "n": record["input"]["n"],
                        "status": outcome(record["status"]),
                        "wall_seconds": record.get("wall_seconds"),
                        "timed_out": bool(record.get("timed_out")),
                    }
                )
        history.append(
            {
                "run": len(history) + 1,
                "run_id": run_id,
                "started_at": info["started_at"],
                "stop_reason": info["stop_reason"],
                "run_attempts": run_attempts,
                "new_trees": len(final) - before_trees,
                "new_verified": outcomes["verified_graceful"] - before_verified,
                **count_snapshot(final, outcomes, totals),
            }
        )
    sizes, families = defaultdict(Counter), defaultdict(Counter)
    for record in final.values():
        for counter in (sizes[record["input"]["n"]], families[record["family"]]):
            counter[outcome(record["status"])] += 1
            counter["trees"] += 1
    result = {
        "schema_version": 1,
        "campaign": manifest["config"]["campaign"],
        "run_id": manifest["run_id"],
        "basis": "Distinct trees with unrestricted attempts; positive witnesses take precedence.",
        "certificate_verified_infeasible": len(certified_trees),
        "cumulative": {
            **count_snapshot(final, outcomes, totals),
            "runs": len(history),
            "catalogued_trees": database.execute("SELECT count(*) FROM cases").fetchone()[0],
        },
        "current_run": count_snapshot(current_final, current_outcomes, current_totals),
        "history": history,
        "sizes": [
            {"n": n, "trees": counts["trees"], **{k: counts[k] for k in OUTCOMES}}
            for n, counts in sorted(sizes.items())
        ],
        "families": [
            {"family": name, "trees": counts["trees"], **{k: counts[k] for k in OUTCOMES}}
            for name, counts in sorted(families.items())
        ],
        "family_sizes": summarize(list(final.values()))["families"],
        "runtime": runtime,
    }
    if manifest.get("proof_evidence_schema_version") == 1:
        result["proof_evidence_schema_version"] = 1
        result["proof_counts"] = {
            "unrestricted_attempts": proofs["unrestricted"],
            "restricted_attempts": proofs["restricted"],
            "total_attempts": sum(proofs.values()),
        }
    return result
