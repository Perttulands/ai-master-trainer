import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDatabase } from '../../../db/index';
import * as trainingSignalQueries from '../../../db/training-signal-queries';
import {
  exportTrainingData,
  exportAsJsonl,
  exportAsCsv,
  exportAsSft,
  exportAsDpo,
  queryTrainingEvents,
  getExportableEventCount,
} from '../exporter';
import type { TrainingEvent } from '../../../types/training-signal';

// Mock the training signal queries module
vi.mock('../../../db/training-signal-queries', () => ({
  getPayload: vi.fn(),
}));

// Create test events
function createTestEvent(overrides: Partial<TrainingEvent> = {}): TrainingEvent {
  return {
    id: 'event-123',
    timestamp: Date.now(),
    eventType: 'artifact.scored',
    schemaVersion: 1,
    sessionId: 'session-123',
    lineageId: 'lineage-123',
    agentId: 'agent-123',
    artifactId: 'artifact-123',
    attemptId: 'attempt-123',
    payloadHash: 'hash-123',
    tags: ['tag1', 'tag2'],
    ...overrides,
  };
}

describe('Training Signal Exporter', () => {
  let mockDb: ReturnType<typeof getDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = getDatabase();
    // Reset the mock to return empty array by default
    (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  describe('queryTrainingEvents', () => {
    it('should query all events when no filters provided', () => {
      const event = createTestEvent();
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [
            [
              event.id,
              event.timestamp,
              event.eventType,
              event.schemaVersion,
              event.sessionId,
              event.lineageId,
              event.agentId,
              event.artifactId,
              event.attemptId,
              event.payloadHash,
              JSON.stringify(event.tags),
            ],
          ],
        },
      ]);

      const result = queryTrainingEvents({});

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.any(Array)
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(event.id);
    });

    it('should filter by sessionId', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      queryTrainingEvents({ sessionId: 'session-456' });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('session_id = ?'),
        expect.arrayContaining(['session-456'])
      );
    });

    it('should filter by eventTypes', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      queryTrainingEvents({ eventTypes: ['artifact.scored', 'agent.created'] });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('event_type IN (?, ?)'),
        expect.arrayContaining(['artifact.scored', 'agent.created'])
      );
    });

    it('should filter by date range', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const fromDate = Date.now() - 86400000; // 1 day ago
      const toDate = Date.now();

      queryTrainingEvents({ fromDate, toDate });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('timestamp >= ?'),
        expect.arrayContaining([fromDate, toDate])
      );
    });

    it('should filter by tags', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      queryTrainingEvents({ tags: ['score:high', 'category:agent'] });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('tags LIKE ?'),
        expect.arrayContaining(['%"score:high"%', '%"category:agent"%'])
      );
    });

    it('should return empty array on error', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const result = queryTrainingEvents({});

      expect(result).toEqual([]);
    });
  });

  describe('getExportableEventCount', () => {
    it('should return count of all events when no filters', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: ['count'],
          values: [[42]],
        },
      ]);

      const result = getExportableEventCount();

      expect(result).toBe(42);
    });

    it('should return count with filters applied', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: ['count'],
          values: [[10]],
        },
      ]);

      const result = getExportableEventCount({
        sessionId: 'session-123',
        eventTypes: ['artifact.scored'],
      });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        expect.arrayContaining(['session-123', 'artifact.scored'])
      );
      expect(result).toBe(10);
    });

    it('should return 0 on error', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const result = getExportableEventCount();

      expect(result).toBe(0);
    });
  });

  describe('exportAsJsonl', () => {
    it('should export events as JSON lines', () => {
      const events = [
        createTestEvent({ id: 'event-1' }),
        createTestEvent({ id: 'event-2' }),
      ];

      const result = exportAsJsonl(events);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]);
      expect(parsed1.id).toBe('event-1');

      const parsed2 = JSON.parse(lines[1]);
      expect(parsed2.id).toBe('event-2');
    });

    it('should include payloads when requested', () => {
      const events = [createTestEvent({ payloadHash: 'hash-with-payload' })];
      const mockPayload = { score: 8, content: 'test content' };

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockReturnValueOnce(mockPayload);

      const result = exportAsJsonl(events, true);

      const parsed = JSON.parse(result);
      expect(parsed.payload).toEqual(mockPayload);
    });

    it('should not include payloads by default', () => {
      const events = [createTestEvent()];

      const result = exportAsJsonl(events);

      const parsed = JSON.parse(result);
      expect(parsed.payload).toBeUndefined();
    });

    it('should return empty string on error', () => {
      // Create an event that will cause JSON.stringify to fail
      const events = [createTestEvent()];
      const originalStringify = JSON.stringify;
      vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
        throw new Error('Stringify error');
      });

      const result = exportAsJsonl(events);

      expect(result).toBe('');
      JSON.stringify = originalStringify;
    });
  });

  describe('exportAsCsv', () => {
    it('should export events as CSV with headers', () => {
      const events = [createTestEvent({ id: 'event-1' })];

      const result = exportAsCsv(events);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2); // header + 1 row

      expect(lines[0]).toBe(
        'id,timestamp,event_type,schema_version,session_id,lineage_id,agent_id,artifact_id,attempt_id,payload_hash,tags'
      );
      expect(lines[1]).toContain('event-1');
    });

    it('should escape values with commas', () => {
      const events = [createTestEvent({ id: 'event,with,commas' })];

      const result = exportAsCsv(events);

      expect(result).toContain('"event,with,commas"');
    });

    it('should escape values with quotes', () => {
      const events = [createTestEvent({ id: 'event"with"quotes' })];

      const result = exportAsCsv(events);

      expect(result).toContain('"event""with""quotes"');
    });

    it('should return empty string on error', () => {
      const events = [createTestEvent()];
      vi.spyOn(Array.prototype, 'map').mockImplementationOnce(() => {
        throw new Error('Map error');
      });

      const result = exportAsCsv(events);

      expect(result).toBe('');
    });
  });

  describe('exportAsSft', () => {
    it('should export attempt.completed events as SFT format', () => {
      const events = [
        createTestEvent({
          id: 'event-1',
          eventType: 'attempt.completed',
          payloadHash: 'hash-1',
        }),
      ];

      const mockPayload = {
        agentSnapshot: { systemPrompt: 'You are a helpful assistant.' },
        input: 'Hello, how are you?',
        output: 'I am doing well, thank you!',
      };

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockReturnValueOnce(mockPayload);

      const result = exportAsSft(events);

      const parsed = JSON.parse(result);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
      expect(parsed.messages[1]).toEqual({ role: 'user', content: 'Hello, how are you?' });
      expect(parsed.messages[2]).toEqual({ role: 'assistant', content: 'I am doing well, thank you!' });
    });

    it('should skip events without system prompt', () => {
      const events = [
        createTestEvent({
          id: 'event-1',
          eventType: 'attempt.completed',
          payloadHash: 'hash-1',
        }),
      ];

      const mockPayload = {
        input: 'Hello',
        output: 'Hi there!',
      };

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockReturnValueOnce(mockPayload);

      const result = exportAsSft(events);

      const parsed = JSON.parse(result);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(parsed.messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should skip events without input or output', () => {
      const events = [
        createTestEvent({
          id: 'event-1',
          eventType: 'attempt.completed',
          payloadHash: 'hash-1',
        }),
      ];

      const mockPayload = {
        agentSnapshot: { systemPrompt: 'System prompt' },
        input: 'Hello',
        // No output
      };

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockReturnValueOnce(mockPayload);

      const result = exportAsSft(events);

      expect(result).toBe('');
    });

    it('should ignore non-attempt.completed events', () => {
      const events = [
        createTestEvent({
          eventType: 'artifact.scored',
        }),
      ];

      const result = exportAsSft(events);

      expect(result).toBe('');
    });

    it('should return empty string on error', () => {
      const events = [
        createTestEvent({
          eventType: 'attempt.completed',
        }),
      ];

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Payload error');
      });

      const result = exportAsSft(events);

      expect(result).toBe('');
    });
  });

  describe('exportAsDpo', () => {
    it('should create DPO pairs from high and low scored artifacts', () => {
      const events = [
        createTestEvent({
          id: 'event-high',
          eventType: 'artifact.scored',
          payloadHash: 'hash-high',
          lineageId: 'lineage-1',
        }),
        createTestEvent({
          id: 'event-low',
          eventType: 'artifact.scored',
          payloadHash: 'hash-low',
          lineageId: 'lineage-1',
        }),
      ];

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          lineageId: 'lineage-1',
          score: 9,
          cycle: 1,
          content: 'High quality output',
        })
        .mockReturnValueOnce({
          lineageId: 'lineage-1',
          score: 3,
          cycle: 2,
          content: 'Low quality output',
        });

      const result = exportAsDpo(events);

      const parsed = JSON.parse(result);
      expect(parsed.chosen).toBe('High quality output');
      expect(parsed.rejected).toBe('Low quality output');
      expect(parsed.prompt).toContain('lineage-1');
    });

    it('should skip artifacts from same cycle', () => {
      const events = [
        createTestEvent({
          id: 'event-high',
          eventType: 'artifact.scored',
          payloadHash: 'hash-high',
          lineageId: 'lineage-1',
        }),
        createTestEvent({
          id: 'event-low',
          eventType: 'artifact.scored',
          payloadHash: 'hash-low',
          lineageId: 'lineage-1',
        }),
      ];

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          lineageId: 'lineage-1',
          score: 9,
          cycle: 1,
          content: 'High quality output',
        })
        .mockReturnValueOnce({
          lineageId: 'lineage-1',
          score: 3,
          cycle: 1, // Same cycle as high-scored
          content: 'Low quality output',
        });

      const result = exportAsDpo(events);

      expect(result).toBe('');
    });

    it('should ignore non-artifact.scored events', () => {
      const events = [
        createTestEvent({
          eventType: 'attempt.completed',
        }),
      ];

      const result = exportAsDpo(events);

      expect(result).toBe('');
    });

    it('should return empty string on error', () => {
      const events = [
        createTestEvent({
          eventType: 'artifact.scored',
        }),
      ];

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Payload error');
      });

      const result = exportAsDpo(events);

      expect(result).toBe('');
    });
  });

  describe('exportTrainingData', () => {
    it('should export as JSONL format', async () => {
      const event = createTestEvent();
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [
            [
              event.id,
              event.timestamp,
              event.eventType,
              event.schemaVersion,
              event.sessionId,
              event.lineageId,
              event.agentId,
              event.artifactId,
              event.attemptId,
              event.payloadHash,
              JSON.stringify(event.tags),
            ],
          ],
        },
      ]);

      const result = await exportTrainingData({ format: 'jsonl' });

      expect(result.format).toBe('jsonl');
      expect(result.eventCount).toBe(1);
      expect(result.filename).toMatch(/training-events-.*\.jsonl/);
      expect(result.data).toContain(event.id);
    });

    it('should export as CSV format', async () => {
      const event = createTestEvent();
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [
            [
              event.id,
              event.timestamp,
              event.eventType,
              event.schemaVersion,
              event.sessionId,
              event.lineageId,
              event.agentId,
              event.artifactId,
              event.attemptId,
              event.payloadHash,
              JSON.stringify(event.tags),
            ],
          ],
        },
      ]);

      const result = await exportTrainingData({ format: 'csv' });

      expect(result.format).toBe('csv');
      expect(result.filename).toMatch(/training-events-.*\.csv/);
      expect(result.data).toContain('id,timestamp');
    });

    it('should export as SFT format', async () => {
      const event = createTestEvent({ eventType: 'attempt.completed' });
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [
            [
              event.id,
              event.timestamp,
              event.eventType,
              event.schemaVersion,
              event.sessionId,
              event.lineageId,
              event.agentId,
              event.artifactId,
              event.attemptId,
              event.payloadHash,
              JSON.stringify(event.tags),
            ],
          ],
        },
      ]);

      (trainingSignalQueries.getPayload as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        agentSnapshot: { systemPrompt: 'System' },
        input: 'User input',
        output: 'Assistant output',
      });

      const result = await exportTrainingData({ format: 'sft' });

      expect(result.format).toBe('sft');
      expect(result.filename).toMatch(/training-sft-.*\.jsonl/);
    });

    it('should export as DPO format', async () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [],
        },
      ]);

      const result = await exportTrainingData({ format: 'dpo' });

      expect(result.format).toBe('dpo');
      expect(result.filename).toMatch(/training-dpo-.*\.jsonl/);
    });

    it('should apply filters correctly', async () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      await exportTrainingData({
        format: 'jsonl',
        sessionId: 'session-123',
        eventTypes: ['artifact.scored'],
        fromDate: 1000,
        toDate: 2000,
        tags: ['score:high'],
      });

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('session_id = ?'),
        expect.arrayContaining(['session-123'])
      );
    });

    it('should return empty result when query returns empty', async () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = await exportTrainingData({ format: 'jsonl' });

      expect(result.data).toBe('');
      expect(result.eventCount).toBe(0);
      expect(result.format).toBe('jsonl');
    });

    it('should return error result on unsupported format', async () => {
      const result = await exportTrainingData({ format: 'unknown' as 'jsonl' });

      expect(result.data).toBe('');
      expect(result.eventCount).toBe(0);
      expect(result.filename).toMatch(/export-failed-.*\.txt/);
    });
  });
});
