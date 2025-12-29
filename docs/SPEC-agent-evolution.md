# Agent Evolution System

## Overview

Training Camp evolves AI agents based on user feedback. When users score artifacts and provide comments, the system analyzes this feedback and makes targeted changes to agent configurations to improve future outputs.

The evolution system follows the Agent Lightning pattern: Algorithm (learns), Store (tracks), Runner (executes).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MASTER TRAINER                           │
│                        (Algorithm)                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Reward    │  │   Credit    │  │  Evolution  │             │
│  │  Analyzer   │  │ Assignment  │  │  Planner    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         STORE                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ Rollouts │ │ Attempts │ │  Spans   │ │ Rewards  │ │Resources││
│  │ (Cycles) │ │ (Tries)  │ │ (Traces) │ │ (Scores) │ │(Agents) ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT RUNNER                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Tracer    │  │  Executor   │  │   Adapter   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Data Models

### Rollout

A rollout represents one cycle of agent execution for a lineage:

```typescript
interface Rollout {
  id: string;
  lineageId: string;
  cycle: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: Attempt[];
  finalAttemptId?: string;
  createdAt: number;
  completedAt?: number;
}
```

### Attempt

An attempt is a single try within a rollout. Failed attempts can be retried:

```typescript
interface Attempt {
  id: string;
  rolloutId: string;
  attemptNumber: number;
  status: 'running' | 'succeeded' | 'failed';

  // What was used (reproducibility)
  agentSnapshot: {
    agentId: string;
    version: number;
    systemPromptHash: string;
    toolsHash: string;
    flowHash: string;
  };

  // Execution context
  input: string;
  modelId: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };

  // Results
  output?: string;
  error?: string;

  // Metrics
  durationMs: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;

  spans: ExecutionSpan[];
  createdAt: number;
}
```

### Execution Span

Spans capture detailed traces during execution:

```typescript
interface ExecutionSpan {
  id: string;
  attemptId: string;
  parentSpanId?: string;
  sequence: number;

  type: 'llm_call' | 'tool_call' | 'tool_result' | 'reasoning' | 'output';

  // Content
  input: string;
  output: string;

  // For LLM calls
  modelId?: string;
  promptTokens?: number;
  completionTokens?: number;

  // For tool calls
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;

  // Metrics
  durationMs: number;
  estimatedCost?: number;

  createdAt: number;
}
```

### Agent Definition (Resource)

Agent definitions have mutable and immutable fields:

```typescript
interface AgentDefinition {
  id: string;
  lineageId: string;
  version: number;

  name: string;
  description: string;

  // Mutable: evolved based on feedback
  systemPrompt: string;
  tools: AgentTool[];
  flow: AgentFlowStep[];
  parameters: AgentParameters;

  // Immutable per session: set at creation, not evolved
  constraints: {
    maxTokens?: number;
    allowedTools?: string[];
    forbiddenPatterns?: string[];
  };

  // Hashes for reproducibility
  systemPromptHash: string;
  toolsHash: string;
  flowHash: string;

  createdAt: number;
  updatedAt: number;
}
```

---

## Evolution Pipeline

### 1. Reward Analysis

The system parses user scores and comments into structured feedback:

```typescript
interface ScoreAnalysis {
  score: number;
  comment?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  aspects: FeedbackAspect[];
  trend: 'improving' | 'stable' | 'declining';
  deltaFromPrevious: number;
}

interface FeedbackAspect {
  aspect: string;        // e.g., "length", "tone", "accuracy"
  sentiment: 'positive' | 'negative';
  quote?: string;        // Evidence from comment
  confidence: number;    // 0-1, how certain the extraction is
}
```

### 2. Credit Assignment

Credit assignment operates at two levels:

#### Prompt-Level Credit (Single-Call Agents)

For agents that make one LLM call, credit is assigned to prompt segments:

```typescript
interface PromptCredit {
  segment: string;           // The instruction text
  segmentIndex: number;      // Position in prompt
  blame: 'high' | 'medium' | 'low' | 'none';
  relatedAspect?: string;    // Which feedback aspect this relates to
  reason: string;
}
```

#### Trajectory Credit (Multi-Step Agents)

For agents with multiple LLM calls, credit is assigned to spans:

```typescript
interface TrajectoryCredit {
  spanId: string;
  contribution: number;      // -1 to 1, negative = harmful
  reason: string;
}
```

The system chooses the appropriate mode based on span count.

### 3. Evolution Planning

The planner creates targeted changes:

```typescript
interface EvolutionPlan {
  changes: EvolutionChange[];
  hypothesis: string;
  expectedImpact: {
    aspect: string;
    direction: 'improve' | 'maintain';
  }[];
}

interface EvolutionChange {
  component: 'systemPrompt' | 'tools' | 'flow' | 'parameters';
  changeType: 'add' | 'remove' | 'modify';
  target: string;            // What specifically is changing
  before: string | null;
  after: string | null;
  reason: string;
  confidence: number;        // 0-1
}
```

The planner:
- Prioritizes high-blame components
- Checks history to avoid repeating failed changes
- Respects immutable constraints
- Formulates testable hypotheses

### 4. Targeted Evolution

Changes are applied surgically:

```typescript
async function evolveAgent(
  agent: AgentDefinition,
  plan: EvolutionPlan
): Promise<AgentDefinition>
```

Only specified components change. Unchanged components keep their exact values.

---

## Evolution Records

Every evolution is recorded with full context:

```typescript
interface EvolutionRecord {
  id: string;
  lineageId: string;
  fromVersion: number;
  toVersion: number;

  // Trigger
  trigger: {
    rolloutId: string;
    attemptId: string;
    score: number;
    comment?: string;
    directives: {
      sticky?: string;
      oneshot?: string;
    };
  };

  // Analysis
  scoreAnalysis: ScoreAnalysis;
  creditAssignment: PromptCredit[] | TrajectoryCredit[];

  // Plan and execution
  plan: EvolutionPlan;
  changes: EvolutionChange[];

  // Outcome (filled after next cycle)
  outcome?: {
    nextScore: number;
    scoreDelta: number;
    hypothesisValidated: boolean;
  };

  createdAt: number;
}
```

---

## History-Aware Learning

### Learning Insights

The system tracks patterns across lineages:

```typescript
interface LearningInsight {
  id: string;
  sessionId: string;
  pattern: string;
  patternType: 'prompt_change' | 'tool_change' | 'param_change';
  contexts: string[];
  successCount: number;
  failureCount: number;
  avgScoreImpact: number;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}
```

### History Check

Before applying changes:

```typescript
interface HistoryCheck {
  proposedChange: EvolutionChange;
  similarPastChanges: {
    change: EvolutionChange;
    outcome: 'improved' | 'worsened' | 'neutral';
    scoreDelta: number;
  }[];
  recommendation: 'apply' | 'skip' | 'modify';
  reason: string;
}
```

---

## Database Schema

```sql
-- Rollouts (cycles)
CREATE TABLE rollouts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES lineages(id),
  cycle INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  final_attempt_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Attempts (tries within rollout)
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL REFERENCES rollouts(id),
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',

  -- Reproducibility
  agent_id TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  system_prompt_hash TEXT NOT NULL,
  tools_hash TEXT NOT NULL,
  flow_hash TEXT NOT NULL,

  -- Execution context
  input TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  top_p REAL,

  -- Results
  output TEXT,
  error TEXT,

  -- Metrics
  duration_ms INTEGER,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL
);

-- Execution spans
CREATE TABLE execution_spans (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  parent_span_id TEXT,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,

  input TEXT,
  output TEXT,

  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,

  tool_name TEXT,
  tool_args TEXT,
  tool_result TEXT,
  tool_error TEXT,

  duration_ms INTEGER,
  estimated_cost REAL,

  created_at INTEGER NOT NULL
);

-- Evolution records
CREATE TABLE evolution_records (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES lineages(id),
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,

  rollout_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  trigger_score INTEGER,
  trigger_comment TEXT,

  score_analysis TEXT NOT NULL,      -- JSON
  credit_assignment TEXT NOT NULL,   -- JSON
  plan TEXT NOT NULL,                -- JSON
  changes TEXT NOT NULL,             -- JSON

  next_score INTEGER,
  score_delta INTEGER,
  hypothesis_validated INTEGER,

  created_at INTEGER NOT NULL
);

-- Learning insights
CREATE TABLE learning_insights (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  contexts TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score_impact REAL,
  confidence REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## Example Flow

**Cycle 1:**
```
Rollout: { id: "r1", cycle: 1 }
Attempt: { id: "a1", attemptNumber: 1, modelId: "claude-3-sonnet", temperature: 0.7 }
Output: 500-word formal essay
Score: 3/10
Comment: "Way too long, wanted quick bullets"
```

**Reward Analysis:**
```
sentiment: negative
aspects:
  - { aspect: "length", sentiment: "negative", confidence: 0.95 }
  - { aspect: "format", sentiment: "negative", quote: "bullets", confidence: 0.9 }
trend: declining
```

**Credit Assignment (Prompt-Level):**
```
- segment: "Provide comprehensive, detailed analysis"
  blame: high, relatedAspect: "length"

- segment: "Structure your response professionally"
  blame: medium, relatedAspect: "format"

- parameter: maxTokens=2048
  blame: high, relatedAspect: "length"
```

**Evolution Plan:**
```
changes:
  1. MODIFY systemPrompt: "comprehensive, detailed" → "brief, scannable"
  2. ADD systemPrompt: "Use bullet points, not paragraphs"
  3. MODIFY parameters.maxTokens: 2048 → 300
  4. REMOVE systemPrompt: "Structure your response professionally"

hypothesis: "Output will be ~80% shorter in bullet format"
expectedImpact: [{ aspect: "length", direction: "improve" }, { aspect: "format", direction: "improve" }]
```

**Cycle 2:**
```
Rollout: { id: "r2", cycle: 2 }
Attempt: { id: "a2", attemptNumber: 1 }
Output: 80-word bullet list
Score: 8/10
Comment: "Much better!"
```

**Evolution Record Updated:**
```
outcome: {
  nextScore: 8,
  scoreDelta: +5,
  hypothesisValidated: true
}
```

**Learning Insight Created:**
```
pattern: "Add explicit bullet point instruction when user mentions 'bullets'"
patternType: "prompt_change"
successCount: 1
avgScoreImpact: +5
```

---

## References

- [Agent Lightning Architecture](https://microsoft.github.io/agent-lightning/stable/deep-dive/birds-eye-view/)
- [Microsoft Research: Agent Lightning](https://www.microsoft.com/en-us/research/blog/agent-lightning-adding-reinforcement-learning-to-ai-agents-without-code-rewrites/)
