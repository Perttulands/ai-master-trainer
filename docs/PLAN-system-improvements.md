# Agent Evolution System - Improvement Plan

## Executive Summary

The agent evolution system has strong foundations (types, database, services) but lacks critical execution infrastructure. This plan addresses the gaps in priority order.

**Current State**: ~75-80% complete
**Target State**: Full Agent Lightning pattern with tool/flow execution

---

## Priority Matrix

| Phase | Impact | Effort | Dependencies |
|-------|--------|--------|--------------|
| 1. Consolidate Evolution Paths | High | Low | None |
| 2. Tool Execution Engine | High | Medium | Phase 1 |
| 3. Flow Execution Engine | High | Medium | Phase 2 |
| 4. Wire Full Pipeline | High | Low | Phase 3 |
| 5. Trajectory Credit | Medium | Low | Phase 3 |
| 6. Learning Integration | Medium | Low | Phase 4 |

---

## Phase 1: Consolidate Evolution Paths

### Problem

Two parallel evolution systems exist:
- `src/agents/agent-evolver.ts` - Simple, only modifies prompt
- `src/services/agent-evolver.ts` - Full, modifies all components

The lineage store uses the simple evolver, leaving the full evolver underutilized.

### Solution

1. Deprecate `src/agents/agent-evolver.ts`
2. Update `src/store/lineages.ts` to use `src/services/agent-evolver.ts`
3. Ensure backward compatibility for `regenerateUnlockedWithAgents()`

### Implementation

```typescript
// src/store/lineages.ts - Update import
import { evolveAgent } from '../services/agent-evolver';

// Replace simple evolver calls with full evolver
const evolvedAgent = await evolveAgent(
  currentAgent,
  plan,
  'moderate' // intensity based on score
);
```

### Files to Modify

- `src/store/lineages.ts` - Switch evolver
- `src/agents/agent-evolver.ts` - Add deprecation notice

### Success Criteria

- [ ] All regeneration uses `services/agent-evolver.ts`
- [ ] Tests pass
- [ ] No behavior changes for users

---

## Phase 2: Tool Execution Engine

### Problem

Agents define tools but they never execute:
```typescript
// Current: Tools are defined
tools: [{
  name: 'web_search',
  description: 'Search the web',
  parameters: { query: { type: 'string' } }
}]
// But nothing actually calls them
```

### Solution

Create a tool registry and execution engine that:
1. Registers tool implementations
2. Handles tool calls from LLM responses
3. Returns results for next LLM turn

### Implementation

#### 2.1 Tool Registry

```typescript
// src/services/tools/registry.ts
export interface ToolImplementation {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
}

class ToolRegistry {
  private tools = new Map<string, ToolImplementation>();

  register(tool: ToolImplementation): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: null, error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(args);
    } catch (e) {
      return { success: false, output: null, error: String(e) };
    }
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();
```

#### 2.2 Built-in Tools

```typescript
// src/services/tools/builtin.ts
import { toolRegistry } from './registry';

// Simulated web search (MVP)
toolRegistry.register({
  name: 'web_search',
  async execute(args) {
    // For MVP: Return simulated results
    // Later: Integrate real search API
    return {
      success: true,
      output: {
        results: [
          { title: 'Result 1', snippet: `Search results for: ${args.query}` }
        ]
      }
    };
  }
});

// Format as markdown
toolRegistry.register({
  name: 'format_markdown',
  async execute(args) {
    return {
      success: true,
      output: `**Formatted:**\n${args.content}`
    };
  }
});

// Data analysis (simulated)
toolRegistry.register({
  name: 'analyze_data',
  async execute(args) {
    return {
      success: true,
      output: {
        summary: `Analysis of ${args.data?.length || 0} items`,
        insights: ['Pattern detected', 'Trend identified']
      }
    };
  }
});
```

#### 2.3 Tool Executor Service

```typescript
// src/services/tools/executor.ts
import { toolRegistry, ToolResult } from './registry';
import { createSpan } from '../../db/queries';
import type { AgentTool } from '../../types/agent';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export async function executeToolCalls(
  attemptId: string,
  toolCalls: ToolCall[],
  availableTools: AgentTool[],
  sequence: number
): Promise<{ results: ToolResult[]; spans: string[] }> {
  const results: ToolResult[] = [];
  const spanIds: string[] = [];

  for (const call of toolCalls) {
    const startTime = Date.now();

    // Validate tool is allowed
    const toolDef = availableTools.find(t => t.name === call.name);
    if (!toolDef) {
      results.push({ success: false, output: null, error: 'Tool not allowed' });
      continue;
    }

    // Execute
    const result = await toolRegistry.execute(call.name, call.arguments);
    const duration = Date.now() - startTime;

    // Record span
    const span = createSpan({
      attemptId,
      sequence: sequence++,
      type: 'tool_call',
      input: JSON.stringify(call.arguments),
      output: JSON.stringify(result.output),
      toolName: call.name,
      toolArgs: call.arguments,
      toolResult: result.output,
      toolError: result.error,
      durationMs: duration,
    });

    results.push(result);
    spanIds.push(span.id);
  }

  return { results, spans: spanIds };
}
```

### Files to Create

- `src/services/tools/registry.ts`
- `src/services/tools/builtin.ts`
- `src/services/tools/executor.ts`
- `src/services/tools/index.ts`

### Success Criteria

- [ ] Tools can be registered
- [ ] Tool calls are executed and recorded
- [ ] Execution spans are created in database
- [ ] Unit tests pass

---

## Phase 3: Flow Execution Engine

### Problem

Agents define execution flows but they're never followed:
```typescript
flow: [
  { id: 'start', type: 'start', next: 'analyze' },
  { id: 'analyze', type: 'prompt', config: { template: '...' }, next: 'decide' },
  { id: 'decide', type: 'condition', config: { ... }, next: ['path_a', 'path_b'] }
]
// Currently ignored - just makes one LLM call
```

### Solution

Build a flow executor that:
1. Starts at `start` node
2. Follows `next` pointers
3. Executes each step type appropriately
4. Records spans for each step

### Implementation

#### 3.1 Flow Step Handlers

```typescript
// src/services/flow/handlers.ts
import { callLLM } from '../../api/llm';
import { executeToolCalls } from '../tools/executor';
import type { AgentFlowStep, AgentDefinition } from '../../types/agent';

export interface FlowContext {
  agent: AgentDefinition;
  input: string;
  attemptId: string;
  variables: Record<string, unknown>;
  sequence: number;
}

export interface StepResult {
  output: unknown;
  nextStepId: string | null;
  sequence: number;
}

export type StepHandler = (
  step: AgentFlowStep,
  context: FlowContext
) => Promise<StepResult>;

export const stepHandlers: Record<string, StepHandler> = {
  start: async (step, ctx) => ({
    output: ctx.input,
    nextStepId: getNextStep(step),
    sequence: ctx.sequence,
  }),

  prompt: async (step, ctx) => {
    const template = step.config?.template || ctx.agent.systemPrompt;
    const prompt = interpolate(template, ctx.variables);

    const response = await callLLM({
      model: ctx.agent.parameters.model || 'claude-sonnet-4-20250514',
      systemPrompt: ctx.agent.systemPrompt,
      userMessage: prompt,
      temperature: ctx.agent.parameters.temperature,
      maxTokens: ctx.agent.parameters.maxTokens,
      tools: ctx.agent.tools,
    });

    return {
      output: response.content,
      nextStepId: getNextStep(step),
      sequence: ctx.sequence + 1,
    };
  },

  tool: async (step, ctx) => {
    const toolName = step.config?.tool as string;
    const toolArgs = step.config?.args || {};

    const { results } = await executeToolCalls(
      ctx.attemptId,
      [{ id: step.id, name: toolName, arguments: toolArgs }],
      ctx.agent.tools,
      ctx.sequence
    );

    return {
      output: results[0]?.output,
      nextStepId: getNextStep(step),
      sequence: ctx.sequence + 1,
    };
  },

  condition: async (step, ctx) => {
    const condition = step.config?.condition as string;
    const result = evaluateCondition(condition, ctx.variables);

    // next is array for conditions: [trueStep, falseStep]
    const nextSteps = step.next as string[];
    const nextStepId = result ? nextSteps[0] : nextSteps[1];

    return {
      output: result,
      nextStepId,
      sequence: ctx.sequence,
    };
  },

  loop: async (step, ctx) => {
    // Loop execution handled by flow executor
    return {
      output: null,
      nextStepId: step.config?.bodyStep as string,
      sequence: ctx.sequence,
    };
  },

  output: async (step, ctx) => ({
    output: ctx.variables.lastOutput,
    nextStepId: null, // Terminal
    sequence: ctx.sequence,
  }),
};

function getNextStep(step: AgentFlowStep): string | null {
  if (!step.next) return null;
  return Array.isArray(step.next) ? step.next[0] : step.next;
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] || ''));
}

function evaluateCondition(condition: string, vars: Record<string, unknown>): boolean {
  // Simple evaluation - extend as needed
  if (condition.includes('{{')) {
    const interpolated = interpolate(condition, vars);
    return Boolean(interpolated && interpolated !== 'false');
  }
  return Boolean(vars[condition]);
}
```

#### 3.2 Flow Executor

```typescript
// src/services/flow/executor.ts
import { stepHandlers, FlowContext, StepResult } from './handlers';
import { createSpan } from '../../db/queries';
import type { AgentDefinition, AgentFlowStep } from '../../types/agent';

export interface FlowExecutionResult {
  success: boolean;
  output: string;
  spans: string[];
  error?: string;
}

export async function executeFlow(
  agent: AgentDefinition,
  input: string,
  attemptId: string
): Promise<FlowExecutionResult> {
  const flow = agent.flow;
  const spanIds: string[] = [];

  // Build step lookup
  const steps = new Map<string, AgentFlowStep>();
  for (const step of flow) {
    steps.set(step.id, step);
  }

  // Find start step
  const startStep = flow.find(s => s.type === 'start');
  if (!startStep) {
    // No flow defined - fall back to single prompt
    return executeSinglePrompt(agent, input, attemptId);
  }

  // Initialize context
  const context: FlowContext = {
    agent,
    input,
    attemptId,
    variables: { input },
    sequence: 0,
  };

  // Execute flow
  let currentStepId: string | null = startStep.id;
  let lastOutput: unknown = input;
  const maxSteps = 50; // Prevent infinite loops
  let stepCount = 0;

  while (currentStepId && stepCount < maxSteps) {
    const step = steps.get(currentStepId);
    if (!step) {
      return {
        success: false,
        output: '',
        spans: spanIds,
        error: `Step not found: ${currentStepId}`,
      };
    }

    const handler = stepHandlers[step.type];
    if (!handler) {
      return {
        success: false,
        output: '',
        spans: spanIds,
        error: `Unknown step type: ${step.type}`,
      };
    }

    try {
      const startTime = Date.now();
      const result = await handler(step, context);
      const duration = Date.now() - startTime;

      // Record span
      const span = createSpan({
        attemptId,
        sequence: context.sequence,
        type: step.type === 'prompt' ? 'llm_call' : 'reasoning',
        input: JSON.stringify({ stepId: step.id, stepType: step.type }),
        output: JSON.stringify(result.output),
        durationMs: duration,
      });
      spanIds.push(span.id);

      // Update context
      context.variables.lastOutput = result.output;
      context.sequence = result.sequence;
      lastOutput = result.output;
      currentStepId = result.nextStepId;
      stepCount++;
    } catch (e) {
      return {
        success: false,
        output: '',
        spans: spanIds,
        error: String(e),
      };
    }
  }

  return {
    success: true,
    output: String(lastOutput),
    spans: spanIds,
  };
}

async function executeSinglePrompt(
  agent: AgentDefinition,
  input: string,
  attemptId: string
): Promise<FlowExecutionResult> {
  // Existing simple execution path
  const { executeAgent } = await import('../agent-executor');
  const result = await executeAgent(agent, input);

  return {
    success: !result.error,
    output: result.content,
    spans: [],
    error: result.error,
  };
}
```

### Files to Create

- `src/services/flow/handlers.ts`
- `src/services/flow/executor.ts`
- `src/services/flow/index.ts`

### Success Criteria

- [ ] Flow steps execute in order
- [ ] Conditions branch correctly
- [ ] Tool calls are made during flow
- [ ] All steps recorded as spans
- [ ] Fallback to single-prompt works

---

## Phase 4: Wire Full Pipeline

### Problem

The full evolution pipeline exists but isn't the default path.

### Solution

1. Update agent executor to use flow execution
2. Update lineage store to use full pipeline
3. Connect trajectory credit assignment

### Implementation

```typescript
// src/store/lineages.ts - Update regenerateUnlockedWithAgents
async regenerateUnlockedWithAgents(sessionId: string, need: string) {
  const { runEvolutionPipeline } = await import('../services/evolution-pipeline');

  for (const lineage of unlockedLineages) {
    const agent = await getAgentByLineage(lineage.id);
    const evaluation = getEvaluationForArtifact(latestArtifact.id);

    // Use full pipeline
    const result = await runEvolutionPipeline(
      agent,
      {
        score: evaluation.score,
        comment: evaluation.comment,
      },
      {
        stickyDirective: lineage.directiveSticky,
        oneshotDirective: lineage.directiveOneshot,
      }
    );

    // Execute evolved agent with flow
    const { executeFlow } = await import('../services/flow/executor');
    const execution = await executeFlow(result.evolved, testInput, attemptId);

    // Create artifact from execution
    createArtifact(lineage.id, nextCycle, execution.output, {
      agentVersion: result.evolved.version,
      spans: execution.spans,
    });
  }
}
```

### Files to Modify

- `src/store/lineages.ts`
- `src/services/agent-executor.ts`

### Success Criteria

- [ ] Full pipeline is default for regeneration
- [ ] Flow execution produces artifacts
- [ ] Evolution records are created
- [ ] Learning insights are extracted

---

## Phase 5: Enable Trajectory Credit Assignment

### Problem

Trajectory credit assignment exists but has no data because flows don't execute.

### Solution

With Phase 3 complete, spans are now created. Update credit assignment to use trajectory mode when appropriate.

### Implementation

```typescript
// src/services/credit-assignment.ts - Update
export async function assignCredit(
  agent: AgentDefinition,
  analysis: ScoreAnalysis,
  spans: ExecutionSpan[]
): Promise<PromptCredit[] | TrajectoryCredit[]> {
  // Use trajectory mode if we have multiple spans
  if (spans.length > 1) {
    return assignTrajectoryCredit(spans, analysis);
  }

  // Fall back to prompt credit
  return assignPromptCredit(agent, analysis);
}
```

### Success Criteria

- [ ] Trajectory mode activates for multi-step agents
- [ ] Span contributions are calculated
- [ ] Credit informs evolution planning

---

## Phase 6: Learning System Integration

### Problem

Learning insights are extracted but inconsistently used.

### Solution

Ensure insights are:
1. Extracted after every evolution
2. Consulted during planning
3. Updated with outcomes

### Implementation

```typescript
// src/services/evolution-pipeline.ts - Ensure learning is integrated

// After evolution completes
const insights = extractLearning(evolutionRecord);
for (const insight of insights) {
  const existing = findInsightByPattern(sessionId, insight.pattern);
  if (existing) {
    // Update existing
    recordInsightOutcome(existing.id, outcome, scoreDelta);
  } else {
    // Create new
    createLearningInsight({
      sessionId,
      pattern: insight.pattern,
      patternType: insight.type,
    });
  }
}

// During planning
const suggestions = await suggestFromInsights(sessionId, analysis);
for (const suggestion of suggestions) {
  if (suggestion.confidence > 0.7) {
    plan.changes.push(createChangeFromSuggestion(suggestion));
  }
}
```

### Success Criteria

- [ ] Insights created for every successful change
- [ ] High-confidence patterns reused
- [ ] Failed patterns avoided
- [ ] Confidence increases with use

---

## File Structure After Improvements

```
src/services/
├── tools/
│   ├── index.ts
│   ├── registry.ts
│   ├── executor.ts
│   └── builtin.ts
├── flow/
│   ├── index.ts
│   ├── executor.ts
│   └── handlers.ts
├── evolution/
│   ├── index.ts           # Re-export from evolution-pipeline.ts
│   └── learning.ts        # Consolidated learning logic
├── reward-analyzer.ts     # Existing
├── credit-assignment.ts   # Existing
├── evolution-planner.ts   # Existing
├── agent-evolver.ts       # Existing (now primary)
├── agent-executor.ts      # Updated to use flow
└── evolution-pipeline.ts  # Existing
```

---

## Testing Strategy

### Unit Tests

Each phase should include unit tests:

```
src/services/tools/__tests__/
├── registry.test.ts
├── executor.test.ts
└── builtin.test.ts

src/services/flow/__tests__/
├── executor.test.ts
└── handlers.test.ts
```

### Integration Tests

Test complete flows:

```typescript
describe('Full Evolution Cycle', () => {
  it('should evolve agent based on low score', async () => {
    // Create session and lineages
    // Generate initial agents
    // Execute agents
    // Score artifacts
    // Regenerate
    // Verify evolution occurred
    // Verify artifact improved
  });
});
```

---

## Execution Order

1. **Phase 1** (Consolidate) - Can start immediately
2. **Phase 2** (Tools) - Can start after Phase 1
3. **Phase 3** (Flow) - Requires Phase 2
4. **Phase 4** (Wire) - Requires Phase 3
5. **Phase 5** (Trajectory) - Requires Phase 3
6. **Phase 6** (Learning) - Requires Phase 4

Phases 5 and 6 can run in parallel after Phase 4.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Keep old paths available, feature flag new behavior |
| LLM tool calling complexity | Start with simulated tools, add real APIs later |
| Flow infinite loops | Max step limit, timeout |
| Database migration issues | All tables already exist |

---

## Success Metrics

- [ ] All regeneration uses full pipeline
- [ ] Tools execute and record spans
- [ ] Flows execute multi-step agents
- [ ] Trajectory credit works for complex agents
- [ ] Learning patterns influence future evolution
- [ ] No regression in existing functionality
