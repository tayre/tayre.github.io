"""Scoped pendant-maximum-edge profiles, with checked evidence for every conclusion.

The discovery stratum is non-caterpillar lobsters with matching deficiency at
least two. Known construction classes are explicitly tagged controls. A negative
profile excludes pendant maximum edges only, and requires an ordinary graceful
witness plus checked refutations of every pendant-edge orbit. It never declares
the tree nongraceful and makes no claim that this restricted question is novel.
"""

import json
import time

import networkx as nx

from .proof_verify import verify_record
from .trees import (
    canonical_code,
    derived_seed,
    edge_orbits,
    features,
    generate_family,
    graph_input,
    to_graph,
    tree_id,
)
from .verify import verify_labeling

STUDY = "pendant-maximum-edge-v1"
TARGET = "target_deficiency_ge2"
CONTROL_CATERPILLAR = "control_caterpillar"
CONTROL_MATCHING = "control_matching_deficiency_le1"
SAMPLE_SIZES = (13, 14, 16, 18, 20)


def describe(case):
    """Recompute eligibility from the actual graph, not saved family/features."""
    graph = to_graph(case)
    observed = features(graph)
    matching_size = len(nx.max_weight_matching(graph, maxcardinality=True))
    deficiency = len(graph) - 2 * matching_size
    if len(graph) < 2 or not observed["is_lobster"]:
        stratum = "outside_scope"
    elif observed["is_caterpillar"]:
        stratum = CONTROL_CATERPILLAR
    elif deficiency <= 1:
        stratum = CONTROL_MATCHING
    else:
        stratum = TARGET
    return {
        "focus_stratum": stratum,
        "matching_deficiency": deficiency,
        "maximum_matching_size": matching_size,
    }


def candidates(
    store,
    max_n=12,
    *,
    controls_per_stratum=2,
    deadline=float("inf"),
    cancelled=lambda: False,
    exclude_ids=(),
):
    """Stable catalogue targets and a small separate set of known-class controls.

    Catalogue membership is not an exhaustive-coverage claim. The caller must
    retain its generator coverage records separately.
    """
    if type(max_n) is not int or max_n < 2:
        raise ValueError("max_n must be an integer at least two")
    if type(controls_per_stratum) is not int or controls_per_stratum < 0:
        raise ValueError("controls_per_stratum must be a nonnegative integer")
    excluded = set(exclude_ids)

    def available():
        return not cancelled() and time.monotonic() < deadline

    def catalogue():
        if not available():
            return
        if hasattr(store, "connection"):
            rows = store.connection.execute(
                "SELECT tree_id,data FROM cases WHERE n<=? ORDER BY n,tree_id", (max_n,)
            )
            for identity, raw in rows:
                if not available():
                    break
                if identity not in excluded:
                    yield json.loads(raw)
        else:
            # Small test/adaptor stores need only the ordinary Store interface.
            for row in sorted(store.cases(max_n=max_n), key=lambda row: (row["n"], row["tree_id"])):
                if not available():
                    break
                if row["tree_id"] not in excluded:
                    yield row

    targets, controls, counts = [], [], {}
    for case in catalogue():
        if not available():
            break
        metadata = describe(case)
        stratum = metadata["focus_stratum"]
        enriched = {**case, **metadata}
        if stratum == TARGET:
            targets.append(enriched)
        elif stratum != "outside_scope" and counts.get(stratum, 0) < controls_per_stratum:
            controls.append(enriched)
            counts[stratum] = counts.get(stratum, 0) + 1
    return targets + controls


def case_for_index(index, seed):
    """A reproducible larger lobster sample; duplicates remain caller-deduplicated."""
    if type(index) is not int or index < 0 or type(seed) is not int or seed < 0:
        raise ValueError("index and seed must be nonnegative integers")
    n = SAMPLE_SIZES[index % len(SAMPLE_SIZES)]
    input_seed = derived_seed(STUDY, seed, index)
    data = graph_input(generate_family("lobster", n, input_seed))
    graph = to_graph(data)
    code = canonical_code(graph)
    return {
        **data,
        "tree_id": tree_id(code),
        "canonical_code": code,
        "family": "lobster",
        "features": features(graph),
        "focus_generation": {"study": STUDY, "index": index, "seed": input_seed},
        **describe(data),
    }


def _edge(edge):
    if (
        not isinstance(edge, (list, tuple))
        or len(edge) != 2
        or any(type(v) is not int for v in edge)
    ):
        return None
    return tuple(sorted(edge))


def _same_input(first, second):
    try:
        return (
            type(first["n"]) is int
            and first["n"] == second["n"]
            and sorted(map(_edge, first["edges"])) == sorted(map(_edge, second["edges"]))
        )
    except (KeyError, TypeError):
        return False


def profile(case, attempts, *, deadline=float("inf")):
    """Independently check ledger evidence and classify this precise property.

    ``attempts`` may include other tree IDs, which are ignored. Records claiming
    this tree but carrying different input, scope or evidence are integrity
    failures. Saved orbit descriptors and verification booleans are not trusted.
    Proof rechecks share the caller's deadline; expiration leaves the profile
    incomplete rather than converting an unchecked assertion into a certificate.
    """
    graph = to_graph(case)
    if case["tree_id"] != tree_id(canonical_code(graph)):
        raise ValueError("profile tree identity differs from its canonical graph")
    data = {"n": case["n"], "edges": case["edges"]}
    metadata = describe(case)
    orbits = [
        {
            **orbit,
            "status": "unknown",
            "evidence_attempt_ids": [],
            "latest_attempt_id": 0,
        }
        for orbit in edge_orbits(graph)
        if orbit["pendant"]
    ]
    by_edge = {_edge(edge): orbit for orbit in orbits for edge in orbit["edges"]}
    positive, negative, uncertified = {}, {}, set()
    ordinary_ids, errors = [], []
    verification_timed_out = False
    for record in attempts:
        if record.get("tree_id") != case["tree_id"]:
            continue
        attempt_id = record.get("attempt_id", 0)
        if type(attempt_id) is not int or attempt_id < 1:
            errors.append("attempt has no valid ledger identity")
            continue
        if not _same_input(record.get("input"), data):
            errors.append(f"attempt {attempt_id}: input differs from the profiled tree")
            continue
        restriction = record.get("restriction")
        scope = record.get("scope")
        orbit = None
        if scope == "graceful":
            if restriction is not None or record.get("edge_key", "") != "":
                errors.append(f"attempt {attempt_id}: ordinary scope contains an edge restriction")
                continue
        elif scope == "extreme_edge":
            if not isinstance(restriction, dict) or restriction.get("kind") != "extreme_edge":
                errors.append(f"attempt {attempt_id}: missing or invalid edge restriction")
                continue
            edge = _edge(restriction.get("edge"))
            if edge not in {_edge(e) for e in data["edges"]}:
                errors.append(f"attempt {attempt_id}: restriction is not a tree edge")
                continue
            if record.get("edge_key", "-".join(map(str, edge))) != "-".join(map(str, edge)):
                errors.append(f"attempt {attempt_id}: edge key differs from restriction")
                continue
            orbit = by_edge.get(edge)
            if orbit is not None:
                orbit["latest_attempt_id"] = max(orbit["latest_attempt_id"], attempt_id)
        else:
            errors.append(f"attempt {attempt_id}: unsupported scope")
            continue

        if (
            record.get("proof_certificate_verified") is True
            and record.get("status") != "solver_infeasible"
        ):
            errors.append(f"attempt {attempt_id}: proof claim is not scoped infeasibility")
            continue

        if record.get("status") == "verified_graceful":
            check = verify_labeling(**data, labels=record.get("labels"), restriction=restriction)
            if not check["valid"]:
                errors.append(f"attempt {attempt_id}: invalid positive witness")
                continue
            if scope == "graceful":
                ordinary_ids.append(attempt_id)
            labels = record["labels"]
            # Any checked witness can demonstrate the property, including a
            # witness originally found for the ordinary graceful problem.
            for edge, target in by_edge.items():
                if abs(labels[edge[0]] - labels[edge[1]]) == case["n"] - 1:
                    key = tuple(target["representative"])
                    positive.setdefault(key, []).append(attempt_id)
        elif orbit is not None and record.get("status") == "solver_infeasible":
            key = tuple(orbit["representative"])
            if record.get("proof_certificate_verified") is not True:
                uncertified.add(key)
                continue
            if time.monotonic() >= deadline:
                verification_timed_out = True
                continue
            check = verify_record(record, deadline=deadline)
            if check["valid"]:
                negative.setdefault(key, []).append(attempt_id)
            elif check.get("timed_out"):
                verification_timed_out = True
            else:
                errors.append(f"attempt {attempt_id}: independent proof check failed")

    for orbit in orbits:
        key = tuple(orbit["representative"])
        if key in positive and key in negative:
            errors.append(f"contradictory positive and negative evidence for orbit {list(key)}")
        if key in positive:
            orbit["status"] = "supported"
            orbit["evidence_attempt_ids"] = sorted(set(positive[key]))
        elif key in negative:
            orbit["status"] = "certified_excluded"
            orbit["evidence_attempt_ids"] = sorted(set(negative[key]))
        elif key in uncertified:
            orbit["status"] = "uncertified"

    if errors:
        status = "integrity_error"
    elif metadata["focus_stratum"] == "outside_scope":
        status = "outside_scope"
    elif not ordinary_ids:
        status = "ordinary_witness_required"
    elif any(orbit["status"] == "supported" for orbit in orbits):
        status = "supported"
    elif orbits and all(orbit["status"] == "certified_excluded" for orbit in orbits):
        status = "certified_restricted_counterexample"
    elif any(orbit["status"] == "uncertified" for orbit in orbits):
        status = "uncertified"
    else:
        status = "incomplete"
    return {
        "schema_version": 1,
        "study": STUDY,
        "tree_id": case["tree_id"],
        "n": case["n"],
        **metadata,
        "status": status,
        "ordinary_witness_attempt_ids": ordinary_ids,
        "orbits": orbits,
        "verification_timed_out": verification_timed_out,
        "errors": errors,
        "whole_tree_counterexample": False,
        "novelty_claimed": False,
    }


def pending_orbits(case, attempts, *, deadline=float("inf")):
    """Unsettled pendant orbits, rotating old attempts before recently retried ones."""
    result = profile(case, attempts, deadline=deadline)
    if result["status"] not in {"incomplete", "uncertified"}:
        return []
    return sorted(
        [orbit for orbit in result["orbits"] if orbit["status"] in {"unknown", "uncertified"}],
        key=lambda orbit: (orbit["latest_attempt_id"], orbit["representative"]),
    )
