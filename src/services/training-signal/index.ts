/**
 * Training Signal Service
 *
 * Exports all training signal recording functionality.
 * Use these functions to capture training-relevant events throughout the app.
 *
 * Example usage:
 *
 * ```typescript
 * import {
 *   recordAgentCreated,
 *   recordArtifactScored,
 *   recordEvolutionOutcome
 * } from '@/services/training-signal';
 *
 * // Record when an agent is created
 * recordAgentCreated(agent, lineageId);
 *
 * // Record when an artifact is scored
 * recordArtifactScored(artifact, 8, "Great output!");
 *
 * // Record evolution outcomes
 * recordEvolutionOutcome(evolutionRecordId, 2, true);
 * ```
 */

// Core recording function
export { recordEvent } from './recorder';

// Tag inference helper
export { inferTags } from './recorder';

// Agent lifecycle events
export {
  recordAgentCreated,
  recordAgentEvolved,
} from './recorder';

// Execution events
export {
  recordAttemptStarted,
  recordAttemptCompleted,
  recordAttemptFailed,
} from './recorder';

// Evaluation events
export {
  recordArtifactScored,
  recordLineageLocked,
  recordDirectiveAdded,
} from './recorder';

// Learning events
export { recordEvolutionOutcome } from './recorder';

// Query helpers
export {
  getTrainingEvent,
  getPayloadContent,
  getEventCounts,
} from './recorder';

// Re-export schema version
export { TRAINING_SIGNAL_SCHEMA_VERSION } from './recorder';

// Export pipeline functions
export {
  exportTrainingData,
  exportAsJsonl,
  exportAsCsv,
  exportAsSft,
  exportAsDpo,
  queryTrainingEvents,
  getExportableEventCount,
} from './exporter';

// Re-export types from exporter
export type { ExportFormat, ExportOptions, ExportResult } from './exporter';
