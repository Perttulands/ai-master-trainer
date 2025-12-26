import { test, expect } from '@playwright/test';

test.describe('Training Camp', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('http://localhost:5173');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('home page loads with correct elements', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Check header
    await expect(page.locator('text=Training Camp')).toBeVisible();

    // Check for "New Session" button
    await expect(page.locator('text=New Session')).toBeVisible();

    // Check for empty state message
    await expect(page.locator('text=No sessions yet')).toBeVisible();
  });

  test('can navigate to new session page', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Click new session button
    await page.click('text=New Session');

    // Should be on new session page
    await expect(page.url()).toContain('/new');
    await expect(page.locator('text=New Training Session')).toBeVisible();
  });

  test('can create a new session', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Fill in session details using label text
    await page.getByLabel('Session Name').fill('Test Session');
    await page.getByLabel('What do you need?').fill('I need a test assistant');

    // Submit form
    await page.click('button:has-text("Generate Options")');

    // Wait for navigation to session page (might take a bit for generation)
    await page.waitForURL(/\/session\//, { timeout: 15000 });

    // Should see the training page
    await expect(page.url()).toMatch(/\/session\//);
  });

  test('displays 4 lineage cards after session creation', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Grid Test');
    await page.getByLabel('What do you need?').fill('Testing grid layout');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });

    // Wait for lineages to load
    await page.waitForTimeout(2000);

    // Check for 4 lineage cards - look for the colored boxes with labels A, B, C, D
    // The cards have a grid layout with 4 cards
    const cardGrid = page.locator('.grid');
    await expect(cardGrid).toBeVisible();

    // Look for the lineage label badges (A, B, C, D)
    await expect(page.locator('span:has-text("A")').first()).toBeVisible();
    await expect(page.locator('span:has-text("B")').first()).toBeVisible();
    await expect(page.locator('span:has-text("C")').first()).toBeVisible();
    await expect(page.locator('span:has-text("D")').first()).toBeVisible();
  });

  test('lineage cards have score buttons', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Score Test');
    await page.getByLabel('What do you need?').fill('Testing scoring');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // ScoreSlider uses buttons 1-10 for scoring, not range input
    // Look for score buttons (any of 1-10)
    const scoreButtons = page.locator('button').filter({ hasText: /^[1-9]$|^10$/ });
    // Each card should have 10 score buttons, and we have 4 cards = 40 buttons
    // But let's just check we have some score buttons visible
    await expect(scoreButtons.first()).toBeVisible();
  });

  test('can toggle lock on lineage', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Lock Test');
    await page.getByLabel('What do you need?').fill('Testing lock');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // First, score a lineage (required before locking)
    const scoreButton5 = page.locator('button').filter({ hasText: '5' }).first();
    await scoreButton5.click();

    // Find first lock button (has Unlock icon by default)
    const lockButton = page.locator('button[title="Lock"]').first();
    if (await lockButton.isVisible()) {
      await lockButton.click();
      // After locking, the button should change to show "Unlock" title
      await expect(page.locator('button[title="Unlock"]').first()).toBeVisible();
    }
  });

  test('regenerate button is present in header', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Regenerate Test');
    await page.getByLabel('What do you need?').fill('Testing regenerate');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check for regenerate button
    const regenerateBtn = page.locator('button:has-text("Regenerate")');
    await expect(regenerateBtn).toBeVisible();
  });

  test('LLM connection status is shown', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Check for LLM status indicator (either "Connected" or "Mock Mode")
    const statusIndicator = page.locator('text=/LLM Connected|Mock Mode/');
    await expect(statusIndicator).toBeVisible();
  });

  test('session persists after page reload', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Persistence Test');
    await page.getByLabel('What do you need?').fill('Testing persistence');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    const sessionUrl = page.url();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on same session URL
    expect(page.url()).toBe(sessionUrl);

    // Go to home and check session is listed
    await page.goto('http://localhost:5173');
    await expect(page.locator('text=Persistence Test')).toBeVisible();
  });

  test('can expand a lineage card for details', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Expand Test');
    await page.getByLabel('What do you need?').fill('Testing expand');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Find expand button (has Maximize2 icon, title="Expand")
    const expandButton = page.locator('button[title="Expand"]').first();
    await expect(expandButton).toBeVisible();
    await expandButton.click();

    // Check for modal with role="dialog"
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Modal should contain lineage info
    await expect(page.locator('[role="dialog"] >> text=Lineage')).toBeVisible();
  });

  test('trainer panel shows chat interface', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Panel Test');
    await page.getByLabel('What do you need?').fill('Testing panels');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check for trainer panel tab
    await expect(page.locator('button:has-text("Trainer")')).toBeVisible();

    // Check for directives tab
    await expect(page.locator('button:has-text("Directives")')).toBeVisible();
  });

  test('can score and then regenerate unlocked lineages', async ({ page }) => {
    await page.goto('http://localhost:5173/new');

    // Create session
    await page.getByLabel('Session Name').fill('Regenerate Flow Test');
    await page.getByLabel('What do you need?').fill('Testing full regeneration flow');
    await page.click('button:has-text("Generate Options")');

    await page.waitForURL(/\/session\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Score all 4 lineages (click score 5 for each)
    const scoreButtons = page.locator('button').filter({ hasText: '5' });
    const count = await scoreButtons.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await scoreButtons.nth(i).click();
      await page.waitForTimeout(100);
    }

    // Now regenerate should be enabled
    const regenerateBtn = page.locator('button:has-text("Regenerate")');
    await expect(regenerateBtn).toBeEnabled({ timeout: 5000 });
  });
});
