import type { SqlValue } from 'sql.js';
import { getDatabase, saveDatabase } from './index';
import { generateId } from '../utils/id';
import type {
  Session,
  Lineage,
  Artifact,
  Evaluation,
  AuditLogEntry,
  CreateSessionInput,
  LineageLabel,
} from '../types';

type SqlRow = SqlValue[];

// ============ Sessions ============

export function createSession(input: CreateSessionInput): Session {
  const db = getDatabase();
  const now = Date.now();
  const session: Session = {
    id: generateId(),
    name: input.name,
    need: input.need,
    constraints: input.constraints || null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    'INSERT INTO sessions (id, name, need, constraints, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session.id, session.name, session.need, session.constraints, session.createdAt, session.updatedAt]
  );

  logAudit('session_created', 'session', session.id, { name: session.name });
  saveDatabase();
  return session;
}

export function getSession(id: string): Session | null {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM sessions WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as string,
    name: row[1] as string,
    need: row[2] as string,
    constraints: row[3] as string | null,
    createdAt: row[4] as number,
    updatedAt: row[5] as number,
  };
}

export function getAllSessions(): Session[] {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM sessions ORDER BY updated_at DESC');
  if (result.length === 0) return [];

  return result[0].values.map((row: SqlRow) => ({
    id: row[0] as string,
    name: row[1] as string,
    need: row[2] as string,
    constraints: row[3] as string | null,
    createdAt: row[4] as number,
    updatedAt: row[5] as number,
  }));
}

export function updateSession(id: string, updates: Partial<Pick<Session, 'name' | 'need' | 'constraints'>>): void {
  const db = getDatabase();
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: SqlValue[] = [now];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.need !== undefined) {
    sets.push('need = ?');
    values.push(updates.need);
  }
  if (updates.constraints !== undefined) {
    sets.push('constraints = ?');
    values.push(updates.constraints);
  }

  values.push(id);
  db.run(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteSession(id: string): void {
  const db = getDatabase();
  db.run('DELETE FROM sessions WHERE id = ?', [id]);
  logAudit('session_deleted', 'session', id, null);
  saveDatabase();
}

// ============ Lineages ============

export function createLineage(sessionId: string, label: LineageLabel, strategyTag?: string): Lineage {
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
    'INSERT INTO lineages (id, session_id, label, strategy_tag, is_locked, directive_sticky, directive_oneshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
  const result = db.exec('SELECT * FROM lineages WHERE session_id = ? ORDER BY label', [sessionId]);
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
  updates: Partial<Pick<Lineage, 'strategyTag' | 'isLocked' | 'directiveSticky' | 'directiveOneshot'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.strategyTag !== undefined) {
    sets.push('strategy_tag = ?');
    values.push(updates.strategyTag);
  }
  if (updates.isLocked !== undefined) {
    sets.push('is_locked = ?');
    values.push(updates.isLocked ? 1 : 0);
    logAudit(updates.isLocked ? 'lineage_locked' : 'lineage_unlocked', 'lineage', id, null);
  }
  if (updates.directiveSticky !== undefined) {
    sets.push('directive_sticky = ?');
    values.push(updates.directiveSticky);
  }
  if (updates.directiveOneshot !== undefined) {
    sets.push('directive_oneshot = ?');
    values.push(updates.directiveOneshot);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE lineages SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function clearOneshotDirective(lineageId: string): void {
  const db = getDatabase();
  db.run('UPDATE lineages SET directive_oneshot = NULL WHERE id = ?', [lineageId]);
  saveDatabase();
}

// ============ Artifacts ============

export function createArtifact(lineageId: string, cycle: number, content: string, metadata?: Record<string, unknown>): Artifact {
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
    'INSERT INTO artifacts (id, lineage_id, cycle, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [artifact.id, artifact.lineageId, artifact.cycle, artifact.content, JSON.stringify(artifact.metadata), artifact.createdAt]
  );

  saveDatabase();
  return artifact;
}

export function getLatestArtifact(lineageId: string): Artifact | null {
  const db = getDatabase();
  const result = db.exec(
    'SELECT * FROM artifacts WHERE lineage_id = ? ORDER BY cycle DESC LIMIT 1',
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
  const result = db.exec('SELECT * FROM artifacts WHERE lineage_id = ? ORDER BY cycle DESC', [lineageId]);
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

export function createEvaluation(artifactId: string, score: number, comment?: string): Evaluation {
  const db = getDatabase();
  const evaluation: Evaluation = {
    id: generateId(),
    artifactId,
    score,
    comment: comment || null,
    createdAt: Date.now(),
  };

  db.run(
    'INSERT INTO evaluations (id, artifact_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?)',
    [evaluation.id, evaluation.artifactId, evaluation.score, evaluation.comment, evaluation.createdAt]
  );

  logAudit('evaluation_created', 'evaluation', evaluation.id, { artifactId, score });
  saveDatabase();
  return evaluation;
}

export function getEvaluationForArtifact(artifactId: string): Evaluation | null {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM evaluations WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1', [artifactId]);
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

export function updateEvaluation(id: string, updates: Partial<Pick<Evaluation, 'score' | 'comment'>>): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: SqlValue[] = [];

  if (updates.score !== undefined) {
    sets.push('score = ?');
    values.push(updates.score);
  }
  if (updates.comment !== undefined) {
    sets.push('comment = ?');
    values.push(updates.comment);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE evaluations SET ${sets.join(', ')} WHERE id = ?`, values);
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
    'INSERT INTO audit_log (id, event_type, entity_type, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.id, entry.eventType, entry.entityType, entry.entityId, JSON.stringify(entry.data), entry.createdAt]
  );
}

export function getAuditLog(entityType?: string, entityId?: string): AuditLogEntry[] {
  const db = getDatabase();
  let query = 'SELECT * FROM audit_log';
  const params: string[] = [];

  if (entityType && entityId) {
    query += ' WHERE entity_type = ? AND entity_id = ?';
    params.push(entityType, entityId);
  } else if (entityType) {
    query += ' WHERE entity_type = ?';
    params.push(entityType);
  }

  query += ' ORDER BY created_at DESC';

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
