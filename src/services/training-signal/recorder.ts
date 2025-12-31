/**
 * Training Signal Recorder Service
 *
 * Records training-relevant events for later export and model fine-tuning.
 * Follows the content-addressed storage pattern for efficient deduplication.
 *
 * IMPORTANT: Recording should never break the main app - all operations
 * are wrapped in try/catch with console.warn for failures.
 */

import { getDatabase, saveDatabase } from '../../db/index';
import { generateId } from '../../utils/id';
import type { AgentDefinition } from '../../types/agent';
import type { Attempt, ExecutionSpan, EvolutionChange } from '../../types/evolution';
import type { Artifact } from '../../types';
import type { TrainingEventType, TrainingEvent } from '../../types/training-signal';
import { TRAINING_SIGNAL_SCHEMA_VERSION } from '../../types/training-signal';

// Re-export the schema version for external use
export { TRAINING_SIGNAL_SCHEMA_VERSION } from '../../types/training-signal';

// ============ Content-Addressed Storage Helpers ============

/**
 * Synchronous hash using djb2 algorithm for content-addressed storage.
 * IMPORTANT: This hash is DETERMINISTIC - the same content will always
 * produce the same hash. This enables proper deduplication.
 *
 * Previously this function added a timestamp which defeated deduplication
 * and caused storage bloat.
 */
function computeHashSync(content: string): string {
  // djb2 hash - fast, deterministic, good distribution
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  // Format: djb2-{length in hex}-{hash in hex}
  // This matches the format used in training-signal-queries.ts for consistency
  return `djb2-${content.length.toString(16)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Stores a payload blob with content-addressed deduplication.
 * Returns the hash of the content.
 */
function storePayloadBlob(content: string): string {
  try {
    const db = getDatabase();
    const hash = computeHashSync(content);
    const now = Date.now();

    // Check if blob already exists
    const existing = db.exec('SELECT hash FROM payload_blobs WHERE hash = ?', [hash]);
    if (existing.length === 0 || existing[0].values.length === 0) {
      db.run(
        'INSERT INTO payload_blobs (hash, content, created_at) VALUES (?, ?, ?)',
        [hash, content, now]
      );
    }

    return hash;
  } catch (error) {
    console.warn('Failed to store payload blob:', error);
    // Return a fallback hash based on timestamp
    return `fallback_${Date.now().toString(16)}`;
  }
}

// ============ Core Recording Function ============

/**
 * Records a training event with the given type and payload.
 * This is the core function that all convenience functions call.
 *
 * @param eventType - The type of training event
 * @param payload - The event payload (will be stored content-addressed)
 * @param refs - Entity references for the event
 * @param tags - Optional tags for filtering
 * @returns The event ID
 */
export function recordEvent(
  eventType: TrainingEventType,
  payload: unknown,
  refs: {
    sessionId?: string;
    lineageId?: string;
    agentId?: string;
    artifactId?: string;
    attemptId?: string;
  },
  tags?: string[]
): string {
  try {
    const db = getDatabase();
    const now = Date.now();
    const eventId = generateId();

    // Store payload blob and get hash
    const payloadJson = JSON.stringify(payload);
    const payloadHash = storePayloadBlob(payloadJson);

    // Infer additional tags
    const inferredTags = inferTags(eventType, payload);
    const allTags = [...(tags || []), ...inferredTags];

    // Insert training event
    db.run(
      `INSERT INTO training_events (id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        now,
        eventType,
        TRAINING_SIGNAL_SCHEMA_VERSION,
        refs.sessionId ?? null,
        refs.lineageId ?? null,
        refs.agentId ?? null,
        refs.artifactId ?? null,
        refs.attemptId ?? null,
        payloadHash,
        allTags.length > 0 ? JSON.stringify(allTags) : null,
        now,
      ]
    );

    saveDatabase();
    return eventId;
  } catch (error) {
    console.warn(`Failed to record training event (${eventType}):`, error);
    // Return a placeholder ID so callers don't break
    return `failed_${Date.now().toString(16)}`;
  }
}

// ============ Tag Inference ============

/**
 * Infers tags based on event type and payload content.
 * Tags help with filtering and categorizing events for export.
 */
export function inferTags(
  eventType: TrainingEventType,
  payload: unknown
): string[] {
  const tags: string[] = [];

  // Add category tag based on event type prefix
  if (eventType.startsWith('agent.')) {
    tags.push('category:agent');
  } else if (eventType.startsWith('attempt.')) {
    tags.push('category:execution');
  } else if (eventType.startsWith('artifact.') || eventType.startsWith('lineage.') || eventType.startsWith('directive.')) {
    tags.push('category:evaluation');
  } else if (eventType.startsWith('evolution.') || eventType.startsWith('insight.')) {
    tags.push('category:learning');
  }

  // Infer tags from payload content
  if (payload && typeof payload === 'object') {
    const payloadObj = payload as Record<string, unknown>;

    // Score-based tags
    if ('score' in payloadObj && typeof payloadObj.score === 'number') {
      const score = payloadObj.score;
      if (score >= 8) tags.push('score:high');
      else if (score >= 5) tags.push('score:medium');
      else tags.push('score:low');
    }

    // Score delta tags
    if ('scoreDelta' in payloadObj && typeof payloadObj.scoreDelta === 'number') {
      const delta = payloadObj.scoreDelta;
      if (delta > 0) tags.push('outcome:improved');
      else if (delta < 0) tags.push('outcome:regressed');
      else tags.push('outcome:stable');
    }

    // Validation tags
    if ('validated' in payloadObj) {
      tags.push(payloadObj.validated ? 'hypothesis:validated' : 'hypothesis:rejected');
    }

    // Error tags
    if ('error' in payloadObj && payloadObj.error) {
      tags.push('has:error');
    }

    // Tool usage tags
    if ('toolsUsed' in payloadObj && Array.isArray(payloadObj.toolsUsed)) {
      tags.push('has:tools');
      if (payloadObj.toolsUsed.length > 0) {
        tags.push(`tools:${payloadObj.toolsUsed.length}`);
      }
    }

    // Evolution change type tags
    if ('changes' in payloadObj && Array.isArray(payloadObj.changes)) {
      const changes = payloadObj.changes as EvolutionChange[];
      const components = new Set(changes.map((c) => c.component));
      components.forEach((c) => tags.push(`changed:${c}`));
    }
  }

  return tags;
}

// ============ Agent Lifecycle Events ============

/**
 * Records when a new agent is created.
 */
export function recordAgentCreated(
  agent: AgentDefinition,
  lineageId: string,
  sessionId?: string
): string {
  const payload = {
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    version: agent.version,
    systemPrompt: agent.systemPrompt,
    toolCount: agent.tools.length,
    toolNames: agent.tools.map((t) => t.name),
    flowStepCount: agent.flow.length,
    memoryType: agent.memory.type,
    parameters: agent.parameters,
  };

  return recordEvent(
    'agent.created',
    payload,
    {
      agentId: agent.id,
      lineageId,
      sessionId,
    },
    ['lifecycle:created']
  );
}

/**
 * Records when an agent is evolved from one version to another.
 */
export function recordAgentEvolved(
  fromAgent: AgentDefinition,
  toAgent: AgentDefinition,
  changes: EvolutionChange[],
  hypothesis: string,
  sessionId?: string
): string {
  const payload = {
    fromAgentId: fromAgent.id,
    fromVersion: fromAgent.version,
    toAgentId: toAgent.id,
    toVersion: toAgent.version,
    changes,
    hypothesis,
    changedComponents: Array.from(new Set(changes.map((c) => c.component))),
    changeCount: changes.length,
  };

  return recordEvent(
    'agent.evolved',
    payload,
    {
      agentId: toAgent.id,
      lineageId: toAgent.lineageId,
      sessionId,
    },
    ['lifecycle:evolved']
  );
}

// ============ Execution Events ============

/**
 * Records when an attempt starts execution.
 */
export function recordAttemptStarted(attempt: Attempt, sessionId?: string): string {
  const payload = {
    attemptId: attempt.id,
    rolloutId: attempt.rolloutId,
    attemptNumber: attempt.attemptNumber,
    agentSnapshot: attempt.agentSnapshot,
    input: attempt.input,
    modelId: attempt.modelId,
    parameters: attempt.parameters,
  };

  return recordEvent(
    'attempt.started',
    payload,
    {
      attemptId: attempt.id,
      agentId: attempt.agentSnapshot.agentId,
      sessionId,
    },
    ['execution:started']
  );
}

/**
 * Records when an attempt completes successfully.
 */
export function recordAttemptCompleted(
  attempt: Attempt,
  spans: ExecutionSpan[],
  output: string,
  sessionId?: string
): string {
  // Extract tool usage information from spans
  const toolSpans = spans.filter((s) => s.type === 'tool_call');
  const toolsUsed = toolSpans.map((s) => s.toolName).filter(Boolean);
  const uniqueToolsUsed = Array.from(new Set(toolsUsed));

  const payload = {
    attemptId: attempt.id,
    rolloutId: attempt.rolloutId,
    attemptNumber: attempt.attemptNumber,
    agentSnapshot: attempt.agentSnapshot,
    input: attempt.input,
    output,
    modelId: attempt.modelId,
    parameters: attempt.parameters,
    durationMs: attempt.durationMs,
    totalTokens: attempt.totalTokens,
    promptTokens: attempt.promptTokens,
    completionTokens: attempt.completionTokens,
    estimatedCost: attempt.estimatedCost,
    spanCount: spans.length,
    toolsUsed: uniqueToolsUsed,
    // Include simplified span summary
    spanSummary: spans.map((s) => ({
      type: s.type,
      toolName: s.toolName,
      durationMs: s.durationMs,
      hasError: !!s.toolError,
    })),
  };

  return recordEvent(
    'attempt.completed',
    payload,
    {
      attemptId: attempt.id,
      agentId: attempt.agentSnapshot.agentId,
      sessionId,
    },
    ['execution:completed']
  );
}

/**
 * Records when an attempt fails.
 */
export function recordAttemptFailed(
  attempt: Attempt,
  error: string,
  sessionId?: string
): string {
  const payload = {
    attemptId: attempt.id,
    rolloutId: attempt.rolloutId,
    attemptNumber: attempt.attemptNumber,
    agentSnapshot: attempt.agentSnapshot,
    input: attempt.input,
    error,
    modelId: attempt.modelId,
    parameters: attempt.parameters,
    durationMs: attempt.durationMs,
  };

  return recordEvent(
    'attempt.failed',
    payload,
    {
      attemptId: attempt.id,
      agentId: attempt.agentSnapshot.agentId,
      sessionId,
    },
    ['execution:failed', 'has:error']
  );
}

// ============ Evaluation Events ============

/**
 * Records when an artifact receives a score.
 */
export function recordArtifactScored(
  artifact: Artifact,
  score: number,
  comment?: string,
  sessionId?: string
): string {
  const payload = {
    artifactId: artifact.id,
    lineageId: artifact.lineageId,
    cycle: artifact.cycle,
    content: artifact.content,
    score,
    comment,
    metadata: artifact.metadata,
  };

  return recordEvent(
    'artifact.scored',
    payload,
    {
      artifactId: artifact.id,
      lineageId: artifact.lineageId,
      sessionId,
    },
    ['evaluation:scored']
  );
}

/**
 * Records when a lineage is locked (winner selected).
 */
export function recordLineageLocked(
  lineageId: string,
  competitorIds: string[],
  sessionId?: string
): string {
  const payload = {
    lineageId,
    competitorIds,
    competitorCount: competitorIds.length,
  };

  return recordEvent(
    'lineage.locked',
    payload,
    {
      lineageId,
      sessionId,
    },
    ['evaluation:locked', 'selection:winner']
  );
}

/**
 * Records when a directive is added to a lineage.
 */
export function recordDirectiveAdded(
  lineageId: string,
  type: 'sticky' | 'oneshot',
  content: string,
  sessionId?: string
): string {
  const payload = {
    lineageId,
    directiveType: type,
    content,
    contentLength: content.length,
  };

  return recordEvent(
    'directive.added',
    payload,
    {
      lineageId,
      sessionId,
    },
    [`directive:${type}`]
  );
}

// ============ Learning Events ============

/**
 * Records the outcome of an evolution (whether it improved scores).
 */
export function recordEvolutionOutcome(
  evolutionRecordId: string,
  scoreDelta: number,
  validated: boolean,
  sessionId?: string
): string {
  const payload = {
    evolutionRecordId,
    scoreDelta,
    validated,
    outcomeType: scoreDelta > 0 ? 'improvement' : scoreDelta < 0 ? 'regression' : 'neutral',
  };

  return recordEvent(
    'evolution.outcome',
    payload,
    {
      sessionId,
    },
    ['learning:outcome']
  );
}

// ============ Query Helpers ============

/**
 * Retrieves a training event by ID.
 */
export function getTrainingEvent(id: string): TrainingEvent | null {
  try {
    const db = getDatabase();
    const result = db.exec(
      `SELECT id, timestamp, event_type, schema_version, session_id, lineage_id, agent_id, artifact_id, attempt_id, payload_hash, tags
       FROM training_events WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      timestamp: row[1] as number,
      eventType: row[2] as TrainingEventType,
      schemaVersion: row[3] as number,
      sessionId: row[4] as string | undefined,
      lineageId: row[5] as string | undefined,
      agentId: row[6] as string | undefined,
      artifactId: row[7] as string | undefined,
      attemptId: row[8] as string | undefined,
      payloadHash: row[9] as string,
      tags: row[10] ? JSON.parse(row[10] as string) : [],
    };
  } catch (error) {
    console.warn('Failed to get training event:', error);
    return null;
  }
}

/**
 * Retrieves the payload content for a given hash.
 */
export function getPayloadContent(hash: string): unknown | null {
  try {
    const db = getDatabase();
    const result = db.exec(
      'SELECT content FROM payload_blobs WHERE hash = ?',
      [hash]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return JSON.parse(result[0].values[0][0] as string);
  } catch (error) {
    console.warn('Failed to get payload content:', error);
    return null;
  }
}

/**
 * Gets the count of training events by type.
 */
export function getEventCounts(): Record<string, number> {
  try {
    const db = getDatabase();
    const result = db.exec(
      'SELECT event_type, COUNT(*) as count FROM training_events GROUP BY event_type'
    );

    if (result.length === 0) {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of result[0].values) {
      counts[row[0] as string] = row[1] as number;
    }
    return counts;
  } catch (error) {
    console.warn('Failed to get event counts:', error);
    return {};
  }
}
