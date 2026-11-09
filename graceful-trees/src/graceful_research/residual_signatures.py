"""Experimental exact composition of small rooted residual branches.

Each component meets the already assigned region only at its declared parent.
Its attachment edge is included in its required differences. A signature records
the exact consumed label set and difference set, with one realizing assignment.
The forest completes iff one signature per component partitions both resource
sets. Negative answers concern this fixed residual problem, never a whole tree.

This deliberately bounded research tool is not part of nightly search: components
have at most three vertices and the forest at most eight. No truncation or
heuristic filtering occurs within these bounds.
"""

from itertools import permutations

MAX_COMPONENT_VERTICES = 3
MAX_RESIDUAL_VERTICES = 8


def _resource(values, name, minimum):
    try:
        values = list(values)
    except TypeError as exc:
        raise ValueError(f"{name} must be an iterable of distinct integers") from exc
    if any(type(v) is not int or v < minimum for v in values):
        raise ValueError(f"{name} contains an invalid integer")
    if len(values) != len(set(values)):
        raise ValueError(f"{name} contains duplicate values")
    return sorted(values)


def _validate(unused, differences, components):
    unused = _resource(unused, "unused labels", 0)
    differences = _resource(differences, "differences", 1)
    if not isinstance(components, (list, tuple)):
        raise ValueError("components must be a list")
    copied = []
    for component in components:
        if not isinstance(component, dict) or set(component) != {"parent_label", "parents"}:
            raise ValueError("each component needs parent_label and parents only")
        boundary, parents = component["parent_label"], component["parents"]
        if type(boundary) is not int or boundary < 0 or boundary in unused:
            raise ValueError("boundary labels must be nonnegative and already assigned")
        if (
            not isinstance(parents, (list, tuple))
            or not 1 <= len(parents) <= MAX_COMPONENT_VERTICES
        ):
            raise ValueError("components must have one through three vertices")
        if any(type(p) is not int for p in parents) or parents[0] != -1:
            raise ValueError("only vertex zero is the root with parent -1")
        if any(not 0 <= parents[v] < v for v in range(1, len(parents))):
            raise ValueError("internal parents must precede their children")
        copied.append({"parent_label": boundary, "parents": list(parents)})
    total = sum(len(component["parents"]) for component in copied)
    if total > MAX_RESIDUAL_VERTICES:
        raise ValueError("at most eight residual vertices are supported")
    if total != len(unused) or total != len(differences):
        raise ValueError("component, label, and difference counts must agree")
    return unused, differences, copied


def _valid_completion(unused, differences, components, placements):
    """Check the returned assignment by direct arithmetic, without signatures."""
    if len(components) != len(placements):
        return False
    labels, actual = [], []
    for component, values in zip(components, placements, strict=True):
        if len(values) != len(component["parents"]):
            return False
        labels.extend(values)
        for v, parent in enumerate(component["parents"]):
            other = component["parent_label"] if parent == -1 else values[parent]
            actual.append(abs(values[v] - other))
    return sorted(labels) == unused and sorted(actual) == differences


def complete_forest(unused, differences, components):
    """Enumerate complete signature tables and join them within declared bounds.

    Component vertices are indexed topologically. The root has parent -1 and is
    attached to ``parent_label``; every other parent index is smaller than its
    child. Placements are returned in the input component/vertex order. Masks in
    signature tables index the sorted resource lists included in the result.
    """
    unused, differences, components = _validate(unused, differences, components)
    label_bits = {u: 1 << i for i, u in enumerate(unused)}
    difference_bits = {d: 1 << i for i, d in enumerate(differences)}
    tables, enumerated = [], []
    for component in components:
        signatures = {}
        visited = 0
        for values in permutations(unused, len(component["parents"])):
            visited += 1
            difference_mask = 0
            for v, parent in enumerate(component["parents"]):
                other = component["parent_label"] if parent == -1 else values[parent]
                bit = difference_bits.get(abs(values[v] - other), 0)
                if bit == 0 or difference_mask & bit:
                    break
                difference_mask |= bit
            else:
                label_mask = sum(label_bits[u] for u in values)
                signatures.setdefault((label_mask, difference_mask), list(values))
        tables.append(
            [
                {"label_mask": labels, "difference_mask": diffs, "labels": values}
                for (labels, diffs), values in signatures.items()
            ]
        )
        enumerated.append(visited)

    order = sorted(range(len(components)), key=lambda i: (len(tables[i]), i))
    full = (1 << len(unused)) - 1
    chosen, failed = {}, set()
    nodes = hits = 0

    def join(position, labels, diffs):
        nonlocal nodes, hits
        nodes += 1
        if position == len(order):
            return labels == full and diffs == full
        key = (position, labels, diffs)
        if key in failed:
            hits += 1
            return False
        index = order[position]
        for signature in tables[index]:
            if labels & signature["label_mask"] or diffs & signature["difference_mask"]:
                continue
            chosen[index] = signature["labels"]
            if join(
                position + 1, labels | signature["label_mask"], diffs | signature["difference_mask"]
            ):
                return True
        failed.add(key)
        chosen.pop(index, None)
        return False

    feasible = join(0, 0, 0)
    placements = [chosen[i] for i in range(len(components))] if feasible else []
    if feasible and not _valid_completion(unused, differences, components, placements):
        raise RuntimeError("residual-signature witness failed direct verification")
    return {
        "schema_version": 1,
        "scope": "fixed_residual_forest",
        "feasible": feasible,
        "complete_within_declared_bounds": True,
        "reason": "completion"
        if feasible
        else (
            "empty_component_table"
            if any(not table for table in tables)
            else "incompatible_signatures"
        ),
        "placements": placements,
        "unused": unused,
        "differences": differences,
        "signature_counts": [len(table) for table in tables],
        "component_assignments_enumerated": enumerated,
        "signature_tables": tables,
        "join_nodes": nodes,
        "join_memo_hits": hits,
        "bounds": {
            "component_vertices": MAX_COMPONENT_VERTICES,
            "residual_vertices": MAX_RESIDUAL_VERTICES,
        },
    }
