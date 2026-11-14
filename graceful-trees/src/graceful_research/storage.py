"""Transactional cumulative ledger, suitable for local or cloud checkpoints."""

import json
import sqlite3
from pathlib import Path

TERMINAL = {"verified_graceful", "solver_infeasible"}
ERROR_STATUSES = {"error", "model_invalid", "invalid_solution", "integrity_error"}


def dump(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


class Store:
    def __init__(self, path: Path, config):
        self.connection = sqlite3.connect(path)
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cursors(stream TEXT PRIMARY KEY, position INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS cases(
                tree_id TEXT PRIMARY KEY, canonical_code TEXT UNIQUE NOT NULL,
                n INTEGER NOT NULL, family TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs(run_id TEXT PRIMARY KEY, manifest TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(
                attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL REFERENCES runs(run_id),
                tree_id TEXT NOT NULL REFERENCES cases(tree_id),
                scope TEXT NOT NULL, edge_key TEXT NOT NULL,
                status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS attempt_tree ON attempts(tree_id, scope, edge_key);
            CREATE INDEX IF NOT EXISTS attempt_run ON attempts(run_id);
        """)
        existing = self.meta("generation_fingerprint")
        if self.meta("schema_version", 1) != 1:
            self.close()
            raise ValueError("unsupported checkpoint schema")
        if existing is not None and existing != config.generation_fingerprint():
            self.close()
            raise ValueError("checkpoint generation config differs; start a new campaign/output")
        self.set_meta("schema_version", 1)
        self.set_meta("generation_fingerprint", config.generation_fingerprint())
        self.set_meta("campaign", config.campaign)
        self.commit()

    def meta(self, key, default=None):
        row = self.connection.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_meta(self, key, value):
        self.connection.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", (key, dump(value)))

    def cursor(self, stream):
        row = self.connection.execute(
            "SELECT position FROM cursors WHERE stream=?", (stream,)
        ).fetchone()
        return row[0] if row else 0

    def set_cursor(self, stream, position):
        self.connection.execute("INSERT OR REPLACE INTO cursors VALUES (?,?)", (stream, position))

    def add_case(self, case):
        row = self.connection.execute(
            "SELECT canonical_code FROM cases WHERE tree_id=?", (case["tree_id"],)
        ).fetchone()
        if row:
            if row[0] != case["canonical_code"]:
                raise RuntimeError(
                    "canonical SHA256 collision; stop rather than merge different trees"
                )
            return False
        self.connection.execute(
            "INSERT INTO cases VALUES (?,?,?,?,?)",
            (case["tree_id"], case["canonical_code"], case["n"], case["family"], dump(case)),
        )
        return True

    def save_run(self, run_id, manifest):
        self.connection.execute(
            "INSERT OR REPLACE INTO runs VALUES (?,?)", (run_id, dump(manifest))
        )
        self.commit()

    def case(self, tree_id):
        row = self.connection.execute(
            "SELECT data FROM cases WHERE tree_id=?", (tree_id,)
        ).fetchone()
        return json.loads(row[0]) if row else None

    def cases(self, max_n=None):
        query = "SELECT data FROM cases"
        params = ()
        if max_n is not None:
            query += " WHERE n<=?"
            params = (max_n,)
        return [
            json.loads(row[0])
            for row in self.connection.execute(query + " ORDER BY n,tree_id", params)
        ]

    def attempts(self, *, run_id=None, tree_id=None, scope=None, edge_key=None):
        filters, params = [], []
        for key, value in (
            ("run_id", run_id),
            ("tree_id", tree_id),
            ("scope", scope),
            ("edge_key", edge_key),
        ):
            if value is not None:
                filters.append(f"{key}=?")
                params.append(value)
        where = " WHERE " + " AND ".join(filters) if filters else ""
        rows = self.connection.execute(
            "SELECT data FROM attempts" + where + " ORDER BY attempt_id", params
        )
        return [json.loads(row[0]) for row in rows]

    def add_attempt(self, record):
        cursor = self.connection.execute(
            "INSERT INTO attempts(run_id,tree_id,scope,edge_key,status,data) VALUES (?,?,?,?,?,?)",
            (
                record["run_id"],
                record["tree_id"],
                record["scope"],
                record["edge_key"],
                record["status"],
                dump(record),
            ),
        )
        record["attempt_id"] = cursor.lastrowid
        self.connection.execute(
            "UPDATE attempts SET data=? WHERE attempt_id=?", (dump(record), record["attempt_id"])
        )
        self.commit()

    def retry_cases(self, config):
        candidates = []
        oldest_unresolved = config.retry_policy == "oldest_unresolved"
        # Use the indexed ledger columns to avoid decoding solved history just
        # to discard it. The audit still checks those columns against every JSON
        # record. Preserve the old input order so Python's stable priority sort
        # also preserves ties, and keep returning all eligible cases. The opt-in
        # oldest policy reopens graceful attempts past the lifetime cap; scoped
        # probe limits are separate and remain the runner's responsibility.
        cap_filter = (
            ""
            if oldest_unresolved
            else """
                 AND (SELECT count(*) FROM attempts AS a
                      WHERE a.tree_id=c.tree_id AND a.scope='graceful') < ?"""
        )
        eligible = self.connection.execute(
            """SELECT c.data FROM cases AS c
               WHERE NOT EXISTS (
                   SELECT 1 FROM attempts AS a
                   WHERE a.tree_id=c.tree_id AND a.scope='graceful'
                     AND a.status='verified_graceful')"""
            + cap_filter
            + " ORDER BY c.n,c.tree_id",
            () if oldest_unresolved else (config.max_attempts_per_case,),
        )
        for row in eligible:
            case = json.loads(row[0])
            records = self.attempts(tree_id=case["tree_id"], scope="graceful")
            if any(r["status"] == "verified_graceful" for r in records):
                continue
            if not oldest_unresolved and len(records) >= config.max_attempts_per_case:
                continue
            if not records:
                priority = (0, 0, case["tree_id"])
            else:
                suspected = any(r["status"] == "solver_infeasible" for r in records)
                if oldest_unresolved:
                    # A new attempt moves a still-unresolved case behind older
                    # cases in its priority class, independently of total tries.
                    priority = (
                        1 if suspected else 2,
                        records[-1]["attempt_id"],
                        case["tree_id"],
                    )
                else:
                    priority = (
                        0 if suspected else 1,
                        len(records),
                        -records[-1].get("wall_seconds", 0),
                    )
            candidates.append((priority, case))
        return [case for _, case in sorted(candidates, key=lambda item: item[0])]

    def commit(self):
        self.connection.commit()

    def close(self):
        self.connection.commit()
        self.connection.close()
