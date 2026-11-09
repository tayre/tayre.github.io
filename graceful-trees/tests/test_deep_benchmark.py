"""Fresh inputs and paired losses constrain the optimization adoption decision."""

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import networkx as nx
import pytest

from graceful_research.constructive import caterpillar_labeling
from graceful_research.trees import canonical_code, tree_id

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "benchmark_deep", PROJECT / "scripts/benchmark_deep.py"
)
benchmark = importlib.util.module_from_spec(SPEC)
sys.path.insert(0, str(PROJECT / "scripts"))
try:
    SPEC.loader.exec_module(benchmark)
finally:
    sys.path.pop(0)


def test_holdout_has_exactly_64_new_shapes_with_prespecified_strata():
    cases, excluded = benchmark.fresh_inputs(6119347)
    again, again_excluded = benchmark.fresh_inputs(6119347)
    assert cases == again and excluded == again_excluded
    assert len(cases) == len({case["tree_id"] for case in cases}) == 64
    assert not {case["tree_id"] for case in cases} & set(excluded)
    assert Counter((case["family"], case["input"]["n"]) for case in cases) == {
        (family, n): count
        for family in ("prufer", "recursive", "spider", "lobster")
        for n, count in ((35, 6), (75, 6), (128, 4))
    }
    prior = {
        row["tree_id"]
        for name in benchmark.PRIOR_CORPORA
        for row in json.loads((PROJECT / "examples" / name).read_text())["inputs"]
    }
    assert set(excluded) == prior
    assert len(benchmark.PRIOR_CORPORA) == 5
    for case in cases:
        graph = nx.Graph()
        graph.add_nodes_from(range(case["input"]["n"]))
        graph.add_edges_from(case["input"]["edges"])
        assert tree_id(canonical_code(graph)) == case["tree_id"]
        assert caterpillar_labeling(**case["input"]) is None


def cases():
    return [
        {
            "input": {"n": 3, "edges": [[0, 1], [1, 2]]},
            "tree_id": "test-path",
            "family": "test",
            "solver_seed": 7,
        },
        {
            "input": {"n": 4, "edges": [[0, 1], [0, 2], [0, 3]]},
            "tree_id": "test-star",
            "family": "test",
            "solver_seed": 8,
        },
    ]


def prepare(tmp_path, monkeypatch):
    project = tmp_path / "project"
    (project / "examples").mkdir(parents=True)
    (project / "examples/portfolio-benchmark.json").write_text(json.dumps({"inputs": cases()}))
    monkeypatch.setattr(benchmark, "PROJECT", project)
    monkeypatch.setattr(benchmark, "fresh_inputs", lambda seed: (cases(), ["excluded-control"]))
    monkeypatch.setattr(benchmark, "provenance", lambda path: {"test": "no benchmark snapshot"})
    monkeypatch.setattr(benchmark, "render", lambda output, result: None)


def test_one_paired_loss_blocks_adoption_even_when_the_candidate_is_faster(tmp_path, monkeypatch):
    prepare(tmp_path, monkeypatch)
    elapsed, requests = [0.0], []
    monkeypatch.setattr(benchmark, "time", SimpleNamespace(perf_counter=lambda: elapsed[0]))
    names = {algorithm: name for name, algorithm in benchmark.ROUTES.items()}
    expected = {index: benchmark.model_hash(case["input"]) for index, case in enumerate(cases())}

    def solve(request):
        requests.append(request)
        repeat, index, _ = Path(request["directory"]).name.split("-", 2)
        repeat, index = int(repeat), int(index)
        name = names[request["frontier_algorithm"]]
        elapsed[0] += {"baseline": 0.2, "filter": 0.1, "orbits": 0.05}[name]
        success = (
            (name == "baseline" and index == 0)
            or (name == "filter" and (index == 1 or repeat == 0))
            or name == "orbits"
        )
        return {
            "status": "verified_graceful" if success else "unknown",
            "labels": ([0, 2, 1] if index == 0 else [0, 1, 2, 3]) if success else None,
            "search_method": "frontier-search" if success else "cp-sat",
            **({"model_sha256": expected[index]} if not success else {}),
        }

    monkeypatch.setattr(benchmark, "solve", solve)
    result = benchmark.benchmark(tmp_path / "run", phase="holdout", seconds=1, repeats=2)
    assert result["eligible_for_adoption"] == ["orbits"]
    assert result["comparisons_against_baseline"]["filter"]["losses_by_repeat"] == [[], [0]]
    assert result["median_seconds"]["filter"] < result["median_seconds"]["baseline"]
    assert len(requests) == 12
    assert {request["solver_seconds"] for request in requests} == {1}
    assert {request["frontier_max_nodes"] for request in requests} == {40000}
    assert result["metadata"]["candidate_seconds"] == 0.1
    assert [names[request["frontier_algorithm"]] for request in requests[:6]] == [
        "baseline",
        "filter",
        "orbits",
        "filter",
        "orbits",
        "baseline",
    ]


def test_changed_fallback_hash_stops_the_benchmark(tmp_path, monkeypatch):
    prepare(tmp_path, monkeypatch)
    monkeypatch.setattr(
        benchmark,
        "solve",
        lambda request: {
            "status": "unknown",
            "labels": None,
            "search_method": "cp-sat",
            "model_sha256": "different-model",
        },
    )
    with pytest.raises(RuntimeError, match="exact fallback model changed"):
        benchmark.benchmark(tmp_path / "run", phase="holdout", repeats=1)


@pytest.mark.parametrize("failure", ["changed_visit_count", "wall_cutoff"])
def test_fixed_work_measurement_rejects_changed_traversal_or_time_cutoff(
    tmp_path, monkeypatch, failure
):
    prepare(tmp_path, monkeypatch)
    actual_import = benchmark.importlib.import_module

    def module(name):
        if name.rsplit(".", 1)[-1] not in benchmark.WORK_METHODS.values():
            return actual_import(name)

        def search(**options):
            return {
                "algorithm": name,
                "labels": None,
                "nodes": 2
                if name.endswith("frontier_fast") and failure == "changed_visit_count"
                else 1,
                "roots_tried": [0],
                "termination": "time_limit" if failure == "wall_cutoff" else "node_limit",
            }

        return SimpleNamespace(search=search)

    monkeypatch.setattr(benchmark.importlib, "import_module", module)
    with pytest.raises(RuntimeError, match="changed the fixed-work traversal|hit a wall cutoff"):
        benchmark.benchmark(tmp_path / "run", phase="work", repeats=1)


@pytest.mark.parametrize(
    "options",
    [
        {"phase": "unsupported"},
        {"seconds": 0},
        {"seconds": True},
        {"seconds": float("nan")},
        {"repeats": 0},
        {"repeats": True},
        {"master_seed": True},
    ],
)
def test_invalid_protocol_does_not_create_an_archive(tmp_path, options):
    path = tmp_path / "invalid"
    with pytest.raises(ValueError):
        benchmark.benchmark(path, **options)
    assert not path.exists()


def test_existing_archive_is_never_overwritten(tmp_path):
    with pytest.raises(FileExistsError):
        benchmark.benchmark(tmp_path)
