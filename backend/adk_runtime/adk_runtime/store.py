from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any


def now_ms() -> int:
    return int(time.time() * 1000)


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


@dataclass(frozen=True)
class SessionRecord:
    id: str
    name: str
    need: str
    constraints: str | None
    input_prompt: str | None
    initial_agent_count: int
    created_at: int
    updated_at: int


class RuntimeStore:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS sessions (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  need TEXT NOT NULL,
                  constraints TEXT,
                  input_prompt TEXT,
                  initial_agent_count INTEGER NOT NULL DEFAULT 4,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS lineages (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  label TEXT NOT NULL,
                  strategy_tag TEXT,
                  is_locked INTEGER NOT NULL DEFAULT 0,
                  directive_sticky TEXT,
                  directive_oneshot TEXT,
                  created_at INTEGER NOT NULL,
                  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS agents (
                  id TEXT PRIMARY KEY,
                  lineage_id TEXT NOT NULL,
                  version INTEGER NOT NULL,
                  name TEXT NOT NULL,
                  description TEXT,
                  system_prompt TEXT NOT NULL,
                  parameters TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS artifacts (
                  id TEXT PRIMARY KEY,
                  lineage_id TEXT NOT NULL,
                  cycle INTEGER NOT NULL,
                  content TEXT NOT NULL,
                  metadata TEXT,
                  created_at INTEGER NOT NULL,
                  FOREIGN KEY (lineage_id) REFERENCES lineages(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS evaluations (
                  id TEXT PRIMARY KEY,
                  artifact_id TEXT NOT NULL UNIQUE,
                  score INTEGER NOT NULL,
                  comment TEXT,
                  created_at INTEGER NOT NULL,
                  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
                ON sessions(updated_at DESC);

                CREATE INDEX IF NOT EXISTS idx_lineages_session
                ON lineages(session_id, label);

                CREATE INDEX IF NOT EXISTS idx_agents_lineage_version
                ON agents(lineage_id, version DESC);

                CREATE INDEX IF NOT EXISTS idx_artifacts_lineage_cycle
                ON artifacts(lineage_id, cycle DESC);
                """
            )
            conn.commit()

    def create_session(
        self,
        *,
        name: str,
        need: str,
        constraints: str | None,
        input_prompt: str | None,
        initial_agent_count: int,
    ) -> SessionRecord:
        with self._lock, self._connect() as conn:
            ts = now_ms()
            session_id = generate_id("ses")
            conn.execute(
                """
                INSERT INTO sessions (
                  id, name, need, constraints, input_prompt,
                  initial_agent_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    name,
                    need,
                    constraints,
                    input_prompt,
                    initial_agent_count,
                    ts,
                    ts,
                ),
            )
            conn.commit()
            return SessionRecord(
                id=session_id,
                name=name,
                need=need,
                constraints=constraints,
                input_prompt=input_prompt,
                initial_agent_count=initial_agent_count,
                created_at=ts,
                updated_at=ts,
            )

    def list_sessions(self) -> list[SessionRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, name, need, constraints, input_prompt,
                       initial_agent_count, created_at, updated_at
                FROM sessions
                ORDER BY updated_at DESC
                """
            ).fetchall()
            return [self._session_from_row(r) for r in rows]

    def get_session(self, session_id: str) -> SessionRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, name, need, constraints, input_prompt,
                       initial_agent_count, created_at, updated_at
                FROM sessions
                WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            if row is None:
                return None
            return self._session_from_row(row)

    def create_lineage(
        self,
        *,
        session_id: str,
        label: str,
        strategy_tag: str,
    ) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            lineage_id = generate_id("lin")
            created_at = now_ms()
            conn.execute(
                """
                INSERT INTO lineages (
                  id, session_id, label, strategy_tag, is_locked,
                  directive_sticky, directive_oneshot, created_at
                ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
                """,
                (lineage_id, session_id, label, strategy_tag, "[]", "[]", created_at),
            )
            conn.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (created_at, session_id),
            )
            conn.commit()
            return {
                "id": lineage_id,
                "sessionId": session_id,
                "label": label,
                "strategyTag": strategy_tag,
                "isLocked": False,
                "directiveSticky": [],
                "directiveOneshot": [],
                "createdAt": created_at,
            }

    def list_lineages(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, session_id, label, strategy_tag, is_locked,
                       directive_sticky, directive_oneshot, created_at
                FROM lineages
                WHERE session_id = ?
                ORDER BY label
                """,
                (session_id,),
            ).fetchall()
            return [self._lineage_from_row(r) for r in rows]

    def get_lineage_by_label(self, session_id: str, label: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, session_id, label, strategy_tag, is_locked,
                       directive_sticky, directive_oneshot, created_at
                FROM lineages
                WHERE session_id = ? AND label = ?
                """,
                (session_id, label),
            ).fetchone()
            if row is None:
                return None
            return self._lineage_from_row(row)

    def set_lineage_locked(self, lineage_id: str, is_locked: bool) -> None:
        with self._lock, self._connect() as conn:
            ts = now_ms()
            conn.execute(
                "UPDATE lineages SET is_locked = ? WHERE id = ?",
                (1 if is_locked else 0, lineage_id),
            )
            conn.execute(
                """
                UPDATE sessions
                SET updated_at = ?
                WHERE id = (SELECT session_id FROM lineages WHERE id = ?)
                """,
                (ts, lineage_id),
            )
            conn.commit()

    def create_agent(
        self,
        *,
        lineage_id: str,
        version: int,
        name: str,
        description: str,
        system_prompt: str,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            ts = now_ms()
            agent_id = generate_id("agt")
            conn.execute(
                """
                INSERT INTO agents (
                  id, lineage_id, version, name, description,
                  system_prompt, parameters, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent_id,
                    lineage_id,
                    version,
                    name,
                    description,
                    system_prompt,
                    json.dumps(parameters),
                    ts,
                    ts,
                ),
            )
            conn.execute(
                """
                UPDATE sessions
                SET updated_at = ?
                WHERE id = (SELECT session_id FROM lineages WHERE id = ?)
                """,
                (ts, lineage_id),
            )
            conn.commit()
            return {
                "id": agent_id,
                "lineageId": lineage_id,
                "version": version,
                "name": name,
                "description": description,
                "systemPrompt": system_prompt,
                "parameters": parameters,
                "createdAt": ts,
                "updatedAt": ts,
            }

    def get_latest_agent(self, lineage_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, lineage_id, version, name, description,
                       system_prompt, parameters, created_at, updated_at
                FROM agents
                WHERE lineage_id = ?
                ORDER BY version DESC
                LIMIT 1
                """,
                (lineage_id,),
            ).fetchone()
            if row is None:
                return None
            return self._agent_from_row(row)

    def create_artifact(
        self,
        *,
        lineage_id: str,
        cycle: int,
        content: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            ts = now_ms()
            artifact_id = generate_id("art")
            conn.execute(
                """
                INSERT INTO artifacts (id, lineage_id, cycle, content, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (artifact_id, lineage_id, cycle, content, json.dumps(metadata), ts),
            )
            conn.execute(
                """
                UPDATE sessions
                SET updated_at = ?
                WHERE id = (SELECT session_id FROM lineages WHERE id = ?)
                """,
                (ts, lineage_id),
            )
            conn.commit()
            return {
                "id": artifact_id,
                "lineageId": lineage_id,
                "cycle": cycle,
                "content": content,
                "metadata": metadata,
                "createdAt": ts,
            }

    def get_latest_artifact(self, lineage_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, lineage_id, cycle, content, metadata, created_at
                FROM artifacts
                WHERE lineage_id = ?
                ORDER BY cycle DESC
                LIMIT 1
                """,
                (lineage_id,),
            ).fetchone()
            if row is None:
                return None
            return self._artifact_from_row(row)

    def upsert_evaluation(
        self, artifact_id: str, score: int, comment: str | None
    ) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            ts = now_ms()
            row = conn.execute(
                "SELECT id FROM evaluations WHERE artifact_id = ?",
                (artifact_id,),
            ).fetchone()
            if row is None:
                evaluation_id = generate_id("evl")
                conn.execute(
                    """
                    INSERT INTO evaluations (id, artifact_id, score, comment, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (evaluation_id, artifact_id, score, comment, ts),
                )
            else:
                evaluation_id = str(row["id"])
                conn.execute(
                    """
                    UPDATE evaluations
                    SET score = ?, comment = ?, created_at = ?
                    WHERE id = ?
                    """,
                    (score, comment, ts, evaluation_id),
                )
            conn.commit()
            return {
                "id": evaluation_id,
                "artifactId": artifact_id,
                "score": score,
                "comment": comment,
                "createdAt": ts,
            }

    def get_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, lineage_id, cycle, content, metadata, created_at
                FROM artifacts
                WHERE id = ?
                """,
                (artifact_id,),
            ).fetchone()
            if row is None:
                return None
            return self._artifact_from_row(row)

    def get_evaluation_for_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, artifact_id, score, comment, created_at
                FROM evaluations
                WHERE artifact_id = ?
                """,
                (artifact_id,),
            ).fetchone()
            if row is None:
                return None
            return {
                "id": str(row["id"]),
                "artifactId": str(row["artifact_id"]),
                "score": int(row["score"]),
                "comment": row["comment"],
                "createdAt": int(row["created_at"]),
            }

    def clear_oneshot_directives(self, lineage_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE lineages SET directive_oneshot = ? WHERE id = ?",
                ("[]", lineage_id),
            )
            conn.commit()

    def build_session_snapshot(self, session_id: str) -> dict[str, Any] | None:
        session = self.get_session(session_id)
        if session is None:
            return None

        lineages = self.list_lineages(session_id)
        lineage_snapshots: list[dict[str, Any]] = []
        for lineage in lineages:
            latest_agent = self.get_latest_agent(lineage["id"])
            latest_artifact = self.get_latest_artifact(lineage["id"])
            latest_eval = None
            cycle = 0
            if latest_artifact is not None:
                cycle = int(latest_artifact["cycle"])
                latest_eval = self.get_evaluation_for_artifact(latest_artifact["id"])
            lineage_snapshots.append(
                {
                    **lineage,
                    "cycle": cycle,
                    "currentAgent": latest_agent,
                    "currentArtifact": latest_artifact,
                    "currentEvaluation": latest_eval,
                }
            )

        return {
            "session": {
                "id": session.id,
                "name": session.name,
                "need": session.need,
                "constraints": session.constraints,
                "inputPrompt": session.input_prompt,
                "initialAgentCount": session.initial_agent_count,
                "createdAt": session.created_at,
                "updatedAt": session.updated_at,
            },
            "lineages": lineage_snapshots,
        }

    def _session_from_row(self, row: sqlite3.Row) -> SessionRecord:
        return SessionRecord(
            id=str(row["id"]),
            name=str(row["name"]),
            need=str(row["need"]),
            constraints=row["constraints"],
            input_prompt=row["input_prompt"],
            initial_agent_count=int(row["initial_agent_count"]),
            created_at=int(row["created_at"]),
            updated_at=int(row["updated_at"]),
        )

    def _lineage_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "sessionId": str(row["session_id"]),
            "label": str(row["label"]),
            "strategyTag": row["strategy_tag"],
            "isLocked": bool(row["is_locked"]),
            "directiveSticky": json.loads(row["directive_sticky"] or "[]"),
            "directiveOneshot": json.loads(row["directive_oneshot"] or "[]"),
            "createdAt": int(row["created_at"]),
        }

    def _agent_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "lineageId": str(row["lineage_id"]),
            "version": int(row["version"]),
            "name": str(row["name"]),
            "description": row["description"],
            "systemPrompt": str(row["system_prompt"]),
            "parameters": json.loads(row["parameters"]),
            "createdAt": int(row["created_at"]),
            "updatedAt": int(row["updated_at"]),
        }

    def _artifact_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "lineageId": str(row["lineage_id"]),
            "cycle": int(row["cycle"]),
            "content": str(row["content"]),
            "metadata": json.loads(row["metadata"] or "{}"),
            "createdAt": int(row["created_at"]),
        }
