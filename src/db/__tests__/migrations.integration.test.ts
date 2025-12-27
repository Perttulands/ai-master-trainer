/**
 * Integration tests for database migrations
 *
 * These tests use real sql.js instances (not mocks) to verify
 * that migrations work correctly on actual databases.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Database, SqlJsStatic } from 'sql.js';

// Unmock sql.js for these integration tests
vi.unmock('sql.js');
vi.unmock('../index');

// Import the actual migration logic - we'll test the real implementation
import { SCHEMA_VERSION, MIGRATIONS } from '../schema';

// We need to dynamically import sql.js to get a real instance
let SQL: SqlJsStatic;

beforeAll(async () => {
  // Load real sql.js (not mocked)
  const sqlJsModule = await import('sql.js');
  const initSqlJs = sqlJsModule.default;
  SQL = await initSqlJs();
});

/**
 * Create a database at version 4 schema (before Quick Start mode was added)
 * This simulates what an existing user's database would look like
 */
function createDatabaseAtVersion4(): Database {
  const db = new SQL.Database();

  // This is the schema as it existed at version 4
  // Sessions table WITHOUT mode and promoted_from columns
  db.run(`
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
      score INTEGER NOT NULL,
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
    INSERT INTO schema_version (version) VALUES (4);
  `);

  return db;
}

// Helper to check if a column exists in a table
function columnExists(db: Database, table: string, column: string): boolean {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return false;
  return result[0].values.some(row => row[1] === column);
}

// Helper to check if a table exists
function tableExists(db: Database, table: string): boolean {
  const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
  return result.length > 0 && result[0].values.length > 0;
}

describe('Database Migrations Integration', () => {
  describe('Migration 4 → 5 (Quick Start mode support)', () => {
    it('should add mode column to sessions table', () => {
      // Create a database at version 4 (without mode column)
      const db = createDatabaseAtVersion4();

      // Verify mode column does NOT exist yet
      expect(columnExists(db, 'sessions', 'mode')).toBe(false);

      // Apply migration 4 → 5
      const migration = MIGRATIONS.find(m => m.fromVersion === 4 && m.toVersion === 5);
      expect(migration).toBeDefined();
      db.run(migration!.sql);

      // Verify mode column NOW exists
      expect(columnExists(db, 'sessions', 'mode')).toBe(true);

      db.close();
    });

    it('should add promoted_from column to sessions table', () => {
      const db = createDatabaseAtVersion4();

      expect(columnExists(db, 'sessions', 'promoted_from')).toBe(false);

      const migration = MIGRATIONS.find(m => m.fromVersion === 4 && m.toVersion === 5);
      db.run(migration!.sql);

      expect(columnExists(db, 'sessions', 'promoted_from')).toBe(true);

      db.close();
    });

    it('should create quickstart_feedback table', () => {
      const db = createDatabaseAtVersion4();

      expect(tableExists(db, 'quickstart_feedback')).toBe(false);

      const migration = MIGRATIONS.find(m => m.fromVersion === 4 && m.toVersion === 5);
      db.run(migration!.sql);

      expect(tableExists(db, 'quickstart_feedback')).toBe(true);

      db.close();
    });

    it('should allow inserting sessions with mode after migration', () => {
      const db = createDatabaseAtVersion4();

      const migration = MIGRATIONS.find(m => m.fromVersion === 4 && m.toVersion === 5);
      db.run(migration!.sql);

      // This should not throw
      expect(() => {
        db.run(
          `INSERT INTO sessions (id, name, need, constraints, mode, promoted_from, created_at, updated_at)
           VALUES ('test-1', 'Test', 'Test need', NULL, 'quickstart', NULL, 1234567890, 1234567890)`
        );
      }).not.toThrow();

      // Verify the data
      const result = db.exec(`SELECT mode FROM sessions WHERE id = 'test-1'`);
      expect(result[0].values[0][0]).toBe('quickstart');

      db.close();
    });
  });

  describe('applyMigrations function', () => {
    // This is the critical test - it tests the actual migration runner
    // that was broken (it didn't apply migrations, just updated version)

    it('should apply pending migrations when database is at older version', async () => {
      // Create a version 4 database (simulating existing user data)
      const db = createDatabaseAtVersion4();

      // Add some existing data
      db.run(`INSERT INTO sessions (id, name, need, constraints, created_at, updated_at)
              VALUES ('existing-session', 'Old Session', 'Some need', NULL, 1234567890, 1234567890)`);

      // Verify we're at version 4 without mode column
      const versionResult = db.exec('SELECT version FROM schema_version');
      expect(versionResult[0].values[0][0]).toBe(4);
      expect(columnExists(db, 'sessions', 'mode')).toBe(false);

      // Import and run the actual migration function from index.ts
      // This is what should apply the migrations
      const { applyMigrations } = await import('../index');

      // Run migrations
      applyMigrations(db);

      // Verify migration was applied
      expect(columnExists(db, 'sessions', 'mode')).toBe(true);

      // Verify existing data still exists and has default mode
      const sessionResult = db.exec(`SELECT id, mode FROM sessions WHERE id = 'existing-session'`);
      expect(sessionResult[0].values[0][0]).toBe('existing-session');
      expect(sessionResult[0].values[0][1]).toBe('training'); // default value

      // Verify version was updated
      const newVersionResult = db.exec('SELECT version FROM schema_version');
      expect(newVersionResult[0].values[0][0]).toBe(SCHEMA_VERSION);

      db.close();
    });

    it('should not fail on a fresh database (no existing schema_version)', async () => {
      const db = new SQL.Database();

      const { applyMigrations } = await import('../index');

      // Should not throw
      expect(() => applyMigrations(db)).not.toThrow();

      // Should have created tables and set version
      const versionResult = db.exec('SELECT version FROM schema_version');
      expect(versionResult[0].values[0][0]).toBe(SCHEMA_VERSION);

      // Should have mode column since we're creating fresh
      expect(columnExists(db, 'sessions', 'mode')).toBe(true);

      db.close();
    });
  });
});
