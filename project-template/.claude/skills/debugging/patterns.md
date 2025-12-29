# Debugging Patterns

## React Component Issues

### Not Rendering

```typescript
// Check 1: Is component called?
console.log("[DEBUG] Render");

// Check 2: Props correct?
console.log("[DEBUG] Props:", props);

// Check 3: Early return?
if (!data) {
  console.log("[DEBUG] No data - returning null");
  return null;
}
```

### State Not Updating

```typescript
// Wrong - mutation
state.items.push(newItem);
setState(state);

// Right - new object
setState({
  ...state,
  items: [...state.items, newItem],
});
```

## API Issues

```typescript
try {
  console.log("[DEBUG] Request:", { url, options });
  const response = await fetch(url, options);
  console.log("[DEBUG] Status:", response.status);

  if (!response.ok) {
    const text = await response.text();
    console.log("[DEBUG] Error body:", text);
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
} catch (error) {
  console.error("[DEBUG] Failed:", error);
  throw error;
}
```

## LLM / Model-Selection Issues

### `Invalid model name passed in model=...`

Symptom:

- Provider returns an error like:
  - `/chat/completions: Invalid model name passed in model=XYZ. Call /v1/models ...`
- Often _one_ chat surface works (e.g., “trainer chat”), while another fails (e.g., “agent execution”).

Why this happens (common root causes):

1. **Hardcoded model IDs** in agent templates/generators differ from the UI-selected/default model.
2. Missing **provider prefix** (e.g., `anthropic/...`, `openai/...`, `azure/...`) expected by the gateway.
3. The model is not enabled for the **current API key** (gateway-specific entitlements).
4. **Multiple code paths** pick models differently ("store default" vs "agent.parameters.model").
5. **Persisted state** (localStorage/sql.js) keeps old agents with stale/invalid model values.

Checklist (do in order):

1. Verify the _actual outgoing request payload_ includes what you think it includes

- In browser devtools, inspect the request body to `/v1/chat/completions` (or your gateway path).
- Confirm:
  - `model` value
  - where it came from: env/default vs agent config

2. Compare working vs failing surfaces

- If “trainer chat” works but “agent run” fails, assume:
  - Trainer uses "current selected model" default.
  - Agent run uses `agent.parameters.model` stamped at generation/evolution time.

3. Search for hardcoded model strings

Use fast repo search for either:

- The exact invalid model string from the error, or
- `parameters: { model:`

The goal is to find where agents are _stamped_ with a model value.

4. Validate available models for the key

- Call `/v1/models` on the same base URL + key used by the app.
- Confirm the expected model ID appears exactly (string match).

5. Confirm env var prefix expectations (Vite)

- In Vite/SPA builds, only `VITE_*` environment variables are exposed to the client.
- If `.env.example` uses non-`VITE_` names, the UI may appear configured but runtime model selection may be falling back unexpectedly.

6. Eliminate persisted-state confusion

- If agents are persisted (localStorage/sql.js), previous runs may keep agents with old model IDs.
- Clear localStorage / reset DB between debugging iterations.

Playwright: make the test catch this class of failure

- Don’t only assert that “a response renders”. Assert the request payload:
  - Intercept `/v1/chat/completions` and check `postDataJSON().model` is one of the IDs from `/v1/models`.
- Reset storage each test:
  - `context.clearCookies()` and `context.addInitScript(() => localStorage.clear())` (or equivalent), so stale agents don’t mask changes.

## TypeScript Issues

```typescript
// Find actual type
type Actual = typeof myVariable;

// Type guard
function isMyType(x: unknown): x is MyType {
  return typeof x === "object" && x !== null && "key" in x;
}

// Narrow carefully
if (isMyType(data)) {
  // data is now MyType
}
```

## Async Issues

```typescript
// Race condition fix
useEffect(() => {
  let cancelled = false;

  async function load() {
    const data = await fetchData();
    if (!cancelled) setData(data);
  }

  load();
  return () => {
    cancelled = true;
  };
}, []);
```

## Logging Best Practices

```typescript
// Use prefixes for filtering
console.log("[DB]", "Query:", sql);
console.log("[API]", "Request:", url);
console.log("[UI]", "Render:", component);

// Remove before commit
// Consider: eslint no-console rule
```

## When Stuck

1. **Simplify** - Minimal reproduction
2. **Compare** - What's different from working code?
3. **Search** - Error message + technology
4. **Explain** - Rubber duck debugging
5. **Break** - Fresh perspective helps

## Cross-Cutting Debugging Meta-Patterns

### Split-Brain Behavior (One Workflow Works, Another Fails)

Symptom:

- Feature A works reliably, feature B fails, even though “they should use the same backend/config”.

Common root causes (reusable across many bug types):

1. **Divergent code paths**: two features call different helper layers, or one passes an explicit option while the other relies on defaults.
2. **Split configuration sources**: env var vs store vs persisted DB vs URL params; one path reads source X, the other reads source Y.
3. **Hardcoded defaults**: generators/templates stamp values at creation time (model IDs, endpoints, flags) that bypass later runtime configuration.
4. **Persisted state masking changes**: localStorage/IndexedDB/sql.js keeps stale objects created earlier; “fixes” won’t apply to existing persisted entities.
5. **Test environment divergence**: Playwright/Vitest might stub network calls or run a fallback code path that never hits real integrations.
6. **Capability gating**: feature flags, permissions, constraints, or tool allowlists differ between the two workflows.

Protocol (do these before deep refactors):

1. **Write down both call graphs** (even rough): UI → store → service → API. Highlight where they diverge.
2. **Inspect the actual runtime inputs** at the edge (network payload, DB write, rendered props). Don’t trust assumptions.
3. **Search for constants**: take a literal from the failure (e.g., a model ID, URL, header name) and repo-search it.
4. **Validate config precedence**: list all possible sources of the setting and confirm which wins.
5. **Reset persistence** and retry (clear localStorage/DB) to eliminate stale entities.
6. **Make tests assert the edge** (e.g., request payload contains expected config), not just that “something rendered”.

This pattern is intentionally generic: it applies to model IDs, API base URLs, feature flags, auth scopes, tool allowlists, schema versions, and more.
