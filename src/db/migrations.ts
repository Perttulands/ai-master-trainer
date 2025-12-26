import type { Database } from 'sql.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SCHEMA_VERSION } from './schema';

interface Migration {
  version: number;
  up: (db: Database) => void;
}

// Add migrations here as the schema evolves
const migrations: Migration[] = [
  // Example migration for future use:
  // {
  //   version: 2,
  //   up: (db) => {
  //     db.run('ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT "active"');
  //   },
  // },
];

export function runMigrations(db: Database, fromVersion: number): void {
  const pendingMigrations = migrations.filter((m) => m.version > fromVersion && m.version <= SCHEMA_VERSION);

  for (const migration of pendingMigrations) {
    console.log(`Running migration to version ${migration.version}`);
    migration.up(db);
  }
}
