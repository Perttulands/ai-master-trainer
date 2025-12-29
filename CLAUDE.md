# Training Camp - Claude Code Guide

## Project Overview

Training Camp enables non-technical users to create and improve AI agents through expressing needs and evaluating outputs.

**Two operational modes:**
1. **Quick Start**: Single agent, freeform feedback, fast iteration for concept validation
2. **Full Training**: 4 parallel lineages (A/B/C/D), score outputs 1-10, lock winners, regenerate the rest

**Key distinction**: The system trains **Agents** (configurations), not text. Users evaluate **Artifacts** (agent outputs), which drives **Agent** evolution.

See `docs/` for detailed specifications:
- `docs/PRD.md` - Product requirements and user journeys
- `docs/ARCHITECTURE.md` - Data models and system flow
- `docs/SPEC-agent-evolution.md` - Evolution pipeline specification
- `docs/UI-flowchart-viewer.md` - Agent viewer UI spec

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Routing**: React Router DOM v7
- **Database**: sql.js (SQLite in browser)
- **LLM Runtime**: LiteLLM gateway (OpenAI-compatible API for multi-model support)
- **Agent Export**: Anthropic SDK (for standalone exported code only, not runtime)
- **Icons**: Lucide React

## Installed Plugins

- **typescript-lsp**: TypeScript language server for code intelligence
- **frontend-design**: Production-grade UI generation (auto-activates)
- **code-review**: Multi-agent code review (`/code-review`)
- **agent-sdk-dev**: Agent SDK scaffolding (`/new-sdk-app`)

## Architecture Pattern (Agent Lightning inspired)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Algorithm  │◄───►│    Store    │◄───►│   Runner    │
│  (Master    │     │  (SQLite)   │     │  (Lineage   │
│   Trainer)  │     │             │     │  Executor)  │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Master Trainer (Algorithm)**: Evolves lineages based on user scores/feedback
- **Store (SQLite)**: Sessions, lineages, agents, artifacts, evaluations
- **Agent Executor (Runner)**: Executes agents with flow/tool support

## Key Concepts

- **Session**: A training workspace for a single objective (Quick Start or Training mode)
- **Lineage**: A persistent evolutionary branch (A/B/C/D in training mode)
- **Prototype**: The single agent in Quick Start mode before promotion
- **Agent**: The AI system being trained (prompt + tools + flow + config)
- **Artifact**: Output produced by an agent for a given cycle
- **Cycle**: One iteration of generate → evaluate → evolve
- **Directive**: User guidance for a specific lineage (sticky or one-shot)
- **Promotion**: Converting a Quick Start prototype into 4 training lineages

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI primitives
│   ├── cards/          # Lineage card components
│   ├── panels/         # Right panel (trainer chat, directives)
│   └── layout/         # App layout components
├── agents/             # Google ADK agent definitions
│   ├── master-trainer/ # Main orchestrator agent
│   └── lineage/        # Lineage execution agents
├── store/              # Zustand stores
│   ├── session.ts      # Session state
│   ├── lineages.ts     # Lineage state
│   └── ui.ts           # UI state
├── db/                 # SQLite database layer
│   ├── schema.ts       # Table definitions
│   ├── migrations.ts   # Schema migrations
│   └── queries.ts      # Query functions
├── api/                # LiteLLM API integration
│   └── llm.ts          # LLM client wrapper
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## Database Schema (SQLite)

```sql
-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  need TEXT NOT NULL,
  constraints TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Lineages
CREATE TABLE lineages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT NOT NULL, -- A, B, C, D
  strategy_tag TEXT,
  is_locked INTEGER DEFAULT 0,
  directive_sticky TEXT,
  directive_oneshot TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Artifacts
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT, -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (lineage_id) REFERENCES lineages(id)
);

-- Evaluations
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  comment TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

-- Audit Log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  data TEXT, -- JSON
  created_at INTEGER NOT NULL
);
```

## Engineering Philosophy

### No Mocks, No Fakes, Proper Errors

**Core principle**: If something doesn't work, it should fail clearly - not pretend to work.

1. **No mock implementations** - Don't create fake versions of features that "simulate" real behavior
2. **Real or nothing** - Either implement a feature properly or don't implement it at all
3. **Clear errors over silent failures** - When something fails, surface it to the user with context
4. **No simulated outputs** - All agent outputs must come from actual LLM execution

**Example - Tools**:
- ❌ Bad: "tools" that are just LLM calls with different prompts pretending to be real tools
- ✅ Good: No tools until we can implement real, deterministic tool execution
- ✅ Good: Clear error message if a feature requires backend support we don't have

**Example - Agent Execution**:
- ❌ Bad: `generateFallbackOutput()` that creates fake content when LLM fails
- ✅ Good: Let the error propagate so user knows execution failed
- ✅ Good: Show "Execution failed: [reason]" in the UI

**Why this matters for Training Camp**:
- Training signal quality depends on real agent behavior
- Users can't meaningfully compare agents if outputs are fake
- Mocks create false confidence and hide real issues

### Current Architectural Decisions

| Feature | Status | Notes |
|---------|--------|-------|
| Agent tools | Disabled | All agents have `tools: []`. Real tool support requires backend. |
| Flow execution | Disabled | All agents use direct LLM execution. Flows had broken templates. |
| Web search | Not available | Requires backend proxy for CORS |
| File generation | Not available | Requires heavy libraries or backend |

See `docs/PLAN-tool-architecture-cleanup.md` for the full tool architecture plan.

## Coding Conventions

### TypeScript
- Use strict mode
- Prefer interfaces over types for object shapes
- Use `const` assertions for literal types
- Avoid `any` - use `unknown` if type is truly unknown

### React
- Functional components only
- Use hooks for state and effects
- Colocate related code (component + styles + tests)
- Props interfaces named `{ComponentName}Props`

### File Naming
- Components: PascalCase (`LineageCard.tsx`)
- Hooks: camelCase with `use` prefix (`useSession.ts`)
- Utils: camelCase (`formatScore.ts`)
- Types: PascalCase (`Session.ts`)

### Styling (Tailwind)
- Use Tailwind utility classes
- Extract repeated patterns to components, not CSS
- Use `cn()` utility for conditional classes

## Common Commands

```bash
pnpm dev          # Start Vite dev server
pnpm build        # TypeScript check + production build
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix ESLint issues
pnpm format       # Run Prettier
```

## API Configuration

LiteLLM endpoint: `LITELLM_API_BASE` (default: https://litellm-api.up.railway.app)

```typescript
// Example LLM call
const response = await fetch(`${LITELLM_API_BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LITELLM_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }]
  })
});
```

## LLM Architecture

**Runtime**: All LLM calls go through LiteLLM gateway (`src/api/llm.ts`)
- Multi-model support (Claude, GPT, Gemini via model IDs like `anthropic/claude-4-5-sonnet-aws`)
- Unified OpenAI-compatible API format
- DO NOT use Anthropic SDK directly for runtime execution

**Export**: Generated standalone code uses Anthropic SDK (`src/lib/export/to-typescript.ts`)
- Users can export agents to run independently outside Training Camp
- Exported code requires user's own `ANTHROPIC_API_KEY`
- This is the ONLY place Anthropic SDK is used

## Testing Approach

- Unit tests for utils and pure functions
- Component tests with React Testing Library
- Integration tests for agent flows
- E2E tests for critical user journeys (later)

## Environment Variables

Required in `.env` for runtime:
- `VITE_LITELLM_API_KEY` - LiteLLM proxy access
- `VITE_LITELLM_API_BASE` - LiteLLM endpoint URL
- `VITE_LITELLM_MODEL` - Default model ID (optional)

Only needed for exported standalone code (not runtime):
- `ANTHROPIC_API_KEY` - Required by exported agents, not by Training Camp itself

## Training Signal Capture

Every agent execution is recorded for future model training. See `docs/SPEC-training-signal-capture.md`.

**Key tables:**
- `training_events` - Immutable event log
- `payload_blobs` - Content-addressed storage (dedup)
- `training_examples` - Materialized SFT/DPO examples

**Recording functions** (in `src/services/training-signal/`):
```typescript
recordAgentCreated(agent, lineageId)
recordAttemptCompleted(attempt, spans, output)
recordArtifactScored(artifact, score, comment)
recordLineageLocked(lineageId, competitorIds)
recordAgentEvolved(fromAgent, toAgent, changes, hypothesis)
```

## Agent Execution

**Current execution mode**: Direct LLM execution (no flows, no tools)

All agents execute via `executeSinglePromptDirect()` in `src/services/agent-executor.ts`:
- System prompt + user input → LLM → output
- No intermediate steps, no tool calls
- Clean, comparable, real outputs

**Why not flows/tools?**
- Flow system had hardcoded templates that ignored user input (bug)
- "Tools" were fake LLM wrappers, not real tool execution
- See `docs/PLAN-tool-architecture-cleanup.md` for the full story

**Flow execution code** (`src/services/flow/`) - preserved for future use:
- `executeFlow(agent, input, attemptId)` - Run agent's flow
- Supports: start, prompt, tool, condition, loop, output steps
- Currently bypassed because agents have `flow: []`

**Tool execution code** (`src/services/tools/`) - preserved for future use:
- `toolRegistry.register(implementation)` - Register tools
- `executeToolCalls(calls, options)` - Run tool calls
- Currently unused because agents have `tools: []`

## Evolution Pipeline

Full evolution cycle (`src/services/`):
1. **Reward Analysis** - Parse scores/comments (`reward-analyzer.ts`)
2. **Credit Assignment** - Blame prompt segments (`credit-assignment.ts`)
3. **Evolution Planning** - Generate changes (`evolution-planner.ts`)
4. **Agent Evolution** - Apply changes (`agent-evolver.ts`)
5. **Learning** - Track patterns (`evolution-pipeline.ts`)

## Agent Lightning Integration

We follow Agent Lightning patterns. See `docs/REPORT-agent-lightning-integration.md`.

Future: Export data for APO (Automatic Prompt Optimization) via Agent Lightning Python package.
