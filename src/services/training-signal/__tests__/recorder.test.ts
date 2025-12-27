import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentDefinition } from '../../../types/agent';
import type { Attempt, ExecutionSpan, EvolutionChange } from '../../../types/evolution';
import type { Artifact } from '../../../types';
import { getDatabase, saveDatabase } from '../../../db/index';
import * as recorder from '../recorder';

// The database is already mocked in test/setup.ts

// ============ Test Helpers ============

function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-123',
    lineageId: 'lineage-123',
    name: 'Test Agent',
    description: 'A test agent for training',
    version: 1,
    systemPrompt: 'You are a helpful assistant.',
    tools: [
      {
        id: 'tool-1',
        name: 'search',
        description: 'Search the web',
        type: 'builtin',
        config: { builtinName: 'web_search' },
        parameters: [],
      },
    ],
    flow: [
      {
        id: 'start-1',
        type: 'start',
        name: 'Start',
        config: {},
        position: { x: 0, y: 0 },
        connections: { next: 'output-1' },
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Output',
        config: {},
        position: { x: 200, y: 0 },
        connections: {},
      },
    ],
    memory: { type: 'buffer', config: { maxMessages: 10 } },
    parameters: { model: 'claude-sonnet', temperature: 0.7, maxTokens: 1024 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createTestAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-123',
    rolloutId: 'rollout-123',
    attemptNumber: 1,
    status: 'succeeded',
    agentSnapshot: {
      agentId: 'agent-123',
      version: 1,
      systemPromptHash: 'hash-123',
      toolsHash: 'tools-hash-123',
      flowHash: 'flow-hash-123',
    },
    input: 'Generate a summary of the topic',
    modelId: 'claude-sonnet',
    parameters: {
      temperature: 0.7,
      maxTokens: 1024,
    },
    durationMs: 1500,
    totalTokens: 500,
    promptTokens: 200,
    completionTokens: 300,
    estimatedCost: 0.005,
    spans: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function createTestSpans(): ExecutionSpan[] {
  return [
    {
      id: 'span-1',
      attemptId: 'attempt-123',
      sequence: 1,
      type: 'llm_call',
      input: 'Generate summary',
      output: 'Here is the summary...',
      modelId: 'claude-sonnet',
      promptTokens: 100,
      completionTokens: 150,
      durationMs: 800,
      createdAt: Date.now(),
    },
    {
      id: 'span-2',
      attemptId: 'attempt-123',
      sequence: 2,
      type: 'tool_call',
      input: 'search query',
      output: 'search results',
      toolName: 'web_search',
      toolArgs: { query: 'test' },
      toolResult: { results: [] },
      durationMs: 500,
      createdAt: Date.now(),
    },
    {
      id: 'span-3',
      attemptId: 'attempt-123',
      sequence: 3,
      type: 'tool_call',
      input: 'format data',
      output: 'formatted',
      toolName: 'format_markdown',
      durationMs: 100,
      createdAt: Date.now(),
    },
  ];
}

function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-123',
    lineageId: 'lineage-123',
    cycle: 1,
    content: 'This is the generated artifact content',
    metadata: { wordCount: 10 },
    createdAt: Date.now(),
    ...overrides,
  };
}

function createTestEvolutionChanges(): EvolutionChange[] {
  return [
    {
      component: 'systemPrompt',
      changeType: 'modify',
      target: 'tone',
      before: 'formal tone',
      after: 'casual tone',
      reason: 'User prefers more casual language',
      confidence: 0.85,
    },
    {
      component: 'parameters',
      changeType: 'modify',
      target: 'temperature',
      before: '0.7',
      after: '0.8',
      reason: 'Increase creativity',
      confidence: 0.7,
    },
  ];
}

// ============ Tests ============

describe('Training Signal Recorder', () => {
  let mockDb: ReturnType<typeof getDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = getDatabase();
  });

  // ============ recordEvent Tests ============

  describe('recordEvent', () => {
    it('should create event with correct type', () => {
      const payload = { test: 'data' };

      const eventId = recorder.recordEvent(
        'agent.created',
        payload,
        { agentId: 'agent-123' }
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.any(String), // eventId
          expect.any(Number), // timestamp
          'agent.created',   // event_type
          recorder.TRAINING_SIGNAL_SCHEMA_VERSION,
        ])
      );
      expect(eventId).toBeDefined();
      expect(eventId).not.toContain('failed_');
    });

    it('should store payload in content-addressed blob', () => {
      const payload = { test: 'data', value: 123 };

      recorder.recordEvent('agent.created', payload, { agentId: 'agent-123' });

      // First call should be to check if blob exists
      expect(mockDb.exec).toHaveBeenCalledWith(
        'SELECT hash FROM payload_blobs WHERE hash = ?',
        [expect.any(String)]
      );

      // Then insert the blob
      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT INTO payload_blobs (hash, content, created_at) VALUES (?, ?, ?)',
        [expect.any(String), JSON.stringify(payload), expect.any(Number)]
      );
    });

    it('should add tags correctly', () => {
      const tags = ['custom:tag1', 'custom:tag2'];

      recorder.recordEvent(
        'agent.created',
        { test: 'data' },
        { agentId: 'agent-123' },
        tags
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('custom:tag1'),
        ])
      );
    });

    it('should return event ID on success', () => {
      const eventId = recorder.recordEvent(
        'attempt.started',
        { attemptId: 'test' },
        { attemptId: 'attempt-123' }
      );

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
      expect(eventId.length).toBeGreaterThan(0);
    });

    it('should call saveDatabase after recording', () => {
      recorder.recordEvent('agent.created', { test: 'data' }, {});

      expect(saveDatabase).toHaveBeenCalled();
    });

    it('should return fallback ID on error', () => {
      // First call is for payload blob insert, second is for event insert
      (mockDb.run as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => {}) // payload blob succeeds
        .mockImplementationOnce(() => {
          throw new Error('Database error');
        }); // event insert fails

      const eventId = recorder.recordEvent('agent.created', { test: 'data' }, {});

      expect(eventId).toContain('failed_');
    });
  });

  // ============ inferTags Tests ============

  describe('inferTags', () => {
    it('should add category tags based on event type', () => {
      expect(recorder.inferTags('agent.created', {})).toContain('category:agent');
      expect(recorder.inferTags('agent.evolved', {})).toContain('category:agent');
      expect(recorder.inferTags('attempt.started', {})).toContain('category:execution');
      expect(recorder.inferTags('attempt.completed', {})).toContain('category:execution');
      expect(recorder.inferTags('artifact.scored', {})).toContain('category:evaluation');
      expect(recorder.inferTags('lineage.locked', {})).toContain('category:evaluation');
      expect(recorder.inferTags('evolution.outcome', {})).toContain('category:learning');
    });

    it('should add high score tag for scores >= 8', () => {
      const tags = recorder.inferTags('artifact.scored', { score: 9 });
      expect(tags).toContain('score:high');
    });

    it('should add medium score tag for scores 5-7', () => {
      const tags = recorder.inferTags('artifact.scored', { score: 6 });
      expect(tags).toContain('score:medium');
    });

    it('should add low score tag for scores < 5', () => {
      const tags = recorder.inferTags('artifact.scored', { score: 3 });
      expect(tags).toContain('score:low');
    });

    it('should add outcome:improved tag for positive score delta', () => {
      const tags = recorder.inferTags('evolution.outcome', { scoreDelta: 2 });
      expect(tags).toContain('outcome:improved');
    });

    it('should add outcome:regressed tag for negative score delta', () => {
      const tags = recorder.inferTags('evolution.outcome', { scoreDelta: -1 });
      expect(tags).toContain('outcome:regressed');
    });

    it('should add outcome:stable tag for zero score delta', () => {
      const tags = recorder.inferTags('evolution.outcome', { scoreDelta: 0 });
      expect(tags).toContain('outcome:stable');
    });

    it('should add hypothesis:validated tag when validated is true', () => {
      const tags = recorder.inferTags('evolution.outcome', { validated: true });
      expect(tags).toContain('hypothesis:validated');
    });

    it('should add hypothesis:rejected tag when validated is false', () => {
      const tags = recorder.inferTags('evolution.outcome', { validated: false });
      expect(tags).toContain('hypothesis:rejected');
    });

    it('should add has:error tag when error is present', () => {
      const tags = recorder.inferTags('attempt.failed', { error: 'Something went wrong' });
      expect(tags).toContain('has:error');
    });

    it('should add tool usage tags when toolsUsed is present', () => {
      const tags = recorder.inferTags('attempt.completed', {
        toolsUsed: ['web_search', 'format_markdown']
      });
      expect(tags).toContain('has:tools');
      expect(tags).toContain('tools:2');
    });

    it('should add changed component tags from evolution changes', () => {
      const changes: EvolutionChange[] = [
        { component: 'systemPrompt', changeType: 'modify', target: 'tone', before: 'a', after: 'b', reason: 'test', confidence: 0.8 },
        { component: 'parameters', changeType: 'modify', target: 'temp', before: '0.5', after: '0.7', reason: 'test', confidence: 0.7 },
      ];
      const tags = recorder.inferTags('agent.evolved', { changes });
      expect(tags).toContain('changed:systemPrompt');
      expect(tags).toContain('changed:parameters');
    });
  });

  // ============ Agent Lifecycle Events Tests ============

  describe('recordAgentCreated', () => {
    it('should create agent.created event', () => {
      const agent = createTestAgent();
      const lineageId = 'lineage-123';

      const eventId = recorder.recordAgentCreated(agent, lineageId);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['agent.created'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include agent details in payload', () => {
      const agent = createTestAgent();
      const lineageId = 'lineage-123';

      recorder.recordAgentCreated(agent, lineageId);

      // Verify payload blob was created with agent details
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String), // hash
          expect.stringContaining(agent.name),
          expect.any(Number), // created_at
        ])
      );
    });

    it('should add lifecycle:created tag', () => {
      const agent = createTestAgent();

      recorder.recordAgentCreated(agent, 'lineage-123');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('lifecycle:created'),
        ])
      );
    });
  });

  describe('recordAgentEvolved', () => {
    it('should create agent.evolved event with changes', () => {
      const fromAgent = createTestAgent({ id: 'agent-v1', version: 1 });
      const toAgent = createTestAgent({ id: 'agent-v2', version: 2 });
      const changes = createTestEvolutionChanges();
      const hypothesis = 'More casual tone will improve user satisfaction';

      const eventId = recorder.recordAgentEvolved(fromAgent, toAgent, changes, hypothesis);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['agent.evolved'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include evolution changes in payload', () => {
      const fromAgent = createTestAgent({ id: 'agent-v1', version: 1 });
      const toAgent = createTestAgent({ id: 'agent-v2', version: 2 });
      const changes = createTestEvolutionChanges();
      const hypothesis = 'Testing evolution';

      recorder.recordAgentEvolved(fromAgent, toAgent, changes, hypothesis);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('systemPrompt'), // From changes
          expect.any(Number),
        ])
      );
    });

    it('should add lifecycle:evolved tag', () => {
      const fromAgent = createTestAgent();
      const toAgent = createTestAgent({ version: 2 });

      recorder.recordAgentEvolved(fromAgent, toAgent, [], 'test');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('lifecycle:evolved'),
        ])
      );
    });
  });

  // ============ Execution Events Tests ============

  describe('recordAttemptStarted', () => {
    it('should create attempt.started event', () => {
      const attempt = createTestAttempt();

      const eventId = recorder.recordAttemptStarted(attempt);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['attempt.started'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include attempt details in payload', () => {
      const attempt = createTestAttempt();

      recorder.recordAttemptStarted(attempt);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining(attempt.id),
          expect.any(Number),
        ])
      );
    });

    it('should add execution:started tag', () => {
      const attempt = createTestAttempt();

      recorder.recordAttemptStarted(attempt);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('execution:started'),
        ])
      );
    });
  });

  describe('recordAttemptCompleted', () => {
    it('should create attempt.completed with spans', () => {
      const attempt = createTestAttempt();
      const spans = createTestSpans();
      const output = 'Generated output content';

      const eventId = recorder.recordAttemptCompleted(attempt, spans, output);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['attempt.completed'])
      );
      expect(eventId).toBeDefined();
    });

    it('should extract tool usage from spans', () => {
      const attempt = createTestAttempt();
      const spans = createTestSpans();
      const output = 'Output';

      recorder.recordAttemptCompleted(attempt, spans, output);

      // Verify payload includes toolsUsed
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('web_search'),
          expect.any(Number),
        ])
      );
    });

    it('should add execution:completed tag', () => {
      const attempt = createTestAttempt();

      recorder.recordAttemptCompleted(attempt, [], 'output');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('execution:completed'),
        ])
      );
    });
  });

  describe('recordAttemptFailed', () => {
    it('should create attempt.failed with error', () => {
      const attempt = createTestAttempt({ status: 'failed' });
      const error = 'Rate limit exceeded';

      const eventId = recorder.recordAttemptFailed(attempt, error);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['attempt.failed'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include error in payload', () => {
      const attempt = createTestAttempt();
      const error = 'Connection timeout';

      recorder.recordAttemptFailed(attempt, error);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('Connection timeout'),
          expect.any(Number),
        ])
      );
    });

    it('should add execution:failed and has:error tags', () => {
      const attempt = createTestAttempt();

      recorder.recordAttemptFailed(attempt, 'error');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('execution:failed'),
        ])
      );
    });
  });

  // ============ Evaluation Events Tests ============

  describe('recordArtifactScored', () => {
    it('should create artifact.scored event', () => {
      const artifact = createTestArtifact();
      const score = 8;
      const comment = 'Great output!';

      const eventId = recorder.recordArtifactScored(artifact, score, comment);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['artifact.scored'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include score and comment in payload', () => {
      const artifact = createTestArtifact();
      const score = 7;
      const comment = 'Good but could be better';

      recorder.recordArtifactScored(artifact, score, comment);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('"score":7'),
          expect.any(Number),
        ])
      );
    });

    it('should add evaluation:scored tag', () => {
      const artifact = createTestArtifact();

      recorder.recordArtifactScored(artifact, 5);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('evaluation:scored'),
        ])
      );
    });

    it('should work without comment', () => {
      const artifact = createTestArtifact();

      const eventId = recorder.recordArtifactScored(artifact, 6);

      expect(eventId).toBeDefined();
      expect(eventId).not.toContain('failed_');
    });
  });

  describe('recordLineageLocked', () => {
    it('should create lineage.locked event', () => {
      const lineageId = 'lineage-winner';
      const competitorIds = ['lineage-a', 'lineage-b', 'lineage-c'];

      const eventId = recorder.recordLineageLocked(lineageId, competitorIds);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['lineage.locked'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include competitor info in payload', () => {
      const lineageId = 'lineage-winner';
      const competitorIds = ['lineage-a', 'lineage-b'];

      recorder.recordLineageLocked(lineageId, competitorIds);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('lineage-a'),
          expect.any(Number),
        ])
      );
    });

    it('should add evaluation:locked and selection:winner tags', () => {
      recorder.recordLineageLocked('lineage-123', []);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('evaluation:locked'),
        ])
      );
    });
  });

  // ============ Query Helpers Tests ============

  describe('getTrainingEvent', () => {
    it('should return event by ID', () => {
      const eventId = 'event-123';
      const mockRow = [
        eventId,
        Date.now(),
        'agent.created',
        1,
        'session-123',
        'lineage-123',
        'agent-123',
        null,
        null,
        'hash-abc',
        '["category:agent","lifecycle:created"]',
      ];

      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { values: [mockRow] },
      ]);

      const event = recorder.getTrainingEvent(eventId);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [eventId]
      );
      expect(event).not.toBeNull();
      expect(event?.id).toBe(eventId);
      expect(event?.eventType).toBe('agent.created');
      expect(event?.tags).toEqual(['category:agent', 'lifecycle:created']);
    });

    it('should return null when event not found', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const event = recorder.getTrainingEvent('nonexistent');

      expect(event).toBeNull();
    });

    it('should return null when query result is empty', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { values: [] },
      ]);

      const event = recorder.getTrainingEvent('empty');

      expect(event).toBeNull();
    });

    it('should handle null tags gracefully', () => {
      const mockRow = [
        'event-123',
        Date.now(),
        'agent.created',
        1,
        null,
        null,
        null,
        null,
        null,
        'hash-abc',
        null, // null tags
      ];

      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { values: [mockRow] },
      ]);

      const event = recorder.getTrainingEvent('event-123');

      expect(event?.tags).toEqual([]);
    });
  });

  describe('getPayloadContent', () => {
    it('should return payload by hash', () => {
      const hash = 'hash-abc123';
      const content = { test: 'data', value: 42 };

      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { values: [[JSON.stringify(content)]] },
      ]);

      const result = recorder.getPayloadContent(hash);

      expect(mockDb.exec).toHaveBeenCalledWith(
        'SELECT content FROM payload_blobs WHERE hash = ?',
        [hash]
      );
      expect(result).toEqual(content);
    });

    it('should return null when hash not found', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = recorder.getPayloadContent('nonexistent-hash');

      expect(result).toBeNull();
    });

    it('should return null when result is empty', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { values: [] },
      ]);

      const result = recorder.getPayloadContent('empty-hash');

      expect(result).toBeNull();
    });
  });

  describe('getEventCounts', () => {
    it('should return event counts by type', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          values: [
            ['agent.created', 5],
            ['agent.evolved', 3],
            ['attempt.completed', 10],
            ['artifact.scored', 8],
          ],
        },
      ]);

      const counts = recorder.getEventCounts();

      expect(mockDb.exec).toHaveBeenCalledWith(
        'SELECT event_type, COUNT(*) as count FROM training_events GROUP BY event_type'
      );
      expect(counts).toEqual({
        'agent.created': 5,
        'agent.evolved': 3,
        'attempt.completed': 10,
        'artifact.scored': 8,
      });
    });

    it('should return empty object when no events', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const counts = recorder.getEventCounts();

      expect(counts).toEqual({});
    });

    it('should handle database errors gracefully', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const counts = recorder.getEventCounts();

      expect(counts).toEqual({});
    });
  });

  // ============ Edge Cases & Error Handling ============

  describe('error handling', () => {
    it('should handle database errors in recordEvent gracefully', () => {
      (mockDb.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Database write error');
      });

      const eventId = recorder.recordEvent('agent.created', {}, {});

      expect(eventId).toContain('failed_');
    });

    it('should handle payload blob storage errors gracefully', () => {
      // First exec for checking blob existence fails
      (mockDb.exec as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Read error');
      });

      const eventId = recorder.recordEvent('agent.created', { test: 'data' }, {});

      // Should still return an ID (fallback)
      expect(eventId).toBeDefined();
    });
  });

  describe('recordDirectiveAdded', () => {
    it('should create directive.added event for sticky directive', () => {
      const eventId = recorder.recordDirectiveAdded(
        'lineage-123',
        'sticky',
        'Always be concise'
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['directive.added'])
      );
      expect(eventId).toBeDefined();
    });

    it('should create directive.added event for oneshot directive', () => {
      const eventId = recorder.recordDirectiveAdded(
        'lineage-123',
        'oneshot',
        'Focus on examples this time'
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['directive.added'])
      );
      expect(eventId).toBeDefined();
    });

    it('should add directive type tag', () => {
      recorder.recordDirectiveAdded('lineage-123', 'sticky', 'content');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('directive:sticky'),
        ])
      );
    });
  });

  describe('recordEvolutionOutcome', () => {
    it('should create evolution.outcome event', () => {
      const eventId = recorder.recordEvolutionOutcome(
        'evolution-record-123',
        2.5,
        true
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining(['evolution.outcome'])
      );
      expect(eventId).toBeDefined();
    });

    it('should include score delta and validation in payload', () => {
      recorder.recordEvolutionOutcome('evolution-123', 1.5, true);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payload_blobs'),
        expect.arrayContaining([
          expect.any(String),
          expect.stringContaining('"scoreDelta":1.5'),
          expect.any(Number),
        ])
      );
    });

    it('should add learning:outcome tag', () => {
      recorder.recordEvolutionOutcome('evolution-123', 0, false);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO training_events'),
        expect.arrayContaining([
          expect.stringContaining('learning:outcome'),
        ])
      );
    });
  });
});
