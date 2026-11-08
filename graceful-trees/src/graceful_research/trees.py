"""Deterministic generation, exact tree isomorphism keys, and structural features."""

import hashlib
import itertools
import json
import math
import random
from collections import Counter

import networkx as nx

from .verify import verify_tree


def derived_seed(*parts):
    digest = hashlib.sha256(json.dumps(parts, separators=(",", ":")).encode()).digest()
    return int.from_bytes(digest[:8], "big") % (2**31 - 1)


def graph_input(graph):
    graph = nx.convert_node_labels_to_integers(graph, ordering="sorted")
    data = {"n": len(graph), "edges": sorted([sorted(e) for e in graph.edges])}
    errors = verify_tree(**data)
    if errors:
        raise ValueError(f"generator did not produce a tree: {errors}")
    return data


def to_graph(data):
    errors = verify_tree(data.get("n"), data.get("edges"))
    if errors:
        raise ValueError(f"invalid tree: {errors}")
    graph = nx.Graph()
    graph.add_nodes_from(range(data["n"]))
    graph.add_edges_from(data["edges"])
    return graph


def rooted_code(graph, root, blocked=None):
    """Exact AHU-style rooted encoding, using an iterative postorder."""
    parents = {root: blocked}
    order = [root]
    for node in order:
        for child in graph[node]:
            if child != parents[node]:
                parents[child] = node
                order.append(child)
    codes = {}
    for node in reversed(order):
        children = sorted(codes[v] for v in graph[node] if v != parents[node])
        codes[node] = "(" + "".join(children) + ")"
    return codes[root]


def canonical_code(graph):
    if not nx.is_tree(graph):
        raise ValueError("canonical_code requires a tree")
    centers = nx.center(graph)
    if len(centers) == 1:
        return "C" + rooted_code(graph, centers[0])
    u, v = centers
    return "B" + "".join(sorted((rooted_code(graph, u, v), rooted_code(graph, v, u))))


def tree_id(code):
    return hashlib.sha256(code.encode()).hexdigest()


def edge_orbits(graph):
    groups = {}
    for u, v in sorted(tuple(sorted(e)) for e in graph.edges):
        code = "".join(sorted((rooted_code(graph, u, v), rooted_code(graph, v, u))))
        groups.setdefault(code, []).append([u, v])
    return [
        {
            "representative": edges[0],
            "edges": edges,
            "orbit_size": len(edges),
            "pendant": any(graph.degree(v) == 1 for v in edges[0]),
        }
        for _, edges in sorted(groups.items())
    ]


def features(graph):
    n = len(graph)
    degrees = [d for _, d in graph.degree]
    core = graph.copy()
    core.remove_nodes_from([v for v, d in graph.degree if d == 1])
    is_caterpillar = len(core) <= 1 or max(dict(core.degree).values()) <= 2
    core2 = core.copy()
    core2.remove_nodes_from([v for v, d in core.degree if d <= 1])
    is_lobster = len(core2) <= 1 or max(dict(core2.degree).values()) <= 2
    colors = nx.bipartite.color(graph)
    counts = Counter(colors.values())
    leaf_count = sum(d == 1 for d in degrees)
    mean = sum(degrees) / n
    return {
        "n": n,
        "diameter": nx.diameter(graph),
        "leaves": leaf_count,
        "leaf_fraction": leaf_count / n,
        "max_degree": max(degrees),
        "branch_vertices": sum(d >= 3 for d in degrees),
        "degree_variance": sum((d - mean) ** 2 for d in degrees) / n,
        "bipartition_min": min(counts.get(0, 0), counts.get(1, 0)),
        "is_caterpillar": is_caterpillar,
        "is_lobster": is_lobster,
        "max_sibling_leaves": max(
            (sum(graph.degree(v) == 1 for v in graph[u]) for u in graph), default=0
        ),
    }


def generate_family(family, n, seed):
    rng = random.Random(seed)
    if n <= 2 or family == "path":
        return nx.path_graph(n)
    if family == "star":
        return nx.star_graph(n - 1)
    if family == "binary_heap":
        return nx.Graph(((i - 1) // 2, i) for i in range(1, n))
    if family == "prufer":
        # Uniform labeled trees, NOT uniform isomorphism classes.
        return nx.from_prufer_sequence([rng.randrange(n) for _ in range(n - 2)])
    if family == "recursive":
        return nx.Graph((rng.randrange(i), i) for i in range(1, n))
    if family == "spider":
        legs = rng.randint(2, min(n - 1, max(2, math.isqrt(n) + 2)))
        lengths = [1] * legs
        for _ in range(n - 1 - legs):
            lengths[rng.randrange(legs)] += 1
        graph = nx.empty_graph(1)
        node = 1
        for length in lengths:
            parent = 0
            for _ in range(length):
                graph.add_edge(parent, node)
                parent, node = node, node + 1
        return graph
    if family == "caterpillar":
        spine = rng.randint(2, n - 1)
        graph = nx.path_graph(spine)
        for v in range(spine, n):
            graph.add_edge(rng.randrange(spine), v)
        return graph
    if family == "lobster":
        spine = max(1, n // 3)
        graph = nx.path_graph(spine)
        first_layer = list(range(spine, min(n, 2 * spine)))
        for v in first_layer:
            graph.add_edge(rng.randrange(spine), v)
        attachable = list(range(spine)) + first_layer
        for v in range(spine + len(first_layer), n):
            graph.add_edge(rng.choice(attachable), v)
        return graph
    if family == "broom":
        spine = rng.randint(2, n - 1)
        graph = nx.path_graph(spine)
        graph.add_edges_from((spine - 1, v) for v in range(spine, n))
        return graph
    if family == "double_star":
        graph = nx.path_graph(2)
        split = rng.randint(1, n - 2)
        graph.add_edges_from((0 if v < split + 2 else 1, v) for v in range(2, n))
        return graph
    raise ValueError(f"unsupported family: {family}")


class TreeStream:
    """Round-robin streams with committed cursors; no giant tree list in memory."""

    def __init__(self, config, store):
        self.config, self.store = config, store
        self.streams = [f"exhaustive:{n}" for n in config.exhaustive_sizes]
        if config.sample_sizes:
            self.streams += [f"family:{f}" for f in config.families]
        self.generators = {}

    def next(self):
        for _ in self.streams:
            turn = self.store.meta("stream_turn", 0)
            stream = self.streams[turn % len(self.streams)]
            self.store.set_meta("stream_turn", turn + 1)
            index = self.store.cursor(stream)
            if index < 0:
                continue
            category, value = stream.split(":")
            if category == "exhaustive":
                n = int(value)
                if stream not in self.generators:
                    source = iter([nx.empty_graph(1)]) if n == 1 else nx.nonisomorphic_trees(n)
                    self.generators[stream] = itertools.islice(source, index, None)
                graph = next(self.generators[stream], None)
                if graph is None:
                    self.store.set_meta("enumerated:" + stream, index)
                    self.store.set_cursor(stream, -1)
                    continue
                family, seed = "exhaustive", None
            else:
                family = value
                if family in {"path", "star", "binary_heap"} and index >= len(
                    self.config.sample_sizes
                ):
                    self.store.set_cursor(stream, -1)
                    continue
                n = self.config.sample_sizes[index % len(self.config.sample_sizes)]
                seed = derived_seed(self.config.seed, stream, index)
                graph = generate_family(family, n, seed)
            data = graph_input(graph)
            code = canonical_code(graph)
            case = {
                "tree_id": tree_id(code),
                "canonical_code": code,
                **data,
                "family": family,
                "generation": {"stream": stream, "index": index, "seed": seed},
                "features": features(graph),
            }
            # Save input and cursor in the same transaction. A crash before solving
            # leaves a persisted pending case, picked up by the next run's retries.
            with self.store.connection:
                inserted = self.store.add_case(case)
                self.store.set_cursor(stream, index + 1)
            return case, inserted
        return None
