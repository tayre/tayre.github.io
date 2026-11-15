"""Small metadata bundles preserve the original audit and full-results links."""

import hashlib
import io
import json
import math
import zipfile

import pytest
from test_cloud import load_script

packager = load_script("package_publication")
dashboard = load_script("publish_dashboard")
notifier = load_script("notify_findings")


@pytest.fixture
def source(tmp_path):
    environment = {
        "GITHUB_REPOSITORY": "owner/repo",
        "GITHUB_SHA": "a" * 40,
        "GITHUB_RUN_ID": "123",
        "GITHUB_RUN_ATTEMPT": "1",
        "GITHUB_REF": "refs/heads/master",
        "GITHUB_REF_NAME": "master",
        "GITHUB_TOKEN": "unused-fixture-token",
        "RESULTS_ARTIFACT_ID": "456",
        "AUDIT_OUTCOME": "success",
        "RESEARCH_OUTCOME": "success",
        "ALERT_RECIPIENT": "owner",
        "GITHUB_STEP_SUMMARY": str(tmp_path / "step-summary.md"),
    }
    identity = {"schema_version": 1, "run_id": "run-current", "campaign": "nightly-v1"}
    documents = {
        "manifest.json": {
            "run_id": identity["run_id"],
            "config": {"campaign": identity["campaign"], "seed": 17, "budget_seconds": 3600},
            "provenance": {
                "github": {
                    key: environment[key]
                    for key in (
                        "GITHUB_REPOSITORY",
                        "GITHUB_SHA",
                        "GITHUB_RUN_ID",
                        "GITHUB_RUN_ATTEMPT",
                        "GITHUB_REF",
                    )
                },
                "dependencies": {"networkx": "3.5", "ortools": "9.14.6206"},
            },
            "started_at": "2026-11-14T00:00:00+00:00",
            "finished_at": "2026-11-14T01:00:00+00:00",
            "elapsed_seconds": 3600,
            "stop_reason": "budget",
            "exhaustive_coverage": {},
        },
        "analysis.json": {"observations": {"difficult": []}, "suggestions": []},
        "progress.json": {
            **identity,
            "basis": "unrestricted trees only",
            "cumulative": {},
            "current_run": {},
            "history": [],
            "sizes": [],
            "families": [],
            "family_sizes": [],
            "certificate_verified_infeasible": 0,
        },
        "findings.json": {
            **identity,
            "findings": [notifier.operational_finding("nightly-v1", "revision", "Test fixture.")],
        },
        "audit.json": {
            "valid": True,
            "certificates_checked": 10,
            "cumulative_labelings_checked": 20,
            "infeasibility_proofs_checked": 3,
        },
    }
    directory = tmp_path / "run"
    directory.mkdir()
    for name, document in documents.items():
        (directory / name).write_bytes((json.dumps(document, indent=4) + "\n\n").encode())
    (directory / "report.html").write_text("Full report stays in original artifact.")
    rehash(directory)
    return directory, environment


def rehash(directory):
    hashes = {
        name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
        for name in packager.HASHED_EVIDENCE
    }
    # Unselected entries may name artifacts unavailable to this transport step.
    hashes["attempts/unselected/model.pbtxt"] = "e" * 64
    (directory / "checksums.json").write_text(json.dumps(hashes))


def archive(directory):
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in (*packager.SELECTED, "checksums.json"):
            bundle.writestr("current/" + name, (directory / name).read_bytes())
    return result.getvalue()


def test_bundle_preserves_bytes_and_both_existing_readers_accept_it(source, tmp_path):
    directory, environment = source
    output = tmp_path / "publication"
    before = {name: (directory / name).read_bytes() for name in packager.SELECTED}
    result = packager.package_publication(directory, output)
    current = output / "current"
    assert sorted(path.name for path in current.iterdir()) == sorted(
        [*packager.SELECTED, "checksums.json"]
    )
    assert result["bytes"] == sum(path.stat().st_size for path in current.iterdir())
    hashes = json.loads((current / "checksums.json").read_bytes())
    assert set(hashes) == set(packager.SELECTED)
    for name, raw in before.items():
        assert (current / name).read_bytes() == raw == (directory / name).read_bytes()
        assert hashes[name] == hashlib.sha256(raw).hexdigest()
    zipped = archive(current)
    evidence = dashboard.read_evidence(zipped, environment)
    assert evidence["audit.json"]["valid"] is True
    assert notifier.read_evidence(zipped, 123)["run_id"] == "run-current"
    assert dashboard.snapshot(evidence, 456)["workflow"]["artifact_url"].endswith("/artifacts/456")
    assert (directory / "report.html").exists()
    assert not (current / "report.html").exists()


@pytest.mark.parametrize("name", packager.HASHED_EVIDENCE)
def test_changed_audited_bytes_fail_before_output_is_created(source, tmp_path, name):
    directory, _ = source
    with (directory / name).open("ab") as handle:
        handle.write(b" ")
    output = tmp_path / "publication"
    with pytest.raises(ValueError, match="checksum mismatch"):
        packager.package_publication(directory, output)
    assert not output.exists()


@pytest.mark.parametrize("valid", [False, None, 1, "true"])
def test_only_exact_positive_audit_allows_packaging(source, tmp_path, valid):
    directory, _ = source
    (directory / "audit.json").write_text(json.dumps({"valid": valid}))
    with pytest.raises(ValueError, match="valid independent audit"):
        packager.package_publication(directory, tmp_path / "publication")


def test_missing_required_checksum_is_not_replaced_with_a_new_untrusted_hash(source, tmp_path):
    directory, _ = source
    hashes = json.loads((directory / "checksums.json").read_text())
    del hashes["progress.json"]
    (directory / "checksums.json").write_text(json.dumps(hashes))
    with pytest.raises(ValueError, match="checksum mismatch: progress.json"):
        packager.package_publication(directory, tmp_path / "publication")


def test_optional_original_audit_hash_is_verified_if_present(source, tmp_path):
    directory, _ = source
    hashes = json.loads((directory / "checksums.json").read_text())
    hashes["audit.json"] = "0" * 64
    (directory / "checksums.json").write_text(json.dumps(hashes))
    with pytest.raises(ValueError, match="checksum mismatch: audit.json"):
        packager.package_publication(directory, tmp_path / "publication")


@pytest.mark.parametrize("name", ["manifest.json", "checksums.json", "audit.json"])
def test_source_symlink_files_are_rejected(source, tmp_path, name):
    directory, _ = source
    actual = tmp_path / ("real-" + name)
    (directory / name).rename(actual)
    (directory / name).symlink_to(actual)
    with pytest.raises(ValueError, match="symlink"):
        packager.package_publication(directory, tmp_path / "publication")


def test_source_symlink_parent_and_nonregular_files_are_rejected(source, tmp_path):
    directory, _ = source
    alias = tmp_path / "alias"
    alias.symlink_to(directory.parent, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        packager.package_publication(alias / directory.name, tmp_path / "publication")
    (directory / "manifest.json").unlink()
    (directory / "manifest.json").mkdir()
    with pytest.raises(ValueError, match="regular file"):
        packager.package_publication(directory, tmp_path / "publication")


def test_output_cannot_replace_source_or_an_existing_bundle(source, tmp_path):
    directory, _ = source
    with pytest.raises(ValueError, match="outside the audited source"):
        packager.package_publication(directory, directory / "publication")
    output = tmp_path / "publication"
    packager.package_publication(directory, output)
    with pytest.raises(ValueError, match="existing publication bundle"):
        packager.package_publication(directory, output)


def test_large_original_checksum_index_becomes_a_small_subset(source, tmp_path):
    directory, environment = source
    with (directory / "checksums.json").open("ab") as handle:
        handle.write(b" " * (9 * 1024 * 1024))
    # Historical full artifacts can still be read under the separate 64 MiB cap.
    historical = archive(directory)
    assert dashboard.read_evidence(historical, environment)["audit.json"]["valid"]
    assert notifier.read_evidence(historical, 123)["run_id"] == "run-current"
    output = tmp_path / "publication"
    packager.package_publication(directory, output)
    assert (output / "current/checksums.json").stat().st_size < 1024
    assert len(archive(output / "current")) < 10000


def test_metadata_above_the_old_eight_mib_limit_round_trips(source, tmp_path):
    directory, environment = source
    manifest = json.loads((directory / "manifest.json").read_text())
    manifest["ignored_padding"] = "x" * (9 * 1024 * 1024)
    (directory / "manifest.json").write_text(json.dumps(manifest))
    rehash(directory)
    output = tmp_path / "publication"
    packager.package_publication(directory, output)
    zipped = archive(output / "current")
    evidence = dashboard.read_evidence(zipped, environment)
    assert notifier.read_evidence(zipped, 123)["run_id"] == "run-current"
    assert "ignored_padding" not in dashboard.snapshot(evidence, 456)
    for module in (packager, dashboard, notifier):
        assert module.MAX_METADATA_BYTES == 32 * 1024 * 1024
        assert module.MAX_CHECKSUM_BYTES == 64 * 1024 * 1024


@pytest.mark.parametrize(
    "name,limit_name",
    [("manifest.json", "MAX_METADATA_BYTES"), ("checksums.json", "MAX_CHECKSUM_BYTES")],
)
def test_bounded_reads_still_reject_oversized_files(
    source, tmp_path, monkeypatch, name, limit_name
):
    directory, environment = source
    limit = (directory / name).stat().st_size - 1
    monkeypatch.setattr(packager, limit_name, limit)
    with pytest.raises(ValueError, match="oversized"):
        packager.package_publication(directory, tmp_path / "publication")
    zipped = archive(directory)
    for module, argument in ((dashboard, environment), (notifier, 123)):
        monkeypatch.setattr(module, limit_name, limit)
        with pytest.raises(ValueError, match="oversized"):
            module.read_evidence(zipped, argument)


def test_bundle_audit_bytes_are_also_checked_by_both_consumers(source, tmp_path):
    directory, environment = source
    output = tmp_path / "publication"
    packager.package_publication(directory, output)
    with (output / "current/audit.json").open("ab") as handle:
        handle.write(b" ")
    zipped = archive(output / "current")
    for module, argument in ((dashboard, environment), (notifier, 123)):
        with pytest.raises(ValueError, match="checksum mismatch: audit.json"):
            module.read_evidence(zipped, argument)


@pytest.mark.parametrize("publication_id", [None, "", "999"])
def test_dashboard_downloads_small_bundle_but_links_full_results(
    source, monkeypatch, publication_id
):
    directory, environment = source
    for key, value in environment.items():
        monkeypatch.setenv(key, value)
    if publication_id is None:
        monkeypatch.delenv("PUBLICATION_ARTIFACT_ID", raising=False)
    else:
        monkeypatch.setenv("PUBLICATION_ARTIFACT_ID", publication_id)
    calls = []

    def fetch(url, token, *, binary=False):
        assert binary
        calls.append(url)
        return archive(directory)

    def publish(feed, token):
        assert feed["workflow"]["artifact_url"].endswith("/artifacts/456")
        return {"published": True, "url": "https://example.invalid/feed.json"}

    monkeypatch.setattr(dashboard, "get", fetch)
    monkeypatch.setattr(dashboard, "publish", publish)
    assert dashboard.main() == 0
    assert calls == [
        f"https://api.github.com/repos/owner/repo/actions/artifacts/{publication_id or '456'}/zip"
    ]


@pytest.mark.parametrize("publication_id", [None, "", "999"])
def test_notification_downloads_small_bundle_and_retains_full_archive_link(source, publication_id):
    directory, environment = source
    if publication_id is not None:
        environment["PUBLICATION_ARTIFACT_ID"] = publication_id
    calls, payloads = [], []

    def fetch(url, token, *, binary=False):
        if binary:
            calls.append(url)
            return archive(directory)
        return []

    def create(url, token, payload):
        payloads.append(payload)
        return {"html_url": "https://github.com/owner/repo/issues/1"}

    result = notifier.review(environment, fetch, create)
    assert result["new_findings"] == 1
    assert calls == [
        f"https://api.github.com/repos/owner/repo/actions/artifacts/{publication_id or '456'}/zip"
    ]
    assert "/artifacts/456" in payloads[0]["body"]
    assert "/artifacts/999" not in payloads[0]["body"]


def test_public_focused_summaries_whitelist_only_counts_times_and_run_ids(source):
    directory, environment = source
    evidence = dashboard.read_evidence(archive(directory), environment)
    evidence["progress.json"]["focused_studies"] = {
        "pendant": {
            "run_id": "run-pendant",
            "summary": {
                "trees_reviewed": 4,
                "targets": 3,
                "outcomes": {"supported": 2, "incomplete": 2, "private_path": "/secret"},
            },
            "directory": "/secret",
        },
        "matching": {
            "run_id": "run-matching",
            "summary": {
                "pairs_started": 3,
                "pairs_completed": 2,
                "comparison": {
                    "both_verified": 1,
                    "matching_only": 1,
                    "baseline_only": 0,
                    "status_counts": {
                        "baseline": {"verified_graceful": 1, "unknown": 1},
                        "private_path": "/secret",
                    },
                    "fully_solved_times": {
                        "pairs": 1,
                        "scope": "private text",
                        "baseline": {
                            "total_seconds": 2.5,
                            "median_seconds": 2.5,
                            "directory": "/secret",
                        },
                        "matching_first": {"total_seconds": 0.3, "median_seconds": 0.3},
                    },
                    "by_stratum": {
                        "matching_rich": {"both_verified": 1, "request": {"token": "secret"}},
                        "private_path": "/secret",
                    },
                    "raw_response": "secret",
                },
            },
        },
        "residual": {
            "run_id": "run-residual",
            "summary": {
                "trace_inputs": 3,
                "unknown_trace_inputs": 1,
                "residuals": 4,
                "records": ["secret"],
            },
        },
        "unrecognized": {"run_id": "secret", "summary": {}},
    }
    feed = dashboard.snapshot(evidence, 456)
    selected = feed["focused_studies"]
    assert set(selected) == {"pendant", "matching", "residual"}
    assert selected["pendant"]["summary"]["outcomes"] == {"supported": 2, "incomplete": 2}
    assert selected["matching"]["summary"]["comparison"]["fully_solved_times"]["baseline"] == {
        "total_seconds": 2.5,
        "median_seconds": 2.5,
    }
    assert selected["residual"]["summary"] == {
        "trace_inputs": 3,
        "unknown_trace_inputs": 1,
        "residuals": 4,
    }
    serialized = json.dumps(selected)
    for excluded in ("secret", "private", "directory", "request", "raw_response", "unrecognized"):
        assert excluded not in serialized


@pytest.mark.parametrize("value", [True, -1, 0.5, math.nan, "secret", {"directory": "/secret"}])
def test_invalid_public_focused_counts_fail_closed(value):
    with pytest.raises(ValueError, match="invalid focused count"):
        dashboard.focused_studies(
            {"residual": {"run_id": "run-r", "summary": {"residuals": value}}}
        )


def test_invalid_public_focused_identity_and_nonfinite_times_fail_closed():
    with pytest.raises(ValueError, match="run identity"):
        dashboard.focused_studies({"pendant": {"run_id": "/secret/path", "summary": {}}})
    with pytest.raises(ValueError, match="timing summary"):
        dashboard.focused_studies(
            {
                "matching": {
                    "run_id": "run-m",
                    "summary": {
                        "comparison": {
                            "fully_solved_times": {"baseline": {"total_seconds": math.inf}}
                        }
                    },
                }
            }
        )


def test_residual_summary_exports_classifications_without_whole_tree_claims():
    summary = {
        "trace_inputs": 3,
        "unknown_trace_inputs": 1,
        "unclassified_snapshots": 2,
        "residuals": 4,
        "completable": 1,
        "impossible_partial": 3,
        "locally_feasible_but_incompatible": 2,
        "congruence_certificates": 2,
        "relaxation_certificates": 4,
        "whole_tree_infeasibility_claims": 0,
        "novelty_claimed": False,
    }
    source = {"residual": {"run_id": "run-r", "summary": summary}}
    assert dashboard.focused_studies(source)["residual"]["summary"] == summary
    for key, value in (("whole_tree_infeasibility_claims", 1), ("novelty_claimed", True)):
        with pytest.raises(ValueError):
            dashboard.focused_studies(
                {"residual": {"run_id": "run-r", "summary": {**summary, key: value}}}
            )


def test_cli_produces_expected_current_directory(source, tmp_path, capsys):
    directory, _ = source
    output = tmp_path / "publication"
    assert packager.main(["--source", str(directory), "--output", str(output)]) == 0
    assert (output / "current/manifest.json").exists()
    assert json.loads(capsys.readouterr().out)["files"] == [
        f"current/{name}" for name in sorted([*packager.SELECTED, "checksums.json"])
    ]
