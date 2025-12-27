---
name: training-signal
description: Work with the training signal capture system. Use when recording agent executions, exporting training data, or understanding the event sourcing architecture. Triggers on training data, signal capture, or export discussions.
---

# Training Signal Capture

## Purpose

Capture every agent interaction as training data for future model optimization.

## Key Concepts

- **Training Events**: Immutable log of everything that happens
- **Payload Blobs**: Content-addressed storage (same content = stored once)
- **Training Examples**: Materialized SFT/DPO examples for export

## Recording Functions

```typescript
import {
  recordAgentCreated,
  recordAttemptCompleted,
  recordArtifactScored,
  recordLineageLocked,
  recordAgentEvolved,
  recordEvolutionOutcome
} from '../services/training-signal';
```

### When to Record

| Event | Function | When |
|-------|----------|------|
| Agent created | `recordAgentCreated` | After `createAgent()` |
| Execution done | `recordAttemptCompleted` | After `executeFlow()` |
| User scores | `recordArtifactScored` | After `createEvaluation()` |
| Lineage locked | `recordLineageLocked` | After lock toggle |
| Agent evolved | `recordAgentEvolved` | After evolution |

## Event Types

```typescript
type TrainingEventType =
  // Execution
  | 'agent.created'
  | 'agent.evolved'
  | 'attempt.started'
  | 'attempt.completed'
  | 'attempt.failed'
  // Evaluation
  | 'artifact.scored'
  | 'artifact.compared'
  | 'lineage.locked'
  | 'lineage.unlocked'
  | 'directive.added'
  // Learning
  | 'evolution.outcome'
  | 'insight.discovered'
  | 'insight.applied';
```

## Query Functions

```typescript
import {
  getTrainingEventsBySession,
  getTrainingEventsByType,
  queryTrainingEvents,
  getTrainingExamplesForExport
} from '../db/training-signal-queries';
```

## Export for Training

```typescript
// Get SFT examples (high-scored completions)
const sftExamples = getTrainingExamplesForExport({
  exampleType: 'sft',
  minScore: 8
});

// Get preference pairs (for DPO)
const prefPairs = getTrainingExamplesForExport({
  exampleType: 'preference',
  minScoreDelta: 2
});
```

## Best Practices

1. **Always wrap in try/catch** - Recording should never break the app
2. **Record after success** - Only record when main operation succeeds
3. **Include all context** - More data = better training signal
4. **Use tags** - Tags enable filtering (e.g., `high_score`, `tool_use`)
