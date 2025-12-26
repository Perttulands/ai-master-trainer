# Training Camp - Claude Code Guide

## Project Overview

Training Camp is a lineage-based interactive training system for AI agents. Users create/improve agents by expressing needs and evaluating outputs through a 4-card grid interface.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Routing**: React Router DOM v7
- **Database**: sql.js (SQLite in browser)
- **AI Agents**: Anthropic Agent SDK (@anthropic-ai/sdk)
- **LLM Backend**: Claude API + LiteLLM (for multi-model support)
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
- **Store (SQLite)**: Sessions, lineages, artifacts, evaluations, audit log
- **Runner (ADK Agents)**: Executes lineage generation, produces artifacts

## Key Concepts

- **Session**: A training workspace for a single objective
- **Lineage**: A persistent evolutionary branch (A/B/C/D)
- **Artifact**: Output produced by a lineage for a given cycle
- **Cycle**: One iteration of generate → evaluate → evolve
- **Directive**: User guidance for a specific lineage (sticky or one-shot)

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

## Anthropic Agent SDK Pattern

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Tool-using agent pattern
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools: [{ name: 'analyze_scores', ... }],
  messages: [{ role: 'user', content: 'Evolve this lineage...' }]
});

// Handle tool calls in agentic loop
if (response.stop_reason === 'tool_use') {
  // Execute tools and continue conversation
}
```

For new agent projects, use `/new-sdk-app` command.

## Testing Approach

- Unit tests for utils and pure functions
- Component tests with React Testing Library
- Integration tests for agent flows
- E2E tests for critical user journeys (later)

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` - Claude API access
- `GOOGLE_API_KEY` - Gemini / ADK access
- `LITELLM_API_KEY` - LiteLLM proxy access
- `LITELLM_API_BASE` - LiteLLM endpoint URL
