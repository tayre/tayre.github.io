"""Independent, standard-library-only positive-witness verifier.

This file can also be copied out of the project and run directly with Python.
It does not import the generator, model, NetworkX, or OR-Tools.
"""

import argparse
import json
from pathlib import Path


def verify_tree(n, edges):
    errors = []
    if type(n) is not int or n < 1:
        return ["n must be a positive integer"]
    if not isinstance(edges, (list, tuple)):
        return ["edges must be a list"]
    if len(edges) != n - 1:
        return ["a tree must have exactly n-1 edges"]
    adjacency = [[] for _ in range(n)]
    seen = set()
    for edge in edges:
        if not isinstance(edge, (list, tuple)) or len(edge) != 2:
            errors.append("each edge must have two endpoints")
            continue
        u, v = edge
        if any(type(x) is not int or not 0 <= x < n for x in (u, v)):
            errors.append("edge endpoint outside integer vertex set 0..n-1")
            continue
        if u == v:
            errors.append("self loop")
        key = tuple(sorted((u, v)))
        if key in seen:
            errors.append("duplicate undirected edge")
        seen.add(key)
        adjacency[u].append(v)
        adjacency[v].append(u)
    reached = {0}
    stack = [0]
    while stack:
        for v in adjacency[stack.pop()]:
            if v not in reached:
                reached.add(v)
                stack.append(v)
    if len(reached) != n:
        errors.append("graph is disconnected")
    # A connected simple graph with n vertices and n-1 edges is a tree.
    return errors


def verify_labeling(n, edges, labels, restriction=None):
    errors = verify_tree(n, edges)
    tree_valid = not errors
    labels_valid = (
        type(n) is int
        and n > 0
        and isinstance(labels, (list, tuple))
        and len(labels) == n
        and all(type(x) is int for x in labels)
        and sorted(labels) == list(range(n))
    )
    if not labels_valid:
        errors.append("vertex labels must be exactly the integers 0..n-1, once each")
    differences = []
    if tree_valid and labels_valid:
        differences = [abs(labels[u] - labels[v]) for u, v in edges]
        if sorted(differences) != list(range(1, n)):
            errors.append("edge differences must be exactly 1..n-1, once each")
    if restriction is not None:
        if not isinstance(restriction, dict) or restriction.get("kind") != "extreme_edge":
            errors.append("unsupported restriction")
        else:
            edge = restriction.get("edge")
            if (
                not isinstance(edge, (list, tuple))
                or len(edge) != 2
                or any(type(x) is not int for x in edge)
                or not tree_valid
                or tuple(sorted(edge)) not in {tuple(sorted(e)) for e in edges}
            ):
                errors.append("restriction does not name a tree edge")
            elif not labels_valid or abs(labels[edge[0]] - labels[edge[1]]) != n - 1:
                errors.append("restricted edge does not carry difference n-1")
    return {
        "valid": not errors,
        "tree_valid": tree_valid,
        "vertex_labels_valid": labels_valid,
        "edge_differences": differences,
        "errors": errors,
        "verifier": "stdlib-v1",
    }


def verify_certificate(certificate):
    if not isinstance(certificate, dict):
        return {"valid": False, "errors": ["certificate must be a JSON object"]}
    return verify_labeling(
        certificate.get("n"),
        certificate.get("edges"),
        certificate.get("labels"),
        certificate.get("restriction"),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="certificate JSON or directory of certificates")
    args = parser.parse_args(argv)
    paths = sorted(args.path.glob("*.json")) if args.path.is_dir() else [args.path]
    errors = []
    if not paths:
        errors.append("no certificates found")
    for path in paths:
        try:
            result = verify_certificate(json.loads(path.read_text()))
            if not result["valid"]:
                errors.append({"path": str(path), "errors": result["errors"]})
        except (OSError, ValueError, TypeError) as exc:
            errors.append({"path": str(path), "error": str(exc)})
    print(json.dumps({"checked": len(paths), "valid": not errors, "errors": errors}, indent=2))
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
