---
name: playwright-testing
description: End-to-end testing with Playwright for Vite/React apps. Focuses on catching real integration failures (config drift, hardcoded defaults, mocks masking bugs, persisted-state bleed), and asserting on network payloads and critical invariants.
---

# Playwright Testing (E2E) — Skill

## Goal

Use Playwright to catch failures that unit tests and “happy path UI assertions” miss:

- Misconfigured integrations (model IDs, base URLs, auth headers)
- Divergent code paths (“trainer chat works, agent run fails”)
- Persisted-state interference (localStorage/sql.js)
- Mocking/stubbing that hides real production behavior

This skill is intentionally **edge-focused**: assert on what leaves the browser and what gets persisted.

## Core Principles

1. **Assert at the edges, not just the UI**

- Verify outbound requests (URL + headers + payload) and inbound responses.
- UI assertions alone can pass while integration is broken.

2. **Reset state between tests**

- If the app persists to localStorage/IndexedDB/sql.js, always clear it.
- A passing test suite with state bleed is not trustworthy.

3. **Prove which configuration source is used**

- When there are env/store/DB defaults, intercept the request to validate the resolved value.

4. **Test the failure mode deliberately**

- A good E2E suite includes one “bad config” test that asserts the app shows a useful error.

5. **Prefer deterministic fixtures**

- If you must mock, mock at the boundary and assert payload correctness.
- Avoid mocking so high up that you never exercise the real path.

## Minimal E2E Coverage Checklist (for this repo shape)

### Session / Navigation

- Create session (Quick Start)
- Create session (Training)
- Navigate to session pages

### Execution

- Master Trainer chat executes one completion request
- Agent execution executes one completion request
- Failure is visible when completion returns error

### Evolution Loop (lightweight)

- Score an artifact
- Trigger evolution pipeline step
- Confirm an evolution record is created (or at least UI shows “evolved”)

### Persistence

- Refresh page retains sessions/lineages
- Optional: export path produces a file/JSON

## Standard Setup (Template)

### Test isolation

- Clear storage **before** navigation.
- Avoid shared state across tests.

Recommended pattern:

- In `beforeEach`, clear storage.
- In `afterEach`, optionally collect console/network logs on failure.

## Required Network Assertions (the big lesson)

When an operation depends on configuration (model IDs, API base URL, tool allowlist, etc), add an explicit assertion:

- Intercept `**/v1/chat/completions` and assert:
  - `postDataJSON().model` is present and expected
  - the base URL is correct
  - the auth header exists (when required)

Also intercept `**/v1/models` when debugging “invalid model” issues.

## Anti-Patterns (avoid these)

- Asserting only that “some text appears” after clicking Run.
- Mocking fetch globally without checking payload correctness.
- Not clearing storage between tests.
- Running E2E against a different API base than production.
- Letting tests fall back to “simulated outputs” without noticing.

## Debugging Helpers

- Capture console errors:
  - fail test if `pageerror` or console error occurs (unless explicitly allowed).
- Capture request/response bodies for failing calls.

See `patterns.md` for copy/paste snippets.
