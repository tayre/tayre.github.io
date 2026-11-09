"""Find small prime-field obstructions to exact residual resource allocation.

Each signature column covers one individual branch, its labels, and its edge
differences. A completion chooses columns summing to the all-ones target. A
functional zero on every column but nonzero on that target proves impossibility.
Failure to find one says only that these particular relaxations did not exclude
completion. It is neither a feasible witness nor unrestricted tree infeasibility.
"""

from .residual_congruence_verify import verify_certificate
from .residual_signatures import complete_forest

MODULI = (2, 3, 5, 7)


def _solve(equations, target, variables, modulus):
    """Deterministic Gaussian elimination over one supported prime field."""
    matrix = [
        [value % modulus for value in row] + [rhs % modulus]
        for row, rhs in zip(equations, target, strict=True)
    ]
    pivot_rows = []
    next_row = 0
    for column in range(variables):
        pivot = next(
            (index for index in range(next_row, len(matrix)) if matrix[index][column]), None
        )
        if pivot is None:
            continue
        matrix[next_row], matrix[pivot] = matrix[pivot], matrix[next_row]
        inverse = pow(matrix[next_row][column], -1, modulus)
        matrix[next_row] = [(value * inverse) % modulus for value in matrix[next_row]]
        for index, row in enumerate(matrix):
            if index != next_row and row[column]:
                multiplier = row[column]
                matrix[index] = [
                    (left - multiplier * right) % modulus
                    for left, right in zip(row, matrix[next_row], strict=True)
                ]
        pivot_rows.append((column, next_row))
        next_row += 1
        if next_row == len(matrix):
            break
    if any(not any(row[:-1]) and row[-1] for row in matrix):
        return None
    solution = [0] * variables
    for column, index in pivot_rows:
        solution[column] = matrix[index][-1]
    return solution


def _columns(result, components):
    branches, size = len(components), len(result["unused"])
    columns = []
    for branch, table in enumerate(result["signature_tables"]):
        for signature in table:
            column = [int(index == branch) for index in range(branches)]
            column += [(signature["label_mask"] >> index) & 1 for index in range(size)]
            column += [(signature["difference_mask"] >> index) & 1 for index in range(size)]
            columns.append(column)
    return columns


def find_certificate(unused, differences, components, *, moduli=MODULI):
    """Discover, then independently check, a self-contained residual certificate."""
    if (
        not isinstance(moduli, (list, tuple))
        or not moduli
        or any(type(q) is not int or q not in MODULI for q in moduli)
        or len(set(moduli)) != len(moduli)
    ):
        raise ValueError("moduli must be distinct members of (2,3,5,7)")
    result = complete_forest(unused, differences, components)
    data = {
        "unused": result["unused"],
        "differences": result["differences"],
        "components": [
            {"parent_label": c["parent_label"], "parents": list(c["parents"])} for c in components
        ],
    }
    columns = _columns(result, components)
    branches, size = len(components), len(result["unused"])
    dimension = branches + 2 * size
    resource_rows = [{"kind": "branch", "instance": index} for index in range(branches)]
    resource_rows += [{"kind": "label", "value": value} for value in result["unused"]]
    resource_rows += [{"kind": "difference", "value": value} for value in result["differences"]]
    uncovered = [
        resource
        for index, resource in enumerate(resource_rows)
        if not any(column[index] for column in columns)
    ]
    tried = []
    certificate = check = None
    support = []
    for modulus in moduli:
        tried.append(modulus)
        coefficients = _solve(
            columns + [[1] * dimension], [0] * len(columns) + [1], dimension, modulus
        )
        if coefficients is None:
            continue
        certificate = {
            "schema_version": 1,
            "kind": "residual_congruence",
            "scope": "fixed_residual_forest",
            "input": data,
            "modulus": modulus,
            "coefficients": {
                "branches": coefficients[:branches],
                "labels": coefficients[branches : branches + size],
                "differences": coefficients[branches + size :],
            },
            "target_residue": 1,
        }
        check = verify_certificate(certificate, expected_input=data)
        if not check["valid"]:
            raise RuntimeError(
                f"independent congruence checker rejected discovery: {check['errors']}"
            )
        if result["feasible"]:
            raise RuntimeError("congruence certificate contradicts an exact completion witness")
        support = [
            {**resource, "coefficient": coefficient}
            for resource, coefficient in zip(resource_rows, coefficients, strict=True)
            if coefficient
        ]
        break
    return {
        "schema_version": 1,
        "scope": "fixed_residual_forest",
        "status": "certified_impossible_residual"
        if certificate
        else "no_congruence_certificate_found",
        "moduli_tried": tried,
        "signature_counts": result["signature_counts"],
        "rows": dimension,
        "columns": len(columns),
        "uncovered_resources": uncovered,
        "all_resources_covered": not uncovered,
        "coefficient_support": support,
        "certificate": certificate,
        "independent_check": check,
        "exact_completion_feasible": result["feasible"],
        "exact_completion_reason": result["reason"],
        "placements": result["placements"],
        "completeness_claim": "none: only the specified prime-field relaxations are tested",
    }
