"""Cloud tracks stay isolated, bounded and separate from the nightly campaign."""

import re
from pathlib import Path

import yaml

PROJECT = Path(__file__).resolve().parents[1]


def test_cloud_tracks_are_independent_bounded_and_read_only():
    path = PROJECT.parent / ".github/workflows/graceful-experiments.yml"
    if not path.exists():
        path = PROJECT / "workflows/graceful-experiments.yml"
    workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
    assert set(workflow["on"]) == {"push", "workflow_dispatch"}
    assert workflow["permissions"] == {"contents": "read"}
    job = workflow["jobs"]["experiment"]
    assert job["strategy"]["fail-fast"] == "false"
    tracks = job["strategy"]["matrix"]["include"]
    assert len(tracks) == int(job["strategy"]["max-parallel"]) == 3
    assert len(tracks) * int(job["timeout-minutes"]) <= 30
    assert {track["experiment"] for track in tracks} == {
        "matching-lift",
        "spider-roots",
        "residual-congruence",
    }
    for track in tracks:
        assert (PROJECT / "scripts" / track["script"]).is_file()
        assert (PROJECT / "tests" / track["test"]).is_file()
    for step in job["steps"]:
        if "uses" in step:
            assert re.fullmatch(r"[\w/-]+@[a-f0-9]{40}", step["uses"])
    upload = next(
        step for step in job["steps"] if step.get("uses", "").startswith("actions/upload-artifact@")
    )
    assert upload["if"] == "always()"
    assert "matrix.experiment" in upload["with"]["name"]
    assert upload["with"]["path"] == "graceful-trees/results/${{ matrix.experiment }}/"
