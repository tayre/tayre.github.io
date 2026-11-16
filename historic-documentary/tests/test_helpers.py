"""Exercise overwrite protection, recovery integrity and resource failure paths."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

FRAMEWORK = Path(__file__).resolve().parents[1]


class ProjectHelpers(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="documentary-framework-test-")
        self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name) / "project"
        self.run_script("new_project.py", self.project, "--title", "Test project")
        path = self.project / "production/brief.json"
        brief = json.loads(path.read_text())
        brief["limits"]["protected_free_gib"] = 0
        path.write_text(json.dumps(brief))

    def run_script(self, name, *args, expected=0):
        result = subprocess.run([sys.executable, str(FRAMEWORK / "scripts" / name),
                                 *map(str, args)], capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def test_snapshot_and_existing_destination(self):
        record = json.loads((self.project / "framework-snapshot.json").read_text())
        for name, expected in record["files_sha256"].items():
            self.assertEqual(hashlib.sha256((self.project / "framework" / name).read_bytes()).hexdigest(), expected)
        marker = self.project / "production/decisions.md"
        marker.write_text("Preserve my existing decisions")
        self.run_script("new_project.py", self.project, expected=2)
        self.assertEqual(marker.read_text(), "Preserve my existing decisions")

    def test_checkpoint_recovers_original_and_detects_corruption(self):
        note = self.project / "research/working.txt"
        note.write_text("Original source transcription")
        media = self.project / "assets/originals/example.bin"
        media.write_bytes(b"media retained in place")
        self.run_script("checkpoint.py", self.project, "save", "--label", "recovery-test")
        self.run_script("checkpoint.py", self.project, "verify")
        store = self.project / "checkpoints"
        record = json.loads((store / (store / "LATEST.txt").read_text().strip()).read_text())
        entry = next(e for e in record["editable_files"] if e["path"] == "research/working.txt")
        note.write_text("Revised transcription")
        saved = store / "objects" / entry["sha256"]
        self.assertEqual(saved.read_text(), "Original source transcription")
        self.assertTrue(any(e["path"] == "assets/originals/example.bin" for e in record["media_inventory"]))
        self.assertFalse(any(e["path"] == "assets/originals/example.bin" for e in record["editable_files"]))
        saved.write_text("corrupted")
        self.run_script("checkpoint.py", self.project, "verify", expected=1)

    def test_checkpoint_respects_disk_reserve(self):
        brief_path = self.project / "production/brief.json"
        brief = json.loads(brief_path.read_text())
        brief["limits"]["protected_free_gib"] = 10**12
        brief_path.write_text(json.dumps(brief))
        result = self.run_script("checkpoint.py", self.project, "save", expected=1)
        self.assertIn("Protected disk reserve", result.stderr)
        self.assertFalse((self.project / "checkpoints/LATEST.txt").exists())

    def test_native_timeline_and_explicit_bundle_are_recoverable(self):
        timeline = self.project / "edit/timeline.otio"
        timeline.write_text('{"OTIO_SCHEMA": "Timeline.1"}')
        bundle = self.project / "edit/editor-project.bundle"
        bundle.mkdir()
        (bundle / "database.unknown").write_bytes(b"native project database")
        brief_path = self.project / "production/brief.json"
        brief = json.loads(brief_path.read_text())
        brief["authoritative_timeline"] = "edit/timeline.otio"
        brief["checkpoint"]["additional_editable_paths"] = ["edit/editor-project.bundle"]
        brief_path.write_text(json.dumps(brief))
        self.run_script("checkpoint.py", self.project, "save")
        store = self.project / "checkpoints"
        record = json.loads((store / (store / "LATEST.txt").read_text().strip()).read_text())
        by_path = {e["path"]: e for e in record["editable_files"]}
        for name in ["edit/timeline.otio", "edit/editor-project.bundle/database.unknown"]:
            self.assertEqual((store / "objects" / by_path[name]["sha256"]).read_bytes(), (self.project / name).read_bytes())
        timeline.unlink()
        result = self.run_script("checkpoint.py", self.project, "save", expected=1)
        self.assertIn("Selected editable file is missing", result.stderr)

    def test_preflight_fails_for_missing_required_tool(self):
        result = self.run_script("preflight.py", self.project, "--require", "blender",
                                 "--blender", self.project / "missing-blender", expected=1)
        record = json.loads(result.stdout)
        self.assertIn("blender", record["missing_required_tools"])
        self.assertFalse(record["render_started"])


if __name__ == "__main__":
    unittest.main()
