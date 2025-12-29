/**
 * Evolution Planner Tests
 *
 * Tests for the evolution planning service that creates targeted
 * evolution plans based on credit assignment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEvolutionPlan,
  checkAgainstHistory,
  summarizePlan,
} from '../evolution-planner';
import type {
  ScoreAnalysis,
  PromptCredit,
  TrajectoryCredit,
  EvolutionChange,
  EvolutionRecord,
  LearningInsight,
} from '../../types/evolution';
import type { AgentDefinition } from '../../types/agent';

// Mock the LLM client
vi.mock('../../api/llm', () => ({
  llmClient: {
    chat: vi.fn(),
  },
  isLLMConfigured: vi.fn(() => false), // Default to heuristic-based planning
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

describe('evolution-planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEvolutionPlan', () => {
    describe('from prompt credits', () => {
      it('creates changes for high-blame segments', async () => {
        const agent = createTestAgent('Be extremely verbose and detailed.');
        const analysis = createTestAnalysis(3, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.9 },
        ]);
        const credits: PromptCredit[] = [
          {
            segment: 'Be extremely verbose and detailed.',
            segmentIndex: 0,
            blame: 'high',
            relatedAspect: 'length',
            reason: 'Causes verbose output',
          },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        expect(plan.changes.length).toBeGreaterThan(0);
        const lengthChange = plan.changes.find(
          (c) => c.target.includes('length') || c.reason.includes('length')
        );
        expect(lengthChange).toBeDefined();
      });

      it('adds parameter adjustment for very low scores', async () => {
        const agent = createTestAgent('Simple prompt');
        const analysis = createTestAnalysis(2);
        const credits: PromptCredit[] = [];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const paramChange = plan.changes.find(
          (c) => c.component === 'parameters'
        );
        expect(paramChange).toBeDefined();
        expect(paramChange?.target).toBe('temperature');
      });

      it('generates instruction changes for negative aspects', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4, [
          { aspect: 'tone', sentiment: 'negative', confidence: 0.8 },
        ]);
        const credits: PromptCredit[] = [
          {
            segment: 'You are a helpful assistant.',
            segmentIndex: 0,
            blame: 'medium',
            relatedAspect: 'tone',
            reason: 'Tone issues',
          },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const toneChange = plan.changes.find(
          (c) => c.reason.includes('tone') || c.target.includes('tone')
        );
        expect(toneChange).toBeDefined();
      });

      it('considers removal of high-blame segments', async () => {
        const agent = createTestAgent('Bad instruction here');
        const analysis = createTestAnalysis(3, [
          { aspect: 'accuracy', sentiment: 'negative', confidence: 0.9 },
        ]);
        const credits: PromptCredit[] = [
          {
            segment: 'Bad instruction here',
            segmentIndex: 0,
            blame: 'high',
            relatedAspect: 'accuracy',
            reason: 'Causes accuracy issues',
          },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const removeChange = plan.changes.find(
          (c) => c.changeType === 'remove'
        );
        expect(removeChange).toBeDefined();
      });
    });

    describe('from trajectory credits', () => {
      it('adds tool error handling for tool failures', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4);
        const credits: TrajectoryCredit[] = [
          { spanId: 's1', contribution: 0.3, reason: 'LLM call ok' },
          { spanId: 's2', contribution: -0.5, reason: 'Tool call failed: timeout' },
          { spanId: 's3', contribution: 0.1, reason: 'Output ok' },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const toolChange = plan.changes.find(
          (c) => c.component === 'tools' && c.reason.includes('tool')
        );
        expect(toolChange).toBeDefined();
      });

      it('adds reasoning guidance for LLM issues', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(3);
        const credits: TrajectoryCredit[] = [
          { spanId: 's1', contribution: -0.4, reason: 'LLM call produced suboptimal' },
          { spanId: 's2', contribution: -0.3, reason: 'LLM reasoning error' },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const reasoningChange = plan.changes.find(
          (c) => c.target === 'reasoning_guidance'
        );
        expect(reasoningChange).toBeDefined();
      });

      it('adds output validation for output issues', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4);
        const credits: TrajectoryCredit[] = [
          { spanId: 's1', contribution: 0.2, reason: 'LLM ok' },
          { spanId: 's2', contribution: -0.5, reason: 'Final output needs improvement' },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        const outputChange = plan.changes.find(
          (c) => c.component === 'flow' && c.target === 'output_validation'
        );
        expect(outputChange).toBeDefined();
      });
    });

    describe('hypothesis generation', () => {
      it('generates hypothesis for changes', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
        ]);
        const credits: PromptCredit[] = [
          {
            segment: 'You are a helpful assistant.',
            segmentIndex: 0,
            blame: 'medium',
            relatedAspect: 'length',
            reason: 'Length issue',
          },
        ];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        expect(plan.hypothesis).toBeDefined();
        expect(plan.hypothesis.length).toBeGreaterThan(0);
      });

      it('generates no-change hypothesis when no changes needed', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(9); // High score
        const credits: PromptCredit[] = [];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        if (plan.changes.length === 0) {
          expect(plan.hypothesis).toContain('maintain');
        }
      });
    });

    describe('expected impact', () => {
      it('generates expected impact for aspects', async () => {
        const agent = createTestAgent('You are a helpful assistant.');
        const analysis = createTestAnalysis(4, [
          { aspect: 'length', sentiment: 'negative', confidence: 0.8 },
          { aspect: 'tone', sentiment: 'positive', confidence: 0.7 },
        ]);
        const credits: PromptCredit[] = [];

        const plan = await createEvolutionPlan(agent, analysis, credits);

        expect(plan.expectedImpact).toBeDefined();
        const lengthImpact = plan.expectedImpact.find((i) => i.aspect === 'length');
        const toneImpact = plan.expectedImpact.find((i) => i.aspect === 'tone');

        if (lengthImpact) {
          expect(lengthImpact.direction).toBe('improve');
        }
        if (toneImpact) {
          expect(toneImpact.direction).toBe('maintain');
        }
      });
    });
  });

  describe('checkAgainstHistory', () => {
    it('recommends apply when no history', async () => {
      const change: EvolutionChange = {
        component: 'systemPrompt',
        changeType: 'modify',
        target: 'length_instructions',
        before: 'old',
        after: 'new',
        reason: 'Fix length',
        confidence: 0.8,
      };

      const result = await checkAgainstHistory(change, [], []);

      expect(result.recommendation).toBe('apply');
      expect(result.similarPastChanges.length).toBe(0);
    });

    it('recommends skip when similar changes failed multiple times', async () => {
      const change: EvolutionChange = {
        component: 'systemPrompt',
        changeType: 'modify',
        target: 'length_instructions',
        before: null,
        after: 'Be concise',
        reason: 'Fix length',
        confidence: 0.8,
      };

      const pastRecords: EvolutionRecord[] = [
        {
          id: 'r1',
          lineageId: 'l1',
          fromVersion: 1,
          toVersion: 2,
          trigger: { rolloutId: 'ro1', attemptId: 'a1', score: 4, directives: {} },
          scoreAnalysis: createTestAnalysis(4),
          creditAssignment: [],
          plan: { changes: [], hypothesis: '', expectedImpact: [] },
          changes: [
            {
              component: 'systemPrompt',
              changeType: 'modify',
              target: 'length_instructions',
              before: null,
              after: 'Be brief',
              reason: 'Reduce length',
              confidence: 0.7,
            },
          ],
          outcome: { nextScore: 3, scoreDelta: -1, hypothesisValidated: false },
          createdAt: Date.now(),
        },
        {
          id: 'r2',
          lineageId: 'l1',
          fromVersion: 2,
          toVersion: 3,
          trigger: { rolloutId: 'ro2', attemptId: 'a2', score: 3, directives: {} },
          scoreAnalysis: createTestAnalysis(3),
          creditAssignment: [],
          plan: { changes: [], hypothesis: '', expectedImpact: [] },
          changes: [
            {
              component: 'systemPrompt',
              changeType: 'modify',
              target: 'length_instructions',
              before: null,
              after: 'Keep it short',
              reason: 'Fix length again',
              confidence: 0.6,
            },
          ],
          outcome: { nextScore: 2, scoreDelta: -1, hypothesisValidated: false },
          createdAt: Date.now(),
        },
      ];

      const result = await checkAgainstHistory(change, pastRecords, []);

      expect(result.recommendation).toBe('skip');
      expect(result.similarPastChanges.length).toBe(2);
    });

    it('recommends apply when similar changes succeeded', async () => {
      const change: EvolutionChange = {
        component: 'systemPrompt',
        changeType: 'modify',
        target: 'tone_instructions',
        before: null,
        after: 'Be friendly',
        reason: 'Fix tone',
        confidence: 0.8,
      };

      const pastRecords: EvolutionRecord[] = [
        {
          id: 'r1',
          lineageId: 'l1',
          fromVersion: 1,
          toVersion: 2,
          trigger: { rolloutId: 'ro1', attemptId: 'a1', score: 5, directives: {} },
          scoreAnalysis: createTestAnalysis(5),
          creditAssignment: [],
          plan: { changes: [], hypothesis: '', expectedImpact: [] },
          changes: [
            {
              component: 'systemPrompt',
              changeType: 'modify',
              target: 'tone_instructions',
              before: null,
              after: 'Be warm',
              reason: 'Improve tone',
              confidence: 0.7,
            },
          ],
          outcome: { nextScore: 7, scoreDelta: 2, hypothesisValidated: true },
          createdAt: Date.now(),
        },
      ];

      const result = await checkAgainstHistory(change, pastRecords, []);

      expect(result.recommendation).toBe('apply');
    });

    it('uses learning insights to inform recommendation', async () => {
      const change: EvolutionChange = {
        component: 'systemPrompt',
        changeType: 'modify',
        target: 'format_instructions',
        before: null,
        after: 'Use bullet points',
        reason: 'Fix format',
        confidence: 0.8,
      };

      const insights: LearningInsight[] = [
        {
          id: 'i1',
          sessionId: 's1',
          pattern: 'Adding format_instructions improves scores',
          patternType: 'prompt_change',
          contexts: [],
          successCount: 5,
          failureCount: 1,
          avgScoreImpact: 1.5,
          confidence: 0.8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const result = await checkAgainstHistory(change, [], insights);

      expect(result.recommendation).toBe('apply');
      expect(result.reason).toContain('insight');
    });

    it('recommends skip based on negative insights', async () => {
      const change: EvolutionChange = {
        component: 'parameters',
        changeType: 'modify',
        target: 'temperature',
        before: '0.7',
        after: '0.9',
        reason: 'Increase creativity',
        confidence: 0.6,
      };

      const insights: LearningInsight[] = [
        {
          id: 'i1',
          sessionId: 's1',
          pattern: 'Increasing temperature often fails',
          patternType: 'param_change',
          contexts: [],
          successCount: 1,
          failureCount: 5,
          avgScoreImpact: -1.2,
          confidence: 0.7,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const result = await checkAgainstHistory(change, [], insights);

      expect(result.recommendation).toBe('skip');
    });
  });

  describe('summarizePlan', () => {
    it('returns no changes message for empty plan', () => {
      const plan = {
        changes: [],
        hypothesis: 'No changes needed',
        expectedImpact: [],
      };

      expect(summarizePlan(plan)).toBe('No changes planned');
    });

    it('summarizes changes and hypothesis', () => {
      const plan = {
        changes: [
          {
            component: 'systemPrompt' as const,
            changeType: 'modify' as const,
            target: 'length_instructions',
            before: null,
            after: 'Be concise',
            reason: 'Fix length',
            confidence: 0.8,
          },
          {
            component: 'parameters' as const,
            changeType: 'modify' as const,
            target: 'temperature',
            before: '0.7',
            after: '0.5',
            reason: 'Reduce randomness',
            confidence: 0.7,
          },
        ],
        hypothesis: 'Length should improve',
        expectedImpact: [],
      };

      const summary = summarizePlan(plan);

      expect(summary).toContain('modify systemPrompt/length_instructions');
      expect(summary).toContain('modify parameters/temperature');
      expect(summary).toContain('Length should improve');
    });
  });
});
