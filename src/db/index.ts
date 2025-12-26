import type { Database, SqlJsStatic } from 'sql.js';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema';

let db: Database | null = null;

const DB_STORAGE_KEY = 'training-camp-db';

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
      const data = Uint8Array.from(atob(savedData), (c) => c.charCodeAt(0));
      db = new SQL.Database(data);
    } catch (e) {
      console.warn('Failed to load saved database, creating new one:', e);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(database: Database): void {
  // Create tables if they don't exist
  database.run(CREATE_TABLES_SQL);

  // Check current schema version
  const result = database.exec('SELECT version FROM schema_version LIMIT 1');
  const currentVersion = result.length > 0 ? (result[0].values[0][0] as number) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    // Run any necessary migrations here
    // For now, just update the version
    if (currentVersion === 0) {
      database.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    } else {
      database.run('UPDATE schema_version SET version = ?', [SCHEMA_VERSION]);
    }
  }

  // Save after migrations
  saveDatabase();
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db) return;

  try {
    const data = db.export();
    const base64 = btoa(String.fromCharCode(...data));
    localStorage.setItem(DB_STORAGE_KEY, base64);
  } catch (e) {
    console.error('Failed to save database:', e);
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
