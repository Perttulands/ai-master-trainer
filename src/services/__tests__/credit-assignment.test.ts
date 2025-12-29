/**
 * Credit Assignment Tests
 *
 * Tests for the credit assignment service that determines which
 * agent components are responsible for user feedback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assignCredit,
  getHighBlameSegments,
  getProblematicSpans,
  shouldUseTrajectoryCredit,
  summarizeSpans,
  summarizeCreditAssignment,
} from '../credit-assignment';
import type {
  ScoreAnalysis,
  ExecutionSpan,
  PromptCredit,
  TrajectoryCredit,
} from '../../types/evolution';
import type { AgentDefinition } from '../../types/agent';

// Mock the LLM client
vi.mock('../../api/llm', () => ({
  llmClient: {
    chat: vi.fn(),
  },
  isLLMConfigured: vi.fn(() => false), // Default to heuristic-based credit
}));

// Helper to create a minimal agent definition
function createTestAgent(systemPrompt: string): AgentDefinition {
  return {
    id: 'test-agent-id',
    name: 'Test Agent',
    description: 'Test description',
    version: 1,
    systemPrompt,
    tools: [],
    flow: [],
    memory: { type: 'none', config: {} },
    parameters: {
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 1024,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Helper to create a test analysis
function createTestAnalysis(
  score: number,
  aspects: ScoreAnalysis['aspects'] = []
): ScoreAnalysis {
  return {
    score,
    sentiment: score >= 7 ? 'positive' : score >= 4 ? 'neutral' : 'negative',
    aspects,
    trend: 'stable',
    deltaFromPrevious: 0,
  };
}

// Helper to create execution spans
function createTestSpan(
  type: ExecutionSpan['type'],
  sequence: number,
  overrides: Partial<ExecutionSpan> = {}
): ExecutionSpan {
  return {
    id: `span-${sequence}`,
    attemptId: 'test-attempt',
    sequence,
    type,
    input: 'test input',
    output: 'test output',
    durationMs: 100,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('credit-assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assignCredit', () => {
    describe('prompt-level credit', () => {
      it('returns prompt mode for agents without spans', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(5, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
        ]);

        const result = await assignCredit(agent, analysis, []);

        expect(result.mode).toBe('prompt');
      });

      it('returns prompt mode for single LLM call', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(5);
        const spans = [createTestSpan('llm_call', 0)];

        const result = await assignCredit(agent, analysis, spans);

        expect(result.mode).toBe('prompt');
      });

      it('segments the prompt correctly', async () => {
        const agent = createTestAgent(`You are a helpful assistant.

Please be concise and clear.

Always verify your answers.`);
        const analysis = createTestAnalysis(4, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
        ]);

        const result = await assignCredit(agent, analysis, []);

        expect(result.mode).toBe('prompt');
        const credits = result.credits as PromptCredit[];
        expect(credits.length).toBeGreaterThan(1);
      });

      it('assigns blame based on aspect relevance', async () => {
        const agent = createTestAgent(
          `Be comprehensive and detailed in all responses.
          Provide thorough explanations with extensive examples.`
        );
        const analysis = createTestAnalysis(3, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.9 },
        ]);

        const result = await assignCredit(agent, analysis, []);

        const credits = result.credits as PromptCredit[];
        const hasRelevantBlame = credits.some(
          (c) => c.blame !== 'none' && c.relatedAspect === 'length'
        );
        expect(hasRelevantBlame).toBe(true);
      });
    });

    describe('trajectory-level credit', () => {
      it('returns trajectory mode for multi-step agents', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(5);
        const spans = [
          createTestSpan('llm_call', 0),
          createTestSpan('tool_call', 1),
          createTestSpan('tool_result', 2),
          createTestSpan('llm_call', 3),
          createTestSpan('output', 4),
        ];

        const result = await assignCredit(agent, analysis, spans);

        expect(result.mode).toBe('trajectory');
      });

      it('assigns positive contribution for successful tool calls', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(7);
        const spans = [
          createTestSpan('llm_call', 0),
          createTestSpan('tool_call', 1, { toolName: 'search' }),
          createTestSpan('tool_result', 2, { output: 'Found results' }),
          createTestSpan('llm_call', 3),
          createTestSpan('output', 4),
        ];

        const result = await assignCredit(agent, analysis, spans);

        const credits = result.credits as TrajectoryCredit[];
        const toolCredit = credits.find((c) => c.spanId === 'span-1');
        expect(toolCredit).toBeDefined();
        expect(toolCredit!.contribution).toBeGreaterThan(0);
      });

      it('assigns negative contribution for failed tool calls', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4);
        const spans = [
          createTestSpan('llm_call', 0),
          createTestSpan('tool_call', 1, {
            toolName: 'search',
            toolError: 'Network error',
          }),
          createTestSpan('llm_call', 2),
          createTestSpan('output', 3),
        ];

        const result = await assignCredit(agent, analysis, spans);

        const credits = result.credits as TrajectoryCredit[];
        const toolCredit = credits.find((c) => c.spanId === 'span-1');
        expect(toolCredit).toBeDefined();
        expect(toolCredit!.contribution).toBeLessThan(0);
        expect(toolCredit!.reason).toContain('failed');
      });

      it('adjusts contribution based on aspects', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4, [
          { aspect: 'accuracy', sentiment: 'negative', confidence: 0.8 },
        ]);
        const spans = [
          createTestSpan('llm_call', 0, {
            input: 'question about accuracy',
            output: 'response mentioning accuracy',
          }),
          createTestSpan('llm_call', 1),
          createTestSpan('output', 2),
        ];

        const result = await assignCredit(agent, analysis, spans);

        const credits = result.credits as TrajectoryCredit[];
        // First span mentions 'accuracy' which is a negative aspect
        const firstSpanCredit = credits.find((c) => c.spanId === 'span-0');
        expect(firstSpanCredit!.reason).toContain('accuracy');
      });
    });
  });

  describe('getHighBlameSegments', () => {
    it('returns high and medium blame segments', () => {
      const credits: PromptCredit[] = [
        { segment: 'seg1', segmentIndex: 0, blame: 'high', reason: 'r1' },
        { segment: 'seg2', segmentIndex: 1, blame: 'medium', reason: 'r2' },
        { segment: 'seg3', segmentIndex: 2, blame: 'low', reason: 'r3' },
        { segment: 'seg4', segmentIndex: 3, blame: 'none', reason: 'r4' },
      ];

      const result = getHighBlameSegments(credits);

      expect(result.length).toBe(2);
      expect(result.map((c) => c.blame)).toEqual(['high', 'medium']);
    });

    it('returns empty array when no high blame segments', () => {
      const credits: PromptCredit[] = [
        { segment: 'seg1', segmentIndex: 0, blame: 'low', reason: 'r1' },
        { segment: 'seg2', segmentIndex: 1, blame: 'none', reason: 'r2' },
      ];

      const result = getHighBlameSegments(credits);

      expect(result.length).toBe(0);
    });
  });

  describe('getProblematicSpans', () => {
    it('returns spans with negative contribution', () => {
      const credits: TrajectoryCredit[] = [
        { spanId: 's1', contribution: 0.5, reason: 'helpful' },
        { spanId: 's2', contribution: -0.3, reason: 'problematic' },
        { spanId: 's3', contribution: 0, reason: 'neutral' },
        { spanId: 's4', contribution: -0.5, reason: 'very problematic' },
      ];

      const result = getProblematicSpans(credits);

      expect(result.length).toBe(2);
      expect(result.map((c) => c.spanId)).toEqual(['s2', 's4']);
    });

    it('returns empty array when no problematic spans', () => {
      const credits: TrajectoryCredit[] = [
        { spanId: 's1', contribution: 0.5, reason: 'helpful' },
        { spanId: 's2', contribution: 0.1, reason: 'slightly helpful' },
      ];

      const result = getProblematicSpans(credits);

      expect(result.length).toBe(0);
    });
  });

  describe('shouldUseTrajectoryCredit', () => {
    it('returns false for empty spans', () => {
      expect(shouldUseTrajectoryCredit([])).toBe(false);
    });

    it('returns false for less than 3 spans', () => {
      const spans = [createTestSpan('llm_call', 0), createTestSpan('output', 1)];
      expect(shouldUseTrajectoryCredit(spans)).toBe(false);
    });

    it('returns false for single LLM call', () => {
      const spans = [
        createTestSpan('llm_call', 0),
        createTestSpan('reasoning', 1),
        createTestSpan('output', 2),
      ];
      expect(shouldUseTrajectoryCredit(spans)).toBe(false);
    });

    it('returns true for multiple LLM calls', () => {
      const spans = [
        createTestSpan('llm_call', 0),
        createTestSpan('tool_call', 1),
        createTestSpan('llm_call', 2),
        createTestSpan('output', 3),
      ];
      expect(shouldUseTrajectoryCredit(spans)).toBe(true);
    });
  });

  describe('summarizeSpans', () => {
    it('returns message for empty spans', () => {
      expect(summarizeSpans([])).toBe('No execution spans');
    });

    it('counts spans by type', () => {
      const spans = [
        createTestSpan('llm_call', 0),
        createTestSpan('llm_call', 1),
        createTestSpan('tool_call', 2),
        createTestSpan('output', 3),
      ];

      const summary = summarizeSpans(spans);

      expect(summary).toContain('4 total spans');
      expect(summary).toContain('2 llm_call');
      expect(summary).toContain('1 tool_call');
      expect(summary).toContain('1 output');
    });
  });

  describe('summarizeCreditAssignment', () => {
    it('returns message for empty credits', () => {
      expect(summarizeCreditAssignment([])).toBe('No credit assigned');
    });

    it('summarizes prompt credits', () => {
      const credits: PromptCredit[] = [
        { segment: 'seg1', segmentIndex: 0, blame: 'high', relatedAspect: 'length', reason: 'r1' },
        { segment: 'seg2', segmentIndex: 1, blame: 'medium', relatedAspect: 'tone', reason: 'r2' },
        { segment: 'seg3', segmentIndex: 2, blame: 'low', reason: 'r3' },
      ];

      const summary = summarizeCreditAssignment(credits);

      expect(summary).toContain('3 prompt segments');
      expect(summary).toContain('High blame');
      expect(summary).toContain('length');
      expect(summary).toContain('Medium blame');
      expect(summary).toContain('tone');
    });

    it('summarizes trajectory credits', () => {
      const credits: TrajectoryCredit[] = [
        { spanId: 's1', contribution: 0.5, reason: 'helpful' },
        { spanId: 's2', contribution: -0.3, reason: 'problematic' },
        { spanId: 's3', contribution: -0.5, reason: 'very problematic' },
      ];

      const summary = summarizeCreditAssignment(credits);

      expect(summary).toContain('3 execution spans');
      expect(summary).toContain('2 problematic spans');
      expect(summary).toContain('1 helpful spans');
    });
  });
});
