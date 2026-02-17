from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any

UNSET = object()


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
    trainer_messages: list[dict[str, Any]]
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
                  trainer_messages TEXT NOT NULL DEFAULT '[]',
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
            self._ensure_column(
                conn,
                table_name="sessions",
                column_name="trainer_messages",
                column_sql="TEXT NOT NULL DEFAULT '[]'",
            )
            conn.commit()

    def _ensure_column(
        self,
        conn: sqlite3.Connection,
        *,
        table_name: str,
        column_name: str,
        column_sql: str,
    ) -> None:
        row = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        existing_columns = {str(r["name"]) for r in row}
        if column_name not in existing_columns:
            conn.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"
            )

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
                  initial_agent_count, trainer_messages, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    name,
                    need,
                    constraints,
                    input_prompt,
                    initial_agent_count,
                    "[]",
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
                trainer_messages=[],
                created_at=ts,
                updated_at=ts,
            )

    def list_sessions(self) -> list[SessionRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, name, need, constraints, input_prompt,
                       initial_agent_count, trainer_messages, created_at, updated_at
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
                       initial_agent_count, trainer_messages, created_at, updated_at
                FROM sessions
                WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            if row is None:
                return None
            return self._session_from_row(row)

    def update_session(
        self,
        session_id: str,
        *,
        name: str | None | object = UNSET,
        need: str | None | object = UNSET,
        constraints: str | None | object = UNSET,
        input_prompt: str | None | object = UNSET,
        trainer_messages: list[dict[str, Any]] | None | object = UNSET,
    ) -> SessionRecord | None:
        updates: list[str] = ["updated_at = ?"]
        values: list[Any] = [now_ms()]

        if name is not UNSET:
            updates.append("name = ?")
            values.append(name)
        if need is not UNSET:
            updates.append("need = ?")
            values.append(need)
        if constraints is not UNSET:
            updates.append("constraints = ?")
            values.append(constraints)
        if input_prompt is not UNSET:
            updates.append("input_prompt = ?")
            values.append(input_prompt)
        if trainer_messages is not UNSET:
            updates.append("trainer_messages = ?")
            values.append(json.dumps(trainer_messages))

        with self._lock, self._connect() as conn:
            values.append(session_id)
            cursor = conn.execute(
                f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?",
                tuple(values),
            )
            if cursor.rowcount == 0:
                conn.rollback()
                return None
            conn.commit()
            row = conn.execute(
                """
                SELECT id, name, need, constraints, input_prompt,
                       initial_agent_count, trainer_messages, created_at, updated_at
                FROM sessions
                WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            if row is None:
                return None
            return self._session_from_row(row)

    def delete_session(self, session_id: str) -> bool:
        with self._lock, self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM sessions WHERE id = ?",
                (session_id,),
            )
            conn.commit()
            return cursor.rowcount > 0

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

    def update_lineage_directives(
        self,
        lineage_id: str,
        *,
        sticky: list[str] | None = None,
        oneshot: list[str] | None = None,
    ) -> None:
        updates: list[str] = []
        values: list[Any] = []

        if sticky is not None:
            updates.append("directive_sticky = ?")
            values.append(json.dumps(sticky))
        if oneshot is not None:
            updates.append("directive_oneshot = ?")
            values.append(json.dumps(oneshot))
        if not updates:
            return

        with self._lock, self._connect() as conn:
            ts = now_ms()
            values.append(lineage_id)
            conn.execute(
                f"UPDATE lineages SET {', '.join(updates)} WHERE id = ?",
                tuple(values),
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

    def list_artifacts_by_lineage(self, lineage_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, lineage_id, cycle, content, metadata, created_at
                FROM artifacts
                WHERE lineage_id = ?
                ORDER BY cycle DESC
                """,
                (lineage_id,),
            ).fetchall()
            return [self._artifact_from_row(r) for r in rows]

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
                "trainerMessages": session.trainer_messages,
                "createdAt": session.created_at,
                "updatedAt": session.updated_at,
            },
            "lineages": lineage_snapshots,
        }

    def build_session_history(self, session_id: str) -> dict[str, Any] | None:
        session = self.get_session(session_id)
        if session is None:
            return None

        lineages = self.list_lineages(session_id)
        lineage_histories: list[dict[str, Any]] = []
        for lineage in lineages:
            artifacts = self.list_artifacts_by_lineage(lineage["id"])
            artifacts_with_eval = []
            for artifact in artifacts:
                artifacts_with_eval.append(
                    {
                        **artifact,
                        "evaluation": self.get_evaluation_for_artifact(artifact["id"]),
                    }
                )

            lineage_histories.append(
                {
                    "lineage": lineage,
                    "artifacts": artifacts_with_eval,
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
                "trainerMessages": session.trainer_messages,
                "createdAt": session.created_at,
                "updatedAt": session.updated_at,
            },
            "histories": lineage_histories,
        }

    def _session_from_row(self, row: sqlite3.Row) -> SessionRecord:
        raw_messages = row["trainer_messages"] if "trainer_messages" in row.keys() else "[]"
        try:
            trainer_messages = json.loads(raw_messages or "[]")
        except (TypeError, json.JSONDecodeError):
            trainer_messages = []
        if not isinstance(trainer_messages, list):
            trainer_messages = []

        return SessionRecord(
            id=str(row["id"]),
            name=str(row["name"]),
            need=str(row["need"]),
            constraints=row["constraints"],
            input_prompt=row["input_prompt"],
            initial_agent_count=int(row["initial_agent_count"]),
            trainer_messages=trainer_messages,
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
