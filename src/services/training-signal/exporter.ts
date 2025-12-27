/**
 * Training Signal Export Service
 *
 * Exports training data in formats suitable for fine-tuning:
 * - JSONL: Generic JSON Lines format
 * - CSV: Comma-separated values for spreadsheet analysis
 * - SFT: Supervised Fine-Tuning format (messages array)
 * - DPO: Direct Preference Optimization format (chosen/rejected pairs)
 *
 * IMPORTANT: Export should never break the main app - all operations
 * are wrapped in try/catch with console.warn for failures.
 */

import { getDatabase } from '../../db/index';
import { getPayload } from '../../db/training-signal-queries';
import type { TrainingEvent, TrainingEventType } from '../../types/training-signal';
import type { SqlValue } from 'sql.js';

// ============ Types ============

export type ExportFormat = 'jsonl' | 'csv' | 'sft' | 'dpo';

export interface ExportOptions {
  format: ExportFormat;
  sessionId?: string; // Filter by session
  eventTypes?: TrainingEventType[]; // Filter by event types
  tags?: string[]; // Filter by tags
  fromDate?: number;
  toDate?: number;
  includePayloads?: boolean;
}

export interface ExportResult {
  data: string; // Exported content
  format: ExportFormat;
  eventCount: number;
  filename: string;
}

// ============ Internal Types ============

interface SftMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SftExample {
  messages: SftMessage[];
}

interface DpoExample {
  prompt: string;
  chosen: string;
  rejected: string;
}

interface ArtifactScoredPayload {
  artifactId?: string;
  lineageId?: string;
  cycle?: number;
  content?: string;
  score?: number;
  comment?: string;
  metadata?: unknown;
}

interface AttemptCompletedPayload {
  attemptId?: string;
  agentSnapshot?: {
    systemPrompt?: string;
  };
  input?: string;
  output?: string;
}

// ============ Main Export Function ============

/**
 * Export training data in the specified format.
 */
export async function exportTrainingData(options: ExportOptions): Promise<ExportResult> {
  try {
    const events = queryTrainingEvents(options);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    let data: string;
    let filename: string;

    switch (options.format) {
      case 'jsonl':
        data = exportAsJsonl(events, options.includePayloads);
        filename = `training-events-${timestamp}.jsonl`;
        break;
      case 'csv':
        data = exportAsCsv(events);
        filename = `training-events-${timestamp}.csv`;
        break;
      case 'sft':
        data = exportAsSft(events);
        filename = `training-sft-${timestamp}.jsonl`;
        break;
      case 'dpo':
        data = exportAsDpo(events);
        filename = `training-dpo-${timestamp}.jsonl`;
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    return {
      data,
      format: options.format,
      eventCount: events.length,
      filename,
    };
  } catch (error) {
    console.warn('Failed to export training data:', error);
    return {
      data: '',
      format: options.format,
      eventCount: 0,
      filename: `export-failed-${Date.now()}.txt`,
    };
  }
}

// ============ Format-Specific Exports ============

/**
 * Export events as JSON Lines format.
 * Each line is a valid JSON object.
 */
export function exportAsJsonl(events: TrainingEvent[], includePayloads: boolean = false): string {
  try {
    const lines = events.map((event) => {
      const exportedEvent: Record<string, unknown> = {
        id: event.id,
        timestamp: event.timestamp,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        sessionId: event.sessionId,
        lineageId: event.lineageId,
        agentId: event.agentId,
        artifactId: event.artifactId,
        attemptId: event.attemptId,
        payloadHash: event.payloadHash,
        tags: event.tags,
      };

      if (includePayloads) {
        const payload = getPayload(event.payloadHash);
        if (payload !== null) {
          exportedEvent.payload = payload;
        }
      }

      return JSON.stringify(exportedEvent);
    });

    return lines.join('\n');
  } catch (error) {
    console.warn('Failed to export as JSONL:', error);
    return '';
  }
}

/**
 * Export events as CSV format.
 * Suitable for spreadsheet analysis.
 */
export function exportAsCsv(events: TrainingEvent[]): string {
  try {
    const headers = [
      'id',
      'timestamp',
      'event_type',
      'schema_version',
      'session_id',
      'lineage_id',
      'agent_id',
      'artifact_id',
      'attempt_id',
      'payload_hash',
      'tags',
    ];

    const rows = events.map((event) => {
      return [
        escapeCSV(event.id),
        event.timestamp.toString(),
        escapeCSV(event.eventType),
        event.schemaVersion.toString(),
        escapeCSV(event.sessionId || ''),
        escapeCSV(event.lineageId || ''),
        escapeCSV(event.agentId || ''),
        escapeCSV(event.artifactId || ''),
        escapeCSV(event.attemptId || ''),
        escapeCSV(event.payloadHash),
        escapeCSV(JSON.stringify(event.tags)),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  } catch (error) {
    console.warn('Failed to export as CSV:', error);
    return '';
  }
}

/**
 * Export as SFT (Supervised Fine-Tuning) format.
 * Creates message arrays from attempt completions.
 *
 * Format:
 * {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
 */
export function exportAsSft(events: TrainingEvent[]): string {
  try {
    // Filter to attempt.completed events which have the full conversation
    const completedEvents = events.filter((e) => e.eventType === 'attempt.completed');

    const sftExamples: SftExample[] = [];

    for (const event of completedEvents) {
      const payload = getPayload<AttemptCompletedPayload>(event.payloadHash);
      if (!payload) continue;

      const systemPrompt = payload.agentSnapshot?.systemPrompt;
      const input = payload.input;
      const output = payload.output;

      // Skip if we don't have all required fields
      if (!input || !output) continue;

      const messages: SftMessage[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push({ role: 'user', content: input });
      messages.push({ role: 'assistant', content: output });

      sftExamples.push({ messages });
    }

    return sftExamples.map((ex) => JSON.stringify(ex)).join('\n');
  } catch (error) {
    console.warn('Failed to export as SFT:', error);
    return '';
  }
}

/**
 * Export as DPO (Direct Preference Optimization) format.
 * Uses artifact scores to determine chosen (high score) vs rejected (low score).
 *
 * Format:
 * {"prompt": "...", "chosen": "...", "rejected": "..."}
 */
export function exportAsDpo(events: TrainingEvent[]): string {
  try {
    // Filter to artifact.scored events
    const scoredEvents = events.filter((e) => e.eventType === 'artifact.scored');

    // Group by lineage to find comparable artifacts
    const byLineage = new Map<string, Array<{ event: TrainingEvent; payload: ArtifactScoredPayload }>>();

    for (const event of scoredEvents) {
      const payload = getPayload<ArtifactScoredPayload>(event.payloadHash);
      if (!payload || !payload.lineageId || payload.score === undefined) continue;

      const lineageId = payload.lineageId;
      if (!byLineage.has(lineageId)) {
        byLineage.set(lineageId, []);
      }
      byLineage.get(lineageId)!.push({ event, payload });
    }

    const dpoExamples: DpoExample[] = [];

    // For each lineage, create pairs from high vs low scored artifacts
    byLineage.forEach((artifacts) => {
      // Sort by score descending
      artifacts.sort((a, b) => (b.payload.score ?? 0) - (a.payload.score ?? 0));

      // Get high-scored (>= 7) and low-scored (< 5) artifacts
      const highScored = artifacts.filter((a) => (a.payload.score ?? 0) >= 7);
      const lowScored = artifacts.filter((a) => (a.payload.score ?? 0) < 5);

      // Create pairs
      for (const chosen of highScored) {
        for (const rejected of lowScored) {
          // Skip if same cycle (should compare different attempts)
          if (chosen.payload.cycle === rejected.payload.cycle) continue;

          const chosenContent = chosen.payload.content;
          const rejectedContent = rejected.payload.content;

          if (!chosenContent || !rejectedContent) continue;

          // Use the lineage context as the prompt
          // In a real scenario, you might want to fetch the original input
          const prompt = `Generate content for lineage ${chosen.payload.lineageId}`;

          dpoExamples.push({
            prompt,
            chosen: chosenContent,
            rejected: rejectedContent,
          });
        }
      }
    });

    return dpoExamples.map((ex) => JSON.stringify(ex)).join('\n');
  } catch (error) {
    console.warn('Failed to export as DPO:', error);
    return '';
  }
}

// ============ Query Helpers ============

/**
 * Query training events with flexible filtering.
 */
export function queryTrainingEvents(options: Partial<ExportOptions>): TrainingEvent[] {
  try {
    const db = getDatabase();
    const conditions: string[] = ['1=1'];
    const params: SqlValue[] = [];

    if (options.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      const placeholders = options.eventTypes.map(() => '?').join(', ');
      conditions.push(`event_type IN (${placeholders})`);
      params.push(...options.eventTypes);
    }

    if (options.fromDate !== undefined) {
      conditions.push('timestamp >= ?');
      params.push(options.fromDate);
    }

    if (options.toDate !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(options.toDate);
    }

    if (options.tags && options.tags.length > 0) {
      // Filter by tags - check if any requested tag is in the event's tags
      const tagConditions = options.tags.map(() => `tags LIKE ?`);
      conditions.push(`(${tagConditions.join(' OR ')})`);
      params.push(...options.tags.map((tag) => `%"${tag}"%`));
    }

    const sql = `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
       FROM training_events WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;

    const result = db.exec(sql, params);

    if (result.length === 0) return [];

    return result[0].values.map(parseTrainingEventRow);
  } catch (error) {
    console.warn('Failed to query training events:', error);
    return [];
  }
}

/**
 * Get count of events matching export options.
 */
export function getExportableEventCount(options?: Partial<ExportOptions>): number {
  try {
    const db = getDatabase();
    const conditions: string[] = ['1=1'];
    const params: SqlValue[] = [];

    if (options?.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }

    if (options?.eventTypes && options.eventTypes.length > 0) {
      const placeholders = options.eventTypes.map(() => '?').join(', ');
      conditions.push(`event_type IN (${placeholders})`);
      params.push(...options.eventTypes);
    }

    if (options?.fromDate !== undefined) {
      conditions.push('timestamp >= ?');
      params.push(options.fromDate);
    }

    if (options?.toDate !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(options.toDate);
    }

    if (options?.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => `tags LIKE ?`);
      conditions.push(`(${tagConditions.join(' OR ')})`);
      params.push(...options.tags.map((tag) => `%"${tag}"%`));
    }

    const sql = `SELECT COUNT(*) as count FROM training_events WHERE ${conditions.join(' AND ')}`;

    const result = db.exec(sql, params);

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  } catch (error) {
    console.warn('Failed to get exportable event count:', error);
    return 0;
  }
}

// ============ Helper Functions ============

/**
 * Parse a SQL row into a TrainingEvent object.
 */
function parseTrainingEventRow(row: SqlValue[]): TrainingEvent {
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

/**
 * Escape a value for CSV format.
 * Wraps in quotes if contains comma, quote, or newline.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
