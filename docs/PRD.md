# Training Camp - Product Requirements Document

## Summary

Training Camp enables non-technical users to **create and improve AI agents** through two simple actions: **expressing a need** and **evaluating outputs**. A built-in **Master Trainer** handles all technical configuration and evolution.

The core UX is an iterative loop: review 4 parallel agent outputs, score them 1-10, lock winners, regenerate the rest.

---

## Problem

Building AI agents requires specialized expertise (prompting, tool design, orchestration). Domain experts know what "good" looks like but can't translate that into agent engineering. Training Camp removes this bottleneck by converting domain judgment (scoring and feedback) into systematic agent improvement.

---

## Key Innovation

Users need only:
1. **State intent/constraints**
2. **Evaluate and choose** among outputs

Everything else—agent generation, variation, optimization—is delegated to the Master Trainer.

---

## Definitions

| Term | Definition |
|------|------------|
| **Agent** | An AI system with instructions, tools, and execution flow |
| **Artifact** | Output produced when an agent processes a test input |
| **Session** | Training workspace for a single objective |
| **Lineage** | A persistent evolutionary branch (A/B/C/D) of an agent |
| **Cycle** | One iteration: generate → evaluate → evolve |
| **Directive** | User guidance for a specific lineage (sticky or one-shot) |

---

## Core Concept: Training Agents, Not Text

**Critical distinction**: The system trains AI **Agents**, not text content.

| What | Definition |
|------|------------|
| **Agent** | The AI system being trained (prompt + tools + flow + config) |
| **Artifact** | The OUTPUT produced when an agent runs against input |

Users evaluate **Artifacts** (outputs), which provides training signal to evolve the **Agents**.

---

## User Journeys

### Journey A: Start from Scratch
1. Enter need: "Summarize emails with action items"
2. Master Trainer proposes 4 different strategies
3. User reviews/adjusts strategies, confirms
4. 4 agents are generated, each executes to produce an artifact
5. User scores each artifact 1-10, locks best performers
6. Click "Regenerate Unlocked" → agents evolve, produce new artifacts
7. Repeat until satisfied, export winning agent(s)

### Journey B: Lineage Directives
1. Add directive to Lineage A: "Use bullet points only"
2. Add directive to Lineage B: "Include urgency levels"
3. Regenerate → see divergent approaches
4. Select preferred direction

### Journey C: Lock and Explore
1. Lock 2-3 high-scoring lineages
2. Keep regenerating unlocked lineages to find better alternatives
3. Compare against locked winners

---

## Product Requirements

### 1. Session Setup
- Create session with need description and optional constraints
- Upload reference files (examples, style samples)
- Master Trainer creates 4 lineages with distinct strategies

### 2. Strategy Discussion
Before generation, Master Trainer:
1. Proposes 4 strategies based on user's need
2. User can adjust or approve
3. This is conversational, not automatic

### 3. Main Training Loop
**Layout**: 2x2 grid of cards + right panel

**Each card shows**:
- Lineage label (A/B/C/D) + strategy tag
- Artifact preview (agent execution output)
- Score slider (1-10)
- Lock toggle
- View Agent button (see agent infrastructure)
- Expand button (see full artifact)

**Right panel**:
- Master Trainer chat
- Lineage directives

### 4. Evaluation
- Score each unlocked lineage 1-10 before regenerating
- Optional: freeform comment
- Regenerate button disabled until all unlocked lineages scored

### 5. Locking & Regeneration
- Lock/unlock any lineage at any time
- "Regenerate Unlocked" evolves only unlocked agents
- Locked agents remain unchanged for comparison

### 6. Agent Viewer
When user clicks "View Agent":
- Show agent's execution flow (visual flowchart)
- Show system prompt
- Show tools and their schemas
- Show configuration (model, temperature, etc.)

### 7. Export
- Export agent definitions as JSON, Python, or TypeScript
- Include evidence pack (scores, comments, lineage history)

---

## Master Trainer Flow

```
User Need → Strategy Discussion → Agent Generation → Agent Execution → Artifacts
                                                                          ↓
                                                                    User Scores
                                                                          ↓
                                                              Agent Evolution
                                                                          ↓
                                                              Re-execution → New Artifacts
```

### Phase 1: Strategy Discussion
Master Trainer proposes approaches, user refines and confirms.

### Phase 2: Agent Generation
For each strategy, create complete agent definition (prompt, tools, flow, config).

### Phase 3: Agent Execution
Each agent runs against test input to produce an artifact.

### Phase 4: Evolution
Based on scores and directives, Master Trainer modifies agent configurations.

---

## Non-Goals (MVP)

- Requiring users to define rubrics/evals
- Exposing technical configuration as prerequisite
- Production deployment orchestration

---

## Success Metrics

- Time to first 4 artifacts
- % sessions completing 3+ cycles
- Average evaluations per session
- % sessions with locked lineages
- Export rate
