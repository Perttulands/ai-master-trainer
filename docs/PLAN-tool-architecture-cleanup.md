# Plan: Tool Architecture Cleanup

## Executive Summary

Training Camp's tool system is fundamentally broken and must be redesigned. The current implementation has:

1. **Fake tools** - LLM-wrapper "tools" that just make additional API calls with different prompts
2. **Arbitrary assignment** - Tools hardcoded per strategy (B gets markdown, C gets brainstorm, D gets analyze)
3. **No actual execution** - Direct execution mode bypasses tools entirely
4. **Unfair comparison** - Agents can't be meaningfully compared when tool access differs

**Decision**: Remove fake tools now. Design real tool support as a separate feature.

---

## Current State Analysis

### What Tools Exist Today

```typescript
// src/agents/agent-generator.ts - STRATEGY_CONFIGS

A: { tools: [] }  // Concise - no tools
B: { tools: [format_markdown] }  // Detailed
C: { tools: [brainstorm] }  // Creative
D: { tools: [analyze_data, knowledge_query] }  // Analytical
E-H: { tools: [] }  // No tools
```

### What These Tools Actually Do

From `src/services/tools/builtin.ts`:

| Tool              | Reality                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `format_markdown` | Makes an LLM call with "format as markdown" system prompt         |
| `brainstorm`      | Makes an LLM call with "generate creative ideas" system prompt    |
| `analyze_data`    | Makes an LLM call with "analyze this data" system prompt          |
| `knowledge_query` | Makes an LLM call with "answer from your knowledge" system prompt |

**These are not tools. They're prompt templates masquerading as tools.**

### Why This Is Broken

1. **Direct execution bypasses tools** - After our fix, agents use `executeSinglePromptDirect()` which never invokes tools
2. **Even flow execution was broken** - The demo flow had hardcoded prompts that ignored user input
3. **Comparison is meaningless** - Agent B with `format_markdown` vs Agent A without isn't a fair test of strategies
4. **Training signal pollution** - Tool "usage" appears in spans but provides no real differentiation signal

---

## The Fix: Remove Fake Tools

### Phase 1: Immediate Cleanup (This PR)

**Goal**: All agents start with empty tools. Differentiation comes from system prompts and temperature only.

#### Files to Modify

**1. `src/agents/agent-generator.ts`**

Remove all tool definitions from `STRATEGY_CONFIGS`:

```typescript
// BEFORE
const STRATEGY_CONFIGS: Record<LineageLabel, {
  tag: string;
  description: string;
  style: string;
  temperature: number;
  tools: AgentTool[];  // ← Remove this
}> = {
  A: { ..., tools: [] },
  B: { ..., tools: [format_markdown_tool] },  // ← Remove
  C: { ..., tools: [brainstorm_tool] },       // ← Remove
  D: { ..., tools: [analyze_data, knowledge_query] },  // ← Remove
  ...
};

// AFTER
const STRATEGY_CONFIGS: Record<LineageLabel, {
  tag: string;
  description: string;
  style: string;
  temperature: number;
}> = {
  A: { tag: 'Concise', description: '...', style: '...', temperature: 0.3 },
  B: { tag: 'Detailed', description: '...', style: '...', temperature: 0.5 },
  C: { tag: 'Creative', description: '...', style: '...', temperature: 0.9 },
  D: { tag: 'Analytical', description: '...', style: '...', temperature: 0.4 },
  // E-H same pattern
};
```

Update all agent creation functions to set `tools: []`:

- `generateAgentFromCustomStrategy()` - line ~270
- `generateAgentForLabel()` - line ~342
- `generateFallbackAgent()` - line ~413
- `generateAgent()` - line ~505

**2. `src/types/agent.ts`**

Keep `tools` field in `AgentDefinition` for future use, but document it:

```typescript
interface AgentDefinition {
  // ...
  /**
   * Tools available to this agent.
   * Currently unused - all agents execute in direct mode.
   * Reserved for future tool support implementation.
   */
  tools: AgentTool[];
  // ...
}
```

**3. Update fallback system prompts**

Remove "Use available tools when appropriate" from generated prompts since there are no tools:

```typescript
// BEFORE
`Guidelines:
- Follow the user's instructions carefully
- Maintain your ${config.tag.toLowerCase()} style consistently
- Provide accurate and helpful responses
- Use available tools when appropriate${constraintNote}`
// AFTER
`Guidelines:
- Follow the user's instructions carefully
- Maintain your ${config.tag.toLowerCase()} style consistently
- Provide accurate and helpful responses${constraintNote}`;
```

---

### Phase 2: Documentation Update (This PR)

**1. Update `CLAUDE.md`**

Add section on no-mock philosophy and tool architecture status.

**2. Update `docs/ARCHITECTURE.md`**

- Remove references to current builtin tools as working features
- Add "Future: Tool Support" section explaining the design
- Document that agents currently use direct execution only

**3. Update `docs/SPEC-agent-evolution.md`**

- Remove tool evolution from the evolution pipeline description
- Note that tool support is deferred

---

### Phase 3: Future Tool Support (Separate Epic)

When we're ready to add real tools, here's the design:

#### Browser-Compatible Tools (Can Implement)

| Tool            | Implementation            | Notes                         |
| --------------- | ------------------------- | ----------------------------- |
| `calculate`     | Math.js or custom parser  | Already exists, deterministic |
| `format_json`   | `JSON.stringify(_, _, 2)` | Deterministic                 |
| `format_table`  | Array → markdown table    | Deterministic                 |
| `parse_csv`     | Papa Parse library        | Deterministic                 |
| `regex_extract` | Native RegExp             | Deterministic                 |
| `word_count`    | String split/count        | Deterministic                 |

#### Requires Backend (Future)

| Tool             | Why Backend Needed          |
| ---------------- | --------------------------- |
| `web_search`     | CORS, API keys              |
| `fetch_url`      | CORS restrictions           |
| `run_code`       | Security sandbox            |
| `file_generate`  | Heavy libraries (PPTX, PDF) |
| `database_query` | Connection security         |

#### Tool Assignment Strategy (Future)

When tools are implemented:

1. **Session-scoped** - User selects tools when creating session
2. **Equal access** - All lineages get the same tools
3. **Differentiation via usage** - Agents differ in HOW they use tools, not WHICH tools they have

---

## Implementation Checklist

### Immediate (This PR)

- [ ] Remove `tools` property from `STRATEGY_CONFIGS` in `src/agents/agent-generator.ts`
- [ ] Remove `tools` property from `STRATEGY_CONFIGS` in `src/utils/demoAgent.ts`
- [ ] Delete `src/agents/mock-trainer.ts`
- [ ] Replace `getDefaultDemoFlow` with `getDirectExecutionFlow` in `src/utils/flowLayout.ts`
- [ ] Update `src/components/infrastructure/FlowchartView.tsx` to use `getDirectExecutionFlow`
- [ ] Remove `AgentTool` imports where no longer needed
- [ ] Set `tools: []` in all agent generation functions
- [ ] Remove "Use available tools" from fallback prompts
- [ ] Update `CLAUDE.md` with no-mock philosophy
- [ ] Update `ARCHITECTURE.md` with tool status
- [ ] Run tests to verify no breakage

### Verification

After implementation:

```bash
# Should pass
pnpm build
pnpm test

# Grep for orphaned tool references
grep -r "tools:" src/agents/
# Should only show `tools: []`
```

### What NOT to Do

- ❌ Don't remove the `tools` field from `AgentDefinition` type
- ❌ Don't delete `src/services/tools/` - may be useful later
- ❌ Don't remove tool handling from flow executor - keep for future
- ❌ Don't create "mock" replacements for removed tools

---

## Key Code References

| File                                                   | Lines              | Purpose                                      |
| ------------------------------------------------------ | ------------------ | -------------------------------------------- |
| [agent-generator.ts](../src/agents/agent-generator.ts) | 9-140              | `STRATEGY_CONFIGS` with tool definitions     |
| [agent-generator.ts](../src/agents/agent-generator.ts) | 270, 342, 413, 505 | Tool assignment in generation functions      |
| [builtin.ts](../src/services/tools/builtin.ts)         | \*                 | Fake LLM-wrapper tools                       |
| [agent-executor.ts](../src/services/agent-executor.ts) | 271-330            | `executeSinglePromptDirect` (bypasses tools) |
| [types/agent.ts](../src/types/agent.ts)                | \*                 | `AgentTool` and `AgentDefinition` types      |

---

## Rationale

### Why Remove Now vs Fix Later

1. **Broken tools are worse than no tools** - They add noise to training signal
2. **Unfair comparison** - Random tool assignment defeats the purpose of A/B testing
3. **Technical debt** - Fake tools require maintenance for zero benefit
4. **Clean foundation** - Better to build real tool support on clean architecture

### Why Not Just Mock Better

Mocks are never the answer for production features:

- They create false confidence
- They don't surface real integration issues
- They pollute the training data
- They make debugging harder

If a feature doesn't work, it should fail clearly - not pretend to work.
