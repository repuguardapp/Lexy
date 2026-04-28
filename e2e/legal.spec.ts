import { expect, test } from '@playwright/test';

const LEGAL_PAGES = [
  { path: 'privacy',      heading: /privacy policy/i,                en: true },
  { path: 'terms',        heading: /terms of service/i,              en: true },
  { path: 'dpa',          heading: /data processing agreement/i,     en: true },
  { path: 'integrations', heading: /integrations & sub-processors/i, en: true }
];

test.describe('Legal & integrations pages', () => {
  for (const { path, heading } of LEGAL_PAGES) {
    test(`/en/${path} renders`, async ({ page }) => {
      await page.goto(`/en/${path}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  test('integrations page lists all sub-processors', async ({ page }) => {
    await page.goto('/en/integrations');
    for (const name of ['Anthropic', 'OpenAI', 'Supabase', 'Stripe', 'Vercel', 'Resend', 'Sentry']) {
      await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible();
    }
  });

  test('privacy mentions Zero-Knowledge', async ({ page }) => {
    await page.goto('/en/privacy');
    await expect(page.getByText(/zero-knowledge/i).first()).toBeVisible();
  });
});
