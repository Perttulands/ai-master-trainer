import type { SqlValue } from "sql.js";
import { getDatabase, saveDatabase } from "./index";
import { generateId } from "../utils/id";
import type {
  Session,
  Lineage,
  Artifact,
  Evaluation,
  AuditLogEntry,
  CreateSessionInput,
  LineageLabel,
} from "../types";
import type {
  AgentDefinition,
  AgentTool,
  AgentFlowStep,
  AgentMemoryConfig,
  AgentParameters,
} from "../types/agent";
import type {
  Rollout,
  RolloutStatus,
  Attempt,
  AttemptStatus,
  ExecutionSpan,
  EvolutionRecord,
  LearningInsight,
  CreateRolloutInput,
  CreateAttemptInput,
  CreateSpanInput,
  CreateEvolutionRecordInput,
  CreateLearningInsightInput,
  UpdateAttemptInput,
  UpdateEvolutionOutcomeInput,
  ScoreAnalysis,
  PromptCredit,
  TrajectoryCredit,
  EvolutionPlan,
  EvolutionChange,
  PatternType,
} from "../types/evolution";

type SqlRow = SqlValue[];

// ============ Sessions ============

export function createSession(input: CreateSessionInput): Session {
  const db = getDatabase();
  const now = Date.now();
  const initialAgentCount = input.initialAgentCount ?? 4;
  const session: Session = {
    id: generateId(),
    name: input.name,
    need: input.need,
    constraints: input.constraints || null,
    inputPrompt: input.inputPrompt || null,
    initialAgentCount,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    "INSERT INTO sessions (id, name, need, constraints, input_prompt, mode, initial_agent_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      session.id,
      session.name,
      session.need,
      session.constraints,
      session.inputPrompt,
      "training",
      session.initialAgentCount,
      session.createdAt,
      session.updatedAt,
    ]
  );

  logAudit("session_created", "session", session.id, {
    name: session.name,
    initialAgentCount,
  });
  saveDatabase();
  return session;
}

export function getSession(id: string): Session | null {
  const db = getDatabase();
  const result = db.exec(
    "SELECT id, name, need, constraints, input_prompt, initial_agent_count, created_at, updated_at FROM sessions WHERE id = ?",
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as string,
    name: row[1] as string,
    need: row[2] as string,
    constraints: row[3] as string | null,
    inputPrompt: row[4] as string | null,
    initialAgentCount: (row[5] as number) ?? 4,
    createdAt: row[6] as number,
    updatedAt: row[7] as number,
  };
}

export function getAllSessions(): Session[] {
  const db = getDatabase();
  const result = db.exec(
    "SELECT id, name, need, constraints, input_prompt, initial_agent_count, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
  );
  if (result.length === 0) return [];

  return result[0].values.map((row: SqlRow) => ({
    id: row[0] as string,
    name: row[1] as string,
    need: row[2] as string,
    constraints: row[3] as string | null,
    inputPrompt: row[4] as string | null,
    initialAgentCount: (row[5] as number) ?? 4,
    createdAt: row[6] as number,
    updatedAt: row[7] as number,
  }));
}

export function updateSession(
  id: string,
  updates: Partial<
    Pick<Session, "name" | "need" | "constraints" | "inputPrompt">
  >
): void {
  const db = getDatabase();
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const values: SqlValue[] = [now];

  if (updates.name !== undefined) {
    sets.push("name = ?");
    values.push(updates.name);
  }
  if (updates.need !== undefined) {
    sets.push("need = ?");
    values.push(updates.need);
  }
  if (updates.constraints !== undefined) {
    sets.push("constraints = ?");
    values.push(updates.constraints);
  }
  if (updates.inputPrompt !== undefined) {
    sets.push("input_prompt = ?");
    values.push(updates.inputPrompt);
  }

  values.push(id);
  db.run(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteSession(id: string): void {
  const db = getDatabase();
  db.run("DELETE FROM sessions WHERE id = ?", [id]);
  logAudit("session_deleted", "session", id, null);
  saveDatabase();
}

// ============ Lineages ============

export function createLineage(
  sessionId: string,
  label: LineageLabel,
  strategyTag?: string
): Lineage {
  const db = getDatabase();
  const lineage: Lineage = {
    id: generateId(),
    sessionId,
    label,
    strategyTag: strategyTag || null,
    isLocked: false,
    directiveSticky: null,
    directiveOneshot: null,
    createdAt: Date.now(),
  };

  db.run(
    "INSERT INTO lineages (id, session_id, label, strategy_tag, is_locked, directive_sticky, directive_oneshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      lineage.id,
      lineage.sessionId,
      lineage.label,
      lineage.strategyTag,
      lineage.isLocked ? 1 : 0,
      lineage.directiveSticky,
      lineage.directiveOneshot,
      lineage.createdAt,
    ]
  );

  saveDatabase();
  return lineage;
}

export function getLineagesBySession(sessionId: string): Lineage[] {
  const db = getDatabase();
  const result = db.exec(
    "SELECT * FROM lineages WHERE session_id = ? ORDER BY label",
    [sessionId]
  );
  if (result.length === 0) return [];

  return result[0].values.map((row: SqlRow) => ({
    id: row[0] as string,
    sessionId: row[1] as string,
    label: row[2] as LineageLabel,
    strategyTag: row[3] as string | null,
    isLocked: (row[4] as number) === 1,
    directiveSticky: row[5] as string | null,
    directiveOneshot: row[6] as string | null,
    createdAt: row[7] as number,
  }));
}

export function updateLineage(
  id: string,
  updates: Partial<
    Pick<
      Lineage,
      "strategyTag" | "isLocked" | "directiveSticky" | "directiveOneshot"
    >
  >
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.strategyTag !== undefined) {
    sets.push("strategy_tag = ?");
    values.push(updates.strategyTag);
  }
  if (updates.isLocked !== undefined) {
    sets.push("is_locked = ?");
    values.push(updates.isLocked ? 1 : 0);
    logAudit(
      updates.isLocked ? "lineage_locked" : "lineage_unlocked",
      "lineage",
      id,
      null
    );
  }
  if (updates.directiveSticky !== undefined) {
    sets.push("directive_sticky = ?");
    values.push(updates.directiveSticky);
  }
  if (updates.directiveOneshot !== undefined) {
    sets.push("directive_oneshot = ?");
    values.push(updates.directiveOneshot);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE lineages SET ${sets.join(", ")} WHERE id = ?`, values);
  saveDatabase();
}

export function clearOneshotDirective(lineageId: string): void {
  const db = getDatabase();
  db.run("UPDATE lineages SET directive_oneshot = NULL WHERE id = ?", [
    lineageId,
  ]);
  saveDatabase();
}

// ============ Artifacts ============

export function createArtifact(
  lineageId: string,
  cycle: number,
  content: string,
  metadata?: Record<string, unknown>
): Artifact {
  const db = getDatabase();
  const artifact: Artifact = {
    id: generateId(),
    lineageId,
    cycle,
    content,
    metadata: metadata || null,
    createdAt: Date.now(),
  };

  db.run(
    "INSERT INTO artifacts (id, lineage_id, cycle, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      artifact.id,
      artifact.lineageId,
      artifact.cycle,
      artifact.content,
      JSON.stringify(artifact.metadata),
      artifact.createdAt,
    ]
  );

  saveDatabase();
  return artifact;
}

export function getLatestArtifact(lineageId: string): Artifact | null {
  const db = getDatabase();
  const result = db.exec(
    "SELECT * FROM artifacts WHERE lineage_id = ? ORDER BY cycle DESC LIMIT 1",
    [lineageId]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as string,
    lineageId: row[1] as string,
    cycle: row[2] as number,
    content: row[3] as string,
    metadata: row[4] ? JSON.parse(row[4] as string) : null,
    createdAt: row[5] as number,
  };
}

export function getArtifactsByLineage(lineageId: string): Artifact[] {
  const db = getDatabase();
  const result = db.exec(
    "SELECT * FROM artifacts WHERE lineage_id = ? ORDER BY cycle DESC",
    [lineageId]
  );
  if (result.length === 0) return [];

  return result[0].values.map((row: SqlRow) => ({
    id: row[0] as string,
    lineageId: row[1] as string,
    cycle: row[2] as number,
    content: row[3] as string,
    metadata: row[4] ? JSON.parse(row[4] as string) : null,
    createdAt: row[5] as number,
  }));
}

export function getCurrentCycle(sessionId: string): number {
  const db = getDatabase();
  const result = db.exec(
    `SELECT MAX(a.cycle) FROM artifacts a
     JOIN lineages l ON a.lineage_id = l.id
     WHERE l.session_id = ?`,
    [sessionId]
  );
  if (result.length === 0 || result[0].values[0][0] === null) return 0;
  return result[0].values[0][0] as number;
}

// ============ Evaluations ============

export function createEvaluation(
  artifactId: string,
  score: number,
  comment?: string
): Evaluation {
  const db = getDatabase();
  const evaluation: Evaluation = {
    id: generateId(),
    artifactId,
    score,
    comment: comment || null,
    createdAt: Date.now(),
  };

  db.run(
    "INSERT INTO evaluations (id, artifact_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?)",
    [
      evaluation.id,
      evaluation.artifactId,
      evaluation.score,
      evaluation.comment,
      evaluation.createdAt,
    ]
  );

  logAudit("evaluation_created", "evaluation", evaluation.id, {
    artifactId,
    score,
  });
  saveDatabase();
  return evaluation;
}

export function getEvaluationForArtifact(
  artifactId: string
): Evaluation | null {
  const db = getDatabase();
  const result = db.exec(
    "SELECT * FROM evaluations WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1",
    [artifactId]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as string,
    artifactId: row[1] as string,
    score: row[2] as number,
    comment: row[3] as string | null,
    createdAt: row[4] as number,
  };
}

export function updateEvaluation(
  id: string,
  updates: Partial<Pick<Evaluation, "score" | "comment">>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.score !== undefined) {
    sets.push("score = ?");
    values.push(updates.score);
  }
  if (updates.comment !== undefined) {
    sets.push("comment = ?");
    values.push(updates.comment);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE evaluations SET ${sets.join(", ")} WHERE id = ?`, values);
  saveDatabase();
}

// ============ Audit Log ============

export function logAudit(
  eventType: string,
  entityType: string | null,
  entityId: string | null,
  data: Record<string, unknown> | null
): void {
  const db = getDatabase();
  const entry: AuditLogEntry = {
    id: generateId(),
    eventType,
    entityType,
    entityId,
    data,
    createdAt: Date.now(),
  };

  db.run(
    "INSERT INTO audit_log (id, event_type, entity_type, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      entry.id,
      entry.eventType,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.data),
      entry.createdAt,
    ]
  );
}

export function getAuditLog(
  entityType?: string,
  entityId?: string
): AuditLogEntry[] {
  const db = getDatabase();
  let query = "SELECT * FROM audit_log";
  const params: string[] = [];

  if (entityType && entityId) {
    query += " WHERE entity_type = ? AND entity_id = ?";
    params.push(entityType, entityId);
  } else if (entityType) {
    query += " WHERE entity_type = ?";
    params.push(entityType);
  }

  query += " ORDER BY created_at DESC";

  const result = db.exec(query, params);
  if (result.length === 0) return [];

  return result[0].values.map((row: SqlRow) => ({
    id: row[0] as string,
    eventType: row[1] as string,
    entityType: row[2] as string | null,
    entityId: row[3] as string | null,
    data: row[4] ? JSON.parse(row[4] as string) : null,
    createdAt: row[5] as number,
  }));
}

// ============ Agent Definitions ============

/**
 * Create a new agent definition for a lineage
 */
export function createAgent(
  agent: AgentDefinition,
  lineageId: string
): AgentDefinition {
  const db = getDatabase();
  const now = Date.now();

  // Ensure agent has an ID
  const agentWithId: AgentDefinition = {
    ...agent,
    id: agent.id || generateId(),
    createdAt: agent.createdAt || now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO agent_definitions (id, lineage_id, version, name, description, system_prompt, tools, flow, memory_config, parameters, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentWithId.id,
      lineageId,
      agentWithId.version,
      agentWithId.name,
      agentWithId.description,
      agentWithId.systemPrompt,
      JSON.stringify(agentWithId.tools),
      JSON.stringify(agentWithId.flow),
      JSON.stringify(agentWithId.memory),
      JSON.stringify(agentWithId.parameters),
      agentWithId.createdAt,
      agentWithId.updatedAt,
    ]
  );

  logAudit("agent_created", "agent", agentWithId.id, {
    lineageId,
    version: agentWithId.version,
  });
  saveDatabase();
  return agentWithId;
}

/**
 * Get agent by lineage ID (returns latest version)
 */
export function getAgentByLineage(lineageId: string): AgentDefinition | null {
  return getLatestAgentVersion(lineageId);
}

/**
 * Get the latest version of an agent for a lineage
 */
export function getLatestAgentVersion(
  lineageId: string
): AgentDefinition | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, version, name, description, system_prompt, tools, flow, memory_config, parameters, created_at, updated_at
     FROM agent_definitions
     WHERE lineage_id = ?
     ORDER BY version DESC
     LIMIT 1`,
    [lineageId]
  );

  if (result.length === 0 || result[0].values.length === 0) return null;

  return parseAgentRow(result[0].values[0]);
}

/**
 * Get all versions of an agent for a lineage
 */
export function getAgentHistory(lineageId: string): AgentDefinition[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, version, name, description, system_prompt, tools, flow, memory_config, parameters, created_at, updated_at
     FROM agent_definitions
     WHERE lineage_id = ?
     ORDER BY version DESC`,
    [lineageId]
  );

  if (result.length === 0) return [];

  return result[0].values.map(parseAgentRow);
}

/**
 * Update an existing agent definition
 */
export function updateAgent(
  id: string,
  updates: Partial<Omit<AgentDefinition, "id" | "createdAt">>
): void {
  const db = getDatabase();
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const values: SqlValue[] = [now];

  if (updates.name !== undefined) {
    sets.push("name = ?");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push("description = ?");
    values.push(updates.description);
  }
  if (updates.systemPrompt !== undefined) {
    sets.push("system_prompt = ?");
    values.push(updates.systemPrompt);
  }
  if (updates.tools !== undefined) {
    sets.push("tools = ?");
    values.push(JSON.stringify(updates.tools));
  }
  if (updates.flow !== undefined) {
    sets.push("flow = ?");
    values.push(JSON.stringify(updates.flow));
  }
  if (updates.memory !== undefined) {
    sets.push("memory_config = ?");
    values.push(JSON.stringify(updates.memory));
  }
  if (updates.parameters !== undefined) {
    sets.push("parameters = ?");
    values.push(JSON.stringify(updates.parameters));
  }
  if (updates.version !== undefined) {
    sets.push("version = ?");
    values.push(updates.version);
  }

  values.push(id);
  db.run(
    `UPDATE agent_definitions SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
  saveDatabase();
}

/**
 * Delete an agent definition
 */
export function deleteAgent(id: string): void {
  const db = getDatabase();
  db.run("DELETE FROM agent_definitions WHERE id = ?", [id]);
  logAudit("agent_deleted", "agent", id, null);
  saveDatabase();
}

/**
 * Get all agents for a session (latest version per lineage)
 */
export function getAgentsBySession(
  sessionId: string
): Map<string, AgentDefinition> {
  const lineages = getLineagesBySession(sessionId);
  const agents = new Map<string, AgentDefinition>();

  for (const lineage of lineages) {
    const agent = getLatestAgentVersion(lineage.id);
    if (agent) {
      agents.set(lineage.id, agent);
    }
  }

  return agents;
}

// Helper function to parse agent row from database
function parseAgentRow(row: SqlRow): AgentDefinition {
  return {
    id: row[0] as string,
    // row[1] is lineage_id which we don't store on the agent object
    version: row[2] as number,
    name: row[3] as string,
    description: row[4] as string,
    systemPrompt: row[5] as string,
    tools: JSON.parse(row[6] as string) as AgentTool[],
    flow: JSON.parse(row[7] as string) as AgentFlowStep[],
    memory: JSON.parse(row[8] as string) as AgentMemoryConfig,
    parameters: JSON.parse(row[9] as string) as AgentParameters,
    createdAt: row[10] as number,
    updatedAt: row[11] as number,
  };
}

// ============ Rollouts ============

export function createRollout(input: CreateRolloutInput): Rollout {
  const db = getDatabase();
  const now = Date.now();
  const rollout: Rollout = {
    id: generateId(),
    lineageId: input.lineageId,
    cycle: input.cycle,
    status: "pending",
    attempts: [],
    createdAt: now,
  };

  db.run(
    `INSERT INTO rollouts (id, lineage_id, cycle, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    [
      rollout.id,
      rollout.lineageId,
      rollout.cycle,
      rollout.status,
      rollout.createdAt,
    ]
  );

  saveDatabase();
  return rollout;
}

export function getRollout(id: string): Rollout | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, cycle, status, final_attempt_id, created_at, completed_at FROM rollouts WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  const rollout = parseRolloutRow(row);

  // Load attempts
  rollout.attempts = getAttemptsByRollout(rollout.id);

  return rollout;
}

export function getRolloutsByLineage(lineageId: string): Rollout[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, cycle, status, final_attempt_id, created_at, completed_at
     FROM rollouts WHERE lineage_id = ? ORDER BY cycle DESC`,
    [lineageId]
  );
  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const rollout = parseRolloutRow(row);
    rollout.attempts = getAttemptsByRollout(rollout.id);
    return rollout;
  });
}

export function updateRollout(
  id: string,
  updates: Partial<Pick<Rollout, "status" | "finalAttemptId" | "completedAt">>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.finalAttemptId !== undefined) {
    sets.push("final_attempt_id = ?");
    values.push(updates.finalAttemptId);
  }
  if (updates.completedAt !== undefined) {
    sets.push("completed_at = ?");
    values.push(updates.completedAt);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE rollouts SET ${sets.join(", ")} WHERE id = ?`, values);
  saveDatabase();
}

function parseRolloutRow(row: SqlRow): Rollout {
  return {
    id: row[0] as string,
    lineageId: row[1] as string,
    cycle: row[2] as number,
    status: row[3] as RolloutStatus,
    finalAttemptId: row[4] as string | undefined,
    createdAt: row[5] as number,
    completedAt: row[6] as number | undefined,
    attempts: [],
  };
}

// ============ Attempts ============

export function createAttempt(input: CreateAttemptInput): Attempt {
  const db = getDatabase();
  const now = Date.now();
  const attempt: Attempt = {
    id: generateId(),
    rolloutId: input.rolloutId,
    attemptNumber: input.attemptNumber,
    status: "running",
    agentSnapshot: input.agentSnapshot,
    input: input.input,
    modelId: input.modelId,
    parameters: input.parameters,
    durationMs: 0,
    spans: [],
    createdAt: now,
  };

  db.run(
    `INSERT INTO attempts (id, rollout_id, attempt_number, status, agent_id, agent_version, system_prompt_hash, tools_hash, flow_hash, input, model_id, temperature, max_tokens, top_p, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attempt.id,
      attempt.rolloutId,
      attempt.attemptNumber,
      attempt.status,
      attempt.agentSnapshot.agentId,
      attempt.agentSnapshot.version,
      attempt.agentSnapshot.systemPromptHash,
      attempt.agentSnapshot.toolsHash,
      attempt.agentSnapshot.flowHash,
      attempt.input,
      attempt.modelId,
      attempt.parameters.temperature,
      attempt.parameters.maxTokens,
      attempt.parameters.topP ?? null,
      attempt.createdAt,
    ]
  );

  saveDatabase();
  return attempt;
}

export function getAttempt(id: string): Attempt | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, rollout_id, attempt_number, status, agent_id, agent_version, system_prompt_hash, tools_hash, flow_hash,
            input, model_id, temperature, max_tokens, top_p, output, error, duration_ms, total_tokens, prompt_tokens, completion_tokens, estimated_cost, created_at
     FROM attempts WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const attempt = parseAttemptRow(result[0].values[0]);
  attempt.spans = getSpansByAttempt(attempt.id);
  return attempt;
}

export function getAttemptsByRollout(rolloutId: string): Attempt[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, rollout_id, attempt_number, status, agent_id, agent_version, system_prompt_hash, tools_hash, flow_hash,
            input, model_id, temperature, max_tokens, top_p, output, error, duration_ms, total_tokens, prompt_tokens, completion_tokens, estimated_cost, created_at
     FROM attempts WHERE rollout_id = ? ORDER BY attempt_number ASC`,
    [rolloutId]
  );
  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const attempt = parseAttemptRow(row);
    attempt.spans = getSpansByAttempt(attempt.id);
    return attempt;
  });
}

export function updateAttempt(id: string, updates: UpdateAttemptInput): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.output !== undefined) {
    sets.push("output = ?");
    values.push(updates.output);
  }
  if (updates.error !== undefined) {
    sets.push("error = ?");
    values.push(updates.error);
  }
  if (updates.durationMs !== undefined) {
    sets.push("duration_ms = ?");
    values.push(updates.durationMs);
  }
  if (updates.totalTokens !== undefined) {
    sets.push("total_tokens = ?");
    values.push(updates.totalTokens);
  }
  if (updates.promptTokens !== undefined) {
    sets.push("prompt_tokens = ?");
    values.push(updates.promptTokens);
  }
  if (updates.completionTokens !== undefined) {
    sets.push("completion_tokens = ?");
    values.push(updates.completionTokens);
  }
  if (updates.estimatedCost !== undefined) {
    sets.push("estimated_cost = ?");
    values.push(updates.estimatedCost);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE attempts SET ${sets.join(", ")} WHERE id = ?`, values);
  saveDatabase();
}

function parseAttemptRow(row: SqlRow): Attempt {
  return {
    id: row[0] as string,
    rolloutId: row[1] as string,
    attemptNumber: row[2] as number,
    status: row[3] as AttemptStatus,
    agentSnapshot: {
      agentId: row[4] as string,
      version: row[5] as number,
      systemPromptHash: row[6] as string,
      toolsHash: row[7] as string,
      flowHash: row[8] as string,
    },
    input: row[9] as string,
    modelId: row[10] as string,
    parameters: {
      temperature: row[11] as number,
      maxTokens: row[12] as number,
      topP: row[13] as number | undefined,
    },
    output: row[14] as string | undefined,
    error: row[15] as string | undefined,
    durationMs: (row[16] as number) || 0,
    totalTokens: row[17] as number | undefined,
    promptTokens: row[18] as number | undefined,
    completionTokens: row[19] as number | undefined,
    estimatedCost: row[20] as number | undefined,
    createdAt: row[21] as number,
    spans: [],
  };
}

// ============ Execution Spans ============

export function createSpan(input: CreateSpanInput): ExecutionSpan {
  const db = getDatabase();
  const now = Date.now();
  const span: ExecutionSpan = {
    id: generateId(),
    attemptId: input.attemptId,
    parentSpanId: input.parentSpanId,
    sequence: input.sequence,
    type: input.type,
    input: input.input,
    output: input.output,
    modelId: input.modelId,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    toolName: input.toolName,
    toolArgs: input.toolArgs,
    toolResult: input.toolResult,
    toolError: input.toolError,
    durationMs: input.durationMs,
    estimatedCost: input.estimatedCost,
    createdAt: now,
  };

  db.run(
    `INSERT INTO execution_spans (id, attempt_id, parent_span_id, sequence, type, input, output, model_id, prompt_tokens, completion_tokens, tool_name, tool_args, tool_result, tool_error, duration_ms, estimated_cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      span.id,
      span.attemptId,
      span.parentSpanId ?? null,
      span.sequence,
      span.type,
      span.input,
      span.output,
      span.modelId ?? null,
      span.promptTokens ?? null,
      span.completionTokens ?? null,
      span.toolName ?? null,
      span.toolArgs ? JSON.stringify(span.toolArgs) : null,
      span.toolResult ? JSON.stringify(span.toolResult) : null,
      span.toolError ?? null,
      span.durationMs,
      span.estimatedCost ?? null,
      span.createdAt,
    ]
  );

  saveDatabase();
  return span;
}

export function getSpansByAttempt(attemptId: string): ExecutionSpan[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, attempt_id, parent_span_id, sequence, type, input, output, model_id, prompt_tokens, completion_tokens, tool_name, tool_args, tool_result, tool_error, duration_ms, estimated_cost, created_at
     FROM execution_spans WHERE attempt_id = ? ORDER BY sequence ASC`,
    [attemptId]
  );
  if (result.length === 0) return [];

  return result[0].values.map(parseSpanRow);
}

function parseSpanRow(row: SqlRow): ExecutionSpan {
  return {
    id: row[0] as string,
    attemptId: row[1] as string,
    parentSpanId: row[2] as string | undefined,
    sequence: row[3] as number,
    type: row[4] as ExecutionSpan["type"],
    input: row[5] as string,
    output: row[6] as string,
    modelId: row[7] as string | undefined,
    promptTokens: row[8] as number | undefined,
    completionTokens: row[9] as number | undefined,
    toolName: row[10] as string | undefined,
    toolArgs: row[11] ? JSON.parse(row[11] as string) : undefined,
    toolResult: row[12] ? JSON.parse(row[12] as string) : undefined,
    toolError: row[13] as string | undefined,
    durationMs: row[14] as number,
    estimatedCost: row[15] as number | undefined,
    createdAt: row[16] as number,
  };
}

// ============ Evolution Records ============

export function createEvolutionRecord(
  input: CreateEvolutionRecordInput
): EvolutionRecord {
  const db = getDatabase();
  const now = Date.now();
  const record: EvolutionRecord = {
    id: generateId(),
    lineageId: input.lineageId,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    trigger: {
      rolloutId: input.rolloutId,
      attemptId: input.attemptId,
      score: input.triggerScore,
      comment: input.triggerComment,
      directives: input.triggerDirectives || {},
    },
    scoreAnalysis: input.scoreAnalysis,
    creditAssignment: input.creditAssignment,
    plan: input.plan,
    changes: input.changes,
    createdAt: now,
  };

  db.run(
    `INSERT INTO evolution_records (id, lineage_id, from_version, to_version, rollout_id, attempt_id, trigger_score, trigger_comment, trigger_directives, score_analysis, credit_assignment, plan, changes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.lineageId,
      record.fromVersion,
      record.toVersion,
      record.trigger.rolloutId,
      record.trigger.attemptId,
      record.trigger.score,
      record.trigger.comment ?? null,
      JSON.stringify(record.trigger.directives),
      JSON.stringify(record.scoreAnalysis),
      JSON.stringify(record.creditAssignment),
      JSON.stringify(record.plan),
      JSON.stringify(record.changes),
      record.createdAt,
    ]
  );

  logAudit("evolution_created", "evolution", record.id, {
    lineageId: record.lineageId,
    fromVersion: record.fromVersion,
    toVersion: record.toVersion,
  });
  saveDatabase();
  return record;
}

export function getEvolutionRecord(id: string): EvolutionRecord | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, from_version, to_version, rollout_id, attempt_id, trigger_score, trigger_comment, trigger_directives, score_analysis, credit_assignment, plan, changes, next_score, score_delta, hypothesis_validated, created_at
     FROM evolution_records WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  return parseEvolutionRecordRow(result[0].values[0]);
}

export function getEvolutionRecordsByLineage(
  lineageId: string
): EvolutionRecord[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, lineage_id, from_version, to_version, rollout_id, attempt_id, trigger_score, trigger_comment, trigger_directives, score_analysis, credit_assignment, plan, changes, next_score, score_delta, hypothesis_validated, created_at
     FROM evolution_records WHERE lineage_id = ? ORDER BY created_at DESC`,
    [lineageId]
  );
  if (result.length === 0) return [];

  return result[0].values.map(parseEvolutionRecordRow);
}

export function updateEvolutionOutcome(
  id: string,
  outcome: UpdateEvolutionOutcomeInput
): void {
  const db = getDatabase();
  db.run(
    `UPDATE evolution_records SET next_score = ?, score_delta = ?, hypothesis_validated = ? WHERE id = ?`,
    [
      outcome.nextScore,
      outcome.scoreDelta,
      outcome.hypothesisValidated ? 1 : 0,
      id,
    ]
  );
  saveDatabase();
}

function parseEvolutionRecordRow(row: SqlRow): EvolutionRecord {
  const record: EvolutionRecord = {
    id: row[0] as string,
    lineageId: row[1] as string,
    fromVersion: row[2] as number,
    toVersion: row[3] as number,
    trigger: {
      rolloutId: row[4] as string,
      attemptId: row[5] as string,
      score: row[6] as number,
      comment: row[7] as string | undefined,
      directives: row[8] ? JSON.parse(row[8] as string) : {},
    },
    scoreAnalysis: JSON.parse(row[9] as string) as ScoreAnalysis,
    creditAssignment: JSON.parse(row[10] as string) as
      | PromptCredit[]
      | TrajectoryCredit[],
    plan: JSON.parse(row[11] as string) as EvolutionPlan,
    changes: JSON.parse(row[12] as string) as EvolutionChange[],
    createdAt: row[16] as number,
  };

  // Add outcome if present
  if (row[13] !== null) {
    record.outcome = {
      nextScore: row[13] as number,
      scoreDelta: row[14] as number,
      hypothesisValidated: (row[15] as number) === 1,
    };
  }

  return record;
}

// ============ Learning Insights ============

export function createLearningInsight(
  input: CreateLearningInsightInput
): LearningInsight {
  const db = getDatabase();
  const now = Date.now();
  const insight: LearningInsight = {
    id: generateId(),
    sessionId: input.sessionId,
    pattern: input.pattern,
    patternType: input.patternType,
    contexts: input.contexts || [],
    successCount: 0,
    failureCount: 0,
    avgScoreImpact: 0,
    confidence: 0,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO learning_insights (id, session_id, pattern, pattern_type, contexts, success_count, failure_count, avg_score_impact, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      insight.id,
      insight.sessionId,
      insight.pattern,
      insight.patternType,
      JSON.stringify(insight.contexts),
      insight.successCount,
      insight.failureCount,
      insight.avgScoreImpact,
      insight.confidence,
      insight.createdAt,
      insight.updatedAt,
    ]
  );

  saveDatabase();
  return insight;
}

export function getLearningInsight(id: string): LearningInsight | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, session_id, pattern, pattern_type, contexts, success_count, failure_count, avg_score_impact, confidence, created_at, updated_at
     FROM learning_insights WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  return parseLearningInsightRow(result[0].values[0]);
}

export function getLearningInsightsBySession(
  sessionId: string
): LearningInsight[] {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, session_id, pattern, pattern_type, contexts, success_count, failure_count, avg_score_impact, confidence, created_at, updated_at
     FROM learning_insights WHERE session_id = ? ORDER BY confidence DESC`,
    [sessionId]
  );
  if (result.length === 0) return [];

  return result[0].values.map(parseLearningInsightRow);
}

export function findInsightByPattern(
  sessionId: string,
  pattern: string
): LearningInsight | null {
  const db = getDatabase();
  const result = db.exec(
    `SELECT id, session_id, pattern, pattern_type, contexts, success_count, failure_count, avg_score_impact, confidence, created_at, updated_at
     FROM learning_insights WHERE session_id = ? AND pattern = ?`,
    [sessionId, pattern]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  return parseLearningInsightRow(result[0].values[0]);
}

export function recordInsightOutcome(
  id: string,
  outcome: "success" | "failure",
  scoreDelta: number
): void {
  const db = getDatabase();
  const insight = getLearningInsight(id);
  if (!insight) return;

  const now = Date.now();
  const isSuccess = outcome === "success";
  const newSuccessCount = insight.successCount + (isSuccess ? 1 : 0);
  const newFailureCount = insight.failureCount + (isSuccess ? 0 : 1);
  const totalCount = newSuccessCount + newFailureCount;

  // Calculate new average score impact
  const oldTotal =
    insight.avgScoreImpact * (insight.successCount + insight.failureCount);
  const newAvg = (oldTotal + scoreDelta) / totalCount;

  // Calculate confidence based on success rate and sample size
  const successRate = newSuccessCount / totalCount;
  const sampleConfidence = Math.min(1, totalCount / 5); // Max confidence at 5+ samples
  const newConfidence = successRate * sampleConfidence;

  db.run(
    `UPDATE learning_insights SET success_count = ?, failure_count = ?, avg_score_impact = ?, confidence = ?, updated_at = ? WHERE id = ?`,
    [newSuccessCount, newFailureCount, newAvg, newConfidence, now, id]
  );
  saveDatabase();
}

function parseLearningInsightRow(row: SqlRow): LearningInsight {
  return {
    id: row[0] as string,
    sessionId: row[1] as string,
    pattern: row[2] as string,
    patternType: row[3] as PatternType,
    contexts: row[4] ? JSON.parse(row[4] as string) : [],
    successCount: row[5] as number,
    failureCount: row[6] as number,
    avgScoreImpact: row[7] as number,
    confidence: row[8] as number,
    createdAt: row[9] as number,
    updatedAt: row[10] as number,
  };
}

export interface UpdateLearningInsightInput {
  successCount?: number;
  failureCount?: number;
  avgScoreImpact?: number;
  confidence?: number;
  contexts?: string[];
}

export function updateLearningInsight(
  id: string,
  input: UpdateLearningInsightInput
): void {
  const db = getDatabase();
  const insight = getLearningInsight(id);
  if (!insight) return;

  const now = Date.now();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.successCount !== undefined) {
    updates.push("success_count = ?");
    values.push(input.successCount);
  }
  if (input.failureCount !== undefined) {
    updates.push("failure_count = ?");
    values.push(input.failureCount);
  }
  if (input.avgScoreImpact !== undefined) {
    updates.push("avg_score_impact = ?");
    values.push(input.avgScoreImpact);
  }
  if (input.confidence !== undefined) {
    updates.push("confidence = ?");
    values.push(input.confidence);
  }
  if (input.contexts !== undefined) {
    updates.push("contexts = ?");
    values.push(JSON.stringify(input.contexts));
  }

  if (updates.length === 0) return;

  updates.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.run(
    `UPDATE learning_insights SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
  saveDatabase();
}
