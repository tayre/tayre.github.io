"""Headless Matplotlib figures and an offline, accessible HTML progress report."""

import base64
import hashlib
import html
import json
import os
import sys
import tempfile
from pathlib import Path

from .io import write_json
from .progress import LABELS, OUTCOMES

COLORS = {
    "verified_graceful": "#087f73",
    "unknown": "#bc7900",
    "solver_infeasible": "#a94a18",
    "errors": "#b52349",
}
CHARTS = (
    (
        "progress",
        "Campaign progress",
        "Cumulative distinct trees across resumed runs; retries do not add new trees.",
    ),
    (
        "sizes",
        "Evidence by tree size",
        "Cumulative unrestricted results. No finite sample is a percentage of the conjecture proved.",
    ),
    (
        "families",
        "Coverage by generating family",
        "Cumulative trees, attributed to their first generator. Families can overlap mathematically.",
    ),
    (
        "runtime",
        "Search effort in this run",
        "Every unrestricted attempt, including retries and dispatch overhead. Unresolved runtimes are censored observations, not evidence against gracefulness.",
    ),
)


def draw_chart(ax, name, data):
    from matplotlib.ticker import MaxNLocator

    ax.set_facecolor("white")
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#cbd5df")
    ax.tick_params(colors="#425466", labelsize=11)
    ax.set_axisbelow(True)
    ax.grid(axis="x" if name == "families" else "y", color="#e8edf2", linewidth=0.7)
    ax.set_title(dict((n, title) for n, title, _ in CHARTS)[name], loc="left", pad=18)
    if name == "progress":
        rows = data["history"]
        for key, label, color, style in (
            ("trees", "Investigated", "#34558b", "-"),
            ("verified_graceful", "Verified graceful", COLORS["verified_graceful"], "--"),
            ("unknown", "Unresolved", COLORS["unknown"], ":"),
        ):
            ax.plot(
                [r["run"] for r in rows],
                [r[key] for r in rows],
                label=label,
                color=color,
                linestyle=style,
                marker="o",
                markersize=4,
            )
        ax.set(xlabel="Run number in this checkpoint", ylabel="Distinct trees", ylim=(0, None))
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        ax.legend(loc="upper left", fontsize=9, frameon=False)
    elif name in {"sizes", "families"}:
        rows = data[name]
        if name == "families":
            rows = sorted(rows, key=lambda r: (-r["trees"], r["family"]))
        positions = list(range(len(rows)))
        bottom = [0] * len(rows)
        for key in OUTCOMES:
            counts = [r[key] for r in rows]
            if name == "sizes":
                ax.bar(
                    positions,
                    counts,
                    bottom=bottom,
                    label=LABELS[key],
                    color=COLORS[key],
                    width=0.7,
                )
            else:
                ax.barh(
                    positions,
                    counts,
                    left=bottom,
                    label=LABELS[key],
                    color=COLORS[key],
                    height=0.65,
                )
            bottom = [a + b for a, b in zip(bottom, counts, strict=True)]
        if name == "sizes":
            ax.set_xticks(positions, [str(r["n"]) for r in rows])
            ax.set(xlabel="Vertices (n)", ylabel="Distinct trees", ylim=(0, None))
            ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        else:
            ax.set_yticks(positions, [r["family"].replace("_", " ") for r in rows])
            ax.invert_yaxis()
            ax.set(xlabel="Distinct trees", xlim=(0, None))
            ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        if not rows:
            ax.text(0.5, 0.5, "No unrestricted attempts yet", ha="center", transform=ax.transAxes)
        ax.legend(
            loc="upper center", bbox_to_anchor=(0.5, -0.19), ncols=2, fontsize=8, frameon=False
        )
    else:
        points = [r for r in data["runtime"] if r["wall_seconds"] is not None]
        for key, marker in zip(OUTCOMES, ("o", "x", "^", "s"), strict=True):
            rows = [r for r in points if r["status"] == key]
            if rows:
                ax.scatter(
                    [r["n"] for r in rows],
                    [r["wall_seconds"] for r in rows],
                    color=COLORS[key],
                    marker=marker,
                    s=30,
                    alpha=0.7,
                    label=LABELS[key],
                )
        ax.set(xlabel="Vertices (n)", ylabel="Observed attempt time (seconds)", ylim=(0, None))
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        if points:
            ax.legend(loc="upper left", fontsize=8, frameon=False)
        else:
            ax.text(
                0.5,
                0.5,
                "No timed unrestricted attempts in this run",
                ha="center",
                transform=ax.transAxes,
            )


def write_figures(output, data):
    # Reuse the font cache across worker/CLI processes. Rebuilding it during
    # shutdown can block signal finalization on platforms with slow font discovery.
    # Respect an operator's MPLCONFIGDIR; otherwise use an environment-specific
    # writable cache outside the immutable run evidence.
    identity = hashlib.sha256(sys.prefix.encode()).hexdigest()[:16]
    cache = Path(tempfile.gettempdir()) / f"graceful-matplotlib-{identity}"
    if not os.environ.get("MPLCONFIGDIR"):
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.environ["MPLCONFIGDIR"] = str(cache)
    import matplotlib as mpl
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure

    directory = output / "figures"
    directory.mkdir(exist_ok=True)
    style = {
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.titlesize": 15,
        "axes.titleweight": "bold",
        "axes.labelcolor": "#425466",
        "text.color": "#183148",
        "svg.fonttype": "none",
        "svg.hashsalt": "graceful-progress-v1",
    }
    with mpl.rc_context(style):
        for name, _, _ in CHARTS:
            figure = Figure(figsize=(7.8, 4.8), layout="constrained")
            FigureCanvasAgg(figure)
            draw_chart(figure.subplots(), name, data)
            figure.savefig(directory / f"{name}.svg", metadata={"Date": None})
            figure.clear()
        figure = Figure(figsize=(15.6, 10.4), layout="constrained")
        FigureCanvasAgg(figure)
        for ax, (name, _, _) in zip(figure.subplots(2, 2).flat, CHARTS, strict=True):
            draw_chart(ax, name, data)
        figure.suptitle(
            "Graceful tree research · progress snapshot", fontsize=20, fontweight="bold"
        )
        figure.savefig(directory / "overview.png", dpi=130)
        figure.clear()


def cell(value):
    return html.escape(str(value), quote=True)


def write_dashboard(output, manifest, data, summary):
    cumulative, current = data["cumulative"], data["current_run"]
    cards = "".join(
        f'<div class="metric"><span>{label}</span><strong>{value:,}</strong><small>{note}</small></div>'
        for label, value, note in (
            (
                "Trees investigated",
                cumulative["trees"],
                "Distinct unrestricted inputs · cumulative",
            ),
            (
                "Verified graceful",
                cumulative["verified_graceful"],
                "Positive labeling witnesses · cumulative",
            ),
            ("Unresolved", cumulative["unknown"], "No conclusion · cumulative"),
            ("Runs in checkpoint", cumulative["runs"], "Retained campaign history"),
        )
    )
    figures = []
    for name, title, description in CHARTS:
        encoded = base64.b64encode((output / "figures" / f"{name}.svg").read_bytes()).decode(
            "ascii"
        )
        figures.append(
            f'<figure><img src="data:image/svg+xml;base64,{encoded}" alt="{title}. {description}">'
            f"<figcaption>{description}</figcaption></figure>"
        )
    family_rows = []
    for row in data["family_sizes"]:
        seconds = row["solved_median_seconds"]
        family_rows.append(
            f'<tr data-family="{cell(row["family"])}" data-size="{row["n"]}">'
            + "".join(
                f"<td>{cell(v)}</td>"
                for v in (
                    row["family"],
                    row["n"],
                    row["trees"],
                    row["verified"],
                    row["unknown"],
                    row["solver_infeasible"],
                    row["errors"],
                    f"{seconds:.4f}" if seconds is not None else "—",
                )
            )
            + "</tr>"
        )
    family_options = "".join(
        f'<option value="{cell(r["family"])}">{cell(r["family"])}</option>'
        for r in data["families"]
    )
    size_options = "".join(f'<option value="{r["n"]}">{r["n"]}</option>' for r in data["sizes"])
    history_rows = "".join(
        "<tr>"
        + "".join(
            f"<td>{cell(v)}</td>"
            for v in (
                r["run"],
                r["started_at"],
                r["stop_reason"],
                r["new_trees"],
                r["new_verified"],
                r["trees"],
                r["verified_graceful"],
                r["unknown"],
            )
        )
        + "</tr>"
        for r in data["history"]
    )
    cases = "".join(
        f'<tr><td><a href="inputs/{cell(r["tree_id"])}.json">{cell(r["tree_id"][:12])}</a></td>'
        + "".join(
            f"<td>{cell(v)}</td>"
            for v in (
                r["input"]["n"],
                r["family"],
                LABELS.get(r["status"], r["status"]),
                f"{r.get('wall_seconds', 0):.3f}",
                r.get("branches", "—"),
            )
        )
        + "</tr>"
        for r in summary["difficult"]
    )
    payload = (
        json.dumps(data, sort_keys=True, allow_nan=False)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Graceful tree research — progress report</title>
<style>
:root{{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183148;background:#f2f5f8}}
*{{box-sizing:border-box}}body{{margin:0}}main{{max-width:1360px;margin:auto;padding:40px 28px 60px}}
h1{{font-size:clamp(28px,4vw,44px);margin:8px 0 12px;letter-spacing:-.04em}}h2{{font-size:23px;margin:0 0 10px}}p{{line-height:1.6}}
.eyebrow{{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#087f73;font-weight:750}}
.muted,figcaption,small{{color:#526579}}.meta{{overflow-wrap:anywhere;font-size:13px}}a{{color:#086d8c;text-underline-offset:3px}}
nav{{display:flex;gap:18px;flex-wrap:wrap;margin:20px 0}}.metrics,.charts{{display:grid;gap:18px}}.metrics{{grid-template-columns:repeat(4,1fr);margin:26px 0}}.charts{{grid-template-columns:repeat(2,minmax(0,1fr))}}
.metric,section,figure{{background:white;border:1px solid #dce4ec;border-radius:12px}}.metric{{padding:22px}}.metric span,.metric small{{display:block}}.metric span{{font-size:13px;font-weight:650}}.metric strong{{display:block;font-size:38px;margin:10px 0;font-variant-numeric:tabular-nums}}.metric small{{font-size:12px;line-height:1.5}}
.notice{{border-left:4px solid #bc7900;background:#fff8e8;padding:14px 20px;border-radius:4px;line-height:1.6;margin:20px 0}}
.family-scroll{{max-height:440px}}.family-scroll th{{position:sticky;top:0;z-index:1}}
figure{{margin:0;padding:16px;overflow:hidden}}figure img{{display:block;width:100%;height:auto}}figcaption{{font-size:13px;line-height:1.6;margin:8px 6px}}
section{{padding:24px;margin-top:20px}}.table-wrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-size:13px;text-align:left;font-variant-numeric:tabular-nums}}th{{color:#526579;background:#f6f8fa;white-space:nowrap}}th,td{{padding:12px 10px;border-bottom:1px solid #e8edf2}}td{{white-space:nowrap}}caption{{text-align:left;padding:0 0 12px;color:#526579}}.filters{{display:flex;gap:18px;flex-wrap:wrap;align-items:end;margin:20px 0}}label{{font-size:13px;display:grid;gap:6px}}select{{font:inherit;padding:9px 12px;border:1px solid #bdcbd8;border-radius:6px;background:white;min-width:150px}}:focus-visible{{outline:3px solid #087f73;outline-offset:3px}}summary{{cursor:pointer;font-weight:650}}.empty{{color:#526579;padding:16px}}footer{{font-size:13px;color:#526579;line-height:1.7;margin-top:24px}}
@media(max-width:850px){{.metrics{{grid-template-columns:repeat(2,1fr)}}.charts{{grid-template-columns:1fr}}}}@media(max-width:450px){{main{{padding:24px 14px}}section{{padding:18px}}.metric{{padding:16px}}.metric strong{{font-size:32px}}figure{{padding:8px}}}}
@media print{{body{{background:white}}main{{padding:0}}.filters,nav{{display:none}}section,figure,.metric{{break-inside:avoid}}.table-wrap{{overflow:visible}}.family-scroll{{max-height:none}}}}
</style></head><body><main>
<header><div class="eyebrow">Graceful tree research / progress snapshot</div><h1>Research progress</h1>
<p class="muted">Campaign <strong>{cell(data["campaign"])}</strong>. A saved snapshot of this run and its accumulated research history.</p>
<p class="meta">Run {cell(manifest["run_id"])}<br>Started {cell(manifest["started_at"])} · Stopped for {cell(manifest["stop_reason"])}</p>
<nav aria-label="Report downloads"><a href="report.md">Full written report</a><a href="progress.json">Chart data</a><a href="attempts.csv">Attempt CSV</a><a href="figures/overview.png">Download chart overview</a><a href="audit.json">Independent audit</a></nav></header>
<div class="metrics">{cards}</div>
<div class="notice"><strong>Evidence boundaries.</strong> Unresolved searches include timeouts. Solver-reported infeasibility is not an independently checked proof. No counterexample or universal proof is established by these charts.</div>
<section aria-labelledby="run-heading"><h2 id="run-heading">This run</h2>
<p>{current["trees"]:,} distinct unrestricted trees · {current["verified_graceful"]:,} verified graceful · {current["unknown"]:,} unresolved · {current["solver_infeasible"]:,} solver-infeasible · {current["errors"]:,} tree-level errors.</p>
<p>{current["attempts"]:,} attempts, including {current["restricted_attempts"]:,} restricted probes and {current["timeout_attempts"]:,} timed-out attempts. Restricted solver-infeasible attempts: {current["restricted_solver_infeasible"]:,}; these do not exclude gracefulness of the tree.</p>
<p class="muted">Cumulative unrestricted solver-infeasible trees: {cumulative["solver_infeasible"]:,}. Independently certified infeasible: <strong>0</strong> (unsupported). {cumulative["catalogued_trees"]:,} inputs are catalogued; only attempted unrestricted inputs contribute to the tree totals above.</p></section>
<div class="charts" style="margin-top:20px">{"".join(figures)}</div>
<section aria-labelledby="family-heading"><h2 id="family-heading">Compare families at the same size</h2>
<p class="muted">Cumulative distinct trees. Medians use CP-SAT time from the most recent successful attempt per solved tree. Constructed witnesses have no solver time; unresolved observations are excluded. These are not unbiased performance comparisons. Family is the first introducing generator.</p>
<div class="filters"><label for="family-filter">Generating family<select id="family-filter"><option value="">All families</option>{family_options}</select></label><label for="size-filter">Vertices<select id="size-filter"><option value="">All sizes</option>{size_options}</select></label><span id="filter-count" role="status" aria-live="polite"></span></div>
<div class="table-wrap family-scroll" tabindex="0" role="region" aria-label="Scrollable family results"><table id="family-table"><caption>Unrestricted outcomes by family and size</caption><thead><tr><th scope="col">Family</th><th scope="col">n</th><th scope="col">Trees</th><th scope="col">Verified</th><th scope="col">Unresolved</th><th scope="col">Solver infeasible</th><th scope="col">Errors</th><th scope="col">Solved median s</th></tr></thead><tbody>{"".join(family_rows)}</tbody></table></div><p id="empty-families" class="empty" hidden>No matching family and size.</p></section>
<section><h2>Cases to investigate from this run</h2><p class="muted">Unresolved and solver-infeasible cases first, then search work. Computational difficulty does not measure evidence against the conjecture.</p>
<div class="table-wrap"><table><thead><tr><th>Input</th><th>n</th><th>Family</th><th>Outcome</th><th>Observed seconds</th><th>Branches</th></tr></thead><tbody>{cases}</tbody></table></div>{'<p class="empty">No unrestricted cases in this run.</p>' if not cases else ""}</section>
<section><details><summary>Run history and exact cumulative counts ({len(data["history"])} runs)</summary><div class="table-wrap"><table><thead><tr><th>Run</th><th>Started (UTC)</th><th>Stop reason</th><th>New trees</th><th>New verified</th><th>Total trees</th><th>Total verified</th><th>Unresolved</th></tr></thead><tbody>{history_rows}</tbody></table></div></details></section>
<footer>This report works offline. Charts are generated from <code>progress.json</code>, checked against the cumulative ledger by <code>graceful-research audit</code>. The plot data and figures are included in the run checksums. These are experimental observations, not new theorems or novelty claims. The conjecture has no known finite progress denominator.</footer>
</main><script id="progress-data" type="application/json">{payload}</script><script>
const family = document.getElementById('family-filter');
const size = document.getElementById('size-filter');
const rows = Array.from(document.querySelectorAll('#family-table tbody tr'));
function filterRows() {{
  let visible = 0;
  for (const row of rows) {{
    row.hidden = Boolean((family.value && row.dataset.family !== family.value) || (size.value && row.dataset.size !== size.value));
    if (!row.hidden) visible++;
  }}
  document.getElementById('filter-count').textContent = visible + ' of ' + rows.length + ' groups';
  document.getElementById('empty-families').hidden = visible !== 0;
}}
family.addEventListener('change', filterRows);
size.addEventListener('change', filterRows);
filterRows();
</script></body></html>"""
    (output / "report.html").write_text(page, encoding="utf-8")


def write_visual_report(output, manifest, data, summary):
    output = Path(output)
    write_json(output / "progress.json", data)
    write_figures(output, data)
    write_dashboard(output, manifest, data, summary)
