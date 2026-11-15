"""Bounded studies of residuals observed in actual connected-prefix searches.

Snapshots are the first distinct eligible states, selected before their outcomes
are known. Every negative statement fixes the entire saved partial labeling.
The definition-level oracle enumerates full-tree completions independently of
the signature join and the certificate discovery code. Nothing here can classify
an unrestricted tree as infeasible. Use worker_main with Supervisor for a hard
parent-enforced wall limit; a terminated worker returns no completed inference.
"""

import hashlib
import itertools
import json
import math
import time
import traceback
from collections import Counter
from pathlib import Path

from .frontier import ALGORITHM, MAX_N, search
from .residual_congruence_verify import verify_certificate as check_congruence
from .residual_relaxations_verify import verify_certificate as check_relaxation
from .verify import verify_labeling, verify_tree

MAX_SNAPSHOTS = 4
MAX_UNUSED = 8
MAX_COMPONENT = 3
SCOPE = "fixed_partial_labeling"
RELAXATIONS = ("signed_integer_cover", "nonnegative_separator", "nonnegative_rational_cover")


class IneligibleResidual(ValueError):
    """A valid search prefix exceeds this study's component bound."""


def reconstruct(full_input, partial_labels):
    """Derive every residual resource and component from the original graph.

    Validate a connected descending-difference prefix, without saved component
    tables or a solver. This validates the state, not the historical claim that a
    particular search invocation visited it; source metadata remains provenance.
    """
    if not isinstance(full_input, dict) or set(full_input) != {"n", "edges"}:
        raise ValueError("full_input requires exactly n and edges")
    n, edges = full_input["n"], full_input["edges"]
    if type(n) is not int or not 1 <= n <= MAX_N:
        raise ValueError("tree order outside bounded trace scope")
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid full tree: {errors}")
    if (
        not isinstance(partial_labels, list)
        or len(partial_labels) != n
        or any(type(x) is not int or not -1 <= x < n for x in partial_labels)
    ):
        raise ValueError("partial_labels must contain integer labels or -1")
    assigned = {v for v, value in enumerate(partial_labels) if value >= 0}
    values = [partial_labels[v] for v in assigned]
    if len(set(values)) != len(values):
        raise ValueError("repeated assigned labels")
    if not assigned or 0 not in values:
        raise ValueError("a trace prefix must contain an assigned zero")
    unassigned = set(range(n)) - assigned
    if not 1 <= len(unassigned) <= MAX_UNUSED:
        raise ValueError("a residual must have one through eight unassigned vertices")
    adjacent = [[] for _ in range(n)]
    fixed_differences = []
    for u, v in edges:
        adjacent[u].append(v)
        adjacent[v].append(u)
        if u in assigned and v in assigned:
            fixed_differences.append(abs(partial_labels[u] - partial_labels[v]))
    visited = {min(assigned)}
    stack = list(visited)
    while stack:
        for neighbor in adjacent[stack.pop()]:
            if neighbor in assigned and neighbor not in visited:
                visited.add(neighbor)
                stack.append(neighbor)
    if visited != assigned:
        raise ValueError("assigned region is disconnected")
    remaining = len(unassigned)
    if sorted(fixed_differences) != list(range(remaining + 1, n)):
        raise ValueError("assigned differences are not a descending-search prefix")
    components, mappings = [], []
    todo = unassigned.copy()
    while todo:
        connected = {min(todo)}
        stack = list(connected)
        while stack:
            for neighbor in adjacent[stack.pop()]:
                if neighbor in unassigned and neighbor not in connected:
                    connected.add(neighbor)
                    stack.append(neighbor)
        if len(connected) > MAX_COMPONENT:
            raise IneligibleResidual("each residual component must have at most three vertices")
        attachments = sorted((v, p) for v in connected for p in adjacent[v] if p in assigned)
        if len(attachments) != 1:
            raise ValueError("each residual component needs exactly one assigned attachment")
        root, boundary = attachments[0]
        vertices, parents, indices = [root], [-1], {root: 0}
        for vertex in vertices:
            for child in sorted(adjacent[vertex]):
                if child in connected and child not in indices:
                    indices[child] = len(vertices)
                    vertices.append(child)
                    parents.append(indices[vertex])
        components.append({"parent_label": partial_labels[boundary], "parents": parents})
        mappings.append({"vertices": vertices, "parent_vertex": boundary})
        todo -= connected
    return {
        "unused": sorted(set(range(n)) - set(values)),
        "differences": list(range(1, remaining + 1)),
        "components": components,
    }, mappings


def _identity(full_input, partial_labels):
    raw = json.dumps(
        {"input": full_input, "partial_labels": partial_labels},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def permutation_oracle(full_input, partial_labels):
    """Enumerate original-vertex assignments, not component signatures."""
    reconstruct(full_input, partial_labels)
    vertices = [v for v, value in enumerate(partial_labels) if value < 0]
    unused = sorted(set(range(full_input["n"])) - set(partial_labels))
    count = 0
    labels = partial_labels.copy()
    target = list(range(1, full_input["n"]))
    for values in itertools.permutations(unused):
        count += 1
        for v, value in zip(vertices, values, strict=True):
            labels[v] = value
        if sorted(abs(labels[u] - labels[v]) for u, v in full_input["edges"]) == target:
            if not verify_labeling(**full_input, labels=labels)["valid"]:
                raise RuntimeError("full-tree oracle witness rejected")
            return {
                "feasible": True,
                "assignments_checked": count,
                "exhausted": False,
                "labels": labels.copy(),
            }
    return {"feasible": False, "assignments_checked": count, "exhausted": True, "labels": None}


def _independent_local_tables(full_input, partial_labels, residual, mappings):
    """Regenerate distinct local resource options directly on full-tree edges."""
    tables = []
    allowed = set(residual["differences"])
    for mapping in mappings:
        vertices = mapping["vertices"]
        present = set(vertices) | {mapping["parent_vertex"]}
        edges = [(u, v) for u, v in full_input["edges"] if u in present and v in present]
        signatures = {}
        for values in itertools.permutations(residual["unused"], len(vertices)):
            labels = {mapping["parent_vertex"]: partial_labels[mapping["parent_vertex"]]}
            labels.update(zip(vertices, values, strict=True))
            differences = [abs(labels[u] - labels[v]) for u, v in edges]
            if len(set(differences)) == len(differences) and set(differences) <= allowed:
                key = (tuple(sorted(values)), tuple(sorted(differences)))
                signatures.setdefault(key, set()).add(values)
        tables.append(signatures)
    return tables


def verify_record(record):
    """Return errors after regenerating scope, complete oracle and certificates.

    Saved exhaustion flags and signature feasibility are not trusted. The bounded
    permutation oracle is rerun on the original tree. No third-party solver is
    invoked by this verification function.
    """
    errors = []
    try:
        if (
            not isinstance(record, dict)
            or type(record.get("schema_version")) is not int
            or record["schema_version"] != 1
        ):
            raise ValueError("unsupported observed-residual record")
        if record.get("scope") != SCOPE or record.get("status") != "completed":
            raise ValueError("record must concern one completed fixed partial labeling")
        if record.get("whole_tree_conclusion") != "none":
            raise ValueError("a residual record cannot make a whole-tree conclusion")
        full, partial = record["full_input"], record["partial_labels"]
        data, mappings = reconstruct(full, partial)
        if record["residual"] != data or record["component_maps"] != mappings:
            raise ValueError("saved residual mapping does not match the original partial tree")
        if record.get("snapshot_id") != _identity(full, partial):
            raise ValueError("snapshot identity mismatch")
        source = record["source"]
        if (
            not isinstance(source, dict)
            or source.get("algorithm") != ALGORITHM
            or type(source.get("seed")) is not int
            or not 0 <= source["seed"] < 2**31
            or type(source.get("node")) is not int
            or source["node"] < 1
            or type(source.get("root")) is not int
            or not 0 <= source["root"] < full["n"]
            or partial[source["root"]] != 0
            or type(source.get("difference")) is not int
            or source.get("difference") != len(data["unused"])
        ):
            raise ValueError("invalid search-source metadata")
        oracle = permutation_oracle(full, partial)
        if record["oracle"] != oracle:
            raise ValueError("saved oracle disagrees with independent full-tree enumeration")
        exact = record["exact"]
        if (
            not isinstance(exact, dict)
            or exact.get("scope") != "fixed_residual_forest"
            or exact.get("unused") != data["unused"]
            or exact.get("differences") != data["differences"]
            or exact.get("complete_within_declared_bounds") is not True
        ):
            raise ValueError("signature result has invalid scope or resources")
        if type(exact.get("feasible")) is not bool or exact["feasible"] != oracle["feasible"]:
            raise ValueError("signature result disagrees with full-tree oracle")
        tables = _independent_local_tables(full, partial, data, mappings)
        counts = [len(table) for table in tables]
        if exact.get("signature_counts") != counts:
            raise ValueError("signature counts disagree with independent local enumeration")
        for saved, regenerated in zip(exact["signature_tables"], tables, strict=True):
            seen = set()
            for entry in saved:
                masks = entry["label_mask"], entry["difference_mask"]
                if any(
                    type(mask) is not int or not 0 <= mask < 2 ** len(data["unused"])
                    for mask in masks
                ):
                    raise ValueError("invalid signature resource mask")
                if not isinstance(entry["labels"], list) or any(
                    type(value) is not int for value in entry["labels"]
                ):
                    raise ValueError("signature labels must be integers")
                key = tuple(
                    tuple(value for index, value in enumerate(resources) if mask >> index & 1)
                    for mask, resources in zip(
                        masks, (data["unused"], data["differences"]), strict=True
                    )
                )
                if key in seen or tuple(entry["labels"]) not in regenerated.get(key, ()):
                    raise ValueError(
                        "saved local signature has no independently verified realization"
                    )
                seen.add(key)
            if seen != set(regenerated):
                raise ValueError("saved local table omits a possible signature")
        reason = (
            "completion"
            if oracle["feasible"]
            else "empty_component_table"
            if 0 in counts
            else "incompatible_signatures"
        )
        if exact.get("reason") != reason:
            raise ValueError("incorrect residual classification")
        if oracle["feasible"]:
            labels = partial.copy()
            for mapping, placement in zip(mappings, exact["placements"], strict=True):
                for vertex, value in zip(mapping["vertices"], placement, strict=True):
                    labels[vertex] = value
            if not verify_labeling(**full, labels=labels)["valid"]:
                raise ValueError("signature witness fails full-tree verification")
        if not isinstance(record["relaxations"], list):
            raise ValueError("relaxation results must be a list")
        for result in [record["congruence"], *record["relaxations"]]:
            if (
                not isinstance(result, dict)
                or type(result.get("exact_completion_feasible")) is not bool
                or result["exact_completion_feasible"] != oracle["feasible"]
            ):
                raise ValueError("certificate discovery's exact scope disagrees with oracle")
            certificate = result.get("certificate")
            if certificate is not None:
                if not isinstance(certificate, dict):
                    raise ValueError("a residual certificate must be an object")
                checker = (
                    check_congruence
                    if certificate.get("kind") == "residual_congruence"
                    else check_relaxation
                )
                check = checker(certificate, expected_input=data)
                if not check["valid"]:
                    raise ValueError(
                        f"independent residual certificate rejection: {check['errors']}"
                    )
                if (
                    certificate["kind"] in ("residual_congruence", "nonnegative_separator")
                    and oracle["feasible"]
                ):
                    raise ValueError("negative certificate contradicts a completion witness")
        if record.get("classification") != (
            "completable" if oracle["feasible"] else "impossible_partial"
        ):
            raise ValueError("classification claims more than the fixed-partial result")
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as exc:
        errors.append(str(exc))
    return errors


def summarize(records):
    """Describe completed, independently verifiable residuals only."""
    counts = Counter(record["classification"] for record in records)
    return {
        "residuals": len(records),
        "completable": counts["completable"],
        "impossible_partial": counts["impossible_partial"],
        "locally_feasible_but_incompatible": sum(
            row["exact"]["reason"] == "incompatible_signatures" for row in records
        ),
        "congruence_certificates": sum(
            row["congruence"].get("certificate") is not None for row in records
        ),
        "relaxation_certificates": sum(
            result.get("certificate") is not None
            for row in records
            for result in row["relaxations"]
        ),
        "whole_tree_infeasibility_claims": 0,
        "novelty_claimed": False,
    }


def investigate(request):
    """Collect actual trace states, then classify them under a single allowance."""
    from .residual_congruence import find_certificate
    from .residual_relaxations import discover
    from .residual_signatures import complete_forest

    started = time.monotonic()
    seconds, seed = request["solver_seconds"], request["seed"]
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("solver_seconds must be finite and positive")
    if type(seed) is not int or not 0 <= seed < 2**31:
        raise ValueError("seed must be an integer in 0..2**31-1")
    limit = request.get("max_snapshots", MAX_SNAPSHOTS)
    if type(limit) is not int or not 1 <= limit <= MAX_SNAPSHOTS:
        raise ValueError("max_snapshots must be one through four")
    full = request["input"]
    if not isinstance(full, dict) or set(full) != {"n", "edges"}:
        raise ValueError("input requires exactly n and edges")
    if type(full["n"]) is not int or not 1 <= full["n"] <= MAX_N:
        raise ValueError("tree order outside bounded trace scope")
    errors = verify_tree(**full)
    if errors:
        raise ValueError(f"invalid tree: {errors}")
    full = {"n": full["n"], "edges": [list(edge) for edge in full["edges"]]}
    deadline = started + seconds
    snapshots, identities = [], set()
    observed = 0

    def observe(state):
        nonlocal observed
        observed += 1
        if len(snapshots) == limit:
            return
        try:
            data, mappings = reconstruct(full, state["labels"])
        except IneligibleResidual:
            # An otherwise valid search state can have a component larger than 3.
            return
        identity = _identity(full, state["labels"])
        if identity not in identities:
            identities.add(identity)
            snapshots.append(
                {
                    "schema_version": 1,
                    "snapshot_id": identity,
                    "scope": SCOPE,
                    "full_input": full,
                    "partial_labels": state["labels"],
                    "source": {key: value for key, value in state.items() if key != "labels"},
                    "residual": data,
                    "component_maps": mappings,
                    "whole_tree_conclusion": "none",
                }
            )

    trace_seconds = min(0.25, seconds / 5)
    trace = search(
        **full,
        seed=seed,
        max_nodes=request.get("max_nodes", 20000),
        seconds=trace_seconds,
        residual_observer=observe,
    )
    trace_verification = None
    if trace["labels"] is not None:
        trace_verification = verify_labeling(**full, labels=trace["labels"])
        if not trace_verification["valid"]:
            raise RuntimeError("trace search returned an invalid full-tree witness")
    records = []
    for snapshot in snapshots:
        if time.monotonic() >= deadline:
            break
        data = snapshot["residual"]
        exact = complete_forest(**data)
        oracle = permutation_oracle(full, snapshot["partial_labels"])
        if exact["feasible"] != oracle["feasible"]:
            raise RuntimeError("signature/oracle disagreement on observed partial labeling")
        congruence = find_certificate(**data)
        relaxations = []
        if not oracle["feasible"] and congruence["certificate"] is None:
            for kind in RELAXATIONS:
                available = deadline - time.monotonic()
                if available <= 0:
                    break
                result = discover(**data, kind=kind, seed=seed, seconds=min(0.25, available))
                relaxations.append(result)
        record = {
            **snapshot,
            "status": "completed",
            "classification": "completable" if oracle["feasible"] else "impossible_partial",
            "exact": exact,
            "oracle": oracle,
            "congruence": congruence,
            "relaxations": relaxations,
        }
        errors = verify_record(record)
        if errors:
            raise RuntimeError(f"independent observed-residual check failed: {errors}")
        records.append(record)
    result = {
        "schema_version": 1,
        "status": "completed",
        "scope": "observed_search_residuals",
        "input": full,
        "seed": seed,
        "solver_seconds": seconds,
        "sampling": "first_distinct_eligible_states_before_outcomes",
        "max_snapshots": limit,
        "trace": trace,
        "trace_verification": trace_verification,
        "trace_states_seen": observed,
        "snapshots_collected": len(snapshots),
        "snapshots_unclassified": len(snapshots) - len(records),
        "unclassified_snapshots": [
            {**snapshot, "status": "unknown", "termination": "study_budget"}
            for snapshot in snapshots[len(records) :]
        ],
        "residual_records": records,
        "summary": summarize(records),
        "whole_tree_conclusion": "none",
        "wall_seconds": time.monotonic() - started,
    }
    if request.get("directory") is not None:
        directory = Path(request["directory"])
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "focused-residual.json"
        with path.open("x") as output:
            json.dump(result, output, indent=2, sort_keys=True)
            output.write("\n")
    return result


def worker_main(connection):
    """Supervisor-compatible process entry point; no module-level solver import."""
    connection.send({"ready": True})
    try:
        while True:
            request = connection.recv()
            if request is None:
                return
            try:
                result = investigate(request)
            except Exception:
                result = {"status": "error", "error": traceback.format_exc()}
            connection.send(result)
    except (EOFError, BrokenPipeError):
        return
    finally:
        connection.close()
