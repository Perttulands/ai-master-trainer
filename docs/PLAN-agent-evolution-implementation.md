# Agent Evolution System - Implementation Plan

## Approach: Test-Driven Development

Each feature follows:
1. Write failing tests
2. Implement minimum code to pass
3. Refactor
4. Repeat

---

## Phase 1: Data Layer Foundation

### 1.1 Types

**Tests First:** `src/types/__tests__/evolution.test.ts`

```typescript
describe('Evolution Types', () => {
  describe('Rollout', () => {
    it('should have required fields', () => {
      const rollout: Rollout = {
        id: 'r1',
        lineageId: 'l1',
        cycle: 1,
        status: 'pending',
        attempts: [],
        createdAt: Date.now(),
      };
      expect(rollout.status).toBe('pending');
    });

    it('should track final attempt when completed', () => {
      const rollout: Rollout = {
        id: 'r1',
        lineageId: 'l1',
        cycle: 1,
        status: 'completed',
        attempts: [],
        finalAttemptId: 'a1',
        createdAt: Date.now(),
        completedAt: Date.now(),
      };
      expect(rollout.finalAttemptId).toBe('a1');
    });
  });

  describe('Attempt', () => {
    it('should capture agent snapshot for reproducibility', () => {
      const attempt: Attempt = createMockAttempt();
      expect(attempt.agentSnapshot.systemPromptHash).toBeDefined();
      expect(attempt.agentSnapshot.toolsHash).toBeDefined();
    });

    it('should track execution metrics', () => {
      const attempt: Attempt = createMockAttempt({
        durationMs: 1500,
        totalTokens: 500,
        estimatedCost: 0.002,
      });
      expect(attempt.durationMs).toBe(1500);
      expect(attempt.estimatedCost).toBe(0.002);
    });
  });

  describe('ExecutionSpan', () => {
    it('should capture LLM call details', () => {
      const span: ExecutionSpan = {
        id: 's1',
        attemptId: 'a1',
        sequence: 1,
        type: 'llm_call',
        input: 'prompt',
        output: 'response',
        modelId: 'claude-3-sonnet',
        promptTokens: 100,
        completionTokens: 200,
        durationMs: 800,
        createdAt: Date.now(),
      };
      expect(span.modelId).toBe('claude-3-sonnet');
    });

    it('should capture tool call details', () => {
      const span: ExecutionSpan = {
        id: 's2',
        attemptId: 'a1',
        sequence: 2,
        type: 'tool_call',
        input: 'search query',
        output: 'results',
        toolName: 'web_search',
        toolArgs: { query: 'test' },
        toolResult: { results: [] },
        durationMs: 500,
        createdAt: Date.now(),
      };
      expect(span.toolName).toBe('web_search');
      expect(span.toolArgs).toEqual({ query: 'test' });
    });
  });
});
```

**Implementation:** `src/types/evolution.ts`

---

### 1.2 Database Schema

**Tests First:** `src/db/__tests__/evolution-schema.test.ts`

```typescript
describe('Evolution Schema', () => {
  beforeEach(() => {
    initTestDatabase();
  });

  describe('rollouts table', () => {
    it('should create rollout', () => {
      const rollout = queries.createRollout('lineage-1', 1);
      expect(rollout.id).toBeDefined();
      expect(rollout.status).toBe('pending');
    });

    it('should update rollout status', () => {
      const rollout = queries.createRollout('lineage-1', 1);
      queries.updateRollout(rollout.id, { status: 'completed' });
      const updated = queries.getRollout(rollout.id);
      expect(updated?.status).toBe('completed');
    });

    it('should get rollouts by lineage', () => {
      queries.createRollout('lineage-1', 1);
      queries.createRollout('lineage-1', 2);
      const rollouts = queries.getRolloutsByLineage('lineage-1');
      expect(rollouts).toHaveLength(2);
    });
  });

  describe('attempts table', () => {
    it('should create attempt with agent snapshot', () => {
      const rollout = queries.createRollout('lineage-1', 1);
      const attempt = queries.createAttempt({
        rolloutId: rollout.id,
        attemptNumber: 1,
        agentSnapshot: {
          agentId: 'agent-1',
          version: 1,
          systemPromptHash: 'hash1',
          toolsHash: 'hash2',
          flowHash: 'hash3',
        },
        input: 'test input',
        modelId: 'claude-3-sonnet',
        parameters: { temperature: 0.7, maxTokens: 1000 },
      });
      expect(attempt.agentSnapshot.systemPromptHash).toBe('hash1');
    });

    it('should update attempt with results', () => {
      const attempt = createTestAttempt();
      queries.updateAttempt(attempt.id, {
        status: 'succeeded',
        output: 'response text',
        durationMs: 1200,
        totalTokens: 450,
      });
      const updated = queries.getAttempt(attempt.id);
      expect(updated?.status).toBe('succeeded');
      expect(updated?.output).toBe('response text');
    });
  });

  describe('execution_spans table', () => {
    it('should create span with LLM metadata', () => {
      const attempt = createTestAttempt();
      const span = queries.createSpan({
        attemptId: attempt.id,
        sequence: 1,
        type: 'llm_call',
        input: 'prompt',
        output: 'response',
        modelId: 'claude-3-sonnet',
        promptTokens: 100,
        completionTokens: 200,
        durationMs: 800,
      });
      expect(span.modelId).toBe('claude-3-sonnet');
    });

    it('should create span with tool metadata', () => {
      const attempt = createTestAttempt();
      const span = queries.createSpan({
        attemptId: attempt.id,
        sequence: 2,
        type: 'tool_call',
        input: 'query',
        output: 'results',
        toolName: 'web_search',
        toolArgs: { query: 'test' },
        toolResult: { items: [] },
        durationMs: 300,
      });
      expect(span.toolName).toBe('web_search');
    });

    it('should get spans by attempt', () => {
      const attempt = createTestAttempt();
      queries.createSpan({ attemptId: attempt.id, sequence: 1, type: 'llm_call', ... });
      queries.createSpan({ attemptId: attempt.id, sequence: 2, type: 'tool_call', ... });
      const spans = queries.getSpansByAttempt(attempt.id);
      expect(spans).toHaveLength(2);
      expect(spans[0].sequence).toBe(1);
    });
  });

  describe('evolution_records table', () => {
    it('should create evolution record', () => {
      const record = queries.createEvolutionRecord({
        lineageId: 'lineage-1',
        fromVersion: 1,
        toVersion: 2,
        rolloutId: 'rollout-1',
        attemptId: 'attempt-1',
        triggerScore: 4,
        triggerComment: 'too long',
        scoreAnalysis: { score: 4, sentiment: 'negative', aspects: [] },
        creditAssignment: [],
        plan: { changes: [], hypothesis: 'test' },
        changes: [],
      });
      expect(record.fromVersion).toBe(1);
      expect(record.toVersion).toBe(2);
    });

    it('should update with outcome', () => {
      const record = createTestEvolutionRecord();
      queries.updateEvolutionOutcome(record.id, {
        nextScore: 8,
        scoreDelta: 4,
        hypothesisValidated: true,
      });
      const updated = queries.getEvolutionRecord(record.id);
      expect(updated?.outcome?.hypothesisValidated).toBe(true);
    });
  });

  describe('learning_insights table', () => {
    it('should create insight', () => {
      const insight = queries.createLearningInsight({
        sessionId: 'session-1',
        pattern: 'Add bullet points',
        patternType: 'prompt_change',
      });
      expect(insight.successCount).toBe(0);
    });

    it('should increment success count', () => {
      const insight = createTestInsight();
      queries.recordInsightOutcome(insight.id, 'success', 5);
      const updated = queries.getLearningInsight(insight.id);
      expect(updated?.successCount).toBe(1);
      expect(updated?.avgScoreImpact).toBe(5);
    });
  });
});
```

**Implementation:** `src/db/schema.ts`, `src/db/queries.ts`

---

## Phase 2: Reward Analysis

### 2.1 Comment Parser

**Tests First:** `src/services/evolution/__tests__/reward-analyzer.test.ts`

```typescript
describe('RewardAnalyzer', () => {
  describe('parseComment', () => {
    it('should extract length feedback', () => {
      const analysis = analyzeReward({
        score: 3,
        comment: 'Way too long, I wanted something shorter',
      });
      expect(analysis.aspects).toContainEqual(
        expect.objectContaining({
          aspect: 'length',
          sentiment: 'negative',
        })
      );
    });

    it('should extract format feedback', () => {
      const analysis = analyzeReward({
        score: 4,
        comment: 'Use bullet points instead of paragraphs',
      });
      expect(analysis.aspects).toContainEqual(
        expect.objectContaining({
          aspect: 'format',
          sentiment: 'negative',
          quote: 'bullet points',
        })
      );
    });

    it('should extract tone feedback', () => {
      const analysis = analyzeReward({
        score: 5,
        comment: 'Too formal, make it more casual',
      });
      expect(analysis.aspects).toContainEqual(
        expect.objectContaining({
          aspect: 'tone',
          sentiment: 'negative',
        })
      );
    });

    it('should extract positive feedback', () => {
      const analysis = analyzeReward({
        score: 9,
        comment: 'Perfect length, love the bullet points!',
      });
      expect(analysis.aspects).toContainEqual(
        expect.objectContaining({
          aspect: 'length',
          sentiment: 'positive',
        })
      );
    });

    it('should handle empty comment', () => {
      const analysis = analyzeReward({ score: 5 });
      expect(analysis.aspects).toHaveLength(0);
      expect(analysis.sentiment).toBe('neutral');
    });
  });

  describe('calculateTrend', () => {
    it('should detect improving trend', () => {
      const analysis = analyzeReward(
        { score: 7 },
        [{ score: 3 }, { score: 5 }]
      );
      expect(analysis.trend).toBe('improving');
    });

    it('should detect declining trend', () => {
      const analysis = analyzeReward(
        { score: 4 },
        [{ score: 8 }, { score: 6 }]
      );
      expect(analysis.trend).toBe('declining');
    });

    it('should detect stable trend', () => {
      const analysis = analyzeReward(
        { score: 6 },
        [{ score: 6 }, { score: 5 }]
      );
      expect(analysis.trend).toBe('stable');
    });
  });

  describe('determineSentiment', () => {
    it('should be negative for score 1-4', () => {
      expect(analyzeReward({ score: 3 }).sentiment).toBe('negative');
    });

    it('should be neutral for score 5-6', () => {
      expect(analyzeReward({ score: 5 }).sentiment).toBe('neutral');
    });

    it('should be positive for score 7-10', () => {
      expect(analyzeReward({ score: 8 }).sentiment).toBe('positive');
    });
  });
});
```

**Implementation:** `src/services/evolution/reward-analyzer.ts`

---

## Phase 3: Credit Assignment

### 3.1 Prompt-Level Credit

**Tests First:** `src/services/evolution/__tests__/credit-assignment.test.ts`

```typescript
describe('CreditAssignment', () => {
  describe('assignPromptCredit', () => {
    it('should blame verbose instructions for length issues', () => {
      const agent = createMockAgent({
        systemPrompt: `You are a helpful assistant.
Provide comprehensive, detailed analysis.
Be thorough in your explanations.`,
      });
      const analysis: ScoreAnalysis = {
        score: 3,
        aspects: [{ aspect: 'length', sentiment: 'negative' }],
      };

      const credits = assignPromptCredit(agent, analysis);

      expect(credits).toContainEqual(
        expect.objectContaining({
          segment: expect.stringContaining('comprehensive'),
          blame: 'high',
          relatedAspect: 'length',
        })
      );
    });

    it('should blame format instructions for format issues', () => {
      const agent = createMockAgent({
        systemPrompt: `Structure your response as a formal essay.
Use proper paragraphs.`,
      });
      const analysis: ScoreAnalysis = {
        score: 4,
        aspects: [{ aspect: 'format', sentiment: 'negative', quote: 'bullets' }],
      };

      const credits = assignPromptCredit(agent, analysis);

      expect(credits).toContainEqual(
        expect.objectContaining({
          segment: expect.stringContaining('essay'),
          blame: 'high',
          relatedAspect: 'format',
        })
      );
    });

    it('should blame parameters for length issues', () => {
      const agent = createMockAgent({
        parameters: { maxTokens: 2048 },
      });
      const analysis: ScoreAnalysis = {
        score: 3,
        aspects: [{ aspect: 'length', sentiment: 'negative' }],
      };

      const credits = assignPromptCredit(agent, analysis);

      expect(credits).toContainEqual(
        expect.objectContaining({
          segment: 'maxTokens: 2048',
          blame: 'high',
          relatedAspect: 'length',
        })
      );
    });

    it('should not blame unrelated segments', () => {
      const agent = createMockAgent({
        systemPrompt: `You are a helpful assistant.
Always be accurate.`,
      });
      const analysis: ScoreAnalysis = {
        score: 3,
        aspects: [{ aspect: 'length', sentiment: 'negative' }],
      };

      const credits = assignPromptCredit(agent, analysis);
      const accuracyCredit = credits.find(c => c.segment.includes('accurate'));

      expect(accuracyCredit?.blame).toBe('none');
    });
  });

  describe('assignTrajectoryCredit', () => {
    it('should credit successful tool calls', () => {
      const spans: ExecutionSpan[] = [
        { type: 'tool_call', toolName: 'search', output: 'good results' },
        { type: 'llm_call', output: 'final answer using search' },
      ];
      const analysis: ScoreAnalysis = { score: 8, sentiment: 'positive' };

      const credits = assignTrajectoryCredit(spans, analysis);

      expect(credits).toContainEqual(
        expect.objectContaining({
          spanId: spans[0].id,
          contribution: expect.toBeGreaterThan(0),
        })
      );
    });

    it('should blame failed tool calls', () => {
      const spans: ExecutionSpan[] = [
        { type: 'tool_call', toolName: 'search', toolError: 'timeout' },
        { type: 'llm_call', output: 'sorry, could not search' },
      ];
      const analysis: ScoreAnalysis = { score: 3, sentiment: 'negative' };

      const credits = assignTrajectoryCredit(spans, analysis);

      expect(credits).toContainEqual(
        expect.objectContaining({
          spanId: spans[0].id,
          contribution: expect.toBeLessThan(0),
        })
      );
    });
  });

  describe('chooseCreditMode', () => {
    it('should use prompt-level for single LLM call', () => {
      const spans: ExecutionSpan[] = [
        { type: 'llm_call' },
      ];
      expect(chooseCreditMode(spans)).toBe('prompt');
    });

    it('should use trajectory for multiple LLM calls', () => {
      const spans: ExecutionSpan[] = [
        { type: 'llm_call' },
        { type: 'tool_call' },
        { type: 'llm_call' },
      ];
      expect(chooseCreditMode(spans)).toBe('trajectory');
    });
  });
});
```

**Implementation:** `src/services/evolution/credit-assignment.ts`

---

## Phase 4: Evolution Planner

### 4.1 Change Generation

**Tests First:** `src/services/evolution/__tests__/evolution-planner.test.ts`

```typescript
describe('EvolutionPlanner', () => {
  describe('planEvolution', () => {
    it('should generate modify change for high-blame segment', () => {
      const credits: PromptCredit[] = [
        { segment: 'comprehensive, detailed', blame: 'high', relatedAspect: 'length' },
      ];
      const analysis: ScoreAnalysis = {
        aspects: [{ aspect: 'length', sentiment: 'negative' }],
      };

      const plan = planEvolution(mockAgent, credits, analysis);

      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          component: 'systemPrompt',
          changeType: 'modify',
          before: expect.stringContaining('comprehensive'),
          reason: expect.stringContaining('length'),
        })
      );
    });

    it('should generate add change for missing feature', () => {
      const analysis: ScoreAnalysis = {
        aspects: [{ aspect: 'format', sentiment: 'negative', quote: 'bullet points' }],
      };
      const agent = createMockAgent({
        systemPrompt: 'You are helpful.',
      });

      const plan = planEvolution(agent, [], analysis);

      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          component: 'systemPrompt',
          changeType: 'add',
          after: expect.stringContaining('bullet'),
        })
      );
    });

    it('should generate parameter change for length issues', () => {
      const credits: PromptCredit[] = [
        { segment: 'maxTokens: 2048', blame: 'high', relatedAspect: 'length' },
      ];

      const plan = planEvolution(mockAgent, credits, mockAnalysis);

      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          component: 'parameters',
          changeType: 'modify',
          target: 'maxTokens',
        })
      );
    });

    it('should generate hypothesis', () => {
      const plan = planEvolution(mockAgent, mockCredits, mockAnalysis);
      expect(plan.hypothesis).toBeTruthy();
      expect(plan.hypothesis.length).toBeGreaterThan(10);
    });

    it('should respect immutable constraints', () => {
      const agent = createMockAgent({
        constraints: { maxTokens: 500 },
      });
      const credits: PromptCredit[] = [
        { segment: 'maxTokens', blame: 'high' },
      ];

      const plan = planEvolution(agent, credits, mockAnalysis);
      const maxTokensChange = plan.changes.find(c => c.target === 'maxTokens');

      expect(maxTokensChange).toBeUndefined();
    });
  });

  describe('checkHistory', () => {
    it('should recommend skip for previously failed change', () => {
      const history: EvolutionRecord[] = [
        {
          changes: [{ changeType: 'add', after: 'Use bullet points' }],
          outcome: { scoreDelta: -2 },
        },
      ];
      const proposedChange = { changeType: 'add', after: 'Use bullet points' };

      const check = checkHistory(proposedChange, history);

      expect(check.recommendation).toBe('skip');
    });

    it('should recommend apply for previously successful change', () => {
      const history: EvolutionRecord[] = [
        {
          changes: [{ changeType: 'modify', target: 'maxTokens', after: '300' }],
          outcome: { scoreDelta: 3 },
        },
      ];
      const proposedChange = { changeType: 'modify', target: 'maxTokens', after: '300' };

      const check = checkHistory(proposedChange, history);

      expect(check.recommendation).toBe('apply');
    });

    it('should recommend apply for novel change', () => {
      const check = checkHistory(mockChange, []);
      expect(check.recommendation).toBe('apply');
    });
  });
});
```

**Implementation:** `src/services/evolution/evolution-planner.ts`

---

## Phase 5: Agent Evolver

### 5.1 Apply Changes

**Tests First:** `src/services/evolution/__tests__/agent-evolver.test.ts`

```typescript
describe('AgentEvolver', () => {
  describe('evolveAgent', () => {
    it('should apply modify change to systemPrompt', () => {
      const agent = createMockAgent({
        systemPrompt: 'Provide comprehensive, detailed analysis.',
      });
      const plan: EvolutionPlan = {
        changes: [{
          component: 'systemPrompt',
          changeType: 'modify',
          before: 'comprehensive, detailed',
          after: 'brief, concise',
          reason: 'length',
        }],
        hypothesis: 'test',
      };

      const evolved = evolveAgent(agent, plan);

      expect(evolved.systemPrompt).toContain('brief, concise');
      expect(evolved.systemPrompt).not.toContain('comprehensive');
    });

    it('should apply add change to systemPrompt', () => {
      const agent = createMockAgent({
        systemPrompt: 'You are helpful.',
      });
      const plan: EvolutionPlan = {
        changes: [{
          component: 'systemPrompt',
          changeType: 'add',
          before: null,
          after: 'Use bullet points for lists.',
          reason: 'format',
        }],
        hypothesis: 'test',
      };

      const evolved = evolveAgent(agent, plan);

      expect(evolved.systemPrompt).toContain('bullet points');
    });

    it('should apply remove change to systemPrompt', () => {
      const agent = createMockAgent({
        systemPrompt: 'Be helpful. Be verbose. Be accurate.',
      });
      const plan: EvolutionPlan = {
        changes: [{
          component: 'systemPrompt',
          changeType: 'remove',
          before: 'Be verbose.',
          after: null,
          reason: 'length',
        }],
        hypothesis: 'test',
      };

      const evolved = evolveAgent(agent, plan);

      expect(evolved.systemPrompt).not.toContain('verbose');
      expect(evolved.systemPrompt).toContain('helpful');
    });

    it('should apply parameter changes', () => {
      const agent = createMockAgent({
        parameters: { maxTokens: 2048, temperature: 0.7 },
      });
      const plan: EvolutionPlan = {
        changes: [{
          component: 'parameters',
          changeType: 'modify',
          target: 'maxTokens',
          before: '2048',
          after: '300',
          reason: 'length',
        }],
        hypothesis: 'test',
      };

      const evolved = evolveAgent(agent, plan);

      expect(evolved.parameters.maxTokens).toBe(300);
      expect(evolved.parameters.temperature).toBe(0.7); // unchanged
    });

    it('should increment version', () => {
      const agent = createMockAgent({ version: 1 });
      const evolved = evolveAgent(agent, mockPlan);
      expect(evolved.version).toBe(2);
    });

    it('should generate new id', () => {
      const agent = createMockAgent({ id: 'old-id' });
      const evolved = evolveAgent(agent, mockPlan);
      expect(evolved.id).not.toBe('old-id');
    });

    it('should update hashes', () => {
      const agent = createMockAgent();
      const oldHash = agent.systemPromptHash;
      const evolved = evolveAgent(agent, mockPlan);
      expect(evolved.systemPromptHash).not.toBe(oldHash);
    });

    it('should preserve unchanged components', () => {
      const agent = createMockAgent({
        tools: [{ name: 'search' }],
        flow: [{ id: 'step1' }],
      });
      const plan: EvolutionPlan = {
        changes: [{
          component: 'systemPrompt',
          changeType: 'modify',
          before: 'old',
          after: 'new',
        }],
      };

      const evolved = evolveAgent(agent, plan);

      expect(evolved.tools).toEqual(agent.tools);
      expect(evolved.flow).toEqual(agent.flow);
    });
  });
});
```

**Implementation:** `src/services/evolution/agent-evolver.ts`

---

## Phase 6: Learning System

### 6.1 Insight Tracking

**Tests First:** `src/services/evolution/__tests__/learning.test.ts`

```typescript
describe('LearningSystem', () => {
  describe('extractPattern', () => {
    it('should extract pattern from change', () => {
      const change: EvolutionChange = {
        component: 'systemPrompt',
        changeType: 'add',
        after: 'Use bullet points',
        reason: 'User requested bullet format',
      };

      const pattern = extractPattern(change);

      expect(pattern).toBe('Add bullet point instruction');
    });
  });

  describe('recordOutcome', () => {
    it('should create new insight for novel pattern', async () => {
      const record: EvolutionRecord = {
        changes: [{ changeType: 'add', after: 'Use bullet points' }],
        outcome: { scoreDelta: 5 },
      };

      await recordOutcome('session-1', record);

      const insights = await getLearningInsights('session-1');
      expect(insights).toContainEqual(
        expect.objectContaining({
          pattern: expect.stringContaining('bullet'),
          successCount: 1,
        })
      );
    });

    it('should update existing insight', async () => {
      // First outcome
      await recordOutcome('session-1', mockRecord);
      // Second similar outcome
      await recordOutcome('session-1', mockRecord);

      const insights = await getLearningInsights('session-1');
      const insight = insights.find(i => i.pattern.includes('bullet'));

      expect(insight?.successCount).toBe(2);
    });

    it('should track failures', async () => {
      const record: EvolutionRecord = {
        changes: [{ changeType: 'add', after: 'Be verbose' }],
        outcome: { scoreDelta: -3 },
      };

      await recordOutcome('session-1', record);

      const insights = await getLearningInsights('session-1');
      const insight = insights.find(i => i.pattern.includes('verbose'));

      expect(insight?.failureCount).toBe(1);
    });

    it('should calculate average impact', async () => {
      await recordOutcome('session-1', { outcome: { scoreDelta: 4 } });
      await recordOutcome('session-1', { outcome: { scoreDelta: 6 } });

      const insights = await getLearningInsights('session-1');
      expect(insights[0].avgScoreImpact).toBe(5);
    });
  });

  describe('suggestFromInsights', () => {
    it('should suggest successful patterns', async () => {
      await createInsight({
        pattern: 'Add bullet instruction',
        successCount: 5,
        failureCount: 1,
        avgScoreImpact: 4,
      });

      const analysis: ScoreAnalysis = {
        aspects: [{ aspect: 'format', quote: 'bullets' }],
      };

      const suggestions = await suggestFromInsights('session-1', analysis);

      expect(suggestions).toContainEqual(
        expect.objectContaining({
          pattern: expect.stringContaining('bullet'),
          confidence: expect.toBeGreaterThan(0.7),
        })
      );
    });

    it('should not suggest failed patterns', async () => {
      await createInsight({
        pattern: 'Add verbose instruction',
        successCount: 1,
        failureCount: 5,
        avgScoreImpact: -2,
      });

      const suggestions = await suggestFromInsights('session-1', mockAnalysis);
      const verboseSuggestion = suggestions.find(s => s.pattern.includes('verbose'));

      expect(verboseSuggestion).toBeUndefined();
    });
  });
});
```

**Implementation:** `src/services/evolution/learning.ts`

---

## Phase 7: Integration

### 7.1 Full Pipeline

**Tests First:** `src/services/evolution/__tests__/pipeline.test.ts`

```typescript
describe('Evolution Pipeline', () => {
  describe('runEvolutionPipeline', () => {
    it('should complete full evolution cycle', async () => {
      const agent = createMockAgent({
        systemPrompt: 'Provide comprehensive analysis.',
        parameters: { maxTokens: 2048 },
      });
      const evaluation = {
        score: 3,
        comment: 'Too long, use bullets',
      };

      const result = await runEvolutionPipeline(agent, evaluation);

      expect(result.evolved.systemPrompt).not.toContain('comprehensive');
      expect(result.evolved.systemPrompt).toContain('bullet');
      expect(result.evolved.parameters.maxTokens).toBeLessThan(2048);
      expect(result.record.hypothesis).toBeTruthy();
    });

    it('should record evolution in database', async () => {
      const result = await runEvolutionPipeline(mockAgent, mockEvaluation);

      const record = await queries.getEvolutionRecord(result.record.id);
      expect(record).toBeTruthy();
      expect(record?.changes).toHaveLength(result.record.changes.length);
    });

    it('should use history to inform changes', async () => {
      // Create failed history
      await queries.createEvolutionRecord({
        changes: [{ after: 'Be extremely brief' }],
        outcome: { scoreDelta: -2 },
      });

      const result = await runEvolutionPipeline(mockAgent, mockEvaluation);

      // Should not repeat the failed pattern
      const briefChange = result.record.changes.find(c =>
        c.after?.includes('extremely brief')
      );
      expect(briefChange).toBeUndefined();
    });
  });

  describe('updateOutcome', () => {
    it('should update evolution record with next score', async () => {
      const record = await createTestEvolutionRecord();

      await updateOutcome(record.id, { score: 8 });

      const updated = await queries.getEvolutionRecord(record.id);
      expect(updated?.outcome?.nextScore).toBe(8);
      expect(updated?.outcome?.scoreDelta).toBe(5); // 8 - 3
      expect(updated?.outcome?.hypothesisValidated).toBe(true);
    });

    it('should record learning insight on outcome', async () => {
      const record = await createTestEvolutionRecord();

      await updateOutcome(record.id, { score: 8 });

      const insights = await queries.getLearningInsights(record.sessionId);
      expect(insights.length).toBeGreaterThan(0);
    });
  });
});
```

**Implementation:** `src/services/evolution/pipeline.ts`

---

## Phase 8: Store Integration

### 8.1 Update Lineage Store

**Tests First:** `src/store/__tests__/lineages-evolution.test.ts`

```typescript
describe('Lineage Store Evolution', () => {
  describe('regenerateUnlockedWithEvolution', () => {
    it('should use evolution pipeline', async () => {
      const { result } = renderHook(() => useLineageStore());

      await act(async () => {
        await result.current.regenerateUnlockedWithEvolution(
          'session-1',
          'test need'
        );
      });

      // Check evolved agent was created
      const agents = await queries.getAgentsByLineage('lineage-1');
      expect(agents.length).toBeGreaterThan(1);
    });

    it('should create rollout and attempt', async () => {
      await regenerateUnlockedWithEvolution('session-1', 'test need');

      const rollouts = await queries.getRolloutsByLineage('lineage-1');
      expect(rollouts).toHaveLength(1);
      expect(rollouts[0].attempts.length).toBeGreaterThan(0);
    });

    it('should record evolution', async () => {
      await regenerateUnlockedWithEvolution('session-1', 'test need');

      const records = await queries.getEvolutionRecordsByLineage('lineage-1');
      expect(records).toHaveLength(1);
    });
  });
});
```

**Implementation:** Update `src/store/lineages.ts`

---

## File Structure

```
src/
├── types/
│   ├── evolution.ts              # Rollout, Attempt, Span, etc.
│   └── __tests__/
│       └── evolution.test.ts
├── db/
│   ├── schema.ts                 # Add new tables
│   ├── queries.ts                # Add new queries
│   └── __tests__/
│       └── evolution-schema.test.ts
├── services/
│   └── evolution/
│       ├── index.ts              # Pipeline export
│       ├── reward-analyzer.ts
│       ├── credit-assignment.ts
│       ├── evolution-planner.ts
│       ├── agent-evolver.ts
│       ├── learning.ts
│       ├── pipeline.ts
│       └── __tests__/
│           ├── reward-analyzer.test.ts
│           ├── credit-assignment.test.ts
│           ├── evolution-planner.test.ts
│           ├── agent-evolver.test.ts
│           ├── learning.test.ts
│           └── pipeline.test.ts
└── store/
    ├── lineages.ts               # Update with evolution
    └── __tests__/
        └── lineages-evolution.test.ts
```

---

## Execution Order

1. **Phase 1**: Types + Schema (foundation)
2. **Phase 2**: Reward Analyzer (parse feedback)
3. **Phase 3**: Credit Assignment (find blame)
4. **Phase 4**: Evolution Planner (decide changes)
5. **Phase 5**: Agent Evolver (apply changes)
6. **Phase 6**: Learning System (track patterns)
7. **Phase 7**: Pipeline Integration (wire together)
8. **Phase 8**: Store Integration (connect to UI)

Each phase is independently testable and deployable.
