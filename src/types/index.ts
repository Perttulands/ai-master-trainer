export interface Session {
  id: string;
  name: string;
  need: string;
  constraints: string | null;
  /** The input prompt to send to agents (the actual task/query they should respond to) */
  inputPrompt: string | null;
  /** Initial number of agents (1, 2, or 4) */
  initialAgentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Lineage {
  id: string;
  sessionId: string;
  label: LineageLabel;
  strategyTag: string | null;
  isLocked: boolean;
  directiveSticky: string | null;
  directiveOneshot: string | null;
  createdAt: number;
}

/**
 * Metadata stored with each artifact from execution.
 * Uses index signature to allow additional properties stored in JSON.
 */
export interface ArtifactMetadata {
  agentId?: string;
  agentVersion?: number;
  executionSuccess?: boolean;
  executionTimeMs?: number;
  inputUsed?: string;
  rolloutId?: string;
  attemptId?: string;
  stepsExecuted?: number;
  spanCount?: number;
  error?: string;
  // Allow additional properties for backward compatibility
  [key: string]: unknown;
}

export interface Artifact {
  id: string;
  lineageId: string;
  cycle: number;
  content: string;
  metadata: ArtifactMetadata | null;
  createdAt: number;
}

export interface Evaluation {
  id: string;
  artifactId: string;
  score: number;
  comment: string | null;
  createdAt: number;
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  createdAt: number;
}

/** Lineage labels A-H support up to 8 agents per session */
export type LineageLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// Agent types
export * from './agent';

// Context types
export * from './context';

export interface LineageWithArtifact extends Lineage {
  currentArtifact: Artifact | null;
  currentEvaluation: Evaluation | null;
  cycle: number;
}

export interface TrainerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Proposed actions for user approval (only on assistant messages) */
  actions?: TrainerAction[];
}

/** Actions the Master Trainer can propose */
export type TrainerAction =
  | { kind: 'set_grade'; lineageId: string; agentLabel: string; grade: number }
  | { kind: 'add_comment'; lineageId: string; agentLabel: string; comment: string }
  | { kind: 'set_directive'; lineageId: string; agentLabel: string; directive: { type: 'sticky' | 'oneshot'; content: string } }
  | { kind: 'add_lineage'; count: number };

export interface CreateSessionInput {
  name: string;
  need: string;
  constraints?: string;
  /** The input prompt to send to agents (the actual task/query they should respond to) */
  inputPrompt?: string;
  /** Initial number of agents (1, 2, or 4) - defaults to 4 */
  initialAgentCount?: number;
}

export interface DirectiveInput {
  lineageId: string;
  type: 'sticky' | 'oneshot';
  content: string;
}
