/**
 * Tests for Evolution Pipeline Service
 *
 * The evolution pipeline orchestrates:
 * 1. Analyze reward (score + comment)
 * 2. Assign credit to agent components
 * 3. Plan evolution changes
 * 4. Apply changes to create new agent version
 * 5. Record evolution for learning
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import type { AgentDefinition } from '../../types/agent';
import type {
  ScoreAnalysis,
  EvolutionPlan,
  EvolutionRecord,
  LearningInsight,
} from '../../types/evolution';

// Mock all external dependencies before imports
vi.mock('../reward-analyzer', () => ({
  analyzeReward: vi.fn(),
  summarizeAnalysis: vi.fn(() => 'Analysis summary'),
}));

vi.mock('../credit-assignment', () => ({
  assignCredit: vi.fn(),
  summarizeCreditAssignment: vi.fn(() => 'Credit summary'),
}));

vi.mock('../evolution-planner', () => ({
  createEvolutionPlan: vi.fn(),
  summarizePlan: vi.fn(() => 'Plan summary'),
}));

vi.mock('../agent-evolver', () => ({
  evolveAgent: vi.fn(),
}));

vi.mock('../../db/queries', () => ({
  createEvolutionRecord: vi.fn(),
  getEvolutionRecordsByLineage: vi.fn(() => []),
  updateEvolutionOutcome: vi.fn(),
  getLearningInsightsBySession: vi.fn(() => []),
  createLearningInsight: vi.fn(),
  findInsightByPattern: vi.fn(() => null),
  updateLearningInsight: vi.fn(),
}));

vi.mock('../training-signal/recorder', () => ({
  recordAgentEvolved: vi.fn(),
  recordEvolutionOutcome: vi.fn(),
}));

vi.mock('../../utils/id', () => ({
  generateId: vi.fn(() => 'mock-id-123'),
}));

// Now import the module under test
import {
  runEvolutionPipeline,
  quickEvolve,
  getEvolutionStats,
  type EvolutionPipelineInput,
} from '../evolution-pipeline';

// Import mocked modules to access mock functions
import { analyzeReward } from '../reward-analyzer';
import { assignCredit } from '../credit-assignment';
import { createEvolutionPlan } from '../evolution-planner';
import { evolveAgent } from '../agent-evolver';
import {
  createEvolutionRecord,
  getEvolutionRecordsByLineage,
  updateEvolutionOutcome,
  getLearningInsightsBySession,
  createLearningInsight,
  findInsightByPattern,
  updateLearningInsight,
} from '../../db/queries';
import { recordAgentEvolved, recordEvolutionOutcome } from '../training-signal/recorder';

// Type the mocked functions
const mockAnalyzeReward = analyzeReward as MockedFunction<typeof analyzeReward>;
const mockAssignCredit = assignCredit as MockedFunction<typeof assignCredit>;
const mockCreateEvolutionPlan = createEvolutionPlan as MockedFunction<typeof createEvolutionPlan>;
const mockEvolveAgent = evolveAgent as MockedFunction<typeof evolveAgent>;
const mockCreateEvolutionRecord = createEvolutionRecord as MockedFunction<typeof createEvolutionRecord>;
const mockGetEvolutionRecordsByLineage = getEvolutionRecordsByLineage as MockedFunction<typeof getEvolutionRecordsByLineage>;
const mockUpdateEvolutionOutcome = updateEvolutionOutcome as MockedFunction<typeof updateEvolutionOutcome>;
const mockGetLearningInsightsBySession = getLearningInsightsBySession as MockedFunction<typeof getLearningInsightsBySession>;
const mockRecordAgentEvolved = recordAgentEvolved as MockedFunction<typeof recordAgentEvolved>;
const mockRecordEvolutionOutcome = recordEvolutionOutcome as MockedFunction<typeof recordEvolutionOutcome>;
const mockFindInsightByPattern = findInsightByPattern as MockedFunction<typeof findInsightByPattern>;
const mockCreateLearningInsight = createLearningInsight as MockedFunction<typeof createLearningInsight>;
const mockUpdateLearningInsight = updateLearningInsight as MockedFunction<typeof updateLearningInsight>;

// Helper to create a test agent
function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-123',
    lineageId: 'lineage-123',
    name: 'Test Agent',
    description: 'A test agent for evolution pipeline tests',
    version: 1,
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
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

// Helper to create a default score analysis
function createMockScoreAnalysis(overrides: Partial<ScoreAnalysis> = {}): ScoreAnalysis {
  return {
    score: 6,
    comment: 'Could be better',
    sentiment: 'neutral',
    aspects: [
      { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
    ],
    trend: 'stable',
    deltaFromPrevious: 0,
    ...overrides,
  };
}

// Helper to create a default evolution plan
function createMockEvolutionPlan(overrides: Partial<EvolutionPlan> = {}): EvolutionPlan {
  return {
    changes: [
      {
        component: 'systemPrompt',
        changeType: 'add',
        target: 'length_instructions',
        before: null,
        after: 'Be concise and focused.',
        reason: 'Address length feedback',
        confidence: 0.8,
      },
    ],
    hypothesis: 'After adding concise instructions, output length should improve',
    expectedImpact: [
      { aspect: 'length', direction: 'improve' },
    ],
    ...overrides,
  };
}

// Helper to create a mock evolution record
function createMockEvolutionRecord(overrides: Partial<EvolutionRecord> = {}): EvolutionRecord {
  return {
    id: 'evolution-123',
    lineageId: 'lineage-123',
    fromVersion: 1,
    toVersion: 2,
    trigger: {
      rolloutId: 'rollout-123',
      attemptId: 'attempt-123',
      score: 5,
      comment: 'Previous feedback',
      directives: {},
    },
    scoreAnalysis: createMockScoreAnalysis({ score: 5 }),
    creditAssignment: [],
    plan: createMockEvolutionPlan(),
    changes: [],
    createdAt: Date.now() - 10000,
    ...overrides,
  };
}

describe('Evolution Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runEvolutionPipeline', () => {
    const defaultInput: EvolutionPipelineInput = {
      agent: createTestAgent(),
      need: 'Create a helpful assistant',
      score: 6,
      comment: 'Could be more concise',
      sessionId: 'session-123',
    };

    beforeEach(() => {
      // Set up default mock return values
      mockAnalyzeReward.mockResolvedValue(createMockScoreAnalysis());
      mockAssignCredit.mockResolvedValue({
        mode: 'prompt' as const,
        credits: [
          {
            segment: 'You are a helpful assistant.',
            segmentIndex: 0,
            blame: 'medium' as const,
            relatedAspect: 'length',
            reason: 'Could be contributing to verbose output',
          },
        ],
      });
      mockCreateEvolutionPlan.mockResolvedValue(createMockEvolutionPlan());
      mockEvolveAgent.mockResolvedValue(createTestAgent({ version: 2, id: 'agent-456' }));
      mockCreateEvolutionRecord.mockReturnValue(createMockEvolutionRecord({ id: 'new-evolution-123' }));
      mockGetEvolutionRecordsByLineage.mockReturnValue([]);
      mockGetLearningInsightsBySession.mockReturnValue([]);
    });

    it('should analyze reward from score and comment', async () => {
      await runEvolutionPipeline(defaultInput);

      expect(mockAnalyzeReward).toHaveBeenCalledWith(6, 'Could be more concise', null);
    });

    it('should use previousScore when provided', async () => {
      await runEvolutionPipeline({ ...defaultInput, previousScore: 4 });

      expect(mockAnalyzeReward).toHaveBeenCalledWith(6, 'Could be more concise', 4);
    });

    it('should assign credit to agent components', async () => {
      const analysis = createMockScoreAnalysis();
      mockAnalyzeReward.mockResolvedValue(analysis);

      await runEvolutionPipeline(defaultInput);

      expect(mockAssignCredit).toHaveBeenCalledWith(
        defaultInput.agent,
        analysis,
        []
      );
    });

    it('should pass spans to credit assignment when provided', async () => {
      const spans = [
        {
          id: 'span-1',
          attemptId: 'attempt-123',
          sequence: 0,
          type: 'llm_call' as const,
          input: 'test input',
          output: 'test output',
          durationMs: 100,
          createdAt: Date.now(),
        },
      ];

      await runEvolutionPipeline({ ...defaultInput, spans });

      expect(mockAssignCredit).toHaveBeenCalledWith(
        defaultInput.agent,
        expect.any(Object),
        spans
      );
    });

    it('should create evolution plan with history and insights', async () => {
      const pastRecords = [createMockEvolutionRecord()];
      const insights: LearningInsight[] = [
        {
          id: 'insight-1',
          sessionId: 'session-123',
          pattern: 'add systemPrompt: length',
          patternType: 'prompt_change',
          contexts: [],
          successCount: 2,
          failureCount: 1,
          avgScoreImpact: 1.5,
          confidence: 0.6,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockGetEvolutionRecordsByLineage.mockReturnValue(pastRecords);
      mockGetLearningInsightsBySession.mockReturnValue(insights);

      await runEvolutionPipeline(defaultInput);

      expect(mockCreateEvolutionPlan).toHaveBeenCalledWith(
        defaultInput.agent,
        expect.any(Object),
        expect.any(Object),
        pastRecords,
        insights
      );
    });

    it('should apply evolution to agent', async () => {
      await runEvolutionPipeline({
        ...defaultInput,
        stickyDirective: 'Always be brief',
        oneshotDirective: 'Focus on bullet points',
      });

      expect(mockEvolveAgent).toHaveBeenCalledWith(
        defaultInput.agent,
        'Create a helpful assistant',
        6,
        'Could be more concise',
        'Always be brief',
        'Focus on bullet points'
      );
    });

    it('should record evolution in database', async () => {
      const result = await runEvolutionPipeline(defaultInput);

      expect(mockCreateEvolutionRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          lineageId: 'lineage-123',
          fromVersion: 1,
          toVersion: 2,
          triggerScore: 6,
          triggerComment: 'Could be more concise',
        })
      );

      expect(result.evolutionRecord).toBeDefined();
    });

    it('should record training signal for agent evolved', async () => {
      const plan = createMockEvolutionPlan();
      mockCreateEvolutionPlan.mockResolvedValue(plan);

      await runEvolutionPipeline(defaultInput);

      expect(mockRecordAgentEvolved).toHaveBeenCalledWith(
        defaultInput.agent,
        expect.objectContaining({ version: 2 }),
        plan.changes,
        plan.hypothesis
      );
    });

    it('should update previous evolution outcome when history exists', async () => {
      const previousRecord = createMockEvolutionRecord({
        id: 'prev-evolution-123',
        trigger: {
          rolloutId: 'rollout-prev',
          attemptId: 'attempt-prev',
          score: 4,
          directives: {},
        },
      });
      mockGetEvolutionRecordsByLineage.mockReturnValue([previousRecord]);

      await runEvolutionPipeline({ ...defaultInput, score: 7 });

      expect(mockUpdateEvolutionOutcome).toHaveBeenCalledWith('prev-evolution-123', {
        nextScore: 7,
        scoreDelta: 3,
        hypothesisValidated: true,
      });
    });

    it('should not update outcome if previous record already has outcome', async () => {
      const previousRecord = createMockEvolutionRecord({
        id: 'prev-evolution-123',
        outcome: {
          nextScore: 6,
          scoreDelta: 1,
          hypothesisValidated: true,
        },
      });
      mockGetEvolutionRecordsByLineage.mockReturnValue([previousRecord]);

      await runEvolutionPipeline(defaultInput);

      expect(mockUpdateEvolutionOutcome).not.toHaveBeenCalled();
    });

    it('should record evolution outcome training signal when updating previous', async () => {
      const previousRecord = createMockEvolutionRecord({
        id: 'prev-evolution-123',
        trigger: { rolloutId: 'r', attemptId: 'a', score: 4, directives: {} },
      });
      mockGetEvolutionRecordsByLineage.mockReturnValue([previousRecord]);

      await runEvolutionPipeline({ ...defaultInput, score: 7 });

      expect(mockRecordEvolutionOutcome).toHaveBeenCalledWith(
        'prev-evolution-123',
        3, // scoreDelta
        true // hypothesisValidated
      );
    });

    it('should return evolved agent with summary', async () => {
      const result = await runEvolutionPipeline(defaultInput);

      expect(result).toHaveProperty('evolvedAgent');
      expect(result).toHaveProperty('evolutionRecord');
      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('summary');
      expect(result.evolvedAgent.version).toBe(2);
    });

    it('should handle recording errors gracefully', async () => {
      mockRecordAgentEvolved.mockImplementation(() => {
        throw new Error('Recording failed');
      });

      // Should not throw
      const result = await runEvolutionPipeline(defaultInput);

      expect(result.evolvedAgent).toBeDefined();
    });

    it('should apply plan changes to evolved agent', async () => {
      const plan = createMockEvolutionPlan({
        changes: [
          {
            component: 'systemPrompt',
            changeType: 'add',
            target: 'concise_instruction',
            before: null,
            after: 'Be brief and to the point.',
            reason: 'Address verbosity',
            confidence: 0.9,
          },
        ],
      });
      mockCreateEvolutionPlan.mockResolvedValue(plan);
      mockEvolveAgent.mockResolvedValue(createTestAgent({
        version: 2,
        systemPrompt: 'You are a helpful assistant.',
      }));

      const result = await runEvolutionPipeline(defaultInput);

      // The plan changes should be applied to the evolved agent's system prompt
      expect(result.evolvedAgent.systemPrompt).toContain('Be brief and to the point.');
    });

    it('should apply temperature changes from plan', async () => {
      const plan = createMockEvolutionPlan({
        changes: [
          {
            component: 'parameters',
            changeType: 'modify',
            target: 'temperature',
            before: '0.7',
            after: '0.5',
            reason: 'Reduce randomness for consistency',
            confidence: 0.8,
          },
        ],
      });
      mockCreateEvolutionPlan.mockResolvedValue(plan);
      mockEvolveAgent.mockResolvedValue(createTestAgent({
        version: 2,
        parameters: { model: 'claude-sonnet', temperature: 0.7, maxTokens: 1024 },
      }));

      const result = await runEvolutionPipeline(defaultInput);

      expect(result.evolvedAgent.parameters.temperature).toBe(0.5);
    });

    it('should use fallback lineageId when agent has none', async () => {
      const agentWithoutLineage = createTestAgent({ lineageId: undefined });

      await runEvolutionPipeline({ ...defaultInput, agent: agentWithoutLineage });

      expect(mockCreateEvolutionRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          lineageId: 'lineage-agent-123',
        })
      );
    });

    it('should include directives in evolution record', async () => {
      await runEvolutionPipeline({
        ...defaultInput,
        stickyDirective: 'Be concise',
        oneshotDirective: 'Use bullet points',
      });

      expect(mockCreateEvolutionRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerDirectives: {
            sticky: 'Be concise',
            oneshot: 'Use bullet points',
          },
        })
      );
    });

    it('should generate rolloutId and attemptId if not provided', async () => {
      await runEvolutionPipeline(defaultInput);

      expect(mockCreateEvolutionRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutId: 'mock-id-123',
          attemptId: 'mock-id-123',
        })
      );
    });

    it('should use provided rolloutId and attemptId', async () => {
      await runEvolutionPipeline({
        ...defaultInput,
        rolloutId: 'custom-rollout',
        attemptId: 'custom-attempt',
      });

      expect(mockCreateEvolutionRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutId: 'custom-rollout',
          attemptId: 'custom-attempt',
        })
      );
    });
  });

  describe('quickEvolve', () => {
    beforeEach(() => {
      mockEvolveAgent.mockResolvedValue(createTestAgent({ version: 2 }));
    });

    it('should return evolved agent without full pipeline', async () => {
      const agent = createTestAgent();
      const result = await quickEvolve(agent, 'test need', 7, 'Good work');

      expect(mockEvolveAgent).toHaveBeenCalledWith(
        agent,
        'test need',
        7,
        'Good work',
        null,
        null
      );
      expect(result.version).toBe(2);
    });

    it('should handle undefined feedback', async () => {
      const agent = createTestAgent();
      await quickEvolve(agent, 'test need', 5);

      expect(mockEvolveAgent).toHaveBeenCalledWith(
        agent,
        'test need',
        5,
        null,
        null,
        null
      );
    });

    it('should pass through evolved agent from evolveAgent', async () => {
      const evolvedAgent = createTestAgent({
        version: 3,
        systemPrompt: 'Evolved prompt',
      });
      mockEvolveAgent.mockResolvedValue(evolvedAgent);

      const result = await quickEvolve(createTestAgent(), 'test', 6);

      expect(result).toEqual(evolvedAgent);
    });
  });

  describe('getEvolutionStats', () => {
    it('should return stats for lineage with history', () => {
      const records: EvolutionRecord[] = [
        createMockEvolutionRecord({
          id: 'evo-1',
          outcome: { nextScore: 7, scoreDelta: 2, hypothesisValidated: true },
          changes: [
            { component: 'systemPrompt', changeType: 'add', target: 'instructions', before: null, after: 'x', reason: 'test', confidence: 0.8 },
          ],
        }),
        createMockEvolutionRecord({
          id: 'evo-2',
          outcome: { nextScore: 8, scoreDelta: 1, hypothesisValidated: true },
          changes: [
            { component: 'systemPrompt', changeType: 'modify', target: 'tone', before: 'a', after: 'b', reason: 'test', confidence: 0.7 },
          ],
        }),
        createMockEvolutionRecord({
          id: 'evo-3',
          outcome: { nextScore: 6, scoreDelta: -2, hypothesisValidated: false },
          changes: [
            { component: 'systemPrompt', changeType: 'add', target: 'instructions', before: null, after: 'y', reason: 'test', confidence: 0.6 },
          ],
        }),
      ];
      mockGetEvolutionRecordsByLineage.mockReturnValue(records);

      const stats = getEvolutionStats('lineage-123');

      expect(stats.totalEvolutions).toBe(3);
      expect(stats.avgScoreImprovement).toBeCloseTo(0.333, 2);
      expect(stats.successRate).toBeCloseTo(0.667, 2);
      expect(stats.commonChanges).toContain('systemPrompt/instructions');
    });

    it('should handle empty history correctly', () => {
      mockGetEvolutionRecordsByLineage.mockReturnValue([]);

      const stats = getEvolutionStats('lineage-empty');

      expect(stats).toEqual({
        totalEvolutions: 0,
        avgScoreImprovement: 0,
        successRate: 0,
        commonChanges: [],
      });
    });

    it('should handle records without outcomes', () => {
      const records: EvolutionRecord[] = [
        createMockEvolutionRecord({ id: 'evo-1', outcome: undefined }),
        createMockEvolutionRecord({
          id: 'evo-2',
          outcome: { nextScore: 7, scoreDelta: 2, hypothesisValidated: true },
        }),
      ];
      mockGetEvolutionRecordsByLineage.mockReturnValue(records);

      const stats = getEvolutionStats('lineage-123');

      expect(stats.totalEvolutions).toBe(2);
      // Only one record has outcome
      expect(stats.avgScoreImprovement).toBe(2);
      expect(stats.successRate).toBe(1); // 1/1 = 100%
    });

    it('should rank common changes by frequency', () => {
      const records: EvolutionRecord[] = [
        createMockEvolutionRecord({
          changes: [
            { component: 'systemPrompt', changeType: 'add', target: 'A', before: null, after: 'x', reason: 'test', confidence: 0.8 },
            { component: 'parameters', changeType: 'modify', target: 'B', before: '1', after: '2', reason: 'test', confidence: 0.7 },
          ],
        }),
        createMockEvolutionRecord({
          changes: [
            { component: 'systemPrompt', changeType: 'add', target: 'A', before: null, after: 'y', reason: 'test', confidence: 0.8 },
          ],
        }),
        createMockEvolutionRecord({
          changes: [
            { component: 'systemPrompt', changeType: 'add', target: 'A', before: null, after: 'z', reason: 'test', confidence: 0.8 },
            { component: 'tools', changeType: 'modify', target: 'C', before: null, after: 'c', reason: 'test', confidence: 0.6 },
          ],
        }),
      ];
      mockGetEvolutionRecordsByLineage.mockReturnValue(records);

      const stats = getEvolutionStats('lineage-123');

      // systemPrompt/A appears 3 times, should be first
      expect(stats.commonChanges[0]).toBe('systemPrompt/A');
    });

    it('should limit common changes to top 5', () => {
      const changes = Array.from({ length: 10 }, (_, i) => ({
        component: 'systemPrompt' as const,
        changeType: 'add' as const,
        target: `target-${i}`,
        before: null,
        after: 'x',
        reason: 'test',
        confidence: 0.8,
      }));

      const records = [createMockEvolutionRecord({ changes })];
      mockGetEvolutionRecordsByLineage.mockReturnValue(records);

      const stats = getEvolutionStats('lineage-123');

      expect(stats.commonChanges.length).toBeLessThanOrEqual(5);
    });
  });

  describe('learning extraction', () => {
    beforeEach(() => {
      // Set up default mock return values for these tests
      mockAnalyzeReward.mockResolvedValue(createMockScoreAnalysis());
      mockAssignCredit.mockResolvedValue({
        mode: 'prompt' as const,
        credits: [],
      });
      mockCreateEvolutionPlan.mockResolvedValue(createMockEvolutionPlan());
      mockEvolveAgent.mockResolvedValue(createTestAgent({ version: 2, id: 'agent-456' }));
      mockCreateEvolutionRecord.mockReturnValue(createMockEvolutionRecord({ id: 'new-evolution-123' }));
      mockGetLearningInsightsBySession.mockReturnValue([]);
    });

    it('should create learning insight for new pattern', async () => {
      const previousRecord = createMockEvolutionRecord({
        id: 'prev-evo',
        trigger: { rolloutId: 'r', attemptId: 'a', score: 5, comment: 'too long', directives: {} },
        changes: [
          { component: 'systemPrompt', changeType: 'add', target: 'brevity', before: null, after: 'Be brief', reason: 'test', confidence: 0.8 },
        ],
      });
      mockGetEvolutionRecordsByLineage.mockReturnValue([previousRecord]);
      mockFindInsightByPattern.mockReturnValue(null);

      await runEvolutionPipeline({
        agent: createTestAgent(),
        need: 'test',
        score: 7,
        sessionId: 'session-123',
      });

      expect(mockCreateLearningInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          pattern: 'add systemPrompt: brevity',
        })
      );
    });

    it('should update existing learning insight', async () => {
      const previousRecord = createMockEvolutionRecord({
        id: 'prev-evo',
        trigger: { rolloutId: 'r', attemptId: 'a', score: 5, directives: {} },
        changes: [
          { component: 'systemPrompt', changeType: 'add', target: 'brevity', before: null, after: 'Be brief', reason: 'test', confidence: 0.8 },
        ],
      });
      mockGetEvolutionRecordsByLineage.mockReturnValue([previousRecord]);

      const existingInsight: LearningInsight = {
        id: 'insight-123',
        sessionId: 'session-123',
        pattern: 'add systemPrompt: brevity',
        patternType: 'prompt_change',
        contexts: ['previous context'],
        successCount: 1,
        failureCount: 1,
        avgScoreImpact: 0.5,
        confidence: 0.3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockFindInsightByPattern.mockReturnValue(existingInsight);

      await runEvolutionPipeline({
        agent: createTestAgent(),
        need: 'test',
        score: 8, // Score improved (+3)
        sessionId: 'session-123',
      });

      expect(mockUpdateLearningInsight).toHaveBeenCalledWith(
        'insight-123',
        expect.objectContaining({
          successCount: 2, // Was successful
          failureCount: 1, // No change
        })
      );
    });
  });

  describe('summary generation', () => {
    beforeEach(() => {
      // Set up default mock return values for these tests
      mockAnalyzeReward.mockResolvedValue(createMockScoreAnalysis());
      mockAssignCredit.mockResolvedValue({
        mode: 'prompt' as const,
        credits: [],
      });
      mockCreateEvolutionPlan.mockResolvedValue(createMockEvolutionPlan());
      mockEvolveAgent.mockResolvedValue(createTestAgent({ version: 2, id: 'agent-456' }));
      mockCreateEvolutionRecord.mockReturnValue(createMockEvolutionRecord({ id: 'new-evolution-123' }));
      mockGetEvolutionRecordsByLineage.mockReturnValue([]);
      mockGetLearningInsightsBySession.mockReturnValue([]);
    });

    it('should generate summary with score trend', async () => {
      mockAnalyzeReward.mockResolvedValue(
        createMockScoreAnalysis({
          score: 7,
          deltaFromPrevious: 2,
          aspects: [
            { aspect: 'tone', sentiment: 'positive', confidence: 0.8 },
            { aspect: 'length', sentiment: 'negative', confidence: 0.7 },
          ],
        })
      );

      const result = await runEvolutionPipeline({
        agent: createTestAgent(),
        need: 'test',
        score: 7,
        previousScore: 5,
        sessionId: 'session-123',
      });

      expect(result.summary).toContain('7/10');
      expect(result.summary).toContain('up 2');
    });

    it('should include issues in summary', async () => {
      mockAnalyzeReward.mockResolvedValue(
        createMockScoreAnalysis({
          aspects: [
            { aspect: 'accuracy', sentiment: 'negative', confidence: 0.9 },
          ],
        })
      );

      const result = await runEvolutionPipeline({
        agent: createTestAgent(),
        need: 'test',
        score: 4,
        sessionId: 'session-123',
      });

      expect(result.summary).toContain('accuracy');
    });

    it('should include version change in summary', async () => {
      mockEvolveAgent.mockResolvedValue(createTestAgent({ version: 3 }));

      const result = await runEvolutionPipeline({
        agent: createTestAgent({ version: 2 }),
        need: 'test',
        score: 6,
        sessionId: 'session-123',
      });

      expect(result.summary).toContain('2 -> 3');
    });

    it('should include hypothesis in summary when present', async () => {
      mockCreateEvolutionPlan.mockResolvedValue(
        createMockEvolutionPlan({
          hypothesis: 'Reducing verbosity will improve user satisfaction',
        })
      );

      const result = await runEvolutionPipeline({
        agent: createTestAgent(),
        need: 'test',
        score: 5,
        sessionId: 'session-123',
      });

      expect(result.summary).toContain('Reducing verbosity');
    });
  });
});
