# Training Camp - Product Requirements Document

## Summary

Training Camp enables non-technical users to **create and improve AI agents** through two simple actions: **expressing a need** and **evaluating outputs**. A built-in **Master Trainer** handles all technical configuration and evolution.

**Operational modes:**
1. **Quick Start (Exploration)**: Single agent, fast iteration, validate concepts
2. **Full Training (Optimization)**: 4 parallel lineages, comparative scoring, systematic evolution

---

## Problem

Building AI agents requires specialized expertise (prompting, tool design, orchestration). Domain experts know what "good" looks like but can't translate that into agent engineering. Training Camp removes this bottleneck by converting domain judgment (scoring and feedback) into systematic agent improvement.

**Additional friction point**: Spinning up 4 parallel agents is wasteful during early exploration when users are still validating basic concepts. The overhead of waiting for 4 agents to generate, scoring all of them, and managing parallel lineages is premature optimization when the user just wants to test if an idea works.

---

## Key Innovation

Users need only:
1. **State intent/constraints**
2. **Evaluate and choose** among outputs

Everything else—agent generation, variation, optimization—is delegated to the Master Trainer.

**Two-phase workflow** matches natural exploration patterns:
- **Phase 1 (Exploration)**: "Does this concept work?" → Single agent, fast iteration
- **Phase 2 (Optimization)**: "Which approach is best?" → Promote to 4 lineages, comparative training

---

## Definitions

| Term | Definition |
|------|------------|
| **Agent** | An AI system with instructions, tools, and execution flow |
| **Artifact** | Output produced when an agent processes a test input |
| **Session** | Training workspace for a single objective (can be Quick Start or Full Training) |
| **Lineage** | A persistent evolutionary branch (A/B/C/D) of an agent |
| **Cycle** | One iteration: generate → evaluate → evolve |
| **Directive** | User guidance for a specific lineage (sticky or one-shot) |
| **Quick Start** | Single-agent exploration mode for concept validation |
| **Prototype** | The single agent in Quick Start mode before promotion |
| **Promotion** | Converting a Quick Start prototype into 4 training lineages |

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

### Journey 1: Quick Start (Exploration)
**Goal**: Validate a concept quickly with minimal overhead

1. Click "Quick Start" on home screen
2. Enter need: "Summarize emails with action items"
3. Single agent is generated immediately (no strategy discussion)
4. View artifact output
5. Provide feedback: "Make it shorter" or "Add urgency levels"
6. Click "Iterate" → agent evolves, new artifact generated
7. Repeat until concept is validated
8. **Decision point**:
   - Export prototype as-is, OR
   - Click "Promote to Training" → spawn 4 lineages from prototype

### Journey 2: Full Training (Optimization)
**Goal**: Find the optimal agent through comparative evaluation

1. Enter need (or start from promoted prototype)
2. Master Trainer proposes 4 different strategies
3. User reviews/adjusts strategies, confirms
4. 4 agents are generated, each executes to produce an artifact
5. User scores each artifact 1-10, locks best performers
6. Click "Regenerate Unlocked" → agents evolve, produce new artifacts
7. Repeat until satisfied, export winning agent(s)

### Journey 3: Promote from Quick Start
**Goal**: Transition from exploration to optimization

1. Complete Quick Start with a working prototype
2. Click "Promote to Training"
3. Choose promotion strategy:
   - **Variations**: 4 lineages with different styles of the same approach
   - **Alternatives**: 4 lineages with fundamentally different strategies
4. Prototype becomes Lineage A (locked by default)
5. Continue with Full Training flow

### Journey 4: Lineage Directives
1. Add directive to Lineage A: "Use bullet points only"
2. Add directive to Lineage B: "Include urgency levels"
3. Regenerate → see divergent approaches
4. Select preferred direction

### Journey 5: Lock and Explore
1. Lock 2-3 high-scoring lineages
2. Keep regenerating unlocked lineages to find better alternatives
3. Compare against locked winners

---

## Product Requirements

### 1. Home Screen
- Show existing sessions (both Quick Start and Full Training)
- Two primary actions:
  - **"Quick Start"** → Single agent exploration
  - **"New Training Session"** → Full 4-lineage training

### 2. Quick Start Mode
**Layout**: Single card, full width, with feedback panel

**Quick Start card shows**:
- Agent name + version
- Artifact output (full content, scrollable)
- Feedback input (freeform text)
- "Iterate" button → evolve agent based on feedback

**Quick Start actions**:
- Iterate: Evolve agent, produce new artifact
- View Agent: See agent configuration
- Export: Export prototype as-is
- **Promote to Training**: Convert to 4-lineage session

**No scoring required** - just freeform feedback and iteration

### 3. Session Setup (Full Training)
- Create session with need description and optional constraints
- Upload reference files (examples, style samples)
- Master Trainer creates 4 lineages with distinct strategies

### 4. Strategy Discussion (Full Training only)
Before generation, Master Trainer:
1. Proposes 4 strategies based on user's need
2. User can adjust or approve
3. This is conversational, not automatic

### 5. Main Training Loop (Full Training)
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

### 6. Evaluation (Full Training)
- Score each unlocked lineage 1-10 before regenerating
- Optional: freeform comment
- Regenerate button disabled until all unlocked lineages scored

### 7. Locking & Regeneration (Full Training)
- Lock/unlock any lineage at any time
- "Regenerate Unlocked" evolves only unlocked agents
- Locked agents remain unchanged for comparison

### 8. Promotion (Quick Start → Full Training)
When user clicks "Promote to Training":
- Choose strategy: Variations (same approach, different styles) or Alternatives (different strategies)
- Prototype becomes Lineage A, locked by default
- Generate 3 additional agents for Lineages B, C, D
- Transition to Full Training layout

### 9. Agent Viewer
When user clicks "View Agent":
- Show agent's execution flow (visual flowchart)
- Show system prompt
- Show tools and their schemas
- Show configuration (model, temperature, etc.)

### 10. Export
- Export agent definitions as JSON, Python, or TypeScript
- Include evidence pack (scores, comments, lineage history)
- Works in both Quick Start and Full Training modes

---

## Master Trainer Flow

### Quick Start Flow
```
User Need → Single Agent Generation → Execution → Artifact
                                                      ↓
                                               User Feedback (freeform)
                                                      ↓
                                               Agent Evolution
                                                      ↓
                                               Re-execution → New Artifact
                                                      ↓
                                               [Promote to Training?]
```

### Full Training Flow
```
User Need → Strategy Discussion → 4x Agent Generation → 4x Execution → 4 Artifacts
                                                                            ↓
                                                                      User Scores (1-10)
                                                                            ↓
                                                                    Agent Evolution (unlocked)
                                                                            ↓
                                                                    Re-execution → New Artifacts
```

### Quick Start Phases

**Phase 1: Immediate Generation**
- No strategy discussion - generate one balanced agent immediately
- Faster time-to-first-artifact

**Phase 2: Feedback-Driven Iteration**
- User provides freeform text feedback
- Agent evolves based on feedback (no numeric scores)
- Tight iteration loop

**Phase 3: Optional Promotion**
- When concept is validated, optionally promote to Full Training
- Prototype becomes the baseline for comparison

### Full Training Phases

**Phase 1: Strategy Discussion**
Master Trainer proposes approaches, user refines and confirms.

**Phase 2: Agent Generation**
For each strategy, create complete agent definition (prompt, tools, flow, config).

**Phase 3: Agent Execution**
Each agent runs against test input to produce an artifact.

**Phase 4: Evolution**
Based on scores and directives, Master Trainer modifies agent configurations.

---

## Non-Goals (MVP)

- Requiring users to define rubrics/evals
- Exposing technical configuration as prerequisite
- Production deployment orchestration

---

## Success Metrics

### Quick Start Metrics
- Time to first artifact (target: <10s with mock, <30s with LLM)
- Iterations per Quick Start session
- % Quick Start sessions that promote to Full Training
- % Quick Start sessions that export directly

### Full Training Metrics
- Time to first 4 artifacts
- % sessions completing 3+ cycles
- Average evaluations per session
- % sessions with locked lineages
- Export rate

### Overall Metrics
- Ratio of Quick Start vs Full Training sessions
- User retention across session types
- Agent quality improvement over iterations

---

## Future Enhancements

### Multi-Test-Prompt Evaluation

**Problem**: A single input prompt can lead to overfitting. An agent that writes excellent love poems about autumn may fail completely when asked about loss or joy.

**Proposed Solution**: Support multiple test prompts per session to evaluate robustness.

**Key Features**:
- **Test Case Library**: Store multiple input prompts per session (reuse existing `test_cases` table)
- **Batch Evaluation**: Run all agents against each test prompt in the library
- **Aggregate Scoring**: Show how agents perform across diverse inputs, not just one
- **Coverage Insights**: Identify which prompt types an agent struggles with

**User Flow**:
1. User defines primary input prompt (current behavior)
2. User can optionally add additional test prompts to the session
3. On regenerate, system runs all test prompts (or a sample for efficiency)
4. Results show per-prompt performance with aggregate quality signals

**Benefits**:
- Prevents narrow optimization around a single prompt
- Reveals agent weaknesses before export/deployment
- Builds more robust, generalizable agents

**Implementation Notes**:
- `test_cases` table already exists in schema but is unused
- Could integrate with context examples (input/expectedOutput pairs)
- Consider weighting: some prompts matter more than others
