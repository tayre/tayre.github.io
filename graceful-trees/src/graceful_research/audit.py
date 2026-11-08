"""Recheck exported witnesses, ledger consistency, inputs, and file integrity."""

import json
import sqlite3
from pathlib import Path

from .analysis import summarize
from .findings import build_findings
from .io import sha256
from .progress import REPORT_FILES, build_progress
from .proof_verify import verify_record
from .trees import canonical_code, to_graph, tree_id
from .verify import verify_certificate, verify_labeling, verify_tree


def audit_ledger(database):
    """Reverify ALL historical witnesses, including those restored from prior runs."""
    errors, checked, proofs_checked = [], 0, 0
    cases = {}
    for identity, raw in database.execute("SELECT tree_id,data FROM cases"):
        case = json.loads(raw)
        if case["tree_id"] != identity or verify_tree(case["n"], case["edges"]):
            errors.append(f"ledger input mismatch: {identity}")
        cases[identity] = case
    scoped_statuses = {}
    for identity, run_id, tree, scope, edge_key, status, raw in database.execute(
        "SELECT attempt_id,run_id,tree_id,scope,edge_key,status,data FROM attempts ORDER BY attempt_id"
    ):
        record = json.loads(raw)
        prefix = f"ledger attempt {identity}"
        expected = {
            "attempt_id": identity,
            "run_id": run_id,
            "tree_id": tree,
            "scope": scope,
            "edge_key": edge_key,
            "status": status,
        }
        if any(record.get(key) != value for key, value in expected.items()):
            errors.append(f"{prefix}: indexed columns differ from record")
        case = cases.get(tree)
        if case is None or record["input"] != {"n": case["n"], "edges": case["edges"]}:
            errors.append(f"{prefix}: saved input differs from case")
        if scope not in {"graceful", "extreme_edge"}:
            errors.append(f"{prefix}: invalid scope")
        restriction = record.get("restriction")
        if (scope == "graceful") != (restriction is None):
            errors.append(f"{prefix}: restriction/scope mismatch")
        if scope == "extreme_edge" and (
            not isinstance(restriction, dict)
            or restriction.get("kind") != "extreme_edge"
            or edge_key != "-".join(map(str, restriction.get("edge", [])))
        ):
            errors.append(f"{prefix}: restriction/key mismatch")
        if record.get("proof_certificate_verified") is True:
            check = verify_record(record)
            if check["valid"]:
                proofs_checked += 1
            else:
                errors.append(f"{prefix}: invalid UNSAT proof: {check['errors']}")
        elif record.get("proof_certificate_verified") is not False:
            errors.append(f"{prefix}: invalid independent UNSAT proof flag")
        if record.get("labels") is not None:
            checked += 1
            check = verify_labeling(
                **record["input"], labels=record["labels"], restriction=restriction
            )
            if not check["valid"] or record.get("verification") != check:
                errors.append(f"{prefix}: invalid labeling or verification")
            if status != "verified_graceful":
                errors.append(f"{prefix}: labeling conflicts with result status {status}")
        elif status == "verified_graceful":
            errors.append(f"{prefix}: missing positive witness")
        elif record.get("verification") is not None:
            errors.append(f"{prefix}: verification without a labeling")
        if status not in {"verified_graceful", "solver_infeasible", "unknown", "error"}:
            errors.append(f"{prefix}: invalid or failed model status {status}")
        if status == "solver_infeasible" and record.get("raw_status") != "INFEASIBLE":
            errors.append(f"{prefix}: infeasibility not backed by a solver INFEASIBLE response")
        key = tree, scope, edge_key
        scoped_statuses.setdefault(key, set()).add(status)
    for key, statuses in scoped_statuses.items():
        if {"verified_graceful", "solver_infeasible"} <= statuses:
            errors.append(f"contradictory solver evidence: {key}")
    return checked, proofs_checked, errors


def audit_run(output):
    output = Path(output).resolve()
    errors = []
    checked = 0
    ledger_checked = 0
    proofs_checked = 0
    try:
        manifest = json.loads((output / "manifest.json").read_text())
        checksums = json.loads((output / "checksums.json").read_text())
        if not checksums:
            errors.append("empty checksum manifest")
        required = {
            "manifest.json",
            "attempts.jsonl",
            "research.sqlite",
            "config.json",
            "analysis.json",
        }
        if manifest.get("visual_report_schema_version") == 1:
            required.update(REPORT_FILES)
        if manifest.get("findings_schema_version") == 1:
            required.add("findings.json")
        if manifest.get("proof_evidence_schema_version") == 1:
            required.update(("verify.py", "proof_verify.py"))
        if not required <= checksums.keys():
            errors.append("required files absent from checksum manifest")
        for relative, expected in checksums.items():
            path = (output / relative).resolve()
            if not path.is_relative_to(output) or not path.is_file() or sha256(path) != expected:
                errors.append(f"file checksum/path mismatch: {relative}")
        for relative, expected in manifest["provenance"]["source_hashes"].items():
            path = (output / "source" / relative).resolve()
            if (
                not path.is_relative_to(output / "source")
                or not path.is_file()
                or sha256(path) != expected
            ):
                errors.append(f"source provenance mismatch: {relative}")
        records = [
            json.loads(line)
            for line in (output / "attempts.jsonl").read_text().splitlines()
            if line
        ]
        if len(records) != manifest["run_attempts"]:
            errors.append("attempt count does not match manifest")
        certificates = {}
        for path in sorted((output / "certificates").glob("*.json")):
            certificate = json.loads(path.read_text())
            checked += 1
            if not verify_certificate(certificate)["valid"]:
                errors.append(f"invalid certificate: {path.name}")
            if certificate["attempt_id"] in certificates:
                errors.append("duplicate certificate attempt_id")
            certificates[certificate["attempt_id"]] = certificate
        valid_ids = set()
        proof_files = set()
        for record in records:
            prefix = f"attempt {record['attempt_id']}"
            data = record["input"]
            if verify_tree(data["n"], data["edges"]):
                errors.append(f"{prefix}: invalid input tree")
                continue
            if tree_id(canonical_code(to_graph(data))) != record["tree_id"]:
                errors.append(f"{prefix}: tree identity mismatch")
            restriction = record.get("restriction")
            if (record["scope"] == "graceful") != (restriction is None):
                errors.append(f"{prefix}: scope/restriction mismatch")
            if record.get("proof_certificate_verified") is True:
                proof_name = Path(record["files"]).name + ".json"
                proof_files.add(proof_name)
                saved_proof = output / "unsat-certificates" / proof_name
                if not saved_proof.is_file() or json.loads(saved_proof.read_text()) != record.get(
                    "proof_certificate"
                ):
                    errors.append(f"{prefix}: missing or mismatched UNSAT certificate")
                model_path = (output / record["files"] / "model.cnf").resolve()
                proof_path = (output / record["files"] / "proof.drup").resolve()
                certificate = record.get("proof_certificate") or {}
                for path, key in ((model_path, "cnf_sha256"), (proof_path, "proof_sha256")):
                    if (
                        not path.is_relative_to(output)
                        or not path.is_file()
                        or sha256(path) != certificate.get(key)
                    ):
                        errors.append(
                            f"{prefix}: saved SAT evidence differs from proof certificate"
                        )
            elif record.get("proof_certificate_verified") is not False:
                errors.append(f"{prefix}: invalid infeasibility certificate flag")
            if record.get("labels") is not None:
                check = verify_labeling(data["n"], data["edges"], record["labels"], restriction)
                if not check["valid"] or record.get("verification") != check:
                    errors.append(f"{prefix}: labeling or saved verification mismatch")
                else:
                    valid_ids.add(record["attempt_id"])
                    cert = certificates.get(record["attempt_id"])
                    if cert is None or any(
                        cert.get(k) != v
                        for k, v in {
                            **data,
                            "tree_id": record["tree_id"],
                            "labels": record["labels"],
                            "restriction": restriction,
                        }.items()
                    ):
                        errors.append(f"{prefix}: missing or mismatched certificate")
            elif record["status"] == "verified_graceful":
                errors.append(f"{prefix}: positive status without a witness")
            if record["status"] in {"invalid_solution", "integrity_error", "model_invalid"}:
                errors.append(f"{prefix}: {record['status']}")
        if set(certificates) != valid_ids:
            errors.append("certificate set differs from verified attempt set")
        if {p.name for p in (output / "unsat-certificates").glob("*.json")} != proof_files:
            errors.append("UNSAT certificate set differs from certified attempt set")
        with sqlite3.connect(f"file:{output / 'research.sqlite'}?mode=ro", uri=True) as database:
            if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                errors.append("SQLite integrity check failed")
            rows = database.execute(
                "SELECT data FROM attempts WHERE run_id=? ORDER BY attempt_id",
                (manifest["run_id"],),
            ).fetchall()
            if [json.loads(row[0]) for row in rows] != records:
                errors.append("JSONL attempts differ from cumulative ledger")
            ledger_checked, proofs_checked, ledger_errors = audit_ledger(database)
            errors.extend(ledger_errors)
            if manifest.get("findings_schema_version") == 1:
                findings = json.loads((output / "findings.json").read_text())
                if findings != build_findings(database, manifest):
                    errors.append("notable findings differ from cumulative ledger")
            if manifest.get("visual_report_schema_version") == 1:
                progress = json.loads((output / "progress.json").read_text())
                if progress != build_progress(database, manifest):
                    errors.append("visual progress data differs from cumulative ledger")
        summary = summarize(records)
        for key, value in manifest["summary"].items():
            # JSON converts integer size keys to strings.
            if json.loads(json.dumps(summary[key])) != value:
                errors.append(f"summary mismatch: {key}")
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        errors.append(f"cannot audit: {exc}")
    return {
        "valid": not errors,
        "certificates_checked": checked,
        "cumulative_labelings_checked": ledger_checked,
        "errors": errors,
        "infeasibility_proofs_checked": proofs_checked,
    }
