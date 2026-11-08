import json
import re
import sqlite3

from graceful_research.progress import build_progress
from graceful_research.visuals import write_dashboard, write_figures


def evidence_database():
    database = sqlite3.connect(":memory:")
    database.executescript("""
        CREATE TABLE runs(run_id TEXT, manifest TEXT);
        CREATE TABLE attempts(attempt_id INTEGER PRIMARY KEY, run_id TEXT, data TEXT);
        CREATE TABLE cases(tree_id TEXT);
    """)
    manifests = [
        {
            "run_id": name,
            "started_at": f"2026-11-0{i}T00:00:00+00:00",
            "stop_reason": "case_limit",
            "config": {"campaign": "test"},
        }
        for i, name in enumerate(("first", "second"), 1)
    ]
    database.executemany(
        "INSERT INTO runs VALUES (?,?)", [(m["run_id"], json.dumps(m)) for m in manifests]
    )
    database.executemany("INSERT INTO cases VALUES (?)", [(name,) for name in "ABCDEF"])
    attempts = [
        ("first", "A", "unknown", "graceful"),
        ("first", "B", "verified_graceful", "graceful"),
        ("first", "C", "solver_infeasible", "extreme_edge"),
        ("second", "A", "verified_graceful", "graceful"),
        ("second", "C", "unknown", "graceful"),
        ("second", "D", "error", "graceful"),
        ("second", "B", "unknown", "graceful"),
        ("second", "A", "solver_infeasible", "extreme_edge"),
        ("second", "E", "verified_graceful", "extreme_edge"),
    ]
    for index, (run_id, tree_id, status, scope) in enumerate(attempts, 1):
        record = {
            "attempt_id": index,
            "tree_id": tree_id,
            "scope": scope,
            "status": status,
            "family": "path",
            "input": {"n": 4},
            "features": {},
            "wall_seconds": 1,
            "solver_wall_seconds": 0.9,
            "timed_out": index in {1, 7},
        }
        database.execute("INSERT INTO attempts VALUES (?,?,?)", (index, run_id, json.dumps(record)))
    return database, manifests[-1]


def test_cumulative_progress_counts_witnesses_without_double_counting_retries():
    database, manifest = evidence_database()
    try:
        data = build_progress(database, manifest)
    finally:
        database.close()
    totals = data["cumulative"]
    assert totals == {
        "trees": 4,
        "verified_graceful": 2,
        "unknown": 1,
        "solver_infeasible": 0,
        "errors": 1,
        "attempts": 9,
        "unrestricted_attempts": 6,
        "restricted_attempts": 3,
        "timeout_attempts": 2,
        "restricted_solver_infeasible": 2,
        "runs": 2,
        "catalogued_trees": 6,
    }
    assert data["current_run"]["trees"] == 4
    assert data["current_run"]["verified_graceful"] == 1
    assert data["current_run"]["unknown"] == 2
    assert [r["trees"] for r in data["history"]] == [2, 4]
    assert [r["verified_graceful"] for r in data["history"]] == [1, 2]
    assert [r["new_verified"] for r in data["history"]] == [1, 1]
    assert data["certificate_verified_infeasible"] == 0
    assert len(data["runtime"]) == 4  # Only this run's unrestricted attempts.
    assert sum(r["trees"] for r in data["sizes"]) == 4
    assert sum(r["trees"] for r in data["families"]) == 4


def test_empty_progress_and_headless_charts(tmp_path):
    database, manifest = evidence_database()
    database.execute("DELETE FROM attempts")
    database.execute("DELETE FROM cases")
    data = build_progress(database, manifest)
    database.close()
    assert data["cumulative"]["trees"] == 0
    assert data["sizes"] == []
    assert data["family_sizes"] == []
    write_figures(tmp_path, data)
    assert (tmp_path / "figures/overview.png").read_bytes().startswith(b"\x89PNG")
    for name in ("progress", "sizes", "families", "runtime"):
        assert "<svg" in (tmp_path / f"figures/{name}.svg").read_text()


def test_offline_html_escapes_data_and_embeds_chart_sources(tmp_path):
    database, manifest = evidence_database()
    manifest["config"]["campaign"] = '</script><script src="https://invalid.example/evil"></script>'
    data = build_progress(database, manifest)
    database.close()
    (tmp_path / "figures").mkdir()
    for name in ("progress", "sizes", "families", "runtime"):
        (tmp_path / f"figures/{name}.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    write_dashboard(tmp_path, manifest, data, {"difficult": []})
    document = (tmp_path / "report.html").read_text()
    assert document.count('src="data:image/svg+xml;base64,') == 4
    assert '<script src="https://' not in document
    assert "&lt;/script&gt;" in document
    embedded = re.search(
        r'<script id="progress-data" type="application/json">(.*?)</script>', document, re.S
    )
    assert json.loads(embedded[1]) == data
    assert 'id="family-filter"' in document and 'id="size-filter"' in document
    assert "not an independently checked proof" in document
