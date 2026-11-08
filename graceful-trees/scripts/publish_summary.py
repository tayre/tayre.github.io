"""Link downloadable visual reports from Actions without broken local image URLs."""

import os
import re
from pathlib import Path
from urllib.parse import urlsplit


def workflow_summary(report, artifact_url=""):
    # Files within an artifact are not public image URLs. Keep the ordinary report
    # intact on disk, but omit those relative links from GitHub's job summary.
    lines = []
    for line in report.splitlines():
        if line.startswith("[Open the offline visual progress report]") or line.startswith("!["):
            continue
        lines.append(re.sub(r"\[([^\]]+)\]\(inputs/[^)]+\)", r"`\1`", line))
    intro = ["## Visual progress report", ""]
    parsed = urlsplit(artifact_url)
    if (
        parsed.scheme == "https"
        and parsed.netloc == "github.com"
        and re.fullmatch(r"[A-Za-z0-9_./:%?=&+~-]+", artifact_url.removeprefix("https://"))
    ):
        intro.append(f"[Download the complete results artifact]({artifact_url}).")
    else:
        intro.append(
            "Download the results artifact from this workflow run's **Artifacts** section, if available."
        )
    intro.extend(
        [
            "Extract the ZIP and open **report.html** for offline charts and family/size filters.",
            "Exportable figures are in **figures/**; **progress.json** contains the audited chart data.",
            "",
            "---",
            "",
        ]
    )
    return "\n".join(intro + lines) + "\n"


def main():
    report = Path("results/current/report.md")
    if not report.is_file():
        return
    text = workflow_summary(report.read_text(), os.environ.get("RESULTS_ARTIFACT_URL", ""))
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as handle:
        handle.write(text)


if __name__ == "__main__":
    main()
