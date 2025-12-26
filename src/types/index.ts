export interface Session {
  id: string;
  name: string;
  need: string;
  constraints: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Lineage {
  id: string;
  sessionId: string;
  label: 'A' | 'B' | 'C' | 'D';
  strategyTag: string | null;
  isLocked: boolean;
  directiveSticky: string | null;
  directiveOneshot: string | null;
  createdAt: number;
}

export interface Artifact {
  id: string;
  lineageId: string;
  cycle: number;
  content: string;
  metadata: Record<string, unknown> | null;
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

export type LineageLabel = 'A' | 'B' | 'C' | 'D';

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
}

export interface CreateSessionInput {
  name: string;
  need: string;
  constraints?: string;
}

export interface DirectiveInput {
  lineageId: string;
  type: 'sticky' | 'oneshot';
  content: string;
}
