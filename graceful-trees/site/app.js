import { FEED_URL, EXAMPLE_LABELS, complement, validateFeed, freshness, chartGeometry, coverageThrough, historyCSV, familyName } from './data.mjs?v=2';

const $ = id => document.getElementById(id);
const number = n => new Intl.NumberFormat('en').format(n);
const utc = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const duration = seconds => seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
const write = (id, value) => { $(id).textContent = value; };
const CACHE_KEY = 'graceful-nightly-public-v1';
let feed = null, chart = null, range = '30', busy = false;

// All data text enters the DOM through textContent, never HTML interpolation.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svg(tag, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function selectRun(index) {
  const row = chart.rows[index];
  $('run-slider').value = index;
  $('run-slider').setAttribute('aria-valuetext', `Run ${row.run}, ${utc(row.started_at)}, ${row.verified_graceful} verified trees`);
  write('run-selection', `Run ${row.run}`);
  write('selected-run', `${utc(row.started_at)} UTC · ${number(row.verified_graceful)} verified / ${number(row.trees)} investigated · ${number(row.unknown)} unresolved · +${number(row.new_trees)} new trees`);
  $('chart-selection')?.remove();
  const group = svg('g', { id: 'chart-selection', 'aria-hidden': 'true' });
  group.append(svg('line', { x1: chart.x(index), x2: chart.x(index), y1: 20, y2: 220, class: 'chart-guide' }), svg('circle', { cx: chart.x(index), cy: chart.y(row.verified_graceful), r: 5, class: 'chart-point' }));
  $('trend-chart').append(group);
}

function renderChart(preserveSelection = false) {
  const selected = preserveSelection ? chart?.rows[Number($('run-slider').value)]?.run_id : null;
  const root = $('trend-chart');
  chart = chartGeometry(feed.history, range, Math.max(280, Math.round(root.getBoundingClientRect().width)));
  root.setAttribute('viewBox', `0 0 ${chart.width} 270`);
  root.replaceChildren(svg('title', { id: 'chart-title' }, 'Cumulative research progress'), svg('desc', { id: 'chart-description' }, `${chart.rows.length} runs shown. Use the run slider or the complete history table for exact counts.`));
  root.append(svg('text', { x: chart.left, y: 12, class: 'chart-axis-label' }, 'Number of trees'));
  chart.ticks.forEach(tick => root.append(svg('line', { x1: chart.left, x2: chart.right, y1: chart.y(tick), y2: chart.y(tick), class: 'chart-grid' }), svg('text', { x: 36, y: chart.y(tick) + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, number(tick))));
  for (const [key, className] of [['trees', 'trees'], ['verified_graceful', 'verified'], ['unknown', 'unknown']]) {
    root.append(svg('path', { d: chart.series[key], class: `chart-line series-${className}` }));
    if (chart.rows.length === 1) root.append(svg('circle', { cx: chart.x(0), cy: chart.y(chart.rows[0][key]), r: 3, class: `chart-line series-${className}` }));
  }
  const indices = new Set([0, Math.floor((chart.rows.length - 1) / 2), chart.rows.length - 1]);
  indices.forEach(i => root.append(svg('text', { x: chart.x(i), y: 246, 'text-anchor': i === 0 ? 'start' : i === chart.rows.length - 1 ? 'end' : 'middle', class: 'chart-axis-label' }, `Run ${chart.rows[i].run}`)));
  $('run-slider').max = chart.rows.length - 1;
  $('run-slider').disabled = chart.rows.length === 1;
  const index = chart.rows.findIndex(row => row.run_id === selected);
  selectRun(index < 0 ? chart.rows.length - 1 : index);
}

function renderCoverage() {
  const byFamily = $('coverage-group').value === 'families';
  const rows = [...feed[byFamily ? 'families' : 'sizes']].sort((a, b) => byFamily ? b.trees - a.trees || a.family.localeCompare(b.family) : a.n - b.n);
  const max = Math.max(1, ...rows.map(row => row.trees));
  const container = $('coverage-bars');
  container.replaceChildren();
  for (const row of rows) {
    const name = byFamily ? familyName(row.family) : `${row.n} vertices`;
    const block = element('div', 'coverage-row');
    const track = element('div', 'coverage-track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${name}: ${row.trees} trees, ${row.verified_graceful} verified, ${row.unknown} unresolved, ${row.solver_infeasible} solver infeasible, ${row.errors} errors`);
    track.title = track.getAttribute('aria-label');
    for (const [key, style] of [['verified_graceful', 'verified'], ['unknown', 'unknown'], ['solver_infeasible', 'infeasible'], ['errors', 'errors']]) {
      const segment = element('span', `bar-${style}`);
      segment.style.width = `${row[key] / max * 100}%`;
      track.append(segment);
    }
    block.append(element('span', 'coverage-name', name), track, element('span', 'coverage-count', number(row.trees)));
    container.append(block);
  }
  if (!rows.length) container.append(element('p', 'note', 'No unrestricted trees have been attempted yet.'));
  const through = coverageThrough(feed.coverage);
  write('coverage-note', through ? `Exhaustive checks completed through ${through} vertices. Larger sizes are partially enumerated or sampled; they are not exhaustive coverage.` : 'Exhaustive validation is in progress. Sampled cases do not establish coverage of all trees at that size.');
  write('coverage-scope', byFamily ? 'Distinct trees by first generation source. Mathematical families may overlap. The number at right is the total in each group.' : 'Distinct trees by number of vertices. The number at right is the total at each order.');
}

function renderFindings() {
  const container = $('findings');
  container.replaceChildren();
  if (!feed.findings.length) {
    const empty = element('div', 'finding-empty');
    empty.append(element('p', '', 'No cases have met the automated criteria for review in this campaign.'));
    container.append(empty);
  }
  feed.findings.slice(0, 4).forEach(item => {
    const article = element('article', 'finding');
    const kind = { unrestricted_infeasibility: 'Requires independent investigation', difficult_case_resolved: 'Performance observation', validation_milestone: 'Validation milestone' }[item.kind] ?? 'For human review';
    article.append(element('span', 'finding-kind', kind), element('h4', '', item.title), element('p', '', item.significance), element('p', '', `Next experiment: ${item.next_step}`));
    container.append(article);
  });
  if (feed.findings.length > 4) container.append(element('p', 'note', `${number(feed.findings.length - 4)} further review items are in the public JSON.`));
  const suggestions = $('suggestions');
  suggestions.replaceChildren();
  feed.suggestions.forEach(item => {
    const article = element('article');
    article.append(element('span', 'suggestion-kind', item.kind === 'hypothesis' ? 'Candidate question' : 'Proposed experiment'), element('p', '', item.statement), element('p', 'note', item.status), element('span', 'note', item.test));
    suggestions.append(article);
  });
}

function renderTables() {
  $('difficult-rows').replaceChildren();
  feed.difficult.forEach(item => {
    const tr = element('tr');
    const id = element('td', 'tree-code', `${item.tree_id.slice(0, 10)}… / #${item.attempt_id}`);
    id.title = `Tree ${item.tree_id}; attempt ${item.attempt_id} in the downloaded research.sqlite`;
    const status = element('span', 'outcome', { verified_graceful: 'Verified graceful', unknown: item.timed_out ? 'Unresolved · timed out' : 'Unresolved', solver_infeasible: 'Infeasible · uncertified' }[item.status] ?? 'Operational error');
    status.dataset.status = item.status;
    const cell = element('td'); cell.append(status);
    tr.append(id, element('td', '', familyName(item.family)), element('td', '', number(item.n)), cell, element('td', '', item.wall_seconds == null ? '—' : duration(item.wall_seconds)), element('td', '', item.branches == null ? '—' : number(item.branches)));
    $('difficult-rows').append(tr);
  });
  if (!feed.difficult.length) { const tr = element('tr'); const td = element('td', '', 'No unrestricted attempts in this run.'); td.colSpan = 6; tr.append(td); $('difficult-rows').append(tr); }
  write('history-count', `(${number(feed.history.length)} runs)`);
  // The complete table is rendered on demand; chart and metrics remain lightweight.
  $('history-rows').replaceChildren();
  if (document.querySelector('.history-details').open) renderHistory();
}

function renderHistory() {
  if (!feed || $('history-rows').children.length) return;
  const fragment = document.createDocumentFragment();
  [...feed.history].reverse().forEach(row => {
    const tr = element('tr'); tr.title = row.run_id;
    [row.run, utc(row.started_at), row.trees, row.verified_graceful, row.unknown, row.solver_infeasible, row.new_trees].forEach(value => tr.append(element('td', '', typeof value === 'number' ? number(value) : value)));
    fragment.append(tr);
  });
  $('history-rows').append(fragment);
}

function render(data, cached = false) {
  feed = data;
  $('dashboard').hidden = false; $('load-error').hidden = true;
  const c = data.cumulative, latest = data.history.at(-1);
  write('verified-total', number(c.verified_graceful)); write('trees-total', number(c.trees)); write('unknown-total', number(c.unknown)); write('runs-total', number(c.runs));
  write('verified-delta', `${number(latest.new_verified)} newly verified trees in the latest run.`);
  write('attempts-total', `${number(c.attempts)} search and restricted-edge attempts in total.`);
  write('infeasible-total', number(c.solver_infeasible)); write('proof-total', number(data.certificate_verified_infeasible)); write('error-total', c.errors ? `${number(c.errors)} trees with operational errors` : '');
  write('latest-finished', utc(data.finished_at)); write('latest-new', `+${number(latest.new_trees)}`); write('latest-budget', `${duration(data.elapsed_seconds)} / ${duration(data.config.budget_seconds)}`);
  write('latest-stop', { compute_budget: 'Time budget reached', case_limit: 'Case limit reached', sources_exhausted: 'Streams exhausted', generation_limit: 'Generation limit reached', cancelled: 'Cancelled' }[data.stop_reason] ?? data.stop_reason.replaceAll('_', ' '));
  write('latest-timeouts', `${number(data.current_run.timeout_attempts)} / ${number(data.current_run.attempts)} attempts`);
  $('latest-workflow').href = data.workflow.url; $('latest-artifact').href = data.workflow.artifact_url;
  write('provenance', `${data.campaign} · seed ${data.config.seed} · NetworkX ${data.versions.networkx} · OR-Tools ${data.versions.ortools}`);
  const state = cached ? { state: 'cached', label: 'Saved snapshot' } : freshness(data.finished_at);
  $('freshness').dataset.state = state.state; write('freshness', state.label);
  write('data-message', `${cached ? 'Could not refresh; showing saved data. ' : ''}Updated ${utc(data.finished_at)} UTC. Cumulative results for ${data.campaign}.${state.state === 'stale' ? ' Check the workflow records for delays or a paused schedule.' : ''}`);
  renderChart(); renderCoverage(); renderFindings(); renderTables();
}

async function refresh() {
  if (busy) return;
  busy = true; $('refresh').disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(FEED_URL, { signal: controller.signal, cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error('Snapshot unavailable');
    const raw = await response.text();
    if (raw.length > 4 * 1024 * 1024) throw new Error('Snapshot too large');
    const data = validateFeed(JSON.parse(raw));
    // A CDN cache must not make the displayed campaign move backwards.
    if (feed && Date.parse(data.finished_at) < Date.parse(feed.finished_at)) throw new Error('Older cached response');
    render(data);
    try { localStorage.setItem(CACHE_KEY, raw); } catch { /* Storage may be disabled or full. */ }
  } catch {
    let saved = feed;
    if (!saved) { try { saved = validateFeed(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { /* No usable cache. */ } }
    if (saved) render(saved, true);
    else {
      $('load-error').hidden = false;
      $('freshness').dataset.state = 'error'; write('freshness', 'Snapshot unavailable');
      write('data-message', 'Audited results are currently unavailable.');
    }
  } finally { clearTimeout(timer); busy = false; $('refresh').disabled = false; }
}

$('refresh').addEventListener('click', refresh);
$('coverage-group').addEventListener('change', renderCoverage);
$('run-slider').addEventListener('input', event => selectRun(Number(event.target.value)));
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  range = button.dataset.range;
  document.querySelectorAll('[data-range]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderChart();
}));
$('trend-chart').addEventListener('pointermove', event => {
  if (!chart || event.pointerType === 'touch') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * chart.width;
  selectRun(Math.max(0, Math.min(chart.rows.length - 1, Math.round((x - chart.left) / (chart.right - chart.left) * (chart.rows.length - 1)))));
});
document.querySelector('.history-details').addEventListener('toggle', renderHistory);
$('download-csv').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([historyCSV(feed.history)], { type: 'text/csv;charset=utf-8' }));
  const anchor = element('a'); anchor.href = url; anchor.download = 'graceful-nightly-history.csv'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('complement').addEventListener('click', () => {
  const active = $('complement').getAttribute('aria-pressed') !== 'true';
  $('complement').setAttribute('aria-pressed', String(active));
  const labels = active ? complement(EXAMPLE_LABELS) : EXAMPLE_LABELS;
  document.querySelectorAll('[data-node]').forEach(node => { node.textContent = labels[Number(node.dataset.node)]; });
  write('example-desc', `Vertex labels ${labels.join(', ')} give edge differences 5, 4, 3, 2, 1. An illustrative example, separate from campaign totals.`);
  write('example-note', active ? 'Complemented labels: each x is replaced by 5 − x. The edge differences are unchanged.' : 'Original labeling. Replacing each x by 5 − x preserves the differences.');
});
// Keep SVG text at a readable size rather than shrinking a desktop plot on phones.
new ResizeObserver(() => {
  if (feed && chart && Math.abs($('trend-chart').getBoundingClientRect().width - chart.width) > 1) renderChart(true);
}).observe($('trend-chart'));
refresh();
// Refresh the public data, not the research job. Hidden pages make no polling requests.
setInterval(() => { if (!document.hidden) refresh(); }, 300000);
