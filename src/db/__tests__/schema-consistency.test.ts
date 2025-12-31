import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { SqlJsStatic, Database } from 'sql.js';
import { CREATE_TABLES_SQL, MIGRATIONS } from '../schema';

// Unmock sql.js for real database testing
vi.unmock('sql.js');

let SQL: SqlJsStatic;

beforeAll(async () => {
  const sqlJsModule = await import('sql.js');
  SQL = await (sqlJsModule.default || sqlJsModule)();
});

/**
 * Get all columns for a table using PRAGMA table_info
 */
function getTableColumns(db: Database, tableName: string): Set<string> {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  if (result.length === 0) return new Set();
  // Column name is at index 1 in PRAGMA table_info output
  return new Set(result[0].values.map((row) => row[1] as string));
}

/**
 * Get all table names in the database
 */
function getTableNames(db: Database): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  if (result.length === 0) return [];
  return result[0].values.map((row) => row[0] as string);
}

describe('Schema Consistency', () => {
  it('CREATE_TABLES_SQL should produce identical schema to running all migrations', () => {
    // Path 1: Fresh install - just run CREATE_TABLES_SQL
    const freshDb = new SQL.Database();
    freshDb.run(CREATE_TABLES_SQL);

    // Path 2: Migration path - run each migration in order
    // Start with minimal v1 schema (what existed before migrations)
    const migratedDb = new SQL.Database();
    migratedDb.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        need TEXT NOT NULL,
        constraints TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE lineages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        label TEXT NOT NULL,
        strategy_tag TEXT,
        is_locked INTEGER DEFAULT 0,
        directive_sticky TEXT,
        directive_oneshot TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        lineage_id TEXT NOT NULL,
        cycle INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE evaluations (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        score INTEGER,
        comment TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        data TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    `);

    // Apply all migrations
    for (const migration of MIGRATIONS) {
      try {
        migratedDb.run(migration.sql);
      } catch {
        // Some migrations may fail (e.g., DELETE on empty table), that's expected
      }
    }

    // Compare all tables
    const freshTables = getTableNames(freshDb);
    const migratedTables = getTableNames(migratedDb);

    // Tables should match (excluding schema_version which both have)
    expect(new Set(freshTables)).toEqual(new Set(migratedTables));

    // Compare columns for each table
    for (const tableName of freshTables) {
      const freshCols = getTableColumns(freshDb, tableName);
      const migratedCols = getTableColumns(migratedDb, tableName);

      expect(freshCols, `Table ${tableName} columns should match`).toEqual(
        migratedCols
      );
    }

    freshDb.close();
    migratedDb.close();
  });

  it('fresh database should work with createSession query', () => {
    // This specifically tests the bug scenario
    const db = new SQL.Database();
    db.run(CREATE_TABLES_SQL);

    // This is the exact query from queries.ts that was failing
    expect(() => {
      db.run(
        `INSERT INTO sessions (id, name, need, constraints, input_prompt, mode, initial_agent_count, trainer_messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'test-id',
          'Test',
          'Test need',
          null,
          null,
          'training',
          4,
          '[]',
          Date.now(),
          Date.now(),
        ]
      );
    }).not.toThrow();

    db.close();
  });
});
