"""Bounded label-permutation search with incremental edge-difference updates.

Label swapping, tabu escape and restarts are established graceful-search ideas
(Aldred--McKay 1998; Fang 2010, sections 2.2--2.3). This implementation samples
candidate swaps and updates only incident edges. It is a witness heuristic:
failure never proves infeasibility and supplies no restriction to an exact model.
The default uniform proposals retain the first development policy. The opt-in
missing-difference policy targets an absent gap on three quarters of proposals
and retains uniform moves for escape. This is an experimental proposal rule,
not a completeness condition or a claimed new mathematical construction.
"""

import math
import random
import time

from .verify import verify_labeling, verify_tree

ALGORITHM = "label-swap-v1"
MAX_N = 256
TIME_CHECK_INTERVAL = 16
MAX_TRAJECTORY = 256


class _SwapState:
    """An internal permutation and its exact difference-frequency objective.

    ``evaluate`` is read-only. Its net frequency changes count both incident edges
    at a common neighbor, but skip the swapped vertices' mutual edge: that edge's
    absolute difference does not change. Tests compare every move to recomputing
    the complete graph; this helper is not the independent witness verifier.
    """

    def __init__(self, n, edges, labels):
        self.n = n
        self.edges = tuple(sorted(tuple(sorted(edge)) for edge in edges))
        self.neighbors = [[] for _ in range(n)]
        for u, v in self.edges:
            self.neighbors[u].append(v)
            self.neighbors[v].append(u)
        self.reset(labels)

    def reset(self, labels):
        self.labels = list(labels)
        self.positions = [0] * self.n
        for vertex, label in enumerate(labels):
            self.positions[label] = vertex
        self.frequency = [0] * self.n
        for u, v in self.edges:
            self.frequency[abs(self.labels[u] - self.labels[v])] += 1
        missing = [d for d in range(1, self.n) if self.frequency[d] == 0]
        self.missing = missing
        self.missing_positions = [-1] * self.n
        for index, difference in enumerate(missing):
            self.missing_positions[difference] = index
        self.missing_count = len(missing)
        self.missing_sum = sum(missing)

    def evaluate(self, u, v):
        changes = {}
        labels = self.labels
        a, b = labels[u], labels[v]
        for vertex, other, before, after in ((u, v, a, b), (v, u, b, a)):
            for neighbor in self.neighbors[vertex]:
                if neighbor == other:
                    continue
                old = abs(before - labels[neighbor])
                new = abs(after - labels[neighbor])
                changes[old] = changes.get(old, 0) - 1
                changes[new] = changes.get(new, 0) + 1
        count, total = self.missing_count, self.missing_sum
        for difference, change in changes.items():
            if not change:
                continue
            old = self.frequency[difference]
            new = old + change
            if old == 0:
                count -= 1
                total -= difference
            elif new == 0:
                count += 1
                total += difference
        return count, total, changes

    def apply(self, u, v, evaluated):
        count, total, changes = evaluated
        for difference, change in changes.items():
            if not change:
                continue
            before = self.frequency[difference]
            self.frequency[difference] += change
            after = self.frequency[difference]
            if before == 0:
                index = self.missing_positions[difference]
                last = self.missing.pop()
                if index < len(self.missing):
                    self.missing[index] = last
                    self.missing_positions[last] = index
                self.missing_positions[difference] = -1
            elif after == 0:
                self.missing_positions[difference] = len(self.missing)
                self.missing.append(difference)
        self.positions[self.labels[u]], self.positions[self.labels[v]] = v, u
        self.labels[u], self.labels[v] = self.labels[v], self.labels[u]
        self.missing_count, self.missing_sum = count, total


def _targeted_pair(state, rng):
    """Propose a swap introducing an absent difference on a designated edge.

    Choose labels a,b with the desired gap, a neighbor u of the vertex holding b,
    and swap u with the vertex holding a. Since that gap is absent, u cannot
    already hold a. The anchor holding b is not swapped. Other incident edges
    may lose useful differences, so acceptance still uses the complete objective.
    """
    if not state.missing:
        raise ValueError("targeted proposals require an unfinished state")
    difference = rng.choice(state.missing)
    lower = rng.randrange(state.n - difference)
    a, b = lower, lower + difference
    if rng.randrange(2):
        a, b = b, a
    anchor = state.positions[b]
    u = rng.choice(state.neighbors[anchor])
    v = state.positions[a]
    return u, v, difference, anchor


def search(
    n,
    edges,
    *,
    seed,
    max_nodes=40000,
    seconds=0.1,
    objective="missing_sum",
    proposal_policy="uniform",
):
    errors = verify_tree(n, edges)
    if errors:
        raise ValueError(f"invalid tree input: {errors}")
    if type(seed) is not int:
        raise ValueError("seed must be an integer")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and nonnegative")
    if not isinstance(objective, str) or objective not in {"missing_count", "missing_sum"}:
        raise ValueError("objective must be missing_count or missing_sum")
    if not isinstance(proposal_policy, str) or proposal_policy not in {
        "uniform",
        "missing_difference",
    }:
        raise ValueError("proposal_policy must be uniform or missing_difference")

    started = time.monotonic()
    deadline = started + seconds
    sample_size = min(24, 2 * n)
    restart_stagnation = max(25, 4 * n)
    tabu_tenure = 7
    result = {
        "algorithm": ALGORITHM,
        "seed": seed,
        "max_nodes": max_nodes,
        "seconds": seconds,
        "objective": objective,
        "proposal_policy": proposal_policy,
        "nodes": 0,
        "uniform_proposals": 0,
        "targeted_proposals": 0,
        "labels": None,
        "search_complete": False,
        "termination": "node_limit",
        "accepted_moves": 0,
        "uphill_moves": 0,
        "tabu_rejections": 0,
        "restarts": 0,
        "initializations": 0,
        "best_missing_count": None,
        "best_missing_sum": None,
        "initial_score": None,
        "best_score": None,
        "improvements": 0,
        "trajectory": [],
        "trajectory_omitted": 0,
        "parameters": {
            "sample_size": sample_size,
            "tabu_tenure": tabu_tenure,
            "restart_stagnation_steps": restart_stagnation,
            "time_check_interval": TIME_CHECK_INTERVAL,
            "max_vertices": MAX_N,
            "initialization": "seeded_permutation",
            "acceptance": "best_sampled_nontabu_or_global_improvement",
            "targeted_probability": 0.75 if proposal_policy == "missing_difference" else 0.0,
        },
    }

    def finish(reason):
        result["termination"] = reason
        result["wall_seconds"] = time.monotonic() - started
        return result

    if n > MAX_N:
        return finish("size_limit")
    if max_nodes == 0:
        return finish("node_limit")
    if seconds == 0 or time.monotonic() >= deadline:
        return finish("time_limit")

    rng = random.Random(seed)
    labels = list(range(n))
    rng.shuffle(labels)
    state = _SwapState(n, edges, labels)
    result["initializations"] = 1
    score_index = 0 if objective == "missing_count" else 1

    def score():
        return state.missing_count if score_index == 0 else state.missing_sum

    best_score = score()
    local_best = best_score
    stagnant_steps = 0
    tabu = {}

    def record_best():
        if result["initial_score"] is None:
            result["initial_score"] = score()
        else:
            result["improvements"] += 1
        result["best_score"] = score()
        result["best_missing_count"] = state.missing_count
        result["best_missing_sum"] = state.missing_sum
        entry = {
            "proposal": result["nodes"],
            "accepted_move": result["accepted_moves"],
            "restart": result["restarts"],
            "missing_count": state.missing_count,
            "missing_sum": state.missing_sum,
        }
        if len(result["trajectory"]) < MAX_TRAJECTORY:
            result["trajectory"].append(entry)
        else:
            result["trajectory_omitted"] += 1

    def witness():
        candidate = state.labels.copy()
        if not verify_labeling(n, edges, candidate)["valid"]:
            raise RuntimeError("label-swap candidate failed independent verification")
        result["labels"] = candidate
        return finish("witness")

    record_best()
    if best_score == 0:
        return witness()

    while result["nodes"] < max_nodes:
        if time.monotonic() >= deadline:
            return finish("time_limit")
        selected = None
        selected_score = math.inf
        tied = 0
        cutoff = False
        for _ in range(min(sample_size, max_nodes - result["nodes"])):
            if result["nodes"] % TIME_CHECK_INTERVAL == 0 and time.monotonic() >= deadline:
                cutoff = True
                break
            if proposal_policy == "missing_difference" and rng.randrange(4) != 0:
                u, v, _, _ = _targeted_pair(state, rng)
                result["targeted_proposals"] += 1
            else:
                u = rng.randrange(n)
                v = rng.randrange(n - 1)
                if v >= u:
                    v += 1
                result["uniform_proposals"] += 1
            pair = (u, v) if u < v else (v, u)
            evaluated = state.evaluate(u, v)
            result["nodes"] += 1
            candidate_score = evaluated[score_index]
            if tabu.get(pair, -1) > result["accepted_moves"] and candidate_score >= best_score:
                result["tabu_rejections"] += 1
                continue
            if candidate_score < selected_score:
                selected, selected_score, tied = (u, v, evaluated), candidate_score, 1
            elif candidate_score == selected_score:
                tied += 1
                if rng.randrange(tied) == 0:
                    selected = (u, v, evaluated)
            # A zero objective already supplies a complete permutation witness.
            if candidate_score == 0:
                break
        if selected is not None:
            u, v, evaluated = selected
            previous_score = score()
            state.apply(u, v, evaluated)
            result["accepted_moves"] += 1
            result["uphill_moves"] += int(selected_score > previous_score)
            pair = (u, v) if u < v else (v, u)
            tabu[pair] = result["accepted_moves"] + tabu_tenure
            # Expiry pruning bounds metadata to recent moves, rather than O(n^2).
            tabu = {p: expiry for p, expiry in tabu.items() if expiry > result["accepted_moves"]}
            if selected_score < best_score:
                best_score = selected_score
                record_best()
            if selected_score == 0:
                return witness()
            if selected_score < local_best:
                local_best, stagnant_steps = selected_score, 0
            else:
                stagnant_steps += 1
        else:
            # With every sampled pair tabu, do not freeze restart progress.
            stagnant_steps += 1
        if cutoff:
            return finish("time_limit")
        if result["nodes"] >= max_nodes:
            break
        if stagnant_steps >= restart_stagnation:
            if time.monotonic() >= deadline:
                return finish("time_limit")
            rng.shuffle(labels)
            state.reset(labels)
            result["restarts"] += 1
            result["initializations"] += 1
            local_best, stagnant_steps = score(), 0
            tabu.clear()
            if local_best < best_score:
                best_score = local_best
                record_best()
            if local_best == 0:
                return witness()
    return finish("node_limit")
