import { describe, it, expect, beforeAll, vi } from "vitest";
import type { SqlJsStatic } from "sql.js";
import { getSession, getAllSessions } from "../queries";
import { _setDbForTesting as setDatabase } from "../index";

// Unmock sql.js for these integration tests
vi.unmock("sql.js");
vi.unmock("../index");

let SQL: SqlJsStatic;

beforeAll(async () => {
  const sqlJsModule = await import("sql.js");
  const initSqlJs = sqlJsModule.default;
  SQL = await initSqlJs();
});

describe("Session Queries Schema Robustness", () => {
  it("should correctly map session fields regardless of column order in DB", () => {
    const db = new SQL.Database();

    // Create a table with a weird column order (simulating migration history or just chaos)
    // Note: created_at is at index 4 here, which caused the bug (inputPrompt expected at 4)
    db.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        need TEXT NOT NULL,
        constraints TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'training',
        promoted_from TEXT,
        input_prompt TEXT,
        initial_agent_count INTEGER NOT NULL DEFAULT 4,
        trainer_messages TEXT
      );
    `);

    // Insert a test session
    const id = "test-session-1";
    const name = "Test Session";
    const need = "Test Need";
    const inputPrompt = "This is the prompt";
    const createdAt = 1000000;
    const updatedAt = 2000000;

    db.run(
      `
      INSERT INTO sessions (id, name, need, constraints, created_at, updated_at, mode, promoted_from, input_prompt, initial_agent_count)
      VALUES (?, ?, ?, NULL, ?, ?, 'training', NULL, ?, 4)
    `,
      [id, name, need, createdAt, updatedAt, inputPrompt]
    );

    // Set this DB as the global instance
    setDatabase(db);

    // Test getSession
    const session = getSession(id);
    expect(session).not.toBeNull();
    expect(session?.id).toBe(id);
    expect(session?.name).toBe(name);
    expect(session?.inputPrompt).toBe(inputPrompt); // This was failing (getting createdAt)
    expect(session?.createdAt).toBe(createdAt);

    // Test getAllSessions
    const sessions = getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].inputPrompt).toBe(inputPrompt);
    expect(sessions[0].createdAt).toBe(createdAt);
  });
});
