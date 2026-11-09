"""Exact certificates distinguish the nine residuals missed by modular search.

The corpus is frozen. Signed covers certify integer-lattice membership, separators
exclude nonnegative real covers, and rational covers witness that relaxation only.
All certificates are independently checked with exact standard-library arithmetic.
"""

import argparse
import hashlib
import itertools
import json
import math
import shutil
from pathlib import Path

from graceful_research import residual_relaxations_verify
from graceful_research.io import provenance, utc_now, write_checksums, write_json
from graceful_research.residual_relaxations import KINDS, discover
from graceful_research.residual_relaxations_verify import verify_certificate
from graceful_research.trees import derived_seed

PROJECT = Path(__file__).resolve().parents[1]
CORPUS = PROJECT / "examples/residual-signatures.json"
CORPUS_SHA256 = "8011328776a6691b3e95915d4382a6879055363bec3cf891ee019119570ed11b"
CASE_IDS = (32, 50, 54, 55, 71, 72, 93, 95, 100)


def permutation_oracle(data):
    checked = 0
    target = sorted(data["differences"])
    for assignment in itertools.permutations(data["unused"]):
        checked += 1
        actual, cursor = [], 0
        for component in data["components"]:
            shape = component["parents"]
            labels = assignment[cursor : cursor + len(shape)]
            cursor += len(shape)
            for index, parent in enumerate(shape):
                other = component["parent_label"] if parent == -1 else labels[parent]
                actual.append(abs(labels[index] - other))
        if sorted(actual) == target:
            return {
                "feasible": True,
                "exhausted": False,
                "assignments_checked": checked,
                "labels": list(assignment),
            }
    return {"feasible": False, "exhausted": True, "assignments_checked": checked, "labels": None}


def experiment(output, *, seconds=2.0):
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("positive finite discovery seconds required")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    if hashlib.sha256(CORPUS.read_bytes()).hexdigest() != CORPUS_SHA256:
        raise RuntimeError("frozen input corpus checksum changed")
    corpus = json.loads(CORPUS.read_text())["inputs"]
    inputs = [{"case": index, "input": corpus[index]} for index in CASE_IDS]
    metadata = {
        "schema_version": 1,
        "started_at": utc_now(),
        "provenance": provenance(output),
        "scope": "fixed_residual_forest",
        "source_corpus_sha256": CORPUS_SHA256,
        "case_ids": list(CASE_IDS),
        "discovery_seconds_per_kind_per_case": seconds,
        "protocol": "Use precisely the nine impossible residuals from the previous frozen corpus that lacked certificates over prime fields 2,3,5,7. For each seek a signed integer cover with coefficients -1..1, a nonnegative rational cover with denominator2, and an integer separator with weights -3..3. Each bounded CP-SAT search is seeded, single-threaded, and time-limited; failure makes no unbounded relaxation claim. Independently verify each positive certificate. Covers are checked from explicit valid local assignments; separating weights are checked against every injective branch assignment. Re-run full global permutation enumeration for exact completion. No runtime comparison, whole-tree negative claim or novelty claim.",
    }
    write_json(output / "protocol.json", metadata)
    write_json(output / "inputs.json", inputs)
    shutil.copyfile(
        Path(residual_relaxations_verify.__file__), output / "residual_relaxations_verify.py"
    )
    records = []
    for item in inputs:
        index, original = item["case"], item["input"]
        data = {key: original[key] for key in ("unused", "differences", "components")}
        oracle = permutation_oracle(data)
        if oracle["feasible"]:
            raise RuntimeError("frozen impossible input unexpectedly has a completion")
        outcomes = {}
        for kind in KINDS:
            result = discover(
                **data,
                kind=kind,
                seed=derived_seed("residual-relaxations-v1", index, kind),
                seconds=seconds,
                directory=output / "attempts" / f"{index:03d}-{kind}",
            )
            if result["exact_completion_feasible"] != oracle["feasible"]:
                raise RuntimeError("branch-table search and global permutation oracle disagree")
            if result["certificate"] is not None:
                checked = verify_certificate(result["certificate"], expected_input=data)
                if not checked["valid"]:
                    raise RuntimeError("independent replay rejected a certificate")
                write_json(
                    output / "certificates" / f"{index:03d}-{kind}.json", result["certificate"]
                )
            outcomes[kind] = result
        if (
            outcomes["nonnegative_rational_cover"]["certificate"]
            and outcomes["nonnegative_separator"]["certificate"]
        ):
            raise RuntimeError("contradictory primal and dual certificates")
        record = {"case": index, "input": original, "oracle": oracle, "relaxations": outcomes}
        records.append(record)
        write_json(output / "cases" / f"{index:03d}.json", record)
        print(
            f"Residual {index}: "
            + ", ".join(kind for kind, result in outcomes.items() if result["certificate"]),
            flush=True,
        )
    counts = {
        kind: sum(row["relaxations"][kind]["certificate"] is not None for row in records)
        for kind in KINDS
    }
    gap = [
        row["case"]
        for row in records
        if row["relaxations"]["signed_integer_cover"]["certificate"]
        and row["relaxations"]["nonnegative_rational_cover"]["certificate"]
    ]
    summary = {
        "metadata": metadata,
        "finished_at": utc_now(),
        "cases": len(records),
        "verified_certificate_counts": counts,
        "certified_against_all_modular_functionals": [
            row["case"]
            for row in records
            if row["relaxations"]["signed_integer_cover"]["certificate"]
        ],
        "integer_and_nonnegative_relaxations_pass_but_completion_fails": gap,
        "oracle_assignments_checked": sum(row["oracle"]["assignments_checked"] for row in records),
        "whole_tree_counterexamples": 0,
        "novelty_claimed": False,
        "records": records,
    }
    write_json(output / "summary.json", summary)
    lines = [
        "# Exact relaxation certificates for nine fixed residuals",
        "",
        "The previous search could not explain these inputs with prime-field congruences. This experiment tests the limitation directly, rather than merely trying more moduli.",
        "",
        "| Independently checked result | Cases |",
        "| --- | ---: |",
        f"| Signed integer resource cover | {counts['signed_integer_cover']} |",
        f"| Integer functional excludes nonnegative real covers | {counts['nonnegative_separator']} |",
        f"| Exact nonnegative rational resource cover | {counts['nonnegative_rational_cover']} |",
        "",
        "If valid local columns satisfy Az=b for a signed integer z, every functional annihilating A modulo any integer q also annihilates b. Consequently no modular linear-functional certificate of the existing form can exclude that input, at any modulus. A signed cover can use negative coefficients and is not a graceful completion.",
        "",
        "A separating certificate has integer row weights w with wA>=0 for every valid local column, but wb<0. Any nonnegative resource cover would give wb=wAz>=0, a contradiction. The independent checker regenerates every injective local assignment and checks the inequalities exactly. This proves only the declared fixed residual impossible.",
        "",
        f"Cases passing both the integer-lattice and nonnegative-rational relaxations while exact completion fails: {gap}. These exact primal certificates demonstrate a limitation of combining those two relaxations. The global permutation oracle checked {summary['oracle_assignments_checked']:,} assignments and exhausted every selected input.",
        "",
        "## Case 32: an exact gap example",
        "",
        "Unused labels and differences are both {1,2,3,4,5}. At parent0 there is a three-vertex fork (root with two leaves) and a two-vertex path. A signed cover is minus fork[2,3,5] plus fork[3,1,2], fork[5,2,3] and path[4,5]. A nonnegative cover gives weight1/2 to each of fork[4,2,3], fork[5,1,3], path[1,4] and path[5,2]. Direct resource sums equal one on each branch, label and difference. Neither is a completion: the former has a negative coefficient; the latter splits branch choices. Full enumeration rejects all120 actual assignments. These displayed examples are independently checked in tests; discovery may return another equally valid certificate.",
        "",
        "The underlying central-zero diameter-four obstruction is already covered by van Bussel's classification, reproduced as Theorem 2.54 of [Superdock's 2014 thesis](https://arxiv.org/abs/1403.1564). The general integer-lattice and separating-functional principles are standard. No novelty or breakthrough is claimed for the finite example or certificate machinery.",
        "",
        "## A simple separator",
        "",
        "Case54 has U={0,1,3,4,6}, D={1,2,3,5,6}, and two two-vertex branches plus one leaf at parent2. Give label6 weight+1, differences5 and6 weight-1, and all other resources weight0. Each valid local option using either large difference consumes label6, and none can use both differences. Every option therefore has nonnegative weight, but the target weight is-1. This is a resource-capacity explanation that congruences cannot supply for this case.",
        "",
        "## Reproduction and scope",
        "",
        "Run `python scripts/experiment_residual_relaxations.py --output results/residual-relaxations`. Inside the downloaded run archive, run `python3 -S residual_relaxations_verify.py certificates`. The checker needs only the standard library. CP-SAT discovery failures refer to the declared finite coefficient domains and timeout only; they never classify an unbounded relaxation. Exact model/parameter/response files, inputs, seeds, certificates, oracle counts, source snapshots and checksums are preserved. These are exploratory residual certificates, separate from the nightly campaign and its whole-tree counters.",
    ]
    (output / "report.md").write_text("\n".join(lines) + "\n")
    write_checksums(output)
    print(json.dumps({"certificates": counts, "gap_cases": gap}, indent=2), flush=True)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=2)
    args = parser.parse_args()
    experiment(args.output, seconds=args.seconds)
