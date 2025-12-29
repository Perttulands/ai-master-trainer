import type { Database, SqlJsStatic } from 'sql.js';
import { CREATE_TABLES_SQL, SCHEMA_VERSION, MIGRATIONS } from './schema';

let db: Database | null = null;

const DB_STORAGE_KEY = 'training-camp-db';

/**
 * Convert Uint8Array to Base64 string using chunked processing.
 * This avoids stack overflow that occurs when using spread operator
 * on large arrays (> ~10KB).
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  if (data.length === 0) return '';

  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Convert Base64 string back to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (base64 === '') return new Uint8Array(0);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Testing helpers
export function _setDbForTesting(database: Database | null): void {
  db = database;
}

export function _getDbForTesting(): Database | null {
  return db;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  console.log('Training Camp: Loading sql.js WASM...');
  // Dynamic import to handle CommonJS/ESM interop
  const sqlJsModule = await import('sql.js');
  const initSqlJs = (sqlJsModule.default || sqlJsModule) as (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<SqlJsStatic>;

  const SQL = await initSqlJs({
    // Use local WASM file (copied from node_modules to public folder)
    locateFile: (file: string) => `/${file}`,
  });
  console.log('Training Camp: sql.js loaded successfully');

  // Try to load existing database from localStorage
  const savedData = localStorage.getItem(DB_STORAGE_KEY);
  if (savedData) {
    try {
      const data = base64ToUint8Array(savedData);
      db = new SQL.Database(data);
    } catch (e) {
      console.warn('Failed to load saved database, creating new one:', e);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Apply migrations
  applyMigrations(db);

  // Save after migrations
  saveDatabase();

  return db;
}

/**
 * Apply database migrations to bring schema up to current version.
 *
 * For new databases (no schema_version table): Creates all tables fresh.
 * For existing databases: Applies each pending migration in order.
 *
 * @param database - The sql.js Database instance to migrate
 */
export function applyMigrations(database: Database): void {
  // Check if schema_version table exists (indicates existing database)
  const tableCheck = database.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  );
  const hasSchemaVersion = tableCheck.length > 0 && tableCheck[0].values.length > 0;

  if (!hasSchemaVersion) {
    // Fresh database - create all tables with current schema
    console.log('Training Camp: Creating fresh database at version', SCHEMA_VERSION);
    database.run(CREATE_TABLES_SQL);
    database.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    return;
  }

  // Existing database - check version and apply migrations
  const result = database.exec('SELECT version FROM schema_version LIMIT 1');
  const currentVersion = result.length > 0 ? (result[0].values[0][0] as number) : 0;

  if (currentVersion >= SCHEMA_VERSION) {
    console.log('Training Camp: Database already at version', currentVersion);
    return;
  }

  console.log(`Training Camp: Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);

  // Find and apply all pending migrations in order
  const pendingMigrations = MIGRATIONS
    .filter(m => m.fromVersion >= currentVersion && m.toVersion <= SCHEMA_VERSION)
    .sort((a, b) => a.fromVersion - b.fromVersion);

  for (const migration of pendingMigrations) {
    console.log(`Training Camp: Applying migration ${migration.fromVersion} → ${migration.toVersion}`);
    try {
      database.run(migration.sql);
      // Update version after each successful migration
      database.run('UPDATE schema_version SET version = ?', [migration.toVersion]);
    } catch (error) {
      console.error(`Training Camp: Migration ${migration.fromVersion} → ${migration.toVersion} failed:`, error);
      throw error;
    }
  }

  console.log('Training Camp: Database migration complete');
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const data = db.export();
  const base64 = uint8ArrayToBase64(data);

  try {
    localStorage.setItem(DB_STORAGE_KEY, base64);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Export your data or clear old sessions.');
    }
    throw e;
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
