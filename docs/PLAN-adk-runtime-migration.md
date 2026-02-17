# Plan: ADK Runtime Migration

## Goal

Refactor Training Camp runtime execution to use Google ADK with native LiteLLM support while keeping current frontend workflows stable.

## Principles

- Keep UI behavior stable during migration.
- Migrate runtime path first; evolve storage/contracts second.
- Make migration reversible with runtime mode flags.

## Target Architecture

```
React UI (existing)
  -> Runtime Adapter (src/api/llm.ts)
    -> ADK Runtime Service (backend/adk_runtime)
      -> Google ADK Runner + LiteLlm model adapter
        -> LiteLLM gateway / model providers
```

## Phases

### Phase 1: Runtime Bridge (done in this branch)

- Add ADK runtime service with OpenAI-compatible `POST /v1/chat/completions`.
- Add runtime switch in frontend:
  - `VITE_LLM_RUNTIME=litellm` (default)
  - `VITE_LLM_RUNTIME=adk`
- Keep existing request/response shape so most frontend code remains unchanged.

### Phase 2: Orchestration Consolidation (in progress)

- Remove duplicate generator/evolver ownership (`src/agents/*` vs `src/services/*`).
- Route all model execution through one runtime gateway path.
- Eliminate stale fallback/mock behavior where it conflicts with production mode.

Progress in this branch:
- Removed deprecated `src/agents/agent-evolver.ts`.
- Removed unused duplicate `src/services/agent-generator.ts`.

### Phase 3: Server-Side Session + Training Signals

- Move critical session/lineage/evolution records to backend persistence.
- Keep append-only training events for replay/export.
- Expose explicit API endpoints for session/run/evaluate/iterate.

Progress in this branch:
- Added backend orchestration API endpoints in `backend/adk_runtime/adk_runtime/main.py`.
- Added persistent SQLite backend state in `backend/adk_runtime/adk_runtime/store.py`.
- Added lock/run/evaluate/iterate endpoints for server-side training loops.
- Added frontend orchestration adapter (`src/api/orchestration.ts`) and backend-mode store wiring.

### Phase 4: Cutover

- Run parity tests against baseline flows.
- Switch default runtime to `adk`.
- Remove deprecated direct-runtime code paths.

## Current Branch Deliverables

- `backend/adk_runtime/` scaffolded and runnable.
- Frontend runtime toggle implemented in `src/api/llm.ts`.
- Env and README updated for ADK mode.
- LLM client tests expanded with ADK runtime coverage.
- Deprecated duplicate modules removed as part of phase 2.
- ADK service now includes a stateful orchestration API (phase 3 foundation).
