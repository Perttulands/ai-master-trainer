# Training Signal Capture

## Intent

Every agent run is a potential training example. Users score outputs and compare alternatives - this is free labeling. Capture everything so the data can later tune models, inform prompt engineering, or train reward models.

## What We Capture

### Per Attempt (Single Agent Execution)

| Category | Data | Purpose |
|----------|------|---------|
| **Input** | User need, constraints, test input, context docs | What was asked |
| **Agent Config** | System prompt, tools, flow, parameters, version | What produced the output |
| **Execution Trace** | Every LLM call, tool call, reasoning step (spans) | How it got there |
| **Output** | Final artifact content | What was produced |
| **Metrics** | Tokens, latency, cost | Efficiency signal |

### Per Evaluation (User Feedback)

| Category | Data | Purpose |
|----------|------|---------|
| **Score** | 1-10 rating | Quality signal |
| **Comment** | Freeform feedback | Aspect-level signal |
| **Comparison** | Which lineage was locked/preferred | Relative ranking |
| **Directives** | What user asked to change | Preference signal |

### Per Evolution (Agent Improvement)

| Category | Data | Purpose |
|----------|------|---------|
| **Before/After** | Agent configs pre/post evolution | What changed |
| **Hypothesis** | Why we made the change | Reasoning |
| **Outcome** | Score delta, hypothesis validated | Did it work |

## Data Relationships

```
Session
  └── Lineages (A, B, C, D)
        └── Agent Versions (v1, v2, v3...)
              └── Rollouts (per cycle)
                    └── Attempts (retries)
                          └── Spans (execution trace)
                    └── Artifacts (outputs)
                          └── Evaluations (scores)
        └── Evolution Records (what changed, why, outcome)
        └── Learning Insights (patterns that work)
```

## Key Insight: Comparative Signal

Users see 4 outputs simultaneously and choose winners. This produces:

- **Absolute scores**: "This is a 7/10"
- **Relative rankings**: "A > B > C > D"
- **Preference pairs**: Locked lineages beat unlocked ones

Preference pairs are especially valuable for RLHF/DPO training.

## Database Tables

Already implemented in `src/db/schema.ts`:

| Table | Captures |
|-------|----------|
| `sessions` | User intent (need, constraints) |
| `lineages` | Evolutionary branches, directives |
| `agent_definitions` | Full agent config per version |
| `rollouts` | Execution cycles |
| `attempts` | Individual runs with full context |
| `execution_spans` | Detailed execution trace |
| `artifacts` | Outputs with metadata |
| `evaluations` | Scores and comments |
| `evolution_records` | Changes with outcomes |
| `learning_insights` | Discovered patterns |

## Export Formats

For model training, export as:

1. **SFT Examples**: `(prompt, good_completion)` from high-scored artifacts
2. **Preference Pairs**: `(prompt, chosen, rejected)` from comparative scores
3. **Reward Model Data**: `(prompt, completion, score)` for all evaluations
4. **Chain-of-Thought**: Execution spans as reasoning traces

## Future Value

This data enables:

- Fine-tuning domain-specific models
- Training reward models for RLHF
- Prompt optimization via historical analysis
- Automatic strategy selection based on past performance
- Cross-session learning ("users like X" patterns)

## Design Principles

1. **Capture everything** - Storage is cheap, hindsight is expensive
2. **Immutable records** - Never delete, append outcomes
3. **Link everything** - Full traceability from input to outcome
4. **Version agents** - Know exactly what produced each output
5. **Hash for dedup** - Identify duplicate prompts/configs
