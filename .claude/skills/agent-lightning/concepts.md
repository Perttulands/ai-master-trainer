# Agent Lightning Concepts

## Rollouts

Units of work that agents process.

```typescript
interface Rollout {
  id: string;
  lineageId: string;
  cycle: number;
  input: {
    need: string;
    constraints: string[];
    directive?: string;
    previousScores: number[];
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
}
```

## Attempts

Track individual executions with retry support.

```typescript
interface Attempt {
  id: string;
  rolloutId: string;
  attemptNumber: number;
  startedAt: number;
  completedAt?: number;
  result?: ArtifactResult;
  error?: string;
}
```

## Spans

Granular execution events for observability.

```typescript
interface Span {
  id: string;
  attemptId: string;
  type: 'llm_call' | 'tool_call' | 'evaluation' | 'custom';
  name: string;
  startTime: number;
  endTime: number;
  metadata: Record<string, unknown>;
}

// Usage
async function withSpan<T>(
  attemptId: string,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    await store.spans.insert({
      id: generateId(),
      attemptId,
      name,
      type: 'custom',
      startTime,
      endTime: Date.now(),
      metadata: { success: true }
    });
    return result;
  } catch (error) {
    await store.spans.insert({
      id: generateId(),
      attemptId,
      name,
      type: 'custom',
      startTime,
      endTime: Date.now(),
      metadata: { success: false, error: error.message }
    });
    throw error;
  }
}
```

## Resources

Tunable assets that improve over time.

```typescript
interface Resource {
  id: string;
  type: 'prompt' | 'model_config' | 'tool_config';
  version: number;
  content: string;
  lineageId: string;
  createdAt: number;
}
```
