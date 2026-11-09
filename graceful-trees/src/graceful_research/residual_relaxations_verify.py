"""Standard-library checker for exact fixed-residual relaxation certificates.

Signed integer covers establish lattice membership, NOT a completion. Rational
nonnegative covers establish relaxation feasibility, NOT a completion. A separating
integer functional excludes every nonnegative combination of valid local options,
hence excludes completion of the declared residual only. The separator checker
regenerates every injective branch assignment; discovery tables are never trusted.
"""

import argparse
import itertools
import json
from fractions import Fraction
from pathlib import Path

MAX_VERTICES = 8
MAX_BRANCH_VERTICES = 3
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_COEFFICIENT = 2**31 - 1
KINDS = {"signed_integer_cover", "nonnegative_rational_cover", "nonnegative_separator"}


def _input(data):
    if not isinstance(data, dict) or set(data) != {"unused", "differences", "components"}:
        raise ValueError("invalid input fields")
    unused, differences, components = data["unused"], data["differences"], data["components"]
    for values, minimum in ((unused, 0), (differences, 1)):
        if not isinstance(values, list) or len(values) > MAX_VERTICES:
            raise ValueError("at most eight distinct resources required")
        if any(type(v) is not int or v < minimum for v in values) or len(set(values)) != len(
            values
        ):
            raise ValueError("invalid or duplicate resources")
    if not isinstance(components, list) or len(components) > MAX_VERTICES:
        raise ValueError("invalid component list")
    normalized = []
    for component in components:
        if not isinstance(component, dict) or set(component) != {"parent_label", "parents"}:
            raise ValueError("invalid branch fields")
        parent, shape = component["parent_label"], component["parents"]
        if type(parent) is not int or parent < 0 or parent in unused:
            raise ValueError("boundary parent is not an assigned label")
        if not isinstance(shape, list) or not 1 <= len(shape) <= MAX_BRANCH_VERTICES:
            raise ValueError("branches must contain one through three vertices")
        if any(type(v) is not int for v in shape) or shape[0] != -1:
            raise ValueError("invalid rooted branch")
        if any(not 0 <= shape[i] < i for i in range(1, len(shape))):
            raise ValueError("parents must precede children")
        normalized.append({"parent_label": parent, "parents": shape.copy()})
    total = sum(len(c["parents"]) for c in normalized)
    if total != len(unused) or total != len(differences):
        raise ValueError("resource and branch sizes differ")
    return {"unused": sorted(unused), "differences": sorted(differences), "components": normalized}


def _option(data, branch, labels):
    if type(branch) is not int or not 0 <= branch < len(data["components"]):
        raise ValueError("invalid branch instance")
    component = data["components"][branch]
    shape = component["parents"]
    if (
        not isinstance(labels, list)
        or len(labels) != len(shape)
        or any(type(v) is not int or v not in data["unused"] for v in labels)
        or len(set(labels)) != len(labels)
    ):
        raise ValueError("invalid local label assignment")
    differences = [
        abs(value - (component["parent_label"] if parent == -1 else labels[parent]))
        for value, parent in zip(labels, shape, strict=True)
    ]
    if len(set(differences)) != len(differences) or any(
        d not in data["differences"] for d in differences
    ):
        raise ValueError("local assignment has invalid differences")
    return differences


def verify_certificate(certificate, *, expected_input=None):
    result = {
        "valid": False,
        "checker": "stdlib-residual-relaxations-v1",
        "scope": "fixed_residual_forest",
        "errors": [],
        "local_assignments_examined": 0,
        "valid_options_checked": 0,
    }
    try:
        if not isinstance(certificate, dict):
            raise ValueError("certificate must be an object")
        kind = certificate.get("kind")
        if not isinstance(kind, str) or kind not in KINDS:
            raise ValueError("unsupported certificate kind")
        field = "weights" if kind == "nonnegative_separator" else "terms"
        if set(certificate) != {"schema_version", "kind", "scope", "input", field}:
            raise ValueError("invalid certificate fields")
        if type(certificate["schema_version"]) is not int or certificate["schema_version"] != 1:
            raise ValueError("unsupported schema")
        if certificate["scope"] != "fixed_residual_forest":
            raise ValueError("unsupported scope")
        data = _input(certificate["input"])
        if expected_input is not None and data != _input(expected_input):
            raise ValueError("certificate input differs from expected residual")
        sizes = {
            "branches": len(data["components"]),
            "labels": len(data["unused"]),
            "differences": len(data["differences"]),
        }
        if kind == "nonnegative_separator":
            weights = certificate["weights"]
            if not isinstance(weights, dict) or set(weights) != set(sizes):
                raise ValueError("invalid weight fields")
            for key, size in sizes.items():
                values = weights[key]
                if not isinstance(values, list) or len(values) != size:
                    raise ValueError("wrong weight vector length")
                if any(type(v) is not int or abs(v) > MAX_COEFFICIENT for v in values):
                    raise ValueError("invalid weight")
            target = sum(sum(values) for values in weights.values())
            if target >= 0:
                raise ValueError("target weight must be negative")
            label_weight = dict(zip(data["unused"], weights["labels"], strict=True))
            diff_weight = dict(zip(data["differences"], weights["differences"], strict=True))
            for branch, component in enumerate(data["components"]):
                for assignment in itertools.permutations(data["unused"], len(component["parents"])):
                    result["local_assignments_examined"] += 1
                    labels = list(assignment)
                    try:
                        differences = _option(data, branch, labels)
                    except ValueError:
                        continue
                    result["valid_options_checked"] += 1
                    score = weights["branches"][branch]
                    score += sum(label_weight[v] for v in labels)
                    score += sum(diff_weight[d] for d in differences)
                    if score < 0:
                        raise ValueError(f"negative weight for a valid option of branch {branch}")
            result.update(conclusion="no_nonnegative_real_cover", target_weight=target)
        else:
            terms = certificate["terms"]
            if not isinstance(terms, list) or len(terms) > 4096:
                raise ValueError("invalid cover terms")
            totals = {key: [Fraction(0)] * size for key, size in sizes.items()}
            label_index = {v: i for i, v in enumerate(data["unused"])}
            diff_index = {v: i for i, v in enumerate(data["differences"])}
            for term in terms:
                if not isinstance(term, dict) or set(term) != {
                    "branch",
                    "labels",
                    "numerator",
                    "denominator",
                }:
                    raise ValueError("invalid cover term fields")
                numerator, denominator = term["numerator"], term["denominator"]
                if type(numerator) is not int or abs(numerator) > MAX_COEFFICIENT:
                    raise ValueError("invalid numerator")
                if type(denominator) is not int or not 1 <= denominator <= MAX_COEFFICIENT:
                    raise ValueError("invalid denominator")
                if kind == "signed_integer_cover" and denominator != 1:
                    raise ValueError("integer cover requires integer coefficients")
                if kind == "nonnegative_rational_cover" and numerator < 0:
                    raise ValueError("rational cover requires nonnegative coefficients")
                differences = _option(data, term["branch"], term["labels"])
                coefficient = Fraction(numerator, denominator)
                totals["branches"][term["branch"]] += coefficient
                for value in term["labels"]:
                    totals["labels"][label_index[value]] += coefficient
                for difference in differences:
                    totals["differences"][diff_index[difference]] += coefficient
                result["valid_options_checked"] += 1
            if any(value != 1 for values in totals.values() for value in values):
                raise ValueError("cover does not sum exactly to every target resource")
            result["conclusion"] = (
                "integer_lattice_membership_excludes_all_modular_functionals"
                if kind == "signed_integer_cover"
                else "nonnegative_rational_relaxation_feasible"
            )
        result.update(valid=True, kind=kind)
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        result["errors"].append(str(exc))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("certificate", type=Path)
    args = parser.parse_args()
    paths = (
        sorted(args.certificate.glob("*.json")) if args.certificate.is_dir() else [args.certificate]
    )
    if not paths:
        parser.error("no certificate files found")
    results = []
    for path in paths:
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                raise ValueError("certificate exceeds size limit")
            checked = verify_certificate(json.loads(path.read_text()))
        except (OSError, ValueError) as exc:
            checked = {"valid": False, "errors": [str(exc)]}
        results.append({"file": str(path), **checked})
    valid = all(row["valid"] for row in results)
    print(
        json.dumps(
            {"valid": valid, "certificates_checked": len(results), "results": results},
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
