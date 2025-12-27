---
name: evolution
description: Work with the agent evolution pipeline. Use when implementing evolution logic, credit assignment, or reward analysis. Triggers on evolution, scoring, or agent improvement discussions.
---

# Evolution Pipeline

## Overview

The evolution pipeline improves agents based on user feedback:

```
User Score → Reward Analysis → Credit Assignment → Evolution Planning → Agent Evolution
```

## Services

| Service | File | Purpose |
|---------|------|---------|
| Reward Analyzer | `reward-analyzer.ts` | Parse scores/comments into structured feedback |
| Credit Assignment | `credit-assignment.ts` | Blame prompt segments or trajectory spans |
| Evolution Planner | `evolution-planner.ts` | Generate targeted change plans |
| Agent Evolver | `agent-evolver.ts` | Apply changes to agent |
| Pipeline | `evolution-pipeline.ts` | Orchestrate full cycle |

## Usage

```typescript
import { runEvolutionPipeline } from '../services/evolution-pipeline';

const result = await runEvolutionPipeline(
  currentAgent,
  { score: 4, comment: 'Too long' },
  { stickyDirective: 'Be concise' }
);

// result.evolved - The improved agent
// result.record - Evolution record with changes
```

## Credit Assignment Modes

### Prompt-Level (Single LLM call)
Blames specific prompt segments:
```typescript
const credits = await assignPromptCredit(agent, analysis);
// [{ segment: 'Be verbose', blame: 'high', relatedAspect: 'length' }]
```

### Trajectory (Multi-step agents)
Blames execution spans:
```typescript
const credits = await assignTrajectoryCredit(spans, analysis);
// [{ spanId: 's1', contribution: -0.5, reason: 'Tool call failed' }]
```

## Evolution Intensity

Based on score:
- **8-10**: Minor refinements (low intensity)
- **5-7**: Moderate changes (medium intensity)
- **1-4**: Major overhaul (high intensity)

## Testing Evolution

```typescript
// Generate test input
const input = await generateDefaultTestInput(sessionNeed);

// Execute agent
const result = await executeAgent(agent, input);

// Score and evolve
const evolved = await runEvolutionPipeline(agent, { score, comment });
```
