import type { SqlValue } from 'sql.js';
import { getDatabase, saveDatabase } from './index';
import { generateId } from '../utils/id';
import { logAudit } from './queries';
import {
  TRAINING_SIGNAL_SCHEMA_VERSION,
  type TrainingEvent,
  type TrainingEventType,
  type CreateTrainingEventInput,
  type PayloadBlob,
  type TrainingExample,
  type TrainingExampleType,
  type CreateTrainingExampleInput,
  type ExportFilter,
} from '../types/training-signal';

type SqlRow = SqlValue[];

// ============ Hashing Utilities ============

/**
 * Simple djb2 hash for synchronous content-addressed storage.
 * Good enough for deduplication within the browser context.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash content for content-addressed storage.
 * Uses djb2 for performance in synchronous contexts.
 */
export function hashContent(content: unknown): string {
  const json = JSON.stringify(content);
  // Add length prefix for additional uniqueness
  return `djb2-${json.length.toString(16)}-${djb2Hash(json)}`;
}

/**
 * Async SHA256 hash for more robust deduplication.
 * Use when async context is available.
 */
export async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============ Payload Blob Functions ============

/**
 * Store content in content-addressed blob storage.
 * Returns the hash (primary key) of the stored content.
 * If content already exists, returns existing hash without re-storing.
 */
export function storePayload(content: unknown): string {
  const db = getDatabase();
  const json = JSON.stringify(content);
  const hash = hashContent(content);
  const now = Date.now();

  // Check if blob already exists
  const existing = db.exec('SELECT hash FROM payload_blobs WHERE hash = ?', [hash]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return hash; // Already stored
  }

  // Store new blob
  db.run('INSERT INTO payload_blobs (hash, content, created_at) VALUES (?, ?, ?)', [
    hash,
    json,
    now,
  ]);

  saveDatabase();
  return hash;
}

/**
 * Retrieve content from blob storage by hash.
 * Returns null if hash not found.
 */
export function getPayload<T>(hash: string): T | null {
  const db = getDatabase();
  const result = db.exec('SELECT content FROM payload_blobs WHERE hash = ?', [hash]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const content = result[0].values[0][0] as string;
  return JSON.parse(content) as T;
}

/**
 * Get payload blob metadata by hash.
 */
export function getPayloadBlob(hash: string): PayloadBlob | null {
  const db = getDatabase();
  const result = db.exec('SELECT hash, content, created_at FROM payload_blobs WHERE hash = ?', [
    hash,
  ]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return parsePayloadBlobRow(result[0].values[0]);
}

function parsePayloadBlobRow(row: SqlRow): PayloadBlob {
  return {
    hash: row[0] as string,
    content: row[1] as string,
    createdAt: row[2] as number,
  };
}

// ============ Training Event Functions ============

/**
 * Create a new training event.
 * Events are immutable records of training-relevant actions.
 */
export function createTrainingEvent(input: CreateTrainingEventInput): TrainingEvent {
  const db = getDatabase();
  const now = Date.now();
  const event: TrainingEvent = {
    id: generateId(),
    timestamp: now,
    eventType: input.eventType,
    schemaVersion: TRAINING_SIGNAL_SCHEMA_VERSION,
    sessionId: input.sessionId,
    lineageId: input.lineageId,
    agentId: input.agentId,
    artifactId: input.artifactId,
    attemptId: input.attemptId,
    payloadHash: input.payloadHash,
    tags: input.tags || [],
  };

  db.run(
    `INSERT INTO training_events (id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.timestamp,
      event.eventType,
      event.schemaVersion,
      event.sessionId ?? null,
      event.lineageId ?? null,
      event.agentId ?? null,
      event.artifactId ?? null,
      event.attemptId ?? null,
      event.payloadHash,
      JSON.stringify(event.tags),
      now,
    ]
  );

  logAudit('training_event_created', 'training_event', event.id, {
    eventType: event.eventType,
    payloadHash: event.payloadHash,
  });
  saveDatabase();
  return event;
}

/**
 * Get a training event by ID.
 */
export function getTrainingEvent(id: string): TrainingEvent | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
     FROM training_events WHERE id = ?`,
    [id]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return parseTrainingEventRow(result[0].values[0]);
}

/**
 * Get all training events for a session.
 */
export function getTrainingEventsBySession(sessionId: string): TrainingEvent[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
     FROM training_events WHERE session_id = ? ORDER BY timestamp DESC`,
    [sessionId]
  );

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingEventRow);
}

/**
 * Get all training events of a specific type.
 */
export function getTrainingEventsByType(eventType: TrainingEventType): TrainingEvent[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
     FROM training_events WHERE event_type = ? ORDER BY timestamp DESC`,
    [eventType]
  );

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingEventRow);
}

/**
 * Get training events within a time range.
 */
export function getTrainingEventsByTimeRange(from: number, to: number): TrainingEvent[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
     FROM training_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC`,
    [from, to]
  );

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingEventRow);
}

/**
 * Query training events with flexible filtering.
 */
export function queryTrainingEvents(filter: Partial<ExportFilter>): TrainingEvent[] {
  const db = getDatabase();
  const conditions: string[] = ['1=1'];
  const params: SqlValue[] = [];

  if (filter.eventTypes && filter.eventTypes.length > 0) {
    const placeholders = filter.eventTypes.map(() => '?').join(', ');
    conditions.push(`event_type IN (${placeholders})`);
    params.push(...filter.eventTypes);
  }

  if (filter.fromTimestamp !== undefined) {
    conditions.push('timestamp >= ?');
    params.push(filter.fromTimestamp);
  }

  if (filter.toTimestamp !== undefined) {
    conditions.push('timestamp <= ?');
    params.push(filter.toTimestamp);
  }

  if (filter.tags && filter.tags.length > 0) {
    // Filter by tags - check if any requested tag is in the event's tags
    // Since tags are stored as JSON array, we use LIKE for simple matching
    const tagConditions = filter.tags.map(() => `tags LIKE ?`);
    conditions.push(`(${tagConditions.join(' OR ')})`);
    params.push(...filter.tags.map((tag) => `%"${tag}"%`));
  }

  const sql = `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
     FROM training_events WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;

  const result = db.exec(sql, params);

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingEventRow);
}

function parseTrainingEventRow(row: SqlRow): TrainingEvent {
  return {
    id: row[0] as string,
    timestamp: row[1] as number,
    eventType: row[2] as TrainingEventType,
    schemaVersion: row[3] as number,
    sessionId: row[4] as string | undefined,
    lineageId: row[5] as string | undefined,
    agentId: row[6] as string | undefined,
    artifactId: row[7] as string | undefined,
    attemptId: row[8] as string | undefined,
    payloadHash: row[9] as string,
    tags: row[10] ? JSON.parse(row[10] as string) : [],
  };
}

// ============ Training Example Functions ============

/**
 * Create a materialized training example.
 * Examples are derived from events and ready for export.
 */
export function createTrainingExample(input: CreateTrainingExampleInput): TrainingExample {
  const db = getDatabase();
  const now = Date.now();
  const example: TrainingExample = {
    id: generateId(),
    exampleType: input.exampleType,
    systemPromptHash: input.systemPromptHash,
    inputHash: input.inputHash,
    completionHash: input.completionHash,
    chosenHash: input.chosenHash,
    rejectedHash: input.rejectedHash,
    score: input.score,
    scoreDelta: input.scoreDelta,
    sourceEventIds: input.sourceEventIds,
    createdAt: now,
  };

  db.run(
    `INSERT INTO training_examples (id, example_type, system_prompt_hash, user_input_hash, completion_hash, chosen_hash, rejected_hash, score, score_delta, source_event_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      example.id,
      example.exampleType,
      example.systemPromptHash ?? null,
      example.inputHash ?? null,
      example.completionHash ?? null,
      example.chosenHash ?? null,
      example.rejectedHash ?? null,
      example.score ?? null,
      example.scoreDelta ?? null,
      JSON.stringify(example.sourceEventIds),
      example.createdAt,
    ]
  );

  logAudit('training_example_created', 'training_example', example.id, {
    exampleType: example.exampleType,
  });
  saveDatabase();
  return example;
}

/**
 * Get a training example by ID.
 */
export function getTrainingExample(id: string): TrainingExample | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, example_type, system_prompt_hash, user_input_hash, completion_hash, chosen_hash, rejected_hash, score, score_delta, source_event_ids, created_at
     FROM training_examples WHERE id = ?`,
    [id]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return parseTrainingExampleRow(result[0].values[0]);
}

/**
 * Get all training examples of a specific type.
 */
export function getTrainingExamplesByType(type: TrainingExampleType): TrainingExample[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, example_type, system_prompt_hash, user_input_hash, completion_hash, chosen_hash, rejected_hash, score, score_delta, source_event_ids, created_at
     FROM training_examples WHERE example_type = ? ORDER BY created_at DESC`,
    [type]
  );

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingExampleRow);
}

/**
 * Get training examples for export with filtering.
 */
export function getTrainingExamplesForExport(filter: ExportFilter): TrainingExample[] {
  const db = getDatabase();
  const conditions: string[] = ['1=1'];
  const params: SqlValue[] = [];

  if (filter.minScore !== undefined) {
    conditions.push('score >= ?');
    params.push(filter.minScore);
  }

  if (filter.maxScore !== undefined) {
    conditions.push('score <= ?');
    params.push(filter.maxScore);
  }

  if (filter.minScoreDelta !== undefined) {
    conditions.push('score_delta >= ?');
    params.push(filter.minScoreDelta);
  }

  if (filter.fromTimestamp !== undefined) {
    conditions.push('created_at >= ?');
    params.push(filter.fromTimestamp);
  }

  if (filter.toTimestamp !== undefined) {
    conditions.push('created_at <= ?');
    params.push(filter.toTimestamp);
  }

  const sql = `SELECT id, example_type, system_prompt_hash, user_input_hash, completion_hash, chosen_hash, rejected_hash, score, score_delta, source_event_ids, created_at
     FROM training_examples WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;

  const result = db.exec(sql, params);

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingExampleRow);
}

/**
 * Get all training examples for specific source events.
 */
export function getTrainingExamplesBySourceEvents(eventIds: string[]): TrainingExample[] {
  const db = getDatabase();
  // Use LIKE to find examples that reference any of the given event IDs
  // This is a simplified approach - for production, consider a junction table
  const conditions = eventIds.map(() => `source_event_ids LIKE ?`);
  const params = eventIds.map((id) => `%"${id}"%`);

  const sql = `SELECT id, example_type, system_prompt_hash, user_input_hash, completion_hash, chosen_hash, rejected_hash, score, score_delta, source_event_ids, created_at
     FROM training_examples WHERE ${conditions.join(' OR ')} ORDER BY created_at DESC`;

  const result = db.exec(sql, params);

  if (result.length === 0) return [];

  return result[0].values.map(parseTrainingExampleRow);
}

function parseTrainingExampleRow(row: SqlRow): TrainingExample {
  return {
    id: row[0] as string,
    exampleType: row[1] as TrainingExampleType,
    systemPromptHash: row[2] as string | undefined,
    inputHash: row[3] as string | undefined,
    completionHash: row[4] as string | undefined,
    chosenHash: row[5] as string | undefined,
    rejectedHash: row[6] as string | undefined,
    score: row[7] as number | undefined,
    scoreDelta: row[8] as number | undefined,
    sourceEventIds: row[9] ? JSON.parse(row[9] as string) : [],
    createdAt: row[10] as number,
  };
}

// ============ Bulk Operations ============

/**
 * Store multiple payloads and return a map of content to hash.
 * Useful for batch operations.
 */
export function storePayloads(contents: unknown[]): Map<unknown, string> {
  const result = new Map<unknown, string>();
  for (const content of contents) {
    const hash = storePayload(content);
    result.set(content, hash);
  }
  return result;
}

/**
 * Get multiple payloads by their hashes.
 */
export function getPayloads<T>(hashes: string[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const hash of hashes) {
    const payload = getPayload<T>(hash);
    if (payload !== null) {
      result.set(hash, payload);
    }
  }
  return result;
}

// ============ Statistics ============

/**
 * Get count of training events by type.
 */
export function getTrainingEventCounts(): Map<TrainingEventType, number> {
  const db = getDatabase();
  const result = db.exec(
    'SELECT event_type, COUNT(*) as count FROM training_events GROUP BY event_type'
  );

  const counts = new Map<TrainingEventType, number>();
  if (result.length > 0) {
    for (const row of result[0].values) {
      counts.set(row[0] as TrainingEventType, row[1] as number);
    }
  }
  return counts;
}

/**
 * Get count of training examples by type.
 */
export function getTrainingExampleCounts(): Map<TrainingExampleType, number> {
  const db = getDatabase();
  const result = db.exec(
    'SELECT example_type, COUNT(*) as count FROM training_examples GROUP BY example_type'
  );

  const counts = new Map<TrainingExampleType, number>();
  if (result.length > 0) {
    for (const row of result[0].values) {
      counts.set(row[0] as TrainingExampleType, row[1] as number);
    }
  }
  return counts;
}

/**
 * Get total size of payload blob storage.
 */
export function getPayloadStorageStats(): { count: number; totalBytes: number } {
  const db = getDatabase();
  const result = db.exec(
    'SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(content)), 0) as total_bytes FROM payload_blobs'
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return { count: 0, totalBytes: 0 };
  }

  return {
    count: result[0].values[0][0] as number,
    totalBytes: result[0].values[0][1] as number,
  };
}
