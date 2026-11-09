"""Independent standard-library checker for fixed-residual congruence proofs.

No discovery code, signature tables, solver, or third-party package is imported.
The checker enumerates every injective assignment to each declared branch. If
every valid branch option has weighted resource sum zero modulo q, any completion
must also sum to zero. A nonzero weight of the target resource vector contradicts
that conclusion. This proves only the embedded fixed residual problem impossible.
"""

import argparse
import itertools
import json
from pathlib import Path

MODULI = (2, 3, 5, 7)
MAX_VERTICES = 8
MAX_BRANCH_VERTICES = 3
MAX_FILE_BYTES = 4 * 1024 * 1024


def _input(data):
    if not isinstance(data, dict) or set(data) != {"unused", "differences", "components"}:
        raise ValueError("input must contain unused, differences and components only")
    unused, differences, components = data["unused"], data["differences"], data["components"]
    for values, minimum, name in ((unused, 0, "unused"), (differences, 1, "differences")):
        if not isinstance(values, list) or len(values) > MAX_VERTICES:
            raise ValueError(f"{name} must be a list with at most eight resources")
        if any(type(value) is not int or value < minimum for value in values):
            raise ValueError(f"invalid {name} resource")
        if len(set(values)) != len(values):
            raise ValueError(f"duplicate {name} resource")
    if not isinstance(components, list) or len(components) > MAX_VERTICES:
        raise ValueError("components must be a list with at most eight branches")
    normalized = []
    for component in components:
        if not isinstance(component, dict) or set(component) != {"parent_label", "parents"}:
            raise ValueError("each branch needs exactly parent_label and parents")
        parent, shape = component["parent_label"], component["parents"]
        if type(parent) is not int or parent < 0 or parent in unused:
            raise ValueError("boundary parent must be an already assigned nonnegative label")
        if not isinstance(shape, list) or not 1 <= len(shape) <= MAX_BRANCH_VERTICES:
            raise ValueError("each branch must have one through three vertices")
        if any(type(v) is not int for v in shape) or shape[0] != -1:
            raise ValueError("branch root must have parent -1")
        if any(not 0 <= shape[i] < i for i in range(1, len(shape))):
            raise ValueError("internal parents must precede their children")
        normalized.append({"parent_label": parent, "parents": shape.copy()})
    total = sum(len(component["parents"]) for component in normalized)
    if total != len(unused) or total != len(differences):
        raise ValueError("branch, label and difference resource counts must agree")
    return {"unused": sorted(unused), "differences": sorted(differences), "components": normalized}


def verify_certificate(certificate, *, expected_input=None):
    """Validate a self-contained certificate, optionally binding an expected input.

    The coefficient vectors index branch *instances*, sorted unused labels, and
    sorted remaining differences. Saved search tables are neither accepted nor
    consulted. Passing no expected input checks the exact input inside the proof.
    """
    result = {
        "valid": False,
        "checker": "stdlib-residual-congruence-v1",
        "scope": "fixed_residual_forest",
        "errors": [],
        "branch_assignments_examined": 0,
        "valid_branch_options_checked": 0,
    }
    try:
        required = {
            "schema_version",
            "kind",
            "scope",
            "input",
            "modulus",
            "coefficients",
            "target_residue",
        }
        if not isinstance(certificate, dict) or set(certificate) != required:
            raise ValueError("invalid certificate fields")
        if type(certificate["schema_version"]) is not int or certificate["schema_version"] != 1:
            raise ValueError("unsupported certificate schema")
        if (
            certificate["kind"] != "residual_congruence"
            or certificate["scope"] != "fixed_residual_forest"
        ):
            raise ValueError("unsupported certificate kind or scope")
        data = _input(certificate["input"])
        if expected_input is not None and data != _input(expected_input):
            raise ValueError("certificate input does not match expected residual")
        modulus = certificate["modulus"]
        if type(modulus) is not int or modulus not in MODULI:
            raise ValueError("supported prime moduli are 2, 3, 5 and 7")
        weights = certificate["coefficients"]
        if not isinstance(weights, dict) or set(weights) != {"branches", "labels", "differences"}:
            raise ValueError("invalid coefficient vectors")
        lengths = {
            "branches": len(data["components"]),
            "labels": len(data["unused"]),
            "differences": len(data["differences"]),
        }
        for name, length in lengths.items():
            values = weights[name]
            if not isinstance(values, list) or len(values) != length:
                raise ValueError(f"wrong {name} coefficient length")
            if any(type(value) is not int or not 0 <= value < modulus for value in values):
                raise ValueError(f"invalid {name} coefficient")
        residue = sum(sum(values) for values in weights.values()) % modulus
        if (
            type(certificate["target_residue"]) is not int
            or certificate["target_residue"] != residue
            or residue == 0
        ):
            raise ValueError("target resource weight must be the declared nonzero residue")
        label_weight = dict(zip(data["unused"], weights["labels"], strict=True))
        difference_weight = dict(zip(data["differences"], weights["differences"], strict=True))
        for branch_index, component in enumerate(data["components"]):
            shape = component["parents"]
            for assignment in itertools.permutations(data["unused"], len(shape)):
                result["branch_assignments_examined"] += 1
                actual = []
                for vertex, parent in enumerate(shape):
                    other = component["parent_label"] if parent == -1 else assignment[parent]
                    actual.append(abs(assignment[vertex] - other))
                if len(set(actual)) != len(actual) or any(
                    d not in difference_weight for d in actual
                ):
                    continue
                result["valid_branch_options_checked"] += 1
                weighted = weights["branches"][branch_index]
                weighted += sum(label_weight[value] for value in assignment)
                weighted += sum(difference_weight[difference] for difference in actual)
                if weighted % modulus:
                    raise ValueError(f"nonzero weight for a valid option of branch {branch_index}")
        result["valid"] = True
        result["modulus"] = modulus
        result["target_residue"] = residue
    except (ValueError, TypeError, KeyError) as exc:
        result["errors"].append(str(exc))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "certificate", type=Path, help="a certificate JSON file or a directory of them"
    )
    args = parser.parse_args()
    paths = (
        sorted(args.certificate.glob("*.json")) if args.certificate.is_dir() else [args.certificate]
    )
    if not paths:
        parser.error("no certificate files found")
    records = []
    for path in paths:
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                raise ValueError("certificate exceeds size limit")
            certificate = json.loads(path.read_text())
            check = verify_certificate(certificate)
        except (OSError, ValueError) as exc:
            check = {"valid": False, "errors": [str(exc)]}
        records.append({"file": str(path), **check})
    result = {
        "valid": all(row["valid"] for row in records),
        "certificates_checked": len(records),
        "scope": "fixed_residual_forest",
        "results": records,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
