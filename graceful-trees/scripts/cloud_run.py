"""Validate dispatch parameters as data, then invoke the ordinary portable CLI."""

import argparse
import math
import os
import subprocess
import sys
from pathlib import Path

from graceful_research.config import Config

MAX_CLOUD_MINUTES = 60

EXPERIMENTS = {
    "nightly",
    "smoke",
    "exhaustive-small",
    "edge-profiles",
    "sat-certificates",
    "leaf-tail",
    "swap-search",
    "bitset-search",
    "orbit-search",
}


def dispatch_config(experiment, minutes=None):
    if experiment not in EXPERIMENTS:
        raise ValueError("unknown workflow experiment")
    config = Path("configs") / f"{experiment}.json"
    # Scheduled events have no dispatch input: honor the versioned configuration.
    if minutes is None or minutes == "":
        minutes = Config.read(Path(__file__).resolve().parents[1] / config).budget_seconds / 60
    minutes = float(minutes)
    if not math.isfinite(minutes) or not 1 <= minutes <= MAX_CLOUD_MINUTES:
        raise ValueError(
            f"cloud runs allow 1..{MAX_CLOUD_MINUTES} minutes; use the CLI for longer budgets"
        )
    return config, minutes * 60


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args()
    config, seconds = dispatch_config(
        os.environ.get("EXPERIMENT") or "nightly", os.environ.get("MINUTES")
    )
    parsed = Config.read(config)
    if args.prepare:
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as handle:
            handle.write(f"campaign={parsed.campaign}\n")
        return 0
    command = [
        sys.executable,
        "-m",
        "graceful_research",
        "run",
        "--config",
        str(config),
        "--output",
        "results/current",
        "--budget-seconds",
        str(seconds),
    ]
    checkpoint = Path("results/previous.sqlite")
    if checkpoint.exists():
        command += ["--resume", str(checkpoint)]
    return subprocess.call(command)


if __name__ == "__main__":
    raise SystemExit(main())
