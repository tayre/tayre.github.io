"""Classify a fixed, seeded corpus of short branches against a permutation oracle.

This is a bounded residual experiment, not a whole-tree search or novelty claim.
The corpus includes intentionally constructed positive controls; its success rate
is not an estimate for random trees or naturally encountered residual states.
"""

import argparse
import hashlib
import itertools
import json
import random
import time
from collections import Counter
from pathlib import Path

from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.rooted_pairings import classify
from graceful_research.trees import derived_seed

MASTER_SEED = 2026110807
RESOURCE_KEYS = ("unused", "internal", "attachment", "parents")


def verify_placement(case, placements):
    """Direct definition check, without importing production verification helpers."""
    if len(placements) != len(case["parents"]) or any(len(row) != 2 for row in placements):
        return False
    if any(type(value) is not int for row in placements for value in row):
        return False
    if sorted(value for row in placements for value in row) != sorted(case["unused"]):
        return False
    internal, attachment = [], []
    for parent, (x, y) in zip(case["parents"], placements, strict=True):
        internal.append(abs(x - y))
        attachment.append(abs(parent - x))
    return sorted(internal) == sorted(case["internal"]) and sorted(attachment) == sorted(
        case["attachment"]
    )


def permutation_oracle(case):
    """Exhaust permutations of all labels; no pairing or orientation search reuse."""
    checked = 0
    pairable = False
    pairing_witness = []
    expected_internal = sorted(case["internal"])
    expected_attachment = sorted(case["attachment"])
    for assignment in itertools.permutations(case["unused"]):
        checked += 1
        actual_internal = sorted(
            abs(assignment[i] - assignment[i + 1]) for i in range(0, len(assignment), 2)
        )
        if actual_internal != expected_internal:
            continue
        rows = [list(assignment[i : i + 2]) for i in range(0, len(assignment), 2)]
        if not pairable:
            pairing_witness = rows
        pairable = True
        actual_attachment = sorted(
            abs(parent - assignment[2 * i]) for i, parent in enumerate(case["parents"])
        )
        if actual_attachment == expected_attachment:
            if not verify_placement(case, rows):
                raise RuntimeError("oracle witness failed direct verification")
            return {
                "pairable": True,
                "feasible": True,
                "exhausted": False,
                "assignments_checked": checked,
                "pairing_witness": pairing_witness,
                "placements": rows,
            }
    return {
        "pairable": pairable,
        "feasible": False,
        "exhausted": True,
        "assignments_checked": checked,
        "pairing_witness": pairing_witness,
        "placements": [],
    }


def cases():
    controls = [
        {
            "name": "nordh_conditions_not_sufficient",
            "unused": [1, 2, 4, 5],
            "internal": [1, 3],
            "attachment": [2, 4],
            "parents": [0, 0],
            "expected": "pairing_obstruction_beyond_conditions",
        },
        {
            "name": "single_branch_wrong_attachment",
            "unused": [1, 2],
            "internal": [1],
            "attachment": [3],
            "parents": [0],
            "expected": "attachment_obstruction",
        },
        {
            "name": "shared_parent_completion",
            "unused": [1, 2, 4, 6],
            "internal": [2, 5],
            "attachment": [1, 4],
            "parents": [0, 0],
            "expected": "completion",
        },
        {
            "name": "attachments_compete_for_one_internal_pair",
            "unused": [1, 2, 4, 6],
            "internal": [2, 5],
            "attachment": [1, 6],
            "parents": [0, 0],
            "expected": "attachment_obstruction",
        },
        {
            "name": "graceful_seven_vertex_path_residual",
            "unused": [0, 3, 4, 6],
            "internal": [1, 6],
            "attachment": [2, 5],
            "parents": [1, 2],
            "expected": "completion",
        },
    ]
    result = [{"kind": "known_control", "pattern": "control", **case} for case in controls]
    for branches in range(1, 5):
        for pattern in ("interval", "two_intervals", "two_holes"):
            for parent_count in range(1, min(2, branches) + 1):
                for mode in (
                    "unconditioned_0",
                    "unconditioned_1",
                    "pairable_control",
                    "positive_control",
                ):
                    seed = derived_seed(
                        "rooted-pairing-v1", MASTER_SEED, branches, pattern, parent_count, mode
                    )
                    rng = random.Random(seed)
                    if pattern == "interval":
                        unused = list(range(1, 2 * branches + 1))
                    elif pattern == "two_intervals":
                        unused = list(range(1, branches + 1)) + list(
                            range(branches + 3, 2 * branches + 3)
                        )
                    else:
                        holes = set(rng.sample(range(2, 2 * branches + 2), 2))
                        unused = [
                            value for value in range(1, 2 * branches + 3) if value not in holes
                        ]
                    parents = [0] * branches
                    if parent_count == 2:
                        parents[branches // 2 :] = [max(unused) + 1] * (branches - branches // 2)
                    ambient_n = max(unused + parents) + 2
                    differences = list(range(1, ambient_n))
                    construction = None
                    generation_attempts = 0
                    if mode.startswith("unconditioned"):
                        chosen = rng.sample(differences, 2 * branches)
                        internal, attachment = sorted(chosen[:branches]), sorted(chosen[branches:])
                    else:
                        for generation_index in range(10000):
                            generation_attempts = generation_index + 1
                            assignment = rng.sample(unused, len(unused))
                            internal = [
                                abs(assignment[i] - assignment[i + 1])
                                for i in range(0, len(unused), 2)
                            ]
                            if len(set(internal)) != branches:
                                continue
                            if mode == "pairable_control":
                                attachment = rng.sample(
                                    [d for d in differences if d not in internal], branches
                                )
                            else:
                                attachment = [
                                    abs(parent - assignment[2 * i])
                                    for i, parent in enumerate(parents)
                                ]
                                if len(set(internal + attachment)) != 2 * branches:
                                    continue
                                construction = [
                                    assignment[i : i + 2] for i in range(0, len(unused), 2)
                                ]
                            break
                        else:
                            raise RuntimeError(
                                "could not construct prespecified control within generation cap"
                            )
                        internal, attachment = sorted(internal), sorted(attachment)
                    result.append(
                        {
                            "kind": "generated",
                            "pattern": pattern,
                            "generation_mode": mode,
                            "seed": seed,
                            "generation_attempts": generation_attempts,
                            "ambient_n": ambient_n,
                            "unused": unused,
                            "internal": internal,
                            "attachment": attachment,
                            "parents": parents,
                            "construction_witness": construction,
                        }
                    )
    # These are labeled arithmetic resource problems, not unlabeled graph shapes.
    # Preserve the proposal count but remove exact duplicate resource inputs.
    unique = {}
    for case in result:
        payload = {key: case[key] for key in RESOURCE_KEYS}
        key = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if key in unique:
            unique[key].setdefault("duplicate_proposals", []).append(
                {k: v for k, v in case.items() if k not in RESOURCE_KEYS}
            )
        else:
            case["case_id"] = hashlib.sha256(key.encode()).hexdigest()
            unique[key] = case
    return list(unique.values())


def experiment(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    inputs = cases()
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "master_seed": MASTER_SEED,
        "provenance": provenance(output),
        "scope": "fixed_rooted_pairing_residual",
        "cases": len(inputs),
        "proposals_before_exact_deduplication": 89,
        "protocol": "Five named controls plus four seeded modes for each admissible combination of 1..4 branches, interval/two-interval/two-hole resources and one/two distinct parents. Modes are two unconditioned difference draws, an internally pairable control and a constructed positive control. Inputs are fixed and saved before classification; outcomes are not used to select inputs. Exact duplicate resource problems are merged. This is neither exhaustive coverage of resource patterns nor a naturally sampled residual workload.",
        "references": [
            "https://arxiv.org/html/math/0506155",
            "https://arxiv.org/html/2511.11331v1",
            "https://doi.org/10.1016/j.disc.2021.112719",
        ],
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    records = []
    for index, case in enumerate(inputs):
        started = time.monotonic()
        result = classify(**{key: case[key] for key in RESOURCE_KEYS})
        seconds = time.monotonic() - started
        started = time.monotonic()
        oracle = permutation_oracle(case)
        oracle_seconds = time.monotonic() - started
        if any(result[key] != oracle[key] for key in ("pairable", "feasible")):
            raise RuntimeError(f"classifier/oracle disagreement for case {index}")
        if "expected" in case and result["classification"] != case["expected"]:
            raise RuntimeError(f"known control failed for case {index}")
        if result["feasible"] and not verify_placement(case, result["placements"]):
            raise RuntimeError(f"invalid witness for case {index}")
        if case.get("construction_witness") is not None:
            if not verify_placement(case, case["construction_witness"]):
                raise RuntimeError(f"invalid constructed positive control {index}")
        row = {
            "case": index,
            "input": case,
            "result": result,
            "permutation_oracle": oracle,
            "classifier_seconds": seconds,
            "oracle_seconds": oracle_seconds,
        }
        records.append(row)
        write_json(output / "cases" / f"{index:03d}.json", row)
    counts = Counter(row["result"]["classification"] for row in records)
    attachment_failures = [
        row for row in records if row["result"]["classification"] == "attachment_obstruction"
    ]
    diagnostic_summary = {
        "attachment_obstructions": len(attachment_failures),
        "with_empty_branch_options": [
            row["case"]
            for row in attachment_failures
            if not row["result"]["local_diagnostics"]["all_branches_have_options"]
        ],
        "with_unavailable_attachment_differences": [
            row["case"]
            for row in attachment_failures
            if row["result"]["local_diagnostics"]["missing_attachment_differences"]
        ],
        "passing_branch_and_attachment_checks": [
            row["case"]
            for row in attachment_failures
            if row["result"]["local_diagnostics"]["passes_branch_and_attachment_checks"]
        ],
        "passing_all_local_resource_checks": [
            row["case"]
            for row in attachment_failures
            if row["result"]["local_diagnostics"]["passes_all_local_resource_checks"]
        ],
        "categories_may_overlap": True,
    }
    groups = []
    for branches in range(1, 5):
        rows = [row for row in records if len(row["input"]["parents"]) == branches]
        groups.append(
            {
                "branches": branches,
                "cases": len(rows),
                "classifications": dict(Counter(row["result"]["classification"] for row in rows)),
            }
        )
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(records),
        "classifications": dict(counts),
        "attachment_diagnostics": diagnostic_summary,
        "by_branch_count": groups,
        "oracle_assignments_checked": sum(
            row["permutation_oracle"]["assignments_checked"] for row in records
        ),
        "all_oracles_agreed": True,
        "negative_proof_certificates": 0,
        "novelty_claimed": False,
        "records": records,
    }
    write_json(output / "summary.json", summary)
    report = [
        "# Rooted short-branch completion experiment",
        "",
        f"{len(records)} unique fixed resource problems; all exact classifications agreed with "
        f"an independent permutation oracle ({summary['oracle_assignments_checked']:,} assignments examined).",
        "",
        "Each branch has two unassigned vertices joined to its declared already assigned parent. "
        "Internal and attachment differences are prescribed separately. An impossible residual "
        "is not a nongraceful tree. These finite exhaustive searches do not produce independently "
        "checkable UNSAT proof certificates, and no mathematical novelty is claimed.",
        "",
        "| Classification | Cases |",
        "| --- | ---: |",
        *[f"| {name} | {count} |" for name, count in sorted(counts.items())],
        "",
        "The corpus includes constructed positive controls and internally pairable controls. "
        "It is not exhaustive over resource patterns, a random-tree sample, or an estimate of "
        "how often this technique would help nightly search. Exact inputs are frozen before "
        "classification and duplicates are recorded rather than counted twice.",
        "",
        "## What the observations distinguish",
        "",
        "Necessary-condition failures violate Skolem parity or density. A pairing failure beyond "
        "those conditions shows they are insufficient for that resource set. Attachment failures "
        "admit the prescribed internal pairing but cannot orient and allocate its pairs among "
        "the declared parent labels while consuming exactly the attachment differences.",
        "",
        "The known Nordh example is retained as a control, not a discovery. The attachment-only "
        "examples are candidates for a future boundary-compatibility classification; this run "
        "does not establish a new general theorem.",
        "",
        "## Local availability versus joint resource conflicts",
        "",
        "Each branch's local table lists every ordered pair of unused labels satisfying its "
        "internal and attachment requirements in isolation. These necessary coverage checks "
        "do not enforce disjointness between branches and are not sufficient for completion.",
        "",
        f"Of the {len(attachment_failures)} attachment obstructions, "
        f"{len(diagnostic_summary['passing_branch_and_attachment_checks'])} have a nonempty "
        "local table for every branch and cover every attachment difference somewhere. "
        f"Of those, {len(diagnostic_summary['passing_all_local_resource_checks'])} also cover "
        "every unused label and internal difference. The other examples retain a direct "
        "local availability obstruction. Diagnostic categories can overlap.",
        "",
        "The named control `attachments_compete_for_one_internal_pair` passes the branch "
        "and attachment checks, but label 2 appears in no local option. Covering attachment "
        "differences alone therefore misses an elementary label-resource obstruction.",
        "",
        *[
            f"- [Case {index}: every local resource is available](cases/{index:03d}.json)"
            for index in diagnostic_summary["passing_all_local_resource_checks"]
        ],
        "",
        "## Recommended next experiment",
        "",
        "Group the smallest attachment failures by resource intervals, holes and parent labels. "
        "Test a specifically formulated construction or obstruction on a separately fixed corpus, "
        "compare it with Skolem/Langford and transfer results, and seek a proof with explicit "
        "assumptions. These measurements do not justify adding a nightly pruning rule.",
        "",
        "## Reproduction",
        "",
        "`inputs.json` saves every resource input; `cases/` saves all internal pairing tables, "
        "witnesses and independent oracle outcomes. `protocol.json`, `source/`, dependency versions "
        "and `checksums.json` preserve the measured implementation. This is an experimental archive, "
        "not a campaign checkpoint accepted by `graceful-research audit`.",
        "",
    ]
    (output / "report.md").write_text("\n".join(report))
    write_checksums(output)
    print(
        json.dumps(
            {
                key: summary[key]
                for key in (
                    "cases",
                    "classifications",
                    "oracle_assignments_checked",
                    "all_oracles_agreed",
                )
            },
            indent=2,
        ),
        flush=True,
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    experiment(args.output)
