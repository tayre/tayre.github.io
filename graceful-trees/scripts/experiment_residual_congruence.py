"""Find and independently verify congruence proofs for 102 frozen residuals.

This tests prime-field relaxations only. A missing certificate is inconclusive;
a checked certificate rules out only the stated boundary/resource assignment.
No result is promoted into the campaign's whole-tree infeasibility counters.
"""

import argparse
import hashlib
import itertools
import json
import shutil
from collections import Counter
from pathlib import Path

from graceful_research import residual_congruence_verify
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.residual_congruence import MODULI, find_certificate
from graceful_research.residual_congruence_verify import verify_certificate

PROJECT = Path(__file__).resolve().parents[1]
CORPUS = PROJECT / "examples/residual-signatures.json"
CORPUS_SHA256 = "8011328776a6691b3e95915d4382a6879055363bec3cf891ee019119570ed11b"


def permutation_oracle(case):
    """Definition-level global enumeration, without signature or modular code."""
    checked = 0
    expected = sorted(case["differences"])
    for assignment in itertools.permutations(case["unused"]):
        checked += 1
        actual, placements, cursor = [], [], 0
        for component in case["components"]:
            size = len(component["parents"])
            row = assignment[cursor : cursor + size]
            cursor += size
            placements.append(list(row))
            for index, parent in enumerate(component["parents"]):
                other = component["parent_label"] if parent == -1 else row[parent]
                actual.append(abs(row[index] - other))
        if sorted(actual) == expected:
            return {
                "feasible": True,
                "assignments_checked": checked,
                "placements": placements,
                "exhausted": False,
            }
    return {"feasible": False, "assignments_checked": checked, "placements": [], "exhausted": True}


def experiment(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    corpus_digest = hashlib.sha256(CORPUS.read_bytes()).hexdigest()
    if corpus_digest != CORPUS_SHA256:
        raise RuntimeError("the prespecified frozen corpus checksum changed")
    inputs = json.loads(CORPUS.read_text())["inputs"]
    if len(inputs) != 102:
        raise RuntimeError("the prespecified frozen corpus changed")
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": provenance(output),
        "scope": "fixed_residual_forest",
        "source_corpus": "examples/residual-signatures.json",
        "source_corpus_sha256": corpus_digest,
        "moduli": list(MODULI),
        "cases": len(inputs),
        "protocol": "Use all 102 previously frozen residual inputs, preserving their recorded seeds and order. Generate complete branch-instance signature columns. For q=2,3,5,7 in that order, seek a functional zero on each column and one on the all-ones target. Retain the first independently verified certificate. If none is found, report that outcome without inferring feasibility. The independent checker regenerates every injective branch assignment and imports no discovery code or third-party package. A separate global permutation oracle checks exact completion for every input. No selection uses new outcomes and there is no timing comparison or novelty claim. Separately count certificates with every branch table nonempty, and certificates where every target resource occurs in some local option; this distinguishes missing-resource exclusions from parity obstructions with full local coverage.",
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    shutil.copyfile(
        Path(residual_congruence_verify.__file__), output / "residual_congruence_verify.py"
    )
    records = []
    for index, case in enumerate(inputs):
        data = {name: case[name] for name in ("unused", "differences", "components")}
        result = find_certificate(**data)
        oracle = permutation_oracle(case)
        if result["exact_completion_feasible"] != oracle["feasible"]:
            raise RuntimeError(f"exact search/oracle disagreement in case {index}")
        check = None
        if result["certificate"] is not None:
            check = verify_certificate(result["certificate"], expected_input=data)
            if not check["valid"] or oracle["feasible"]:
                raise RuntimeError(f"certificate/oracle disagreement in case {index}")
            write_json(output / "certificates" / f"{index:03d}.json", result["certificate"])
        record = {
            "case": index,
            "input": case,
            "result": result,
            "independent_check": check,
            "permutation_oracle": oracle,
        }
        records.append(record)
        write_json(output / "cases" / f"{index:03d}.json", record)
    impossible = [row for row in records if not row["permutation_oracle"]["feasible"]]
    certificates = [row for row in records if row["result"]["certificate"] is not None]
    incompatible = [row for row in impossible if all(row["result"]["signature_counts"])]
    certified_incompatible = [
        row for row in incompatible if row["result"]["certificate"] is not None
    ]
    certified_covered = [row for row in certificates if row["result"]["all_resources_covered"]]
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(records),
        "exact_feasible": len(records) - len(impossible),
        "exact_impossible_fixed_residuals": len(impossible),
        "residual_certificates_verified": len(certificates),
        "impossible_without_congruence_certificate": [
            row["case"] for row in impossible if row["result"]["certificate"] is None
        ],
        "incompatible_nonempty_tables": [row["case"] for row in incompatible],
        "certified_nonempty_tables": [row["case"] for row in certified_incompatible],
        "certified_with_all_resources_covered": [row["case"] for row in certified_covered],
        "modulus_counts": dict(
            Counter(str(row["result"]["certificate"]["modulus"]) for row in certificates)
        ),
        "all_oracles_agreed": True,
        "oracle_assignments_checked": sum(
            row["permutation_oracle"]["assignments_checked"] for row in records
        ),
        "whole_tree_counterexamples": 0,
        "novelty_claimed": False,
        "records": records,
    }
    write_json(output / "summary.json", summary)
    lines = [
        "# Congruence certificates for fixed residual forests",
        "",
        f"All {len(records)} frozen cases were checked. Exactly {len(impossible)} residuals are impossible "
        f"and {len(records) - len(impossible)} complete. Independent global permutation checks agreed "
        f"on every input ({summary['oracle_assignments_checked']:,} assignments examined).",
        "",
        "| Observation | Cases |",
        "| --- | ---: |",
        f"| Independently checked residual congruence certificate | {len(certificates)} |",
        f"| Impossible, but no certificate for the tested primes | {len(impossible) - len(certificates)} |",
        f"| Feasible; no certificate | {len(records) - len(impossible)} |",
        f"| All branch tables nonempty, but jointly impossible | {len(incompatible)} |",
        f"| Such joint failures explained by a checked congruence | {len(certified_incompatible)} |",
        f"| Certificates with every target resource appearing in some local option | {len(certified_covered)} |",
        "",
        "Each selected certificate has a modulus and weights for each individual branch, unused "
        "vertex label and required difference. Every valid local assignment has weighted sum zero "
        "modulo that modulus. The full target resources have nonzero weight. Any completion would "
        "sum local zero weights to that nonzero value, a contradiction.",
        "",
        "Many exclusions are simple: a missing branch option or unused target resource already "
        "prevents completion. The full-coverage row isolates certificates for which that explanation "
        "alone is unavailable. All counts concern this frozen corpus, not arbitrary trees.",
        "",
        "## A concrete parity certificate",
        "",
        "Case 28 has unused labels {1,4,5} and remaining differences {1,2,3}. Branch instance 0 is "
        "the path 0–x–y; branch instance 1 is the leaf 2–z. Give weight 1 modulo 2 to branch "
        "instance 0, vertex label 4 and edge difference 2; give all other resources weight 0. "
        "Every valid local assignment has even total weight. The only valid assignment for the "
        "first branch is (x,y)=(1,4), of weight 2. For the leaf, labels 1,4,5 give differences "
        "1,2,3 and weights 0,2,0, respectively. Any completion must use each branch and every "
        "label and difference once, for total weight 3, which is odd. This is a contradiction "
        "for this fixed residual only. Every resource appears in at least one local option.",
        "",
        "Cases with no congruence certificate despite exact impossibility: "
        + ", ".join(map(str, summary["impossible_without_congruence_certificate"]))
        + ". Each has an exhausted global-permutation oracle record; none is accepted as a "
        "congruence certificate. This explicitly demonstrates the relaxation's incompleteness.",
        "",
        "## Trust boundary",
        "",
        "The standalone standard-library checker validates the embedded input and regenerates all "
        "injective assignments for every branch. It does not trust saved signature tables or their "
        "claimed completeness, and does not use the discovery module, NetworkX, or a solver. "
        "The result certifies only the declared parent labels, branch shapes and remaining resources. "
        "It is not whole-tree infeasibility and does not enter the nightly campaign certificate counts. "
        "The checker implementation itself has tests and independent arithmetic structure, not a "
        "formal correctness proof.",
        "",
        "## Limits and next questions",
        "",
        "These are standard linear-functional certificates, not a novel theorem. Testing fields "
        "of orders 2,3,5,7 is not a complete integer-lattice membership test. Failure to find a "
        "certificate never establishes a completion. No conclusions about natural search-state "
        "frequency or speed follow from this deliberately structured, bounded corpus. Inspect the "
        "joint-failure certificates for repeated coefficient patterns; test any proposed general "
        "invariant on a fresh corpus and prove its stated scope before using it as a pruning rule.",
        "",
        "## Reproduction",
        "",
        "`python scripts/experiment_residual_congruence.py --output results/residual-congruence`",
        "",
        "Inside the downloaded archive: `python3 -S residual_congruence_verify.py certificates`.",
        "",
        "The archive preserves all exact inputs and original seeds, certificates, full per-case "
        "results, permutation-oracle records, dependency versions, source snapshots and checksums. "
        "It is a residual research archive, not a campaign checkpoint for graceful-research audit.",
        "",
    ]
    (output / "report.md").write_text("\n".join(lines))
    write_checksums(output)
    print(
        json.dumps(
            {
                key: summary[key]
                for key in (
                    "cases",
                    "exact_feasible",
                    "exact_impossible_fixed_residuals",
                    "residual_certificates_verified",
                    "modulus_counts",
                    "impossible_without_congruence_certificate",
                    "certified_nonempty_tables",
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
