---
name: debugging
description: Systematic debugging of code issues and errors. Use when encountering errors, test failures, runtime exceptions, type errors, or unexpected behavior. Triggers on error messages, stack traces, or when something isn't working as expected.
---

# Systematic Debugging

## Protocol

1. **Gather** - Collect error messages and context
2. **Reproduce** - Confirm steps to trigger issue
3. **Isolate** - Narrow down to specific cause
4. **Hypothesize** - Form theory based on error type
5. **Test** - Try one fix at a time
6. **Verify** - Confirm fix and no regressions

## Quick Commands

```bash
# TypeScript errors
pnpm exec tsc --noEmit

# Lint issues
pnpm lint

# Build errors
pnpm build 2>&1 | head -50

# Recent changes
git diff HEAD~3 --stat
```

## Common Error Patterns

| Error | Likely Cause |
|-------|--------------|
| `TypeError: undefined` | Missing null check, async timing |
| `Module not found` | Import path, missing dep |
| `Type not assignable` | Interface mismatch |
| `Hook rules violation` | Conditional hooks |
| `State not updating` | Mutation vs new object |

See [patterns.md](patterns.md) for detailed debugging examples.

## Verification

After fixing, always verify:

```bash
pnpm build && pnpm lint && pnpm test
```
