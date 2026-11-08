"""Review audited research artifacts and mention the owner only for new findings.

Runs on GitHub with its automatic GITHUB_TOKEN; no local computer, LLM, personal
token, or email service is required. Existing bot issues are the delivery ledger.
"""

import hashlib
import io
import json
import os
import re
import urllib.request
import zipfile
from pathlib import Path

from restore_checkpoint import SafeRedirect, get

MARKER = "graceful-research-notices:v1:"


def post(url, token, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "graceful-tree-research",
        },
    )
    with urllib.request.build_opener(SafeRedirect()).open(request, timeout=30) as response:
        return json.load(response)


def read_evidence(data, workflow_run):
    names = ("manifest.json", "findings.json", "audit.json", "checksums.json")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        contents = {}
        for name in names:
            path = f"current/{name}"
            if archive.namelist().count(path) != 1:
                raise ValueError(f"missing or duplicated evidence file: {name}")
            if archive.getinfo(path).file_size > 8 * 1024 * 1024:
                raise ValueError(f"oversized evidence file: {name}")
            contents[name] = archive.read(path)
    parsed = {name: json.loads(raw) for name, raw in contents.items()}
    for name in ("manifest.json", "findings.json"):
        if hashlib.sha256(contents[name]).hexdigest() != parsed["checksums.json"].get(name):
            raise ValueError(f"evidence checksum mismatch: {name}")
    manifest, findings = parsed["manifest.json"], parsed["findings.json"]
    saved_run = manifest.get("provenance", {}).get("github", {}).get("GITHUB_RUN_ID")
    if str(saved_run) != str(workflow_run):
        raise ValueError("evidence is from another workflow run")
    if findings.get("schema_version") != 1 or findings.get("run_id") != manifest["run_id"]:
        raise ValueError("finding schema or run mismatch")
    if findings.get("campaign") != manifest["config"]["campaign"]:
        raise ValueError("finding campaign mismatch")
    if parsed["audit.json"].get("valid") is not True:
        raise ValueError("evidence audit failed")
    return findings


def operational_finding(campaign, revision, reason):
    key = hashlib.sha256(f"{campaign}:operational:{revision}:{reason}".encode()).hexdigest()
    return {
        "key": key,
        "kind": "integrity_or_run_failure",
        "title": "Research run needs operational review",
        "significance": f"{reason} This is an operational alert, not a mathematical finding.",
        "next_step": "Inspect the workflow and audit before trusting or promoting its results.",
        "attempt_ids": [],
    }


def previous_keys(issues):
    keys = set()
    for issue in issues:
        if issue.get("pull_request") or issue.get("user", {}).get("login") != "github-actions[bot]":
            continue
        for encoded in re.findall(
            r"<!-- " + re.escape(MARKER) + r"(.*?) -->", issue.get("body") or "", re.S
        ):
            try:
                values = json.loads(encoded)
                if isinstance(values, list):
                    keys.update(
                        value
                        for value in values
                        if isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)
                    )
            except ValueError:
                continue
    return keys


def issue_body(findings, keys, recipient, run_url, artifact_url):
    lines = [
        f"@{recipient} — the scheduled research review found {len(findings)} new item(s) worth attention.",
        "",
        f"[Workflow run]({run_url})",
    ]
    if artifact_url:
        lines += [
            f"[Download the visual report and evidence]({artifact_url}). Extract the ZIP and open `current/report.html`."
        ]
    lines += ["", "## Items to review", ""]
    for finding in findings[:10]:
        lines += [
            f"- **{finding['title']}** — {finding['significance']}",
            f"  Next: {finding['next_step']}",
        ]
        if finding.get("tree_id"):
            lines.append(
                f"  Tree `{finding['tree_id']}`; attempt IDs `{', '.join(map(str, finding['attempt_ids']))}` in the cumulative `research.sqlite`."
            )
    if len(findings) > 10:
        lines += [
            "",
            f"{len(findings) - 10} additional items are recorded in `current/findings.json`.",
        ]
    lines += [
        "",
        "Timeouts are unresolved. Restricted-edge infeasibility does not exclude gracefulness.",
        "A CP-SAT infeasibility result is not an independently certified counterexample. These alerts do not assert mathematical novelty.",
        "",
        f"<!-- {MARKER}{json.dumps(keys)} -->",
        "",
    ]
    return "\n".join(lines)


def publish(
    repository, branch, recipient, token, findings, run_id, artifact_id, fetch=get, create=post
):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("invalid repository")
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", recipient):
        raise ValueError("invalid alert recipient")
    run_url = f"https://github.com/{repository}/actions/runs/{int(run_id)}"
    artifact_url = f"{run_url}/artifacts/{int(artifact_id)}" if artifact_id else ""
    base = f"https://api.github.com/repos/{repository}"
    if not findings:
        return {"new_findings": 0, "issues_created": [], "reason": "nothing notable"}
    keyed = {}
    for finding in findings:
        key = hashlib.sha256(f"{repository}:{branch}:{finding['key']}".encode()).hexdigest()
        keyed.setdefault(key, finding)
    seen = set()
    for page in range(1, 21):
        issues = fetch(f"{base}/issues?state=all&per_page=100&page={page}", token)
        seen.update(previous_keys(issues))
        if len(issues) < 100:
            break
    else:
        raise RuntimeError(
            "notification history exceeds 2000 issues; refusing blind duplicate alerts"
        )
    fresh = [(key, finding) for key, finding in keyed.items() if key not in seen]
    urls = []
    for start in range(0, len(fresh), 100):
        batch = fresh[start : start + 100]
        body = issue_body(
            [f for _, f in batch], [k for k, _ in batch], recipient, run_url, artifact_url
        )
        result = create(
            f"{base}/issues",
            token,
            {
                "title": f"[Graceful trees] {len(batch)} new research review item(s)",
                "body": body,
            },
        )
        urls.append(result["html_url"])
    return {
        "new_findings": len(fresh),
        "issues_created": urls,
        "reason": "published" if fresh else "all findings already reported",
    }


def review(environ, fetch=get, create=post):
    repository = environ["GITHUB_REPOSITORY"]
    token = environ["GITHUB_TOKEN"]
    run_id = int(environ["GITHUB_RUN_ID"])
    artifact_id = environ.get("RESULTS_ARTIFACT_ID", "")
    campaign = environ.get("CAMPAIGN") or "unknown-campaign"
    revision = environ["GITHUB_SHA"]
    reason = None
    findings = []
    if environ.get("AUDIT_OUTCOME") == "failure":
        reason = "The independent evidence audit failed."
    elif environ.get("RESEARCH_OUTCOME") == "failure":
        reason = "The research workflow did not finish successfully."
    elif environ.get("RESEARCH_OUTCOME") in {"cancelled", "skipped"}:
        return {"new_findings": 0, "issues_created": [], "reason": "research cancelled or skipped"}
    elif artifact_id and environ.get("AUDIT_OUTCOME") == "success":
        data = fetch(
            f"https://api.github.com/repos/{repository}/actions/artifacts/{int(artifact_id)}/zip",
            token,
            binary=True,
        )
        try:
            evidence = read_evidence(data, run_id)
            findings = evidence["findings"]
        except (ValueError, KeyError, TypeError, zipfile.BadZipFile):
            reason = "The exported evidence could not be validated for notification."
    else:
        reason = "No audited research artifact was available."
    if reason:
        findings = [operational_finding(campaign, revision, reason)]
    return publish(
        repository,
        environ["GITHUB_REF_NAME"],
        environ["ALERT_RECIPIENT"],
        token,
        findings,
        run_id,
        artifact_id,
        fetch,
        create,
    )


def main():
    try:
        result = review(os.environ)
        print(json.dumps(result, indent=2))
        lines = [
            "## Research notifications",
            "",
            f"Review: **{result['reason']}**.",
            f"New review items: **{result['new_findings']}**.",
        ]
        lines += [f"- [Notification issue]({url})" for url in result["issues_created"]]
        status = 0
    except Exception as exc:
        # Never print the token, headers, response bodies, or environment.
        print(f"::warning::Research notification delivery failed ({type(exc).__name__}).")
        lines = [
            "## Research notifications",
            "",
            "Notification delivery failed. Research evidence is preserved; later reviews retry findings retained in successful checkpoints.",
        ]
        status = 1
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as handle:
        handle.write("\n".join(lines) + "\n")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
