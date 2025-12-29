# Playwright Patterns

These are **original** templates intended to be adapted to the repo.

## 1) Clear Persisted State (localStorage/sql.js)

Use this when the app persists to localStorage (and/or sql.js DB snapshots):

```ts
import { test } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  // Clear cookies + localStorage deterministically.
  await context.clearCookies();

  // Must run before any app scripts read localStorage.
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
});
```

Notes:

- If you need finer control, clear only the DB key (e.g., `training-camp-db`).
- If IndexedDB is used, add an IndexedDB clear helper too.

## 2) Assert Outbound Chat-Completions Payload

This prevents “trainer chat works but agent run fails” issues from slipping through.

```ts
import { test, expect } from "@playwright/test";

test("agent execution uses a valid model id", async ({ page }) => {
  let seenModel: string | undefined;

  await page.route("**/v1/chat/completions", async (route) => {
    const req = route.request();
    const body = req.postDataJSON?.() as any;
    seenModel = body?.model;

    // Let the request continue to real backend (integration test)
    await route.continue();
  });

  await page.goto("/");

  // TODO: drive UI to trigger an agent run
  // await page.getByRole('button', { name: 'Run' }).click();

  // Wait until a completion request is observed.
  await expect.poll(() => seenModel, { timeout: 30_000 }).toBeTruthy();

  // Assert is the key: ensure the model matches the environment.
  // For strictness, compare to a known allowlist from config.
  expect(seenModel).not.toMatch(/^claude-sonnet-4-20250514$/);
});
```

Variants:

- If you don’t want to call the real backend, `route.fulfill()` with a deterministic response, but keep the payload assertion.

## 3) Compare Two Code Paths (Split-Brain Test)

A generic structure to catch divergent defaults:

```ts
import { test, expect } from "@playwright/test";

test("trainer chat and agent execution use the same model source", async ({
  page,
}) => {
  const models: string[] = [];

  await page.route("**/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON?.() as any;
    if (body?.model) models.push(String(body.model));
    await route.continue();
  });

  await page.goto("/");

  // 1) Trigger trainer chat
  // TODO: click into trainer UI and send a message.

  // 2) Trigger agent execution
  // TODO: create or load an agent and run it.

  await expect
    .poll(() => models.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);

  const [trainerModel, agentModel] = models;
  expect(trainerModel).toBeTruthy();
  expect(agentModel).toBeTruthy();

  // Either equality, or both in same allowlist.
  expect(agentModel).toBe(trainerModel);
});
```

This single test prevents an entire class of configuration drift.

## 4) Fail Test on Console Errors (with allowlist)

```ts
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    errors.push(String(err));
  });

  // Attach to test result on failure
  test.info().on("testEnd", async () => {
    // no-op placeholder
  });

  // Example: assert late, after actions
  (page as any).__getConsoleErrors = () => errors;
});

test("no console errors", async ({ page }) => {
  await page.goto("/");
  // ... actions ...
  const errors = (page as any).__getConsoleErrors() as string[];
  expect(errors, errors.join("\n")).toEqual([]);
});
```

Tip:

- Add an allowlist for known benign warnings so this doesn’t become noisy.

## 5) Mocking Without Losing Signal

If you must mock the backend:

- Still assert payload correctness.
- Fulfill with realistic shapes and error cases.

```ts
await page.route("**/v1/chat/completions", async (route) => {
  const body = route.request().postDataJSON?.() as any;
  // Assert model/headers/etc here

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "test",
      choices: [{ message: { role: "assistant", content: "ok" } }],
    }),
  });
});
```

## 6) Reset Between Tests (when running dev server)

If your config uses a dev server reused across tests, stale state is a frequent culprit.
Minimum:

- clear localStorage in `addInitScript`
- use unique session names
- avoid relying on previous tests having run
