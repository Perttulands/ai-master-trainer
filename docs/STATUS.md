# Training Camp - Status

Last updated: December 2024

## System State

**LLM is required** - No fallback or mock modes. Configure:
```bash
VITE_LITELLM_API_BASE=https://your-litellm-endpoint
VITE_LITELLM_API_KEY=your-api-key
```

**Everything is real:**
- Agent execution via LLM
- Evolution pipeline (reward analysis, credit assignment, planning, evolution)
- Built-in tools (LLM-powered except `calculate` which is deterministic)
- Training signal recording
- Database persistence (sql.js → localStorage)

**Quick Start removed** - Single onboarding path via Training mode with dynamic agent count (1-8).

**Tool types** - Only `builtin` supported. `function` and `api` types removed.

## Recent Fixes

| Area | Fix |
|------|-----|
| Security | Flow conditions use `safeExpressionEvaluator` instead of `new Function()` |
| Correctness | Flow success logic: `success = !lastError` (errors now correctly fail) |
| Data integrity | Training signal hash is deterministic (removed timestamp from hash) |
| Persistence | Database save uses chunked Base64 conversion (fixed stack overflow) |
| UI | Error states displayed instead of "No output yet" |

## Known Issues

| Issue | Impact | Notes |
|-------|--------|-------|
| `lineageId` optional in AgentDefinition | Training signal integrity | Spec says required |
| Multiple evolver implementations | Confusion | `services/agent-evolver.ts` vs deprecated `agents/agent-evolver.ts` |
| Evolution planner proposes unapplied changes | Learning history pollution | Tool/flow changes planned but skipped |
| Bundle size 1.15MB | Performance | Exceeds 500KB recommended; needs code-splitting |

## Future Considerations

**Master Trainer as UI Operator** - Proposed feature to let Master Trainer propose and execute UI actions (grades, comments, directives) with user confirmation. Not yet implemented.

**Model preservation during evolution** - Audit needed to verify evolved agents inherit correct model from parent or store.
