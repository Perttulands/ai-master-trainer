# Training Camp - Architecture

> **Implementation Status**: Both Quick Start and Full Training modes are implemented.

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Master    │◄───►│    Store    │◄───►│   Agent     │
│   Trainer   │     │  (SQLite)   │     │  Executor   │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Master Trainer**: Orchestrates strategy discussion, agent generation, and evolution
- **Store**: Persists sessions, lineages, agents, artifacts, evaluations
- **Agent Executor**: Runs agents with flow and tool execution

---

## Data Model

### Session

```typescript
type SessionMode = 'quickstart' | 'training';

interface Session {
  id: string;
  name: string;
  need: string;           // What the user wants to accomplish
  constraints?: string;   // Optional constraints
  mode: SessionMode;      // Quick Start or Full Training
  promotedFrom?: string;  // Links promoted session to original Quick Start
  createdAt: number;
  updatedAt: number;
}
```

### Lineage

```typescript
interface Lineage {
  id: string;
  sessionId: string;
  label: 'A' | 'B' | 'C' | 'D';
  strategyTag: string;         // e.g., "Quick Triage", "Deep Analysis"
  isLocked: boolean;
  directiveSticky?: string;    // Persists across cycles
  directiveOneshot?: string;   // Applied once, then cleared
  createdAt: number;
}
```

### Agent Definition

```typescript
interface AgentDefinition {
  id: string;
  lineageId: string;
  version: number;          // Increments on each evolution
  name: string;
  description: string;
  systemPrompt: string;
  tools: AgentTool[];       // Tools the agent can use
  flow: AgentFlowStep[];    // Execution flow
  memory: AgentMemoryConfig;
  parameters: AgentParameters;
  createdAt: number;
  updatedAt: number;
}
```

### Artifact

```typescript
interface Artifact {
  id: string;
  lineageId: string;
  cycle: number;
  content: string;          // The actual output from agent execution
  metadata?: {
    agentVersion: number;
    inputUsed: string;
    executionTimeMs: number;
  };
  createdAt: number;
}
```

### Evaluation

```typescript
interface Evaluation {
  id: string;
  artifactId: string;
  score: number;            // 1-10
  comment?: string;
  createdAt: number;
}
```

---

## Data Flow

### Session Creation

```
User Input (need, constraints)
        ↓
Strategy Discussion (Master Trainer proposes, user confirms)
        ↓
Create 4 Lineages (each with distinct strategy)
        ↓
Generate 4 Agent Definitions (one per lineage)
        ↓
Execute Agents → Create 4 Artifacts (cycle 1)
        ↓
Display in 2x2 Grid
```

### Training Cycle

```
User Scores Artifacts (1-10)
        ↓
User Clicks "Regenerate Unlocked"
        ↓
For each unlocked lineage:
  ├─ Get current agent + score + directives
  ├─ Master Trainer evolves agent definition
  ├─ Save new agent version (version++)
  ├─ Execute evolved agent
  └─ Create new artifact (cycle++)
        ↓
Display new artifacts, clear oneshot directives
```

### Quick Start Flow

```
User Input (need, constraints)
        ↓
Generate Prototype Agent (single, balanced)
        ↓
Execute Agent → Create Artifact (cycle 1)
        ↓
Display single-column output
        ↓
User Provides Freeform Feedback
        ↓
Evolve Agent Based on Feedback
        ↓
Execute → Create Artifact (cycle++)
        ↓
Repeat or Promote to Training
```

### Promotion Flow

```
User Clicks "Promote to Training"
        ↓
Select Strategy (Variations or Alternatives)
        ↓
Create New Session (mode: training, promotedFrom: quickstart.id)
        ↓
Lineage A = Prototype (locked)
        ↓
Generate 3 Additional Agents
        ↓
Create Lineages B, C, D with new agents
        ↓
Navigate to Training Session
```

---

## Store Separation (Zustand)

| Store | Responsibility |
|-------|---------------|
| `useSessionStore` | Current session data |
| `useLineageStore` | Lineages, artifacts, evaluations |
| `useAgentStore` | Agent definitions per lineage |
| `useUIStore` | Modals, panels, expanded cards |

---

## Database Schema (SQLite)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  need TEXT NOT NULL,
  constraints TEXT,
  mode TEXT NOT NULL DEFAULT 'training' CHECK (mode IN ('quickstart', 'training')),
  promoted_from TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE lineages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  label TEXT NOT NULL CHECK (label IN ('A', 'B', 'C', 'D')),
  strategy_tag TEXT,
  is_locked INTEGER DEFAULT 0,
  directive_sticky TEXT,
  directive_oneshot TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE agent_definitions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES lineages(id),
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools TEXT,           -- JSON array
  flow TEXT,            -- JSON array
  memory_config TEXT,   -- JSON object
  parameters TEXT,      -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES lineages(id),
  cycle INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,        -- JSON object
  created_at INTEGER NOT NULL
);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  comment TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE quickstart_feedback (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  feedback TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

See `src/db/schema.ts` for the complete schema including evolution tables and training signal capture.

---

## Persistence & Reliability

### Storage Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                  │
│              (Zustand stores, React)                │
├─────────────────────────────────────────────────────┤
│                   Database Layer                    │
│                  (sql.js / SQLite)                  │
├─────────────────────────────────────────────────────┤
│                 Persistence Layer                   │
│              (Browser localStorage)                 │
└─────────────────────────────────────────────────────┘
```

**sql.js**: SQLite compiled to WebAssembly, runs entirely in browser. The database is an in-memory structure that must be explicitly persisted.

### Persistence Requirements

| Requirement | Specification |
|-------------|---------------|
| Storage backend | localStorage (5-10MB quota typical) |
| Serialization | Binary export → Base64 encoding |
| Save triggers | After each write operation |
| Load triggers | Application startup |
| Error handling | Surface to UI, never silent |

### Implementation Constraints

**Binary to Base64 Conversion**: The sql.js `db.export()` returns a `Uint8Array`. Converting to Base64 for localStorage requires chunked processing to avoid stack overflow:

```typescript
// CORRECT: Chunked conversion
function uint8ArrayToBase64(data: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// WRONG: Spread operator causes stack overflow at ~10KB
// btoa(String.fromCharCode(...data));
```

### Error Handling Strategy

All database operations must follow this pattern:

1. **Attempt operation** - Execute SQL or persistence call
2. **On success** - Return result, trigger save
3. **On failure** - Throw error with context (never silently catch)
4. **UI layer** - Display error to user with recovery options

Errors that must surface to UI:
- Database save failures
- Storage quota exceeded
- Database corruption
- Migration failures

### Data Integrity

| Concern | Mitigation |
|---------|------------|
| Concurrent writes | Single-threaded JS prevents race conditions |
| Partial writes | localStorage is atomic per key |
| Corruption | Schema version check on load |
| Data loss | Error surfaces immediately |

### Storage Quota Management

localStorage typically provides 5-10MB. The application should:

1. Monitor usage after saves
2. Warn user at 80% capacity
3. Provide export functionality before quota exceeded
4. Clear old session data if user permits

---

## Key Implementation Notes

### Agent Definitions are Dynamic
- Tools and flow steps are not restricted to predefined types
- Master Trainer generates appropriate structure based on user need
- The viewer adapts to whatever structure the agent has

### Artifacts are Execution Results
- Artifacts contain actual agent output, not agent descriptions
- Each artifact is linked to the agent version that produced it
- Test inputs come from session context or defaults

### Evolution is Configuration-Based
- Master Trainer modifies agent definitions based on scores
- Low scores → more significant changes
- High scores → minor refinements
- Directives guide evolution direction

---

## Services

### Evolution Pipeline (`src/services/`)

| Service | Purpose |
|---------|---------|
| `reward-analyzer.ts` | Parse scores/comments into structured feedback |
| `credit-assignment.ts` | Identify which prompt segments to blame |
| `evolution-planner.ts` | Generate targeted change plans |
| `agent-evolver.ts` | Apply changes to agent definitions |
| `evolution-pipeline.ts` | Orchestrate the full cycle |

### Agent Execution (`src/services/agent-executor.ts`)

**Current mode**: Direct LLM execution

All agents execute via `executeSinglePromptDirect()`:
- Takes agent system prompt + user input
- Makes single LLM call
- Returns output directly

This ensures:
- Fair comparison between lineages (all use same execution path)
- User input always reaches the LLM
- Clean training signal without fake tool noise

### Flow Execution (`src/services/flow/`) - PRESERVED FOR FUTURE

| Service | Purpose |
|---------|---------|
| `executor.ts` | Run agent flow steps |
| `handlers.ts` | Handle each step type (start, prompt, tool, etc.) |

**Status**: Code preserved but currently bypassed. Agents have `flow: []`.

**Why disabled**: The demo flow had hardcoded templates that ignored user input. See `docs/PLAN-tool-architecture-cleanup.md`.

### Tool Execution (`src/services/tools/`) - PRESERVED FOR FUTURE

| Service | Purpose |
|---------|---------|
| `registry.ts` | Register tool implementations |
| `executor.ts` | Execute tool calls |
| `builtin.ts` | LLM-wrapper tools (currently unused) |

**Status**: Code preserved but currently unused. Agents have `tools: []`.

**Why disabled**: The "tools" were fake - just LLM calls with different prompts pretending to be tools. Real tool support requires either:
- Backend service for CORS/security
- MCP server integration
- Browser-only deterministic tools (calculate, format, etc.)

See `docs/PLAN-tool-architecture-cleanup.md` for the full tool architecture plan.

### Training Signal (`src/services/training-signal/`)

| Service | Purpose |
|---------|---------|
| `recorder.ts` | Record events to training_events table |
| `exporter.ts` | Export training data (SFT, DPO format) |
