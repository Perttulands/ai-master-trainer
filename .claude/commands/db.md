# /db - Database Operations

Manage SQLite database operations.

## Subcommands

- `/db init` - Initialize database with schema
- `/db reset` - Drop all tables and reinitialize
- `/db seed` - Add sample data for development
- `/db migrate` - Run pending migrations
- `/db query <sql>` - Run a raw SQL query (dev only)

## Steps

### init
1. Check if database exists
2. Run schema creation from `src/db/schema.ts`
3. Report tables created

### reset
1. Confirm with user (destructive operation)
2. Drop all tables
3. Run init

### seed
1. Check database is initialized
2. Insert sample sessions, lineages, artifacts
3. Report records created

### migrate
1. Check current schema version
2. Run any pending migrations from `src/db/migrations.ts`
3. Update schema version

## Database Location

Browser: IndexedDB via sql.js
File path from env: `SQLITE_DB_PATH`
