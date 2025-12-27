/**
 * Evolution System Types
 *
 * These types support the Agent Lightning-inspired evolution pipeline:
 * - Rollout: One cycle of agent execution for a lineage
 * - Attempt: A single try within a rollout (with retry capability)
 * - ExecutionSpan: Detailed trace of execution steps
 * - Credit Assignment: Blame attribution for feedback
 * - Evolution: Planned changes and their outcomes
 */

// ============ Execution Tracking ============

export type RolloutStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AttemptStatus = 'running' | 'succeeded' | 'failed';
export type SpanType = 'llm_call' | 'tool_call' | 'tool_result' | 'reasoning' | 'output';

/**
 * A rollout represents one cycle of agent execution for a lineage
 */
export interface Rollout {
  id: string;
  lineageId: string;
  cycle: number;
  status: RolloutStatus;
  attempts: Attempt[];
  finalAttemptId?: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * Agent snapshot for reproducibility
 */
export interface AgentSnapshot {
  agentId: string;
  version: number;
  systemPromptHash: string;
  toolsHash: string;
  flowHash: string;
}

/**
 * Execution parameters
 */
export interface ExecutionParameters {
  temperature: number;
  maxTokens: number;
  topP?: number;
}

/**
 * An attempt is a single try within a rollout
 */
export interface Attempt {
  id: string;
  rolloutId: string;
  attemptNumber: number;
  status: AttemptStatus;

  // Reproducibility
  agentSnapshot: AgentSnapshot;

  // Execution context
  input: string;
  modelId: string;
  parameters: ExecutionParameters;

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

/**
 * Execution span captures detailed traces during execution
 */
export interface ExecutionSpan {
  id: string;
  attemptId: string;
  parentSpanId?: string;
  sequence: number;

  type: SpanType;

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

// ============ Reward Analysis ============

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Trend = 'improving' | 'stable' | 'declining';

/**
 * Extracted aspect from user feedback
 */
export interface FeedbackAspect {
  aspect: string; // e.g., "length", "tone", "accuracy", "format"
  sentiment: Sentiment;
  quote?: string; // Evidence from comment
  confidence: number; // 0-1
}

/**
 * Analysis of user score and comment
 */
export interface ScoreAnalysis {
  score: number;
  comment?: string;
  sentiment: Sentiment;
  aspects: FeedbackAspect[];
  trend: Trend;
  deltaFromPrevious: number;
}

// ============ Credit Assignment ============

export type BlameLevel = 'high' | 'medium' | 'low' | 'none';
export type CreditMode = 'prompt' | 'trajectory';

/**
 * Credit assignment for prompt segments (single-call agents)
 */
export interface PromptCredit {
  segment: string;
  segmentIndex: number;
  blame: BlameLevel;
  relatedAspect?: string;
  reason: string;
}

/**
 * Credit assignment for execution trajectory (multi-step agents)
 */
export interface TrajectoryCredit {
  spanId: string;
  contribution: number; // -1 to 1, negative = harmful
  reason: string;
}

// ============ Evolution Planning ============

export type EvolutionComponent = 'systemPrompt' | 'tools' | 'flow' | 'parameters';
export type ChangeType = 'add' | 'remove' | 'modify';

/**
 * A specific change to make to the agent
 */
export interface EvolutionChange {
  component: EvolutionComponent;
  changeType: ChangeType;
  target: string; // What specifically is changing
  before: string | null;
  after: string | null;
  reason: string;
  confidence: number; // 0-1
}

/**
 * Expected impact of a change
 */
export interface ExpectedImpact {
  aspect: string;
  direction: 'improve' | 'maintain';
}

/**
 * Plan for evolving an agent
 */
export interface EvolutionPlan {
  changes: EvolutionChange[];
  hypothesis: string;
  expectedImpact: ExpectedImpact[];
}

/**
 * Result of checking change against history
 */
export interface HistoryCheck {
  proposedChange: EvolutionChange;
  similarPastChanges: {
    change: EvolutionChange;
    outcome: 'improved' | 'worsened' | 'neutral';
    scoreDelta: number;
  }[];
  recommendation: 'apply' | 'skip' | 'modify';
  reason: string;
}

// ============ Evolution Records ============

/**
 * Trigger information for evolution
 */
export interface EvolutionTrigger {
  rolloutId: string;
  attemptId: string;
  score: number;
  comment?: string;
  directives: {
    sticky?: string;
    oneshot?: string;
  };
}

/**
 * Outcome of an evolution (filled after next cycle)
 */
export interface EvolutionOutcome {
  nextScore: number;
  scoreDelta: number;
  hypothesisValidated: boolean;
}

/**
 * Complete record of an evolution
 */
export interface EvolutionRecord {
  id: string;
  lineageId: string;
  fromVersion: number;
  toVersion: number;

  // Trigger
  trigger: EvolutionTrigger;

  // Analysis
  scoreAnalysis: ScoreAnalysis;
  creditAssignment: PromptCredit[] | TrajectoryCredit[];

  // Plan and execution
  plan: EvolutionPlan;
  changes: EvolutionChange[];

  // Outcome (filled after next cycle)
  outcome?: EvolutionOutcome;

  createdAt: number;
}

// ============ Learning System ============

export type PatternType = 'prompt_change' | 'tool_change' | 'param_change';

/**
 * Learned pattern from evolution history
 */
export interface LearningInsight {
  id: string;
  sessionId: string;
  pattern: string;
  patternType: PatternType;
  contexts: string[];
  successCount: number;
  failureCount: number;
  avgScoreImpact: number;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

// ============ Input Types for Creation ============

export interface CreateRolloutInput {
  lineageId: string;
  cycle: number;
}

export interface CreateAttemptInput {
  rolloutId: string;
  attemptNumber: number;
  agentSnapshot: AgentSnapshot;
  input: string;
  modelId: string;
  parameters: ExecutionParameters;
}

export interface CreateSpanInput {
  attemptId: string;
  parentSpanId?: string;
  sequence: number;
  type: SpanType;
  input: string;
  output: string;
  modelId?: string;
  promptTokens?: number;
  completionTokens?: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  durationMs: number;
  estimatedCost?: number;
}

export interface CreateEvolutionRecordInput {
  lineageId: string;
  fromVersion: number;
  toVersion: number;
  rolloutId: string;
  attemptId: string;
  triggerScore: number;
  triggerComment?: string;
  triggerDirectives?: {
    sticky?: string;
    oneshot?: string;
  };
  scoreAnalysis: ScoreAnalysis;
  creditAssignment: PromptCredit[] | TrajectoryCredit[];
  plan: EvolutionPlan;
  changes: EvolutionChange[];
}

export interface CreateLearningInsightInput {
  sessionId: string;
  pattern: string;
  patternType: PatternType;
  contexts?: string[];
}

export interface UpdateAttemptInput {
  status?: AttemptStatus;
  output?: string;
  error?: string;
  durationMs?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;
}

export interface UpdateEvolutionOutcomeInput {
  nextScore: number;
  scoreDelta: number;
  hypothesisValidated: boolean;
}
