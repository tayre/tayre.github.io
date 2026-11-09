"""Strict, versioned experiment configuration; JSON needs no extra parser."""

import hashlib
import importlib.metadata
import json
import math
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

FAMILIES = (
    "path",
    "star",
    "binary_heap",
    "prufer",
    "recursive",
    "spider",
    "caterpillar",
    "lobster",
    "broom",
    "double_star",
)


@dataclass
class Config:
    schema_version: int = 1
    campaign: str = "nightly-v1"
    seed: int = 20261108
    budget_seconds: float = 1800
    finalize_reserve_seconds: float = 10
    attempt_seconds: float = 5
    retry_seconds: float = 30
    retry_budget_fraction: float = 0.2
    probe_budget_fraction: float = 0.1
    max_cases: int = 1000
    max_generated: int = 10000
    max_retries: int = 12
    max_attempts_per_case: int = 4
    exhaustive_sizes: list[int] = field(default_factory=lambda: list(range(1, 11)))
    sample_sizes: list[int] = field(default_factory=lambda: [20, 35, 50, 75])
    families: list[str] = field(default_factory=lambda: list(FAMILIES))
    probe_max_n: int = 10
    probe_max_attempts: int = 40
    complement_break: bool = True
    redundant_sum: bool = True
    constructive_search: bool = True
    frontier_search: bool = True
    frontier_max_nodes: int = 40000
    frontier_algorithm: str = "portfolio-frontier-v3"
    swap_objective: str = "missing_sum"
    swap_proposal_policy: str = "uniform"
    backend: str = "cp-sat"
    probe_backend: str = "same"
    certify_infeasible: bool = True

    def validate(self):
        for name, low, high in (
            ("schema_version", 1, 1),
            ("seed", 0, 2**31 - 1),
            ("max_cases", 1, 100000),
            ("max_generated", 1, 1000000),
            ("max_retries", 0, 10000),
            ("max_attempts_per_case", 1, 100),
            ("probe_max_n", 0, 32),
            ("probe_max_attempts", 0, 10000),
            ("frontier_max_nodes", 0, 1000000),
        ):
            value = getattr(self, name)
            if type(value) is not int or not low <= value <= high:
                raise ValueError(f"{name} must be an integer in [{low}, {high}]")
        for name, low, high in (
            ("budget_seconds", 0.1, 86400 * 7),
            ("finalize_reserve_seconds", 0.01, 600),
            ("attempt_seconds", 0.001, 86400),
            ("retry_seconds", 0.001, 86400),
            ("retry_budget_fraction", 0, 0.8),
            ("probe_budget_fraction", 0, 0.8),
        ):
            value = getattr(self, name)
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or not low <= value <= high
            ):
                raise ValueError(f"{name} must be finite and in [{low}, {high}]")
        if self.finalize_reserve_seconds >= self.budget_seconds:
            raise ValueError("finalize_reserve_seconds must be smaller than budget_seconds")
        if self.retry_budget_fraction + self.probe_budget_fraction >= 0.9:
            raise ValueError("reserve at least 10% of the compute window for new cases")
        if not isinstance(self.campaign, str) or not re.fullmatch(
            r"[a-zA-Z0-9_-]{1,64}", self.campaign
        ):
            raise ValueError("campaign must be 1..64 letters, digits, underscores or hyphens")
        for name, maximum in (("exhaustive_sizes", 16), ("sample_sizes", 256)):
            values = getattr(self, name)
            if (
                not isinstance(values, list)
                or any(type(n) is not int or not 1 <= n <= maximum for n in values)
                or len(values) != len(set(values))
            ):
                raise ValueError(f"{name} must contain distinct integers in [1, {maximum}]")
        if not isinstance(self.families, list) or any(f not in FAMILIES for f in self.families):
            raise ValueError(f"families must be drawn from {FAMILIES}")
        if len(set(self.families)) != len(self.families):
            raise ValueError("families must not repeat")
        for name in (
            "complement_break",
            "redundant_sum",
            "constructive_search",
            "frontier_search",
            "certify_infeasible",
        ):
            if type(getattr(self, name)) is not bool:
                raise ValueError(f"{name} must be boolean")
        if not isinstance(self.backend, str) or self.backend not in {"cp-sat", "sat"}:
            raise ValueError("backend must be cp-sat or sat")
        if not isinstance(self.frontier_algorithm, str) or self.frontier_algorithm not in {
            "descending-frontier-v1",
            "memo-frontier-v2",
            "portfolio-frontier-v3",
            "leaf-portfolio-v4",
            "label-swap-v1",
            "swap-portfolio-v5",
        }:
            raise ValueError("unsupported frontier_algorithm")
        if not isinstance(self.swap_objective, str) or self.swap_objective not in {
            "missing_sum",
            "missing_count",
        }:
            raise ValueError("unsupported swap_objective")
        if not isinstance(self.swap_proposal_policy, str) or self.swap_proposal_policy not in {
            "uniform",
            "missing_difference",
        }:
            raise ValueError("unsupported swap_proposal_policy")
        if not isinstance(self.probe_backend, str) or self.probe_backend not in {
            "same",
            "cp-sat",
            "sat",
        }:
            raise ValueError("probe_backend must be same, cp-sat or sat")
        if self.backend == "sat" and any(n > 75 for n in self.sample_sizes):
            raise ValueError("SAT sampling currently supports at most 75 vertices")
        if not self.exhaustive_sizes and not (self.sample_sizes and self.families):
            raise ValueError("at least one generation stream is required")
        return self

    def as_dict(self):
        return asdict(self)

    def generation_fingerprint(self):
        fields = (
            "schema_version",
            "campaign",
            "seed",
            "exhaustive_sizes",
            "sample_sizes",
            "families",
        )
        value = {name: getattr(self, name) for name in fields}
        value["generator_version"] = 1
        value["networkx_version"] = importlib.metadata.version("networkx")
        return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

    @classmethod
    def read(cls, path: Path):
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            raise ValueError("config must be a JSON object")
        unknown = set(data) - set(cls.__dataclass_fields__)
        if unknown:
            raise ValueError(f"unknown config fields: {sorted(unknown)}")
        return cls(**data).validate()
