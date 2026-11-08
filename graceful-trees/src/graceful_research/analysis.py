"""Deterministic observations and explicitly unproven experiment suggestions."""

import csv
import statistics
from collections import Counter, defaultdict
from typing import Protocol

from .io import write_json
from .storage import ERROR_STATUSES
from .trees import edge_orbits, to_graph


class HypothesisProvider(Protocol):
    """Future optional providers consume summaries, never change solver evidence.

    Implementations may return suggestions for human review. The nightly CLI uses
    only RuleBasedHypotheses; an LLM client and credentials are not dependencies.
    """

    def suggest(self, summary: dict) -> list[dict]: ...


class RuleBasedHypotheses:
    def suggest(self, summary):
        suggestions = [
            {
                "kind": "hypothesis",
                "id": "pendant-extreme-support-lobsters",
                "statement": (
                    "For every lobster T that is not a caterpillar, there is a graceful "
                    "labeling whose edge of difference |V(T)|-1 is incident to a leaf."
                ),
                "status": "candidate question; truth and novelty not asserted",
                "test": (
                    "Enumerate non-caterpillar lobsters at a declared order; test every pendant "
                    "edge orbit. Caterpillars already satisfy this by the known construction. "
                    "One verified pendant witness establishes the property for that tree. "
                    "Excluding all pendant orbits requires independently checked UNSAT evidence."
                ),
            }
        ]
        if summary["unknown"]:
            suggestions.append(
                {
                    "kind": "experiment",
                    "id": "censored-retries",
                    "statement": "Repeat unresolved inputs with larger budgets and multiple logged seeds.",
                    "status": "algorithm benchmark, not a mathematical conjecture",
                    "test": "Match size, solver version, model options and CPU; report censoring explicitly.",
                }
            )
        if summary["outliers"]:
            suggestions.append(
                {
                    "kind": "hypothesis",
                    "id": "structural-search-cost",
                    "statement": (
                        "At fixed order and fixed CP-SAT configuration, lower leaf fraction "
                        "predicts a higher median branch count across a fixed list of seeds."
                    ),
                    "status": "unvalidated performance hypothesis; no claim about gracefulness",
                    "test": (
                        "Use size-matched cohorts with at least 20 trees and 5 seeds per tree. "
                        "Include unknowns as censored observations; do not compare solved-only "
                        "averages as if they represented the whole cohort."
                    ),
                }
            )
        return suggestions


def summarize(records):
    main = [r for r in records if r["scope"] == "graceful"]
    by_tree = defaultdict(list)
    for record in main:
        by_tree[record["tree_id"]].append(record)
    final = []
    for items in by_tree.values():
        # A positive witness remains positive even if a later timed search is unknown.
        solved = [r for r in items if r["status"] == "verified_graceful"]
        final.append(solved[-1] if solved else items[-1])
    counts = Counter(r["status"] for r in final)
    groups = defaultdict(list)
    for record in final:
        groups[(record["family"], record["input"]["n"])].append(record)
    families = []
    for (family, n), items in sorted(groups.items()):
        solved = [r for r in items if r["status"] == "verified_graceful"]
        times = [r["solver_wall_seconds"] for r in solved if "solver_wall_seconds" in r]
        branches = [r["branches"] for r in solved if "branches" in r]
        families.append(
            {
                "family": family,
                "n": n,
                "trees": len(items),
                "verified": len(solved),
                "unknown": sum(r["status"] == "unknown" for r in items),
                "solver_infeasible": sum(r["status"] == "solver_infeasible" for r in items),
                "errors": sum(r["status"] in ERROR_STATUSES for r in items),
                "solved_median_seconds": statistics.median(times) if times else None,
                "solved_median_branches": statistics.median(branches) if branches else None,
            }
        )
    by_size = defaultdict(list)
    for record in final:
        if (
            record["status"] == "verified_graceful"
            and record.get("search_method", "cp-sat") == "cp-sat"
        ):
            by_size[record["input"]["n"]].append(record.get("branches", 0))
    outliers = []
    for record in final:
        peers = by_size[record["input"]["n"]]
        if (
            record.get("search_method", "cp-sat") == "cp-sat"
            and len(peers) >= 5
            and record.get("branches", 0) > max(50, 3 * statistics.median(peers))
        ):
            outliers.append(record["tree_id"])
    rank = {
        "solver_infeasible": 0,
        "integrity_error": 0,
        "error": 0,
        "model_invalid": 0,
        "invalid_solution": 0,
        "unknown": 1,
        "verified_graceful": 2,
    }
    difficult = sorted(
        final,
        key=lambda r: (
            rank[r["status"]],
            -r.get("deterministic_time", 0),
            -r.get("branches", 0),
            -r.get("wall_seconds", 0),
            r["tree_id"],
        ),
    )[:15]
    return {
        "trees_investigated": len({r["tree_id"] for r in records}),
        "unrestricted_trees": len(final),
        "attempts": len(records),
        "unrestricted_attempts": len(main),
        "restricted_attempts": len(records) - len(main),
        "search_methods": dict(
            sorted(Counter(r.get("search_method", "unrecorded") for r in records).items())
        ),
        "size_distribution": dict(sorted(Counter(r["input"]["n"] for r in final).items())),
        "verified_graceful": counts["verified_graceful"],
        "unknown": counts["unknown"],
        "solver_infeasible": counts["solver_infeasible"],
        "certificate_verified_infeasible": 0,
        "timeout_attempts": sum(bool(r.get("timed_out")) for r in records),
        "unknown_attempts": sum(r["status"] == "unknown" for r in records),
        "errors": sum(r["status"] in ERROR_STATUSES for r in records),
        "verified_certificates": sum(
            r.get("verification", {}).get("valid", False) for r in records if r.get("verification")
        ),
        "restricted_solver_infeasible": sum(
            r["scope"] != "graceful" and r["status"] == "solver_infeasible" for r in records
        ),
        "families": families,
        "outliers": sorted(outliers),
        "difficult": difficult,
    }


def extreme_profiles(store, max_n):
    profiles = []
    for case in store.cases(max_n=max_n):
        if case["n"] < 2:
            continue
        entries = []
        for orbit in edge_orbits(to_graph(case)):
            key = "-".join(map(str, orbit["representative"]))
            records = store.attempts(tree_id=case["tree_id"], scope="extreme_edge", edge_key=key)
            status = records[-1]["status"] if records else "untested"
            entries.append(
                {**orbit, "status": status, "attempt_ids": [r["attempt_id"] for r in records]}
            )
        if any(e["status"] != "untested" for e in entries):
            profiles.append(
                {
                    "tree_id": case["tree_id"],
                    "n": case["n"],
                    "orbits": entries,
                    "witnessed_edges": sum(
                        e["orbit_size"] for e in entries if e["status"] == "verified_graceful"
                    ),
                    "solver_excluded_edges": sum(
                        e["orbit_size"] for e in entries if e["status"] == "solver_infeasible"
                    ),
                    "pendant_witness": any(
                        e["pendant"] and e["status"] == "verified_graceful" for e in entries
                    ),
                    "exclusions_independently_certified": False,
                }
            )
    return profiles


def write_reports(output, manifest, records, profiles, provider=None):
    summary = summarize(records)
    suggestions = (provider or RuleBasedHypotheses()).suggest(summary)
    # Providers produce proposals only. They do not participate in classification.
    write_json(
        output / "analysis.json",
        {
            "observations": summary,
            "suggestions": suggestions,
            "mathematical_proofs": [],
            "novelty_checked": False,
            "extreme_edge_profiles": profiles,
        },
    )
    columns = [
        "attempt_id",
        "tree_id",
        "scope",
        "edge_key",
        "family",
        "n",
        "seed",
        "status",
        "search_method",
        "termination",
        "wall_seconds",
        "solver_wall_seconds",
        "branches",
        "conflicts",
        "deterministic_time",
        "timed_out",
        "proof_certificate_verified",
    ]
    with (output / "attempts.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for record in records:
            row = {key: record.get(key) for key in columns}
            row["n"] = record["input"]["n"]
            writer.writerow(row)
    lines = [
        "# Graceful tree research run",
        "",
        f"Run `{manifest['run_id']}` · campaign `{manifest['config']['campaign']}`",
        "",
        f"Started {manifest['started_at']}; stopped for **{manifest['stop_reason']}**.",
        f"Elapsed {manifest['elapsed_seconds']:.3f}s; configured budget {manifest['config']['budget_seconds']}s.",
        "",
        "[Open the offline visual progress report](report.html) · [Chart data](progress.json) · [Notable review candidates](findings.json)",
        "",
        "Download and extract the complete run artifact to open the HTML report and its evidence links.",
        "The charts combine cumulative checkpoint history with this run's search effort.",
        "",
        "![Cumulative research progress, size/family outcomes, and current-run search effort](figures/overview.png)",
        "",
        "## Evidence summary",
        "",
        f"- Unique trees investigated (including probes): **{summary['trees_investigated']}**.",
        f"- Unrestricted trees: **{summary['unrestricted_trees']}**; verified graceful: **{summary['verified_graceful']}**.",
        f"- Unrestricted unknown: **{summary['unknown']}**; solver-reported infeasible: **{summary['solver_infeasible']}**.",
        "- Independently certificate-verified infeasible: **0** (unsupported by this backend).",
        f"- Attempts: **{summary['attempts']}** ({summary['restricted_attempts']} restricted probes).",
        f"- Unknown attempts: **{summary['unknown_attempts']}**; observed timeouts: **{summary['timeout_attempts']}**.",
        f"- Verified labeling certificates: **{summary['verified_certificates']}**; errors: **{summary['errors']}**.",
        f"- Restricted solver-infeasible attempts: **{summary['restricted_solver_infeasible']}**, kept separate from the main search.",
        "- Attempts by method: "
        + "; ".join(f"{method}: **{count}**" for method, count in summary["search_methods"].items())
        + ". Unrecorded includes attempts interrupted before the worker returned a method.",
        "",
        "A timeout is unresolved. A CP-SAT INFEASIBLE result is a solver conclusion, not an",
        "independently checked proof certificate. No counterexample is declared automatically.",
        "These experiments do not prove the universal conjecture or establish novelty.",
        "",
        "## Tree sizes (unrestricted searches)",
        "",
        "| Vertices | Trees |",
        "| --- | ---: |",
    ]
    lines += [f"| {n} | {count} |" for n, count in summary["size_distribution"].items()]
    lines += [
        "",
        "## Performance by input family and size",
        "",
        "Family is the first generator that introduced a tree, not an exclusive mathematical classification.",
        "Medians use solved CP-SAT cases only; constructed witnesses have no solver time or branch count.",
        "Unknowns are censored; different sizes, budgets, hardware",
        "or successful subsets are not controlled comparisons.",
        "",
        "| Family | n | Trees | Verified | Unknown | Infeasible | Solved median s | Median branches |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for group in summary["families"]:
        seconds = group["solved_median_seconds"]
        time_text = f"{seconds:.4f}" if seconds is not None else "—"
        lines.append(
            f"| {group['family']} | {group['n']} | {group['trees']} | {group['verified']} | "
            f"{group['unknown']} | {group['solver_infeasible']} | {time_text} | "
            f"{group['solved_median_branches']} |"
        )
    lines += [
        "",
        "## Cases to investigate",
        "",
        "Unresolved and infeasible cases come first, then deterministic work and branch count.",
        "Wall times include dispatch overhead; exact inputs and all attempts are in the ledger.",
        "",
        "| Tree ID | n | Family | Status | Wall s | Branches | Leaves | Diameter |",
        "| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for record in summary["difficult"]:
        lines.append(
            f"| [{record['tree_id'][:12]}](inputs/{record['tree_id']}.json) | "
            f"{record['input']['n']} | {record['family']} | {record['status']} | "
            f"{record.get('wall_seconds', 0):.3f} | {record.get('branches', '—')} | "
            f"{record['features']['leaves']} | {record['features']['diameter']} |"
        )
    lines += [
        "",
        f"Branch-count outliers (>3× same-order solved CP-SAT median, ≥5 CP-SAT peers, >50 branches): {len(summary['outliers'])}.",
        "This is a triage rule, not a statistical significance test.",
        "",
        "## Extreme-edge observations",
        "",
        f"Cumulative checkpoint contains {len(profiles)} partially or fully probed trees.",
        "`analysis.json` records every edge orbit, witnesses, exclusions reported by the solver,",
        "and untested/unknown orbits. Only witnessed membership is independently verified.",
        "Infeasibility for a prescribed edge does not imply that the tree is nongraceful.",
        "",
        "## Proposed next experiments (unproven)",
        "",
    ]
    for suggestion in suggestions:
        lines += [
            f"- **{suggestion['id']}**: {suggestion['statement']} "
            f"Status: {suggestion['status']}. {suggestion['test']}"
        ]
    lines += [
        "",
        "## Reproducibility and coverage",
        "",
        "See `manifest.json` for exact versions, seeds, source hashes, configuration, hardware,",
        "generation cursors and cumulative counts. `attempts.jsonl` and CSV describe this run;",
        "`research.sqlite` carries the complete accumulated inputs, attempts and positive witnesses.",
        "`certificates/` contains standalone witnesses. Model/parameter/response protos are retained",
        "per attempt when the worker reached those stages. `checksums.json` covers saved files.",
        "Run `graceful-research audit RUN_DIRECTORY` before using results.",
        "",
        f"Cumulative unique inputs: {manifest['cumulative_cases']}; cumulative attempts: {manifest['cumulative_attempts']}.",
        "Generation stopping or exhausting a configured stream alone does not certify exhaustive",
        "gracefulness verification. Inspect unresolved inputs and enumeration counts as well.",
        "",
    ]
    if manifest.get("error"):
        lines += ["## Run error", "", "```text", manifest["error"], "```", ""]
    (output / "report.md").write_text("\n".join(lines))
    return summary
