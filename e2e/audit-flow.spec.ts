import { expect, test } from '@playwright/test';

/**
 * Audit form happy path. Drives the upload -> tracking -> completed
 * states with /api/audit/async and /api/audit/[id] mocked at the
 * network level. No AI provider, no Supabase. We assert the UI
 * transitions and the final CTA.
 */
test.describe('Audit form', () => {
  test('upload → tracking → completed happy path', async ({ page }) => {
    // Mock the async upload acceptance.
    await page.route('**/api/audit/async', (route) => {
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ auditId: '11111111-1111-1111-1111-111111111111', status: 'pending' })
      });
    });

    // Mock the polling endpoint: pending → running → completed.
    let pollCount = 0;
    await page.route(/\/api\/audit\/[^/]+$/, (route) => {
      pollCount += 1;
      const status = pollCount >= 3 ? 'completed' : 'running';
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          status,
          riskScore: status === 'completed' ? 68 : null,
          findingsCount: status === 'completed' ? 3 : 0,
          language: 'en'
        })
      });
    });

    await page.goto('/en/audit');

    // Fill the form.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Privacy policy\n\nWe collect personal data for marketing purposes ' +
        'and retain it as long as necessary under GDPR Article 6.'
      )
    });
    await page.locator('select[name="frameworks"]').selectOption(['gdpr']);
    await page.locator('input[name="targetLanguage"]').fill('en');

    await page.getByRole('button', { name: /run audit/i }).click();

    // Tracking phase visible.
    await expect(page.getByText(/auditing|queued/i).first()).toBeVisible();

    // Eventually transitions to completed.
    await expect(page.getByText(/audit complete/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/68\/100/)).toBeVisible();
    await expect(page.getByRole('link', { name: /open the report/i })).toBeVisible();
  });

  test('shows error panel when upload returns 429', async ({ page }) => {
    await page.route('**/api/audit/async', (route) => {
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'rate_limited' })
      });
    });

    await page.goto('/en/audit');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Filler content '.repeat(50))
    });
    await page.locator('select[name="frameworks"]').selectOption(['gdpr']);
    await page.getByRole('button', { name: /run audit/i }).click();

    await expect(page.getByText(/audit failed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
  });
});
