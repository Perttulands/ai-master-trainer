import { test, expect } from '@playwright/test';

// Capture all console messages
const consoleMessages: { type: string; text: string }[] = [];
const pageErrors: string[] = [];

test.describe('Diagnostic Tests - Investigate Issues', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage
    await page.goto('http://localhost:5173');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('training-camp');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Clear previous messages
    consoleMessages.length = 0;
    pageErrors.length = 0;

    // Capture console messages
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
      if (msg.type() === 'error') {
        console.log(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log(`[PAGE ERROR] ${error.message}`);
    });
  });

  test('diagnose Quick Start flow', async ({ page }) => {
    console.log('\n=== DIAGNOSTIC: Quick Start Flow ===\n');

    // Step 1: Navigate to Quick Start
    await page.goto('http://localhost:5173/quickstart/new');
    await expect(page.getByRole('heading', { name: 'Quick Start' })).toBeVisible();
    console.log('✓ Quick Start page loaded');

    // Step 2: Fill form
    await page.getByLabel('Session Name').fill('Diagnostic Test');
    await page.getByLabel('What do you need?').fill('Write a short poem about testing');
    console.log('✓ Form filled');

    // Step 3: Click Start and capture what happens
    console.log('→ Clicking Start button...');
    const startButton = page.locator('button:has-text("Start")');
    await startButton.click();

    // Wait a moment for processing
    await page.waitForTimeout(3000);

    // Step 4: Check current URL
    const currentUrl = page.url();
    console.log(`→ Current URL: ${currentUrl}`);

    // Step 5: Check what's visible on screen
    const pageContent = await page.textContent('body');
    console.log(`→ Page contains "Loading...": ${pageContent?.includes('Loading...')}`);
    console.log(`→ Page contains "Generating prototype": ${pageContent?.includes('Generating prototype')}`);
    console.log(`→ Page contains "No output yet": ${pageContent?.includes('No output yet')}`);
    console.log(`→ Page contains "Prototype Agent": ${pageContent?.includes('Prototype Agent')}`);

    // Wait more for potential async operations
    await page.waitForTimeout(5000);

    // Check again
    const updatedContent = await page.textContent('body');
    console.log(`\n→ After 5s wait:`);
    console.log(`→ Page contains "Loading...": ${updatedContent?.includes('Loading...')}`);
    console.log(`→ Page contains "No output yet": ${updatedContent?.includes('No output yet')}`);

    // Step 6: Log all console errors
    console.log('\n=== Console Errors ===');
    const errors = consoleMessages.filter(m => m.type === 'error');
    if (errors.length === 0) {
      console.log('No console errors captured');
    } else {
      errors.forEach(e => console.log(`  - ${e.text}`));
    }

    // Step 7: Log page errors
    console.log('\n=== Page Errors ===');
    if (pageErrors.length === 0) {
      console.log('No page errors captured');
    } else {
      pageErrors.forEach(e => console.log(`  - ${e}`));
    }

    // Step 8: Check IndexedDB for session
    const sessionData = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('training-camp');
        request.onsuccess = () => {
          const db = request.result;
          // Just check if DB exists
          resolve({ dbExists: true, objectStores: Array.from(db.objectStoreNames) });
        };
        request.onerror = () => {
          resolve({ dbExists: false, error: request.error?.message });
        };
      });
    });
    console.log('\n=== IndexedDB Status ===');
    console.log(JSON.stringify(sessionData, null, 2));

    // Take a screenshot for visual inspection
    await page.screenshot({ path: 'diagnostic-quickstart.png', fullPage: true });
    console.log('\n✓ Screenshot saved to diagnostic-quickstart.png');
  });

  test('diagnose Training flow', async ({ page }) => {
    console.log('\n=== DIAGNOSTIC: Training Flow ===\n');

    // Step 1: Navigate to New Training
    await page.goto('http://localhost:5173/new');
    await expect(page.locator('text=New Training Session')).toBeVisible();
    console.log('✓ New Training page loaded');

    // Step 2: Fill form
    await page.getByLabel('Session Name').fill('Training Diagnostic');
    await page.getByLabel('What do you need?').fill('Write a haiku about code');
    console.log('✓ Form filled');

    // Step 3: Click Generate Options
    console.log('→ Clicking Generate Options...');
    await page.click('button:has-text("Generate Options")');

    // Wait for strategy dialog
    try {
      await expect(page.locator('text=Strategy Discussion')).toBeVisible({ timeout: 30000 });
      console.log('✓ Strategy Discussion dialog appeared');

      // Confirm strategies
      await page.click('button:has-text("Confirm & Generate")');
      console.log('✓ Confirmed strategies');
    } catch (e) {
      console.log(`✗ Strategy dialog did not appear: ${e}`);
      // Log what's on screen
      const content = await page.textContent('body');
      console.log(`Page content preview: ${content?.substring(0, 500)}`);
    }

    // Wait for navigation
    try {
      await page.waitForURL(/\/session\//, { timeout: 60000 });
      console.log('✓ Navigated to session page');
    } catch (e) {
      console.log(`✗ Did not navigate to session: ${e}`);
      console.log(`Current URL: ${page.url()}`);
    }

    // Wait for content to load
    await page.waitForTimeout(5000);

    // Step 4: Check lineage cards
    const cardCount = await page.locator('[class*="card"]').count();
    console.log(`→ Found ${cardCount} card elements`);

    // Check for artifact content
    const hasNoContent = await page.locator('text=No content yet').count();
    console.log(`→ "No content yet" appears ${hasNoContent} times`);

    const hasContent = await page.locator('[data-testid="artifact-content"], .prose, main p').count();
    console.log(`→ Content areas found: ${hasContent}`);

    // Check for specific lineage labels
    for (const label of ['A', 'B', 'C', 'D']) {
      const found = await page.locator(`span:has-text("${label}")`).first().isVisible().catch(() => false);
      console.log(`→ Lineage ${label} visible: ${found}`);
    }

    // Log console errors
    console.log('\n=== Console Errors ===');
    const errors = consoleMessages.filter(m => m.type === 'error');
    if (errors.length === 0) {
      console.log('No console errors captured');
    } else {
      errors.forEach(e => console.log(`  - ${e.text}`));
    }

    // Log warnings too
    console.log('\n=== Console Warnings ===');
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    if (warnings.length === 0) {
      console.log('No console warnings captured');
    } else {
      warnings.forEach(w => console.log(`  - ${w.text}`));
    }

    // Take screenshot
    await page.screenshot({ path: 'diagnostic-training.png', fullPage: true });
    console.log('\n✓ Screenshot saved to diagnostic-training.png');
  });

  test('check database state directly', async ({ page }) => {
    console.log('\n=== DIAGNOSTIC: Database State ===\n');

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Execute in browser to check sql.js database
    const dbState = await page.evaluate(async () => {
      // Access the app's database through window or module
      // The app uses sql.js which stores in IndexedDB
      return new Promise((resolve) => {
        const request = indexedDB.open('training-camp');
        request.onsuccess = () => {
          const db = request.result;
          const stores = Array.from(db.objectStoreNames);
          resolve({
            success: true,
            stores,
            version: db.version
          });
        };
        request.onerror = () => {
          resolve({
            success: false,
            error: request.error?.message
          });
        };
      });
    });

    console.log('IndexedDB state:', JSON.stringify(dbState, null, 2));
  });

  test('trace agent execution', async ({ page }) => {
    console.log('\n=== DIAGNOSTIC: Agent Execution Trace ===\n');

    // We need to intercept and log what happens during agent execution
    // Add console log interception
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('executeAgent') ||
          text.includes('executeFlow') ||
          text.includes('LLM') ||
          text.includes('Error') ||
          text.includes('error')) {
        console.log(`[APP] ${msg.type()}: ${text}`);
      }
    });

    // Create a Quick Start session to trigger agent execution
    await page.goto('http://localhost:5173/quickstart/new');
    await page.getByLabel('Session Name').fill('Trace Test');
    await page.getByLabel('What do you need?').fill('Say hello');

    console.log('→ Starting agent creation...');
    await page.click('button:has-text("Start")');

    // Wait for execution
    await page.waitForTimeout(10000);

    console.log(`→ Final URL: ${page.url()}`);

    // Check the result
    const pageText = await page.textContent('body');
    if (pageText?.includes('Loading...')) {
      console.log('✗ Still showing Loading...');
    } else if (pageText?.includes('No output yet')) {
      console.log('✗ Shows No output yet - execution produced empty result');
    } else if (pageText?.includes('Prototype Agent')) {
      console.log('✓ Prototype Agent visible');
      // Try to get the output - look for the main content area
      const contentArea = page.locator('main').first();
      const output = await contentArea.textContent();
      // Extract a preview, skipping navigation elements
      const preview = output?.replace(/.*Prototype Agent/s, 'Prototype Agent').substring(0, 300);
      console.log(`→ Output preview: ${preview}`);
    }

    await page.screenshot({ path: 'diagnostic-trace.png', fullPage: true });
    console.log('✓ Screenshot saved to diagnostic-trace.png');
  });
});
