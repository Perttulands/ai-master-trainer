# Training Camp - Architecture

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Master    │◄───►│    Store    │◄───►│   Agent     │
│   Trainer   │     │  (SQLite)   │     │  Executor   │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Master Trainer**: Orchestrates strategy discussion, agent generation, and evolution
- **Store**: Persists sessions, lineages, agents, artifacts, evaluations
- **Agent Executor**: Runs agents against inputs to produce artifacts

---

## Data Model

### Session
```typescript
interface Session {
  id: string;
  name: string;
  need: string;           // What the user wants to accomplish
  constraints?: string;   // Optional constraints
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
  flow: AgentFlowStep[];    // Execution flow (flexible structure)
  memory: AgentMemoryConfig;
  parameters: AgentParameters;
  createdAt: number;
  updatedAt: number;
}
```

### Agent Tool (Flexible Schema)
```typescript
interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema for parameters
}
```

### Agent Flow Step (Flexible Structure)
```typescript
interface AgentFlowStep {
  id: string;
  type: string;             // Not restricted to predefined types
  label: string;
  config: Record<string, unknown>;  // Type-specific configuration
  next?: string | string[]; // Next step(s) or conditional branches
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE lineages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  label TEXT NOT NULL,
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

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  data TEXT,            -- JSON object
  created_at INTEGER NOT NULL
);
```

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

## Implementation Status

### Fully Implemented ✅

| Component | Location | Notes |
|-----------|----------|-------|
| Database schema | `src/db/schema.ts` | All tables including evolution tracking |
| Database queries | `src/db/queries.ts` | Full CRUD for all entities |
| Agent definitions | `src/types/agent.ts` | Complete agent structure |
| Agent generation | `src/agents/agent-generator.ts` | 4 default strategies |
| Reward analysis | `src/services/reward-analyzer.ts` | LLM + keyword fallback |
| Credit assignment (prompt) | `src/services/credit-assignment.ts` | Prompt segment blame |
| Evolution planning | `src/services/evolution-planner.ts` | Change generation |
| Agent store | `src/store/agents.ts` | Zustand state |
| Lineage store | `src/store/lineages.ts` | With 3 regeneration modes |

### Partially Implemented ⚠️

| Component | Location | Gap |
|-----------|----------|-----|
| Simple agent evolver | `src/agents/agent-evolver.ts` | Only evolves prompt, not tools/flow |
| Full agent evolver | `src/services/agent-evolver.ts` | Complete but underutilized |
| Evolution pipeline | `src/services/evolution-pipeline.ts` | Works but not integrated into UI flow |
| Learning system | `src/services/evolution-pipeline.ts` | Extracts insights but inconsistent usage |

### Not Implemented ❌

| Component | Impact | Blocking |
|-----------|--------|----------|
| Tool execution engine | Tools defined but never run | High |
| Flow execution engine | Flow steps never execute | High |
| Trajectory credit assignment | Dead code (needs flow execution) | Medium |
| Agent viewer flowchart | UI spec exists, not built | Low |

### Architecture Decisions Needed

1. **Consolidate Evolution Paths**: Two parallel systems exist:
   - `src/agents/agent-evolver.ts` (simple, used by lineage store)
   - `src/services/agent-evolver.ts` (full, underutilized)

2. **Tool Execution Strategy**: Choose between:
   - Built-in tool implementations (simpler, less flexible)
   - Plugin/adapter pattern (more complex, extensible)
   - LLM-simulated tools (for MVP, fake execution)
