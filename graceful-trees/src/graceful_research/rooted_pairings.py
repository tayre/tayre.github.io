"""Exact small Skolem pairings with prescribed branch attachment differences.

Branch i has edges parent[i]--x[i]--y[i]. Unused labels, internal differences,
and attachment differences are consumed exactly once in their separate roles.
All negative answers concern this fixed residual, never an unrestricted tree.
The bounded classifier is an offline research tool, not a nightly search prune.
"""

MAX_BRANCHES = 4


def _integers(values, name, minimum, *, distinct=True):
    try:
        result = list(values)
    except TypeError as exc:
        raise ValueError(f"{name} must be an iterable of integers") from exc
    if any(type(v) is not int or v < minimum for v in result):
        raise ValueError(f"{name} contains an invalid integer")
    if distinct and len(set(result)) != len(result):
        raise ValueError(f"{name} must contain distinct integers")
    return result


def _pairing_input(unused, internal):
    unused = sorted(_integers(unused, "unused labels", 0))
    internal = sorted(_integers(internal, "internal differences", 1))
    if len(unused) != 2 * len(internal) or len(internal) > MAX_BRANCHES:
        raise ValueError("pairing needs two labels per difference and at most four branches")
    return unused, internal


def _validate(unused, internal, attachment, parents):
    unused, internal = _pairing_input(unused, internal)
    attachment = sorted(_integers(attachment, "attachment differences", 1))
    parents = _integers(parents, "parent labels", 0, distinct=False)
    if len(parents) != len(internal) or len(attachment) != len(internal):
        raise ValueError("one internal and attachment difference are required per branch")
    if len(set(parents)) > 2:
        raise ValueError("at most two distinct parent labels are supported")
    if set(parents) & set(unused):
        raise ValueError("parent labels must already be assigned, outside unused labels")
    if set(internal) & set(attachment):
        raise ValueError("internal and attachment differences must be disjoint")
    return unused, internal, attachment, parents


def pairing_conditions(unused, internal):
    """Nordh's necessary parity/density conditions, not a sufficiency test.

    For every r, the r largest prescribed differences cannot exceed the sum
    of the r largest positions minus the sum of the r smallest positions.
    """
    unused, internal = _pairing_input(unused, internal)
    inequalities = []
    for count in range(1, len(internal) + 1):
        requested = sum(internal[-count:])
        maximum = sum(unused[-count:]) - sum(unused[:count])
        inequalities.append(
            {
                "count": count,
                "requested": requested,
                "maximum": maximum,
                "holds": requested <= maximum,
            }
        )
    parity = sum(internal) % 2 == sum(unused) % 2
    density = all(row["holds"] for row in inequalities)
    return {
        "parity": parity,
        "density": density,
        "passes": parity and density,
        "inequalities": inequalities,
        "sufficient": False,
    }


def verify_completion(unused, internal, attachment, parents, placements):
    """Definition-level witness check, independent of pairing enumeration."""
    try:
        unused, internal, attachment, parents = _validate(unused, internal, attachment, parents)
    except ValueError:
        return False
    if not isinstance(placements, (list, tuple)) or len(placements) != len(parents):
        return False
    if any(
        not isinstance(row, (list, tuple))
        or len(row) != 2
        or any(type(value) is not int for value in row)
        for row in placements
    ):
        return False
    values = sorted(value for row in placements for value in row)
    if values != unused:
        return False
    return (
        sorted(abs(x - y) for x, y in placements) == internal
        and sorted(abs(parent - row[0]) for parent, row in zip(parents, placements, strict=True))
        == attachment
    )


def _local_diagnostics(unused, internal, attachment, parents):
    """Necessary local coverage checks; they do not enforce joint disjointness."""
    tables = []
    covered_labels, covered_internal, covered_attachment = set(), set(), set()
    for index, parent in enumerate(parents):
        options = []
        for x in unused:
            attachment_difference = abs(parent - x)
            if attachment_difference not in attachment:
                continue
            for y in unused:
                internal_difference = abs(x - y)
                if x == y or internal_difference not in internal:
                    continue
                options.append(
                    {
                        "labels": [x, y],
                        "internal_difference": internal_difference,
                        "attachment_difference": attachment_difference,
                    }
                )
                covered_labels.update((x, y))
                covered_internal.add(internal_difference)
                covered_attachment.add(attachment_difference)
        tables.append(
            {
                "branch": index,
                "parent_label": parent,
                "options": options,
                "option_count": len(options),
                "covered_attachment_differences": sorted(
                    {option["attachment_difference"] for option in options}
                ),
            }
        )
    every_branch = all(table["options"] for table in tables)
    missing_labels = sorted(set(unused) - covered_labels)
    missing_internal = sorted(set(internal) - covered_internal)
    missing_attachment = sorted(set(attachment) - covered_attachment)
    attachment_checks = every_branch and not missing_attachment
    return {
        "branch_tables": tables,
        "all_branches_have_options": every_branch,
        "covered_unused_labels": sorted(covered_labels),
        "covered_internal_differences": sorted(covered_internal),
        "covered_attachment_differences": sorted(covered_attachment),
        "missing_unused_labels": missing_labels,
        "missing_internal_differences": missing_internal,
        "missing_attachment_differences": missing_attachment,
        "all_attachment_differences_have_options": not missing_attachment,
        "passes_branch_and_attachment_checks": attachment_checks,
        "passes_all_local_resource_checks": attachment_checks
        and not missing_internal
        and not missing_labels,
        "sufficient": False,
    }


def classify(unused, internal, attachment, parents):
    """Enumerate every internal pairing, then assign its oriented pairs to parents.

    Choosing the least remaining label uniquely orders pair discovery, removing
    only duplicate presentations of the same unordered matching. The orientation
    search still considers every branch instance, pair placement and orientation.
    There are no time or node cutoffs within the declared four-branch bound.
    """
    unused, internal, attachment, parents = _validate(unused, internal, attachment, parents)
    conditions = pairing_conditions(unused, internal)
    pairings = []
    pairing_nodes = 0

    def pair(remaining, differences, chosen):
        nonlocal pairing_nodes
        pairing_nodes += 1
        if not remaining:
            pairings.append(chosen.copy())
            return
        first = remaining[0]
        for second in remaining[1:]:
            difference = second - first
            if difference in differences:
                pair(
                    tuple(value for value in remaining if value not in (first, second)),
                    differences - {difference},
                    chosen + [[first, second]],
                )

    pair(tuple(unused), set(internal), [])
    orientation_nodes = 0
    placements = None
    successful_pairing = None

    def orient(index, available, differences, chosen):
        nonlocal orientation_nodes
        orientation_nodes += 1
        if index == len(parents):
            return chosen.copy()
        for position, (a, b) in enumerate(available):
            for x, y in ((a, b), (b, a)):
                difference = abs(parents[index] - x)
                if difference in differences:
                    result = orient(
                        index + 1,
                        available[:position] + available[position + 1 :],
                        differences - {difference},
                        chosen + [[x, y]],
                    )
                    if result is not None:
                        return result
        return None

    for index, pairing in enumerate(pairings):
        placements = orient(0, pairing, set(attachment), [])
        if placements is not None:
            successful_pairing = index
            break
    feasible = placements is not None
    if feasible and not verify_completion(unused, internal, attachment, parents, placements):
        raise RuntimeError(
            "rooted pairing reconstruction failed independent arithmetic verification"
        )
    if pairings and not conditions["passes"]:
        raise RuntimeError("exact pairing contradicts necessary Skolem conditions")
    category = (
        "completion"
        if feasible
        else (
            "attachment_obstruction"
            if pairings
            else (
                "pairing_obstruction_beyond_conditions"
                if conditions["passes"]
                else "necessary_condition_obstruction"
            )
        )
    )
    return {
        "schema_version": 1,
        "scope": "fixed_rooted_pairing_residual",
        "complete_within_declared_bounds": True,
        "max_branches": MAX_BRANCHES,
        "feasible": feasible,
        "pairable": bool(pairings),
        "classification": category,
        "conditions": conditions,
        "local_diagnostics": _local_diagnostics(unused, internal, attachment, parents),
        "pairings": pairings,
        "pairing_count": len(pairings),
        "pairing_nodes": pairing_nodes,
        "orientation_nodes": orientation_nodes,
        "successful_pairing": successful_pairing,
        "placements": placements if feasible else [],
        "proof_certificate_verified": False,
    }
