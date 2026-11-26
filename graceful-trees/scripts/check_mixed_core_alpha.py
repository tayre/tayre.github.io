"""Standalone stdlib verifier for the exact numbered G(1,5) alpha certificate.

No project, generator, matching, or solver imports. All validation remains
enabled under python -O. This is a custom finite certificate, not DRAT or Lean.
"""

import gzip
import hashlib
import json
from collections import Counter
from itertools import combinations, permutations
from pathlib import Path

ORIGINAL_INPUT_SHA256 = "2c74d29634d215f8d0d6fc4350ef0f899acd2acdd4c59eaf97ebdb7a96028254"


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _graph(n, edges, root):
    """Bind the certificate to one exact numbered graph; derive branch roles."""
    _require(
        type(n) is int and n == 32 and type(root) is int and root == 1,
        "Certificate applies only to n=32, numbered root d=1",
    )
    normalized = []
    for edge in edges:
        _require(
            isinstance(edge, (list, tuple)) and len(edge) == 2,
            "Every edge must have two integer endpoints",
        )
        a, b = edge
        _require(
            type(a) is int and type(b) is int and 0 <= a < n and 0 <= b < n and a != b,
            "Invalid edge endpoint",
        )
        normalized.append(tuple(sorted(edge)))
    expected = {(0, 1), (0, 2), (0, 5), (1, 9), (1, 20)}
    expected.update((2, x) for x in (3, 4))
    expected.update((5, x) for x in (6, 7, 8))
    expected.update((9, x) for x in range(10, 20))
    expected.update((20, x) for x in range(21, 32))
    _require(
        len(normalized) == len(set(normalized)) == 31 and set(normalized) == expected,
        "Graph differs from the exact numbered G(1,5) certificate input",
    )
    adj = {v: set() for v in range(n)}
    for a, b in normalized:
        adj[a].add(b)
        adj[b].add(a)
    colors = {root: 0}
    queue = [root]
    for v in queue:
        for w in adj[v]:
            if w not in colors:
                colors[w] = 1 - colors[v]
                queue.append(w)
            _require(colors[w] != colors[v], "Graph is not bipartite")
    _require(len(colors) == n, "Graph is disconnected")
    low = {v for v in colors if colors[v] == 0}
    _require(len(low) == 24, "Wrong alpha low-part cardinality")
    # Recover support roles from adjacency and leaf counts, not supplied metadata.
    mapping = {"c": 0, "d": root}
    leaves = {}
    for name, center, count in (("A", 0, 2), ("B", 0, 3), ("C", root, 10), ("D", root, 11)):
        candidates = [
            v
            for v in adj[center]
            if v not in (0, root)
            and len(adj[v] - {center}) == count
            and all(len(adj[x]) == 1 for x in adj[v] - {center})
        ]
        _require(len(candidates) == 1, "Ambiguous or incorrect branch mapping")
        mapping[name] = candidates[0]
        leaves[name] = sorted(adj[candidates[0]] - {center})
    _require(
        [len(adj[mapping[name]]) - 1 for name in ("c", "C", "D", "A", "B")] == [2, 10, 11, 2, 3],
        "Incorrect degree correction for balance identity",
    )
    return normalized, mapping, leaves, low


def verify_certificate(n, edges, root, certificate_path, expected_sha256=None):
    """Check exact coverage and every local rejection; raise ValueError on error.

    n/edges/root must describe the frozen numbered G(1,5), with no reliance on
    caller-supplied branch metadata. Optional expected_sha256 binds compressed
    bytes to a publication manifest. No solver or matching algorithm is called.
    """
    _, mapping, leaves, _ = _graph(n, edges, root)
    packed = Path(certificate_path).read_bytes()
    digest = hashlib.sha256(packed).hexdigest()
    _require(expected_sha256 is None or digest == expected_sha256, "Certificate SHA256 mismatch")
    raw = gzip.decompress(packed)
    certificate = json.loads(raw)
    _require(
        certificate.get("format") == "g1-l5-d-zero-alpha-local-rejections-v1",
        "Wrong certificate format",
    )
    _require(
        certificate.get("input_sha256") == ORIGINAL_INPUT_SHA256,
        "Wrong frozen-input provenance hash",
    )
    _require(
        certificate.get("claim_scope") == "G(1,5), numbered d=1 prescribed zero, whole-tree alpha",
        "Wrong certificate scope",
    )
    _require(
        certificate.get("pattern_key") == ["H", "K", "L", "u", "v", "A_offset_1", "A_offset_2"],
        "Wrong pattern-key schema",
    )
    supplied = {}
    for row in certificate["rows"]:
        _require(isinstance(row, list) and len(row) == 2, "Invalid certificate row")
        key, reason = row
        _require(
            isinstance(key, list) and len(key) == 7 and all(type(x) is int for x in key),
            "Invalid pattern key",
        )
        key = tuple(key)
        _require(key not in supplied, "Duplicate pattern key")
        _require(isinstance(reason, list) and reason, "Invalid rejection record")
        supplied[key] = reason
    counts = Counter()
    expected_keys = set()
    for H, K, L in permutations(range(8), 3):
        remaining = [h for h in range(8) if h not in (H, K, L)]
        for u in range(1, 24):
            for v in range(1, 24):
                if u == v or 2 * u + 3 * v != 2 * H + 10 * K + 11 * L:
                    continue
                for a_offsets in combinations(remaining, 2):
                    key = (H, K, L, u, v, *a_offsets)
                    _require(key in supplied, "Missing pattern key")
                    expected_keys.add(key)
                    reason = supplied[key]
                    values = {
                        mapping["c"]: 24 + H,
                        mapping["d"]: 0,
                        mapping["A"]: u,
                        mapping["B"]: v,
                        mapping["C"]: 24 + K,
                        mapping["D"]: 24 + L,
                    }
                    b_offsets = [h for h in remaining if h not in a_offsets]
                    for name, offsets in (("A", a_offsets), ("B", b_offsets)):
                        for vertex, offset in zip(leaves[name], offsets, strict=True):
                            values[vertex] = 24 + offset
                    fixed_order = [(mapping["d"], mapping[name]) for name in ("c", "C", "D")]
                    fixed_order += [(mapping["c"], mapping[name]) for name in ("A", "B")]
                    fixed_order += [
                        (mapping[name], vertex) for name in ("A", "B") for vertex in leaves[name]
                    ]
                    fixed = [abs(values[a] - values[b]) for a, b in fixed_order]
                    kind = reason[0]
                    if kind == "repeat":
                        _require(
                            len(reason) == 3 and all(type(x) is int for x in reason[1:]),
                            "Invalid repeat evidence",
                        )
                        i, j = reason[1:]
                        _require(
                            0 <= i < j < 10 and fixed[i] == fixed[j],
                            "False repeated-difference rejection",
                        )
                    elif kind == "out_of_range":
                        _require(
                            len(reason) == 2 and type(reason[1]) is int, "Invalid range evidence"
                        )
                        i = reason[1]
                        _require(
                            0 <= i < 10 and not 1 <= fixed[i] <= 31, "False out-of-range rejection"
                        )
                    else:
                        _require(
                            len(set(fixed)) == 10 and all(1 <= x <= 31 for x in fixed),
                            "Invalid residual premise",
                        )
                        unused_labels = set(range(n)) - set(values.values())
                        unused_differences = set(range(1, n)) - set(fixed)
                        _require(
                            len(unused_labels) == len(unused_differences) == 21,
                            "Wrong residual cardinality",
                        )
                        _require(
                            unused_labels <= set(range(1, 24)),
                            "Residual label outside alpha low part",
                        )

                        def options(
                            x,
                            own_c=values[mapping["C"]],
                            own_d=values[mapping["D"]],
                            available=frozenset(unused_differences),
                        ):
                            return {abs(own_c - x), abs(own_d - x)} & available

                        if kind == "isolated_label":
                            _require(
                                len(reason) == 2 and type(reason[1]) is int,
                                "Invalid label isolation evidence",
                            )
                            x = reason[1]
                            _require(
                                x in unused_labels and not options(x),
                                "False isolated-label rejection",
                            )
                        elif kind == "isolated_difference":
                            _require(
                                len(reason) == 2 and type(reason[1]) is int,
                                "Invalid difference isolation evidence",
                            )
                            difference = reason[1]
                            _require(
                                difference in unused_differences
                                and all(difference not in options(x) for x in unused_labels),
                                "False isolated-difference rejection",
                            )
                        elif kind == "hall":
                            _require(
                                len(reason) == 3
                                and isinstance(reason[1], list)
                                and isinstance(reason[2], list),
                                "Invalid Hall evidence",
                            )
                            labels, neighbors = reason[1:]
                            _require(
                                all(type(x) is int for x in labels + neighbors),
                                "Noninteger Hall evidence",
                            )
                            _require(
                                labels == sorted(set(labels))
                                and labels
                                and neighbors == sorted(set(neighbors)),
                                "Repeated or unsorted Hall evidence",
                            )
                            _require(set(labels) <= unused_labels, "Hall label is not unused")
                            actual = set().union(*(options(x) for x in labels))
                            _require(
                                actual == set(neighbors) and len(actual) < len(labels),
                                "False Hall rejection",
                            )
                        else:
                            raise ValueError("Unknown rejection type")
                    counts[kind] += 1
    _require(
        set(supplied) == expected_keys and len(expected_keys) == 14860,
        "Extra, missing, or incorrect pattern coverage",
    )
    return {
        "status": "verified_custom_finite_domain_certificate",
        "scope": "fixed_graph_prescribed_zero_alpha_only",
        "custom_finite_certificate_verified": True,
        "external_solver_certificate_verified": False,
        "lean_proof_checked": False,
        "ordinary_rooted_infeasibility_claim": False,
        "pattern_count": len(expected_keys),
        "rejection_counts": dict(counts),
        "certificate_sha256": digest,
        "matching_or_solver_called": False,
    }


def verify_ordinary_witness(n, edges, root, labels):
    """Independently check ordinary graceful root-zero witness on this input."""
    normalized, _, _, low = _graph(n, edges, root)
    _require(
        isinstance(labels, list) and len(labels) == n and all(type(x) is int for x in labels),
        "Invalid vertex labels",
    )
    _require(sorted(labels) == list(range(n)), "Vertex labels are not a permutation")
    _require(labels[root] == 0, "Prescribed root is not zero")
    differences = [abs(labels[a] - labels[b]) for a, b in normalized]
    _require(sorted(differences) == list(range(1, n)), "Edge differences are not a permutation")
    alpha = max(labels[v] for v in low) < min(labels[v] for v in set(range(n)) - low)
    return {
        "tree_valid": True,
        "labels_valid": True,
        "differences_valid": True,
        "root_zero": True,
        "alpha_with_zero_root": alpha,
    }


def verify_evidence(evidence, certificate_path):
    """Check an evidence JSON object containing input, root, witness, and hash."""
    tree = evidence["input"]
    ordinary = verify_ordinary_witness(
        tree["n"], tree["edges"], evidence["root"], evidence["ordinary_labels"]
    )
    alpha = verify_certificate(
        tree["n"],
        tree["edges"],
        evidence["root"],
        certificate_path,
        evidence["certificate"]["sha256"],
    )
    return {"ordinary_graceful_witness": ordinary, "rooted_alpha_exclusion": alpha}


def main():
    import argparse

    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--evidence", type=Path, default=project / "examples/mixed-core-alpha-obstruction.json"
    )
    parser.add_argument(
        "--certificate",
        type=Path,
        default=project / "examples/mixed-core-alpha-certificate.json.gz",
    )
    args = parser.parse_args()
    evidence = json.loads(args.evidence.read_text())
    print(json.dumps(verify_evidence(evidence, args.certificate), indent=2))


if __name__ == "__main__":
    main()
