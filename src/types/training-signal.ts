/**
 * Training Signal Types
 *
 * Types for capturing, storing, and exporting training signals:
 * - TrainingEvent: Immutable record of any training-relevant event
 * - PayloadBlob: Content-addressed storage for event payloads
 * - TrainingExample: Materialized SFT/preference/reward examples
 * - ExportFilter: Filters for selecting events/examples for export
 */

// ============ Schema Version ============

export const TRAINING_SIGNAL_SCHEMA_VERSION = 1;

// ============ Event Types ============

export type TrainingEventType =
  // Execution events
  | 'agent.created'
  | 'agent.evolved'
  | 'attempt.started'
  | 'attempt.completed'
  | 'attempt.failed'
  // Evaluation events
  | 'artifact.scored'
  | 'artifact.compared'
  | 'lineage.locked'
  | 'lineage.unlocked'
  | 'directive.added'
  // Learning events
  | 'evolution.outcome'
  | 'insight.discovered'
  | 'insight.applied';

// ============ Core Event ============

/**
 * Immutable record of a training-relevant event
 */
export interface TrainingEvent {
  id: string;
  timestamp: number;
  eventType: TrainingEventType;
  schemaVersion: number;

  // Optional entity references
  sessionId?: string;
  lineageId?: string;
  agentId?: string;
  artifactId?: string;
  attemptId?: string;

  // Content-addressed payload reference
  payloadHash: string;

  // Tags for filtering
  tags: string[];
}

/**
 * Input for creating a training event
 */
export interface CreateTrainingEventInput {
  eventType: TrainingEventType;
  sessionId?: string;
  lineageId?: string;
  agentId?: string;
  artifactId?: string;
  attemptId?: string;
  payloadHash: string;
  tags?: string[];
}

// ============ Content-Addressed Storage ============

/**
 * Content-addressed blob for event payloads
 */
export interface PayloadBlob {
  hash: string; // SHA256, primary key
  content: string; // JSON string
  createdAt: number;
}

// ============ Training Examples ============

export type TrainingExampleType = 'sft' | 'preference' | 'reward';

/**
 * Materialized training example ready for export
 */
export interface TrainingExample {
  id: string;
  exampleType: TrainingExampleType;

  // Content hashes for SFT examples
  systemPromptHash?: string;
  inputHash?: string;
  completionHash?: string;

  // Content hashes for preference examples
  chosenHash?: string;
  rejectedHash?: string;

  // Scoring
  score?: number;
  scoreDelta?: number;

  // Provenance
  sourceEventIds: string[];

  createdAt: number;
}

/**
 * Input for materializing a training example
 */
export interface CreateTrainingExampleInput {
  exampleType: TrainingExampleType;
  systemPromptHash?: string;
  inputHash?: string;
  completionHash?: string;
  chosenHash?: string;
  rejectedHash?: string;
  score?: number;
  scoreDelta?: number;
  sourceEventIds: string[];
}

// ============ Export Filters ============

/**
 * Filters for selecting events/examples for export
 */
export interface ExportFilter {
  minScore?: number;
  maxScore?: number;
  minScoreDelta?: number;
  eventTypes?: TrainingEventType[];
  fromTimestamp?: number;
  toTimestamp?: number;
  tags?: string[];
}
