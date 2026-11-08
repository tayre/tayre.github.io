"""Conservative, deterministic findings for review, never automatic discoveries.

Return cumulative findings so a failed notification can be retried on the next
run. Delivery deduplication is separate from, and never mutates, solver evidence.
"""

import hashlib
import json
from collections import defaultdict

from .verify import verify_labeling


def finding_key(campaign, kind, identity):
    return hashlib.sha256(f"{campaign}:{kind}:{identity}".encode()).hexdigest()


def coverage_through(manifest):
    rows = {row["n"]: row for row in manifest.get("exhaustive_coverage", [])}
    n = 0
    while n + 1 in rows:
        row = rows[n + 1]
        count = row.get("enumerated_count")
        if not (
            row.get("generator_exhausted") is True
            and type(count) is int
            and count > 0
            and row.get("catalogued_classes") == count
            and row.get("classes_with_witness") == count
        ):
            break
        n += 1
    return n


def build_findings(database, manifest):
    campaign = manifest["config"]["campaign"]
    findings = {}
    prior_unknown = defaultdict(list)
    witnessed = set()

    def add(kind, identity, **details):
        key = finding_key(campaign, kind, identity)
        findings.setdefault(key, {"key": key, "kind": kind, **details})

    for (raw,) in database.execute("SELECT data FROM attempts ORDER BY attempt_id"):
        record = json.loads(raw)
        if record["scope"] != "graceful":
            continue
        tree = record["tree_id"]
        common = {
            "tree_id": tree,
            "n": record["input"]["n"],
            "family": record["family"],
            "first_run_id": record["run_id"],
            "attempt_ids": [record["attempt_id"]],
        }
        if record["status"] == "solver_infeasible":
            if record.get("proof_certificate_verified"):
                add(
                    "certificate_verified_infeasibility",
                    tree,
                    **common,
                    title=f"Checked unrestricted UNSAT certificate on a {common['n']}-vertex tree",
                    significance="Candidate for independent mathematical review; no automatic counterexample claim.",
                    next_step="Recheck the archived graph, encoding and proof with a separate implementation, then obtain expert review.",
                )
                continue
            add(
                "unrestricted_infeasibility",
                tree,
                **common,
                title=f"Unrestricted solver infeasibility on a {common['n']}-vertex tree",
                significance="Requires independent investigation; not a certified counterexample.",
                next_step="Recheck the exact model and input, repeat without reductions, and seek an independent proof-logging solver.",
            )
        elif record["status"] == "unknown":
            prior_unknown[tree].append(
                {"attempt_id": record["attempt_id"], "run_id": record["run_id"]}
            )
        elif record["status"] == "verified_graceful":
            previous = prior_unknown[tree]
            if (
                tree not in witnessed
                and common["n"] >= 20
                and len(previous) >= 3
                and len({r["run_id"] for r in previous}) >= 2
                and verify_labeling(**record["input"], labels=record.get("labels"))["valid"]
            ):
                common["attempt_ids"] = [r["attempt_id"] for r in previous] + common["attempt_ids"]
                add(
                    "difficult_case_resolved",
                    tree,
                    **common,
                    title=f"A {common['n']}-vertex case resolved after {len(previous)} inconclusive attempts",
                    significance="A verified labeling and an algorithm-performance observation; mathematical novelty is not established.",
                    next_step="Compare the logged seeds, budgets, and branch counts; retain the verified witness as a benchmark.",
                )
            witnessed.add(tree)

    best = 0
    for run_id, raw in database.execute("SELECT run_id,manifest FROM runs ORDER BY rowid"):
        info = manifest if run_id == manifest["run_id"] else json.loads(raw)
        through = coverage_through(info)
        if through > best and through >= 10:
            add(
                "validation_milestone",
                str(through),
                first_run_id=run_id,
                through_n=through,
                attempt_ids=[],
                title=f"Configured exhaustive validation completed through {through} vertices",
                significance="An implementation-validation milestone, not a new literature bound or proof of the universal conjecture.",
                next_step="Review enumeration counts and witnesses, then choose the next bounded experiment.",
            )
        best = max(best, through)
    priority = {
        "certificate_verified_infeasibility": 0,
        "unrestricted_infeasibility": 0,
        "difficult_case_resolved": 1,
        "validation_milestone": 2,
    }
    return {
        "schema_version": 1,
        "campaign": campaign,
        "run_id": manifest["run_id"],
        "findings": sorted(findings.values(), key=lambda f: (priority[f["kind"]], f["key"])),
        "policy": "Cumulative review candidates; ordinary timeouts, restricted infeasibility, and stock hypotheses do not trigger alerts.",
    }
