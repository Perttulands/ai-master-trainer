# Training Signal Storage - Design

## Core Principle: Event Sourcing

Don't store current state. Store every event that happened. Current state is derived.

```
Traditional: UPDATE agent SET prompt = 'new' WHERE id = 1
Event-sourced: INSERT event (agent_prompt_changed, {agentId: 1, before: 'old', after: 'new'})
```

Benefits:
- Complete history forever
- Replay to any point in time
- Add new derived views without migration
- Debug by replaying events
- ML training uses raw events, not reconstructed state

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENT LOG                                 │
│  Append-only, immutable, content-addressed                      │
├─────────────────────────────────────────────────────────────────┤
│  event_id | timestamp | event_type | entity_id | payload_hash  │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │  BLOB STORE │    │ MATERIALIZED│    │   EXPORT    │
    │  (payloads) │    │    VIEWS    │    │   PIPELINES │
    └─────────────┘    └─────────────┘    └─────────────┘
    Content-addressed   Current state      SFT, DPO, etc.
    deduplication       for UI queries
```

## Event Schema

```typescript
interface TrainingEvent {
  id: string;                    // UUID
  timestamp: number;             // Unix ms
  eventType: string;             // Namespaced: 'agent.executed', 'artifact.scored'
  schemaVersion: number;         // For parsing old events

  // Entity references (sparse - only relevant ones set)
  sessionId?: string;
  lineageId?: string;
  agentId?: string;
  artifactId?: string;
  attemptId?: string;

  // Content-addressed payload
  payloadHash: string;           // SHA256 of payload
  payloadSize: number;           // For quota tracking

  // Denormalized for fast queries
  tags: string[];                // ['high_score', 'tool_use', 'evolution']
}

// Payloads stored separately, deduplicated by hash
interface PayloadBlob {
  hash: string;                  // Primary key
  content: string;               // JSON stringified
  refCount: number;              // For garbage collection (optional)
}
```

## Event Types

### Execution Events
```
agent.created           {agentConfig, lineageId, version}
agent.evolved           {fromVersion, toVersion, changes, hypothesis}
attempt.started         {agentSnapshot, input, modelId, parameters}
attempt.span_recorded   {spanType, input, output, toolName?, duration}
attempt.completed       {output, tokens, duration, success}
attempt.failed          {error, partialOutput?}
```

### Evaluation Events
```
artifact.created        {content, attemptId, cycle}
artifact.scored         {score, comment?}
artifact.compared       {otherArtifactIds, ranking}
lineage.locked          {reason?, competingLineageIds}
lineage.unlocked        {reason?}
directive.added         {type: 'sticky'|'oneshot', content}
```

### Learning Events
```
evolution.outcome       {evolutionId, scoreDelta, validated}
insight.discovered      {pattern, patternType, context}
insight.applied         {insightId, agentId, change}
insight.outcome         {insightId, success, scoreDelta}
```

## Content-Addressed Storage

Large content (prompts, outputs, configs) stored once, referenced by hash:

```typescript
function storePayload(content: unknown): string {
  const json = JSON.stringify(content);
  const hash = sha256(json);

  // Only insert if not exists
  db.run(`
    INSERT OR IGNORE INTO payload_blobs (hash, content, created_at)
    VALUES (?, ?, ?)
  `, [hash, json, Date.now()]);

  return hash;
}

function getPayload<T>(hash: string): T {
  const row = db.get('SELECT content FROM payload_blobs WHERE hash = ?', [hash]);
  return JSON.parse(row.content);
}
```

Benefits:
- Same prompt used 100 times = stored once
- Agent configs with identical settings = deduplicated
- Outputs can be compared by hash (fast equality check)

## Database Schema

```sql
-- Immutable event log
CREATE TABLE training_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,

  -- Entity references (indexed)
  session_id TEXT,
  lineage_id TEXT,
  agent_id TEXT,
  artifact_id TEXT,
  attempt_id TEXT,

  -- Payload reference
  payload_hash TEXT NOT NULL,
  payload_size INTEGER NOT NULL,

  -- Denormalized tags for filtering
  tags TEXT -- JSON array
);

-- Indexes for common query patterns
CREATE INDEX idx_events_type ON training_events(event_type);
CREATE INDEX idx_events_session ON training_events(session_id, timestamp);
CREATE INDEX idx_events_lineage ON training_events(lineage_id, timestamp);
CREATE INDEX idx_events_time ON training_events(timestamp);
CREATE INDEX idx_events_tags ON training_events(tags); -- JSON contains queries

-- Content-addressed blob storage
CREATE TABLE payload_blobs (
  hash TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Materialized views (rebuilt from events)
CREATE TABLE mv_training_examples (
  id TEXT PRIMARY KEY,
  example_type TEXT NOT NULL, -- 'sft', 'preference', 'reward'

  -- The training example
  system_prompt_hash TEXT,
  user_input_hash TEXT,
  completion_hash TEXT,

  -- For preference pairs
  chosen_hash TEXT,
  rejected_hash TEXT,

  -- Metadata
  score REAL,
  score_delta REAL,
  source_events TEXT, -- JSON array of event IDs

  created_at INTEGER NOT NULL,

  FOREIGN KEY (system_prompt_hash) REFERENCES payload_blobs(hash),
  FOREIGN KEY (completion_hash) REFERENCES payload_blobs(hash)
);

-- Export tracking
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  export_type TEXT NOT NULL, -- 'sft_jsonl', 'dpo_parquet', etc.
  query_params TEXT NOT NULL, -- JSON: filters used
  event_range_start INTEGER,
  event_range_end INTEGER,
  example_count INTEGER,
  file_path TEXT,
  created_at INTEGER NOT NULL
);
```

## Recording Events (API)

```typescript
// src/services/training-signal/recorder.ts

class TrainingSignalRecorder {
  private db: Database;

  recordEvent(
    eventType: string,
    payload: unknown,
    refs: {
      sessionId?: string;
      lineageId?: string;
      agentId?: string;
      artifactId?: string;
      attemptId?: string;
    },
    tags: string[] = []
  ): string {
    const payloadHash = storePayload(payload);
    const eventId = generateId();

    this.db.run(`
      INSERT INTO training_events
      (id, timestamp, event_type, schema_version, session_id, lineage_id,
       agent_id, artifact_id, attempt_id, payload_hash, payload_size, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      Date.now(),
      eventType,
      CURRENT_SCHEMA_VERSION,
      refs.sessionId,
      refs.lineageId,
      refs.agentId,
      refs.artifactId,
      refs.attemptId,
      payloadHash,
      JSON.stringify(payload).length,
      JSON.stringify(tags)
    ]);

    return eventId;
  }

  // Convenience methods
  recordAgentExecution(attempt: Attempt, spans: Span[], output: string) {
    this.recordEvent('attempt.completed', {
      agentSnapshot: attempt.agentSnapshot,
      input: attempt.input,
      spans: spans.map(s => ({
        type: s.type,
        input: s.input,
        output: s.output,
        toolName: s.toolName,
        duration: s.durationMs
      })),
      output,
      tokens: attempt.totalTokens,
      duration: attempt.durationMs
    }, {
      attemptId: attempt.id,
      lineageId: attempt.lineageId
    }, this.inferTags(attempt, spans));
  }

  recordScore(artifact: Artifact, score: number, comment?: string) {
    this.recordEvent('artifact.scored', {
      score,
      comment,
      artifactContent: artifact.content
    }, {
      artifactId: artifact.id,
      lineageId: artifact.lineageId
    }, score >= 8 ? ['high_score'] : score <= 3 ? ['low_score'] : []);
  }

  recordComparison(artifacts: Artifact[], ranking: string[]) {
    this.recordEvent('artifact.compared', {
      artifacts: artifacts.map(a => ({ id: a.id, score: a.score })),
      ranking
    }, {
      sessionId: artifacts[0].sessionId
    }, ['comparison']);
  }

  private inferTags(attempt: Attempt, spans: Span[]): string[] {
    const tags: string[] = [];
    if (spans.some(s => s.type === 'tool_call')) tags.push('tool_use');
    if (spans.length > 3) tags.push('multi_step');
    if (attempt.error) tags.push('error');
    return tags;
  }
}

export const trainingSignal = new TrainingSignalRecorder();
```

## Materialization (Building Training Examples)

```typescript
// src/services/training-signal/materializer.ts

class TrainingExampleMaterializer {
  // Run periodically or on-demand
  materialize(fromTimestamp?: number) {
    // SFT examples from high-scored artifacts
    this.materializeSFT(fromTimestamp);

    // Preference pairs from comparative scores
    this.materializePreferencePairs(fromTimestamp);

    // Reward model data from all scores
    this.materializeRewardData(fromTimestamp);
  }

  private materializeSFT(from?: number) {
    // Find high-scored completions
    const events = this.db.query(`
      SELECT e.*, p.content as payload
      FROM training_events e
      JOIN payload_blobs p ON e.payload_hash = p.hash
      WHERE e.event_type = 'artifact.scored'
        AND json_extract(p.content, '$.score') >= 8
        ${from ? 'AND e.timestamp > ?' : ''}
    `, from ? [from] : []);

    for (const event of events) {
      const payload = JSON.parse(event.payload);
      // Get the agent config that produced this
      const agentEvent = this.findAgentForArtifact(event.artifact_id);

      this.db.run(`
        INSERT OR REPLACE INTO mv_training_examples
        (id, example_type, system_prompt_hash, user_input_hash,
         completion_hash, score, source_events, created_at)
        VALUES (?, 'sft', ?, ?, ?, ?, ?, ?)
      `, [
        generateId(),
        agentEvent.systemPromptHash,
        agentEvent.inputHash,
        storePayload(payload.artifactContent),
        payload.score,
        JSON.stringify([event.id, agentEvent.id]),
        Date.now()
      ]);
    }
  }

  private materializePreferencePairs(from?: number) {
    // Find cases where same input produced different scores
    const comparisons = this.db.query(`
      SELECT session_id,
             json_group_array(json_object(
               'artifact_id', artifact_id,
               'score', json_extract(p.content, '$.score'),
               'content_hash', payload_hash
             )) as artifacts
      FROM training_events e
      JOIN payload_blobs p ON e.payload_hash = p.hash
      WHERE e.event_type = 'artifact.scored'
      GROUP BY session_id,
               (SELECT cycle FROM artifacts WHERE id = e.artifact_id)
      HAVING COUNT(*) > 1
    `);

    for (const comparison of comparisons) {
      const artifacts = JSON.parse(comparison.artifacts);
      // Sort by score descending
      artifacts.sort((a, b) => b.score - a.score);

      // Create pairs: best vs each worse one
      const chosen = artifacts[0];
      for (const rejected of artifacts.slice(1)) {
        if (chosen.score > rejected.score) {
          this.db.run(`
            INSERT INTO mv_training_examples
            (id, example_type, chosen_hash, rejected_hash,
             score_delta, source_events, created_at)
            VALUES (?, 'preference', ?, ?, ?, ?, ?)
          `, [
            generateId(),
            chosen.content_hash,
            rejected.content_hash,
            chosen.score - rejected.score,
            JSON.stringify([chosen.artifact_id, rejected.artifact_id]),
            Date.now()
          ]);
        }
      }
    }
  }
}
```

## Export Pipeline

```typescript
// src/services/training-signal/exporter.ts

class TrainingDataExporter {
  exportSFT(filters: ExportFilters): string {
    const examples = this.db.query(`
      SELECT
        p_sys.content as system_prompt,
        p_in.content as user_input,
        p_out.content as completion
      FROM mv_training_examples e
      JOIN payload_blobs p_sys ON e.system_prompt_hash = p_sys.hash
      JOIN payload_blobs p_in ON e.user_input_hash = p_in.hash
      JOIN payload_blobs p_out ON e.completion_hash = p_out.hash
      WHERE e.example_type = 'sft'
        AND e.score >= ?
    `, [filters.minScore || 8]);

    // Output as JSONL for fine-tuning
    const lines = examples.map(ex => JSON.stringify({
      messages: [
        { role: 'system', content: JSON.parse(ex.system_prompt) },
        { role: 'user', content: JSON.parse(ex.user_input) },
        { role: 'assistant', content: JSON.parse(ex.completion) }
      ]
    }));

    return lines.join('\n');
  }

  exportDPO(filters: ExportFilters): string {
    const pairs = this.db.query(`
      SELECT
        p_chosen.content as chosen,
        p_rejected.content as rejected,
        e.score_delta
      FROM mv_training_examples e
      JOIN payload_blobs p_chosen ON e.chosen_hash = p_chosen.hash
      JOIN payload_blobs p_rejected ON e.rejected_hash = p_rejected.hash
      WHERE e.example_type = 'preference'
        AND e.score_delta >= ?
    `, [filters.minScoreDelta || 2]);

    return pairs.map(p => JSON.stringify({
      chosen: JSON.parse(p.chosen),
      rejected: JSON.parse(p.rejected),
      score_delta: p.score_delta
    })).join('\n');
  }
}
```

## Integration Points

Add recording calls to existing code:

```typescript
// In agent-executor.ts
const result = await executeFlow(agent, input, attemptId);
trainingSignal.recordAgentExecution(attempt, result.spans, result.output);

// In lineages.ts (evaluation)
const evaluation = createEvaluation(artifactId, score, comment);
trainingSignal.recordScore(artifact, score, comment);

// In lineages.ts (lock)
updateLineage(lineageId, { isLocked: true });
trainingSignal.recordEvent('lineage.locked', {
  lineageId,
  competitorScores: otherLineages.map(l => l.score)
}, { lineageId }, ['preference_signal']);
```

## Future-Proofing

1. **Schema versioning**: Every event has `schema_version`. Old events parsed with old schema.

2. **Extensible event types**: Add new event types without migration. Views ignore unknown types.

3. **Flexible payload**: JSON payload can contain anything. Structure enforced at read time.

4. **Rebuildable views**: Materialized views can be rebuilt from events. Add new view types anytime.

5. **Content-addressed**: Same content = same hash. Natural deduplication and comparison.

6. **Export agnostic**: Raw events → any format. Add new exporters without changing storage.

## Migration from Current Schema

The current tables (`artifacts`, `evaluations`, etc.) continue to work for UI. Training events are a parallel capture layer:

```
Current tables ──► UI reads/writes (fast, current state)
       │
       └──► Training events ──► ML exports (complete history)
```

No migration needed. Add event recording alongside existing writes.
