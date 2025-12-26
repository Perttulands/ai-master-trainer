---
name: agent-lightning
description: Apply Agent Lightning architectural patterns for scalable agent systems. Use when designing system architecture, implementing Algorithm/Runner/Store separation, handling rollouts and attempts, or building training pipelines. Triggers on architecture discussions or scalability concerns.
---

# Agent Lightning Patterns

## Core Pattern: Algorithm ↔ Store ↔ Runner

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ALGORITHM   │◄───►│    STORE     │◄───►│    RUNNER    │
│ (decisions)  │     │ (state/queue)│     │ (execution)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Key principle:** Algorithm and Runner never communicate directly. All state flows through Store.

## Training Camp Mapping

| Agent Lightning | Training Camp |
|-----------------|---------------|
| Algorithm | Master Trainer |
| Runner | Lineage Executor |
| Store | SQLite database |
| Rollout | Artifact generation task |
| Attempt | Single execution try |
| Span | LLM call / tool event |
| Resource | Lineage prompt/config |

## Key Concepts

See [concepts.md](concepts.md) for detailed type definitions:
- Rollouts (work units)
- Attempts (executions with retries)
- Spans (observability events)
- Resources (tunable assets)

## Implementation Patterns

See [patterns.md](patterns.md) for code examples:
- Decoupled communication
- Parallel execution
- Immutable history
- Observability with spans

## Best Practices

1. **Single source of truth** - Store is only shared state
2. **Idempotent operations** - Retries must be safe
3. **Immutable records** - Append only, never update
4. **Trace everything** - Spans enable debugging
5. **Scale independently** - Algorithm and Runners decouple

## Reference

- [Agent Lightning Docs](https://microsoft.github.io/agent-lightning/)
