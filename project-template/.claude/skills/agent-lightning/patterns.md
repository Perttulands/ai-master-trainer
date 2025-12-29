# Agent Lightning Implementation Patterns

## Decoupled Communication

Algorithm and Runner communicate only through Store.

```typescript
// Algorithm enqueues work
async function enqueueRollout(store: Store, lineage: Lineage): Promise<Rollout> {
  const rollout = {
    id: generateId(),
    lineageId: lineage.id,
    cycle: lineage.currentCycle + 1,
    input: buildRolloutInput(lineage),
    status: 'pending',
    createdAt: Date.now()
  };
  await store.rollouts.insert(rollout);
  return rollout;
}

// Runner pulls and executes
async function processRollouts(store: Store, executor: LineageExecutor) {
  const pending = await store.rollouts.findByStatus('pending');

  for (const rollout of pending) {
    await store.rollouts.update(rollout.id, { status: 'running' });

    try {
      const result = await executor.run(rollout);
      await store.rollouts.update(rollout.id, {
        status: 'completed',
        result
      });
    } catch (error) {
      await store.rollouts.update(rollout.id, {
        status: 'failed',
        error: error.message
      });
    }
  }
}

// Algorithm learns from results
async function evolve(store: Store, trainer: MasterTrainer) {
  const completed = await store.rollouts.findByStatus('completed');
  const evaluations = await store.evaluations.forRollouts(completed);
  const updates = await trainer.computeUpdates(completed, evaluations);
  await store.resources.applyUpdates(updates);
}
```

## Parallel Execution

Runners scale horizontally for throughput.

```typescript
// One runner per lineage
const runners = ['A', 'B', 'C', 'D'].map(label =>
  new Runner(`runner-${label}`, { lineageFilter: label })
);

// Process in parallel
await Promise.all(
  runners.map(runner => runner.processLoop(store))
);
```

## Immutable History

Never update artifacts or evaluations - only append.

```typescript
async function storeArtifact(artifact: Artifact): Promise<void> {
  // Always insert, never update
  await db.artifacts.insert({
    ...artifact,
    createdAt: Date.now()
  });
}

async function recordEvaluation(evaluation: Evaluation): Promise<void> {
  // Append-only
  await db.evaluations.insert({
    ...evaluation,
    createdAt: Date.now()
  });

  // Audit trail
  await db.auditLog.insert({
    id: generateId(),
    eventType: 'evaluation_recorded',
    entityType: 'artifact',
    entityId: evaluation.artifactId,
    data: JSON.stringify(evaluation),
    createdAt: Date.now()
  });
}
```

## Training Camp Store Schema

```sql
-- Work queue
CREATE TABLE rollouts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  input TEXT NOT NULL,  -- JSON
  status TEXT NOT NULL,
  result TEXT,  -- JSON
  error TEXT,
  created_at INTEGER NOT NULL
);

-- Execution tracking
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  result TEXT,  -- JSON
  error TEXT
);

-- Observability
CREATE TABLE spans (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  metadata TEXT  -- JSON
);
```
