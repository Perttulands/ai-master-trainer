# Agent Lightning Integration Report

## What is Agent Lightning?

[Agent Lightning](https://github.com/microsoft/agent-lightning) is Microsoft's open-source framework for training AI agents. It works with any agent framework (LangChain, OpenAI SDK, AutoGen, CrewAI) with minimal code changes.

**Key capabilities:**
- Automatic Prompt Optimization (APO)
- Reinforcement Learning from Human Feedback
- Supervised Fine-tuning
- Trace capture for all agent interactions

## Architecture Comparison

| Component | Agent Lightning | Training Camp |
|-----------|-----------------|---------------|
| **Algorithm** | Pluggable (APO, RL, SFT) | Evolution pipeline |
| **Store** | LightningStore | SQLite + training_events |
| **Runner** | Framework-agnostic executor | Flow executor |
| **Tracer** | `agl.emit_xxx()` decorators | Span recording |
| **Resources** | Prompt templates (mutable) | Agent definitions |

### What We Already Have

Training Camp already implements the core Agent Lightning pattern:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  MASTER TRAINER │◄───►│     SQLITE      │◄───►│  FLOW EXECUTOR  │
│  (Algorithm)    │     │    (Store)      │     │    (Runner)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Our strengths:**
- Full execution trace capture (spans, tool calls)
- Event sourcing for training signal
- Content-addressed payload storage (deduplication)
- Comparative evaluation (4 lineages side-by-side)
- User preference pairs (locked vs unlocked)

**What Agent Lightning adds:**
- Automatic Prompt Optimization (APO) algorithm
- Textual gradients (LLM-generated critiques)
- Beam search over prompt variants
- Reinforcement learning integration
- Multi-GPU distributed training

## Feature Gap Analysis

| Feature | Agent Lightning | Training Camp | Gap |
|---------|-----------------|---------------|-----|
| Trace capture | ✅ | ✅ | None |
| Span recording | ✅ | ✅ | None |
| Rollout/Attempt tracking | ✅ | ✅ | None |
| Human feedback collection | ✅ | ✅ | None |
| Preference pairs | ✅ | ✅ | None |
| Automatic Prompt Optimization | ✅ | ❌ | **Major** |
| Textual gradients | ✅ | ❌ | **Major** |
| Beam search | ✅ | ❌ | Medium |
| RL training | ✅ | ❌ | Low priority |
| Model fine-tuning | ✅ | ❌ | Low priority |

## Integration Strategy

### Option A: Use Agent Lightning Directly (Recommended for APO)

Install Agent Lightning and use its APO algorithm on our captured data.

**Pros:**
- Battle-tested optimization algorithms
- Active development by Microsoft
- GPU-accelerated training

**Cons:**
- Python dependency (we're TypeScript)
- Requires export pipeline to Agent Lightning format

**Implementation:**
1. Export training events to Agent Lightning format
2. Run APO as a batch job (Python script)
3. Import optimized prompts back

### Option B: Implement APO in TypeScript

Port the APO algorithm to our codebase.

**APO Algorithm (simplified):**
```typescript
async function runAPO(
  initialPrompt: string,
  trainingData: TrainingExample[],
  validationData: TrainingExample[],
  options: { beamWidth: number; branchFactor: number; rounds: number }
): Promise<string> {
  let beam = [initialPrompt];

  for (let round = 0; round < options.rounds; round++) {
    const candidates: string[] = [];

    for (const prompt of beam) {
      // 1. Run rollouts with this prompt
      const rollouts = await executeRollouts(prompt, trainingData);

      // 2. Compute textual gradient (critique)
      const gradient = await computeGradient(prompt, rollouts);

      // 3. Generate improved variants
      const variants = await applyGradient(prompt, gradient, options.branchFactor);
      candidates.push(...variants);
    }

    // 4. Evaluate all candidates on validation set
    const scores = await evaluateCandidates(candidates, validationData);

    // 5. Keep top performers
    beam = selectTopK(candidates, scores, options.beamWidth);
  }

  return beam[0]; // Best prompt
}

async function computeGradient(prompt: string, rollouts: Rollout[]): Promise<string> {
  const failedRollouts = rollouts.filter(r => r.score < 5);

  return await llm.complete({
    system: "Analyze these failed attempts and describe how the prompt could be improved.",
    user: `Prompt: ${prompt}\n\nFailed attempts:\n${formatRollouts(failedRollouts)}`
  });
}

async function applyGradient(prompt: string, gradient: string, count: number): Promise<string[]> {
  return await llm.complete({
    system: "Generate improved prompt variants based on the critique.",
    user: `Original: ${prompt}\n\nCritique: ${gradient}\n\nGenerate ${count} improved versions.`
  });
}
```

**Pros:**
- Stays in our TypeScript ecosystem
- Full control over algorithm
- No Python dependency

**Cons:**
- Reimplementing tested code
- Missing GPU acceleration

### Option C: Hybrid Approach (Recommended)

1. **Keep our trace capture** (already superior for browser-based use)
2. **Export for batch optimization** (periodic Python job)
3. **Implement lightweight APO** for real-time feedback

## Implementation Plan

### Phase 1: Export Pipeline (Low effort, High value)

Create export functions for Agent Lightning format:

```typescript
// src/services/training-signal/exporter.ts
export function exportForAgentLightning(
  sessionId: string
): AgentLightningDataset {
  const events = getTrainingEventsBySession(sessionId);

  return {
    rollouts: events
      .filter(e => e.eventType === 'attempt.completed')
      .map(toAgentLightningRollout),
    resources: getAgentDefinitions(sessionId)
      .map(toAgentLightningResource),
    rewards: events
      .filter(e => e.eventType === 'artifact.scored')
      .map(toAgentLightningReward)
  };
}
```

### Phase 2: Textual Gradients (Medium effort, High value)

Add gradient computation to evolution pipeline:

```typescript
// src/services/evolution/gradient.ts
export async function computeTextualGradient(
  agent: AgentDefinition,
  failedAttempts: Attempt[]
): Promise<string> {
  // Use reward analyzer patterns + LLM critique
  const analysis = failedAttempts.map(a => ({
    input: a.input,
    output: a.output,
    score: a.score,
    feedback: a.comment
  }));

  return await llm.complete({
    system: GRADIENT_SYSTEM_PROMPT,
    user: formatForGradient(agent.systemPrompt, analysis)
  });
}
```

### Phase 3: Beam Search (Medium effort, Medium value)

Add beam search to evolution:

```typescript
// src/services/evolution/beam-search.ts
export async function beamSearchEvolution(
  agent: AgentDefinition,
  trainingData: TestCase[],
  options: BeamSearchOptions
): Promise<AgentDefinition> {
  // Generate multiple variants
  // Evaluate in parallel
  // Select top performers
}
```

### Phase 4: Python Integration (Optional)

Add Python script for heavy optimization:

```python
# scripts/optimize_prompts.py
import agentlightning as agl
from training_camp import load_export

def run_apo(export_path: str):
    data = load_export(export_path)
    algorithm = agl.APO(beam_width=4, rounds=3)
    result = algorithm.optimize(data)
    return result.best_prompt
```

## Devcontainer Updates Needed

To support Python integration:

```dockerfile
# Already have Python 3.12 via feature
# Add Agent Lightning
RUN pip install --user agentlightning
```

## Recommendations

### Immediate (No Agent Lightning dependency)

1. **Implement textual gradients** - Use our existing LLM infrastructure
2. **Add gradient-based evolution** - Enhance current evolution planner
3. **Create export format** - Prepare data for future Agent Lightning use

### Short-term (With Agent Lightning)

1. **Add batch optimization script** - Python script for APO
2. **Schedule optimization runs** - Nightly/weekly prompt optimization
3. **Import improved prompts** - Update agent definitions

### Long-term

1. **Evaluate RL training** - For complex multi-step agents
2. **Consider model fine-tuning** - If we collect enough data

## Sources

- [Agent Lightning GitHub](https://github.com/microsoft/agent-lightning)
- [Agent Lightning Documentation](https://microsoft.github.io/agent-lightning/latest/)
- [APO Algorithm Details](https://microsoft.github.io/agent-lightning/latest/algorithm-zoo/apo/)
