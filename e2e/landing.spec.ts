import { expect, test } from '@playwright/test';

test.describe('Landing & navigation', () => {
  test('redirects / to the locale-prefixed homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(en|fr|es|de|pt-br|ja)\/?$/);
  });

  test('English landing renders the LexyFlow tagline', async ({ page }) => {
    await page.goto('/en', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { level: 1, name: /global compliance, automated/i })
    ).toBeVisible();
    await expect(page.getByText('GDPR', { exact: false })).toBeVisible();
  });

  test('French landing renders the localised accroche', async ({ page }) => {
    await page.goto('/fr');
    await expect(
      page.getByRole('heading', { level: 1, name: /la conformité mondiale, automatisée/i })
    ).toBeVisible();
  });

  test('language selector switches to Japanese without losing the route', async ({ page }) => {
    await page.goto('/en/pricing');
    const select = page.locator('header select');
    await select.selectOption('ja');
    await expect(page).toHaveURL(/\/ja\/pricing/);
  });

  test('hreflang alternates point at every locale on the homepage', async ({ page }) => {
    await page.goto('/en');
    const hrefs = await page.locator('link[rel="alternate"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('hreflang') ?? '')
    );
    for (const code of ['en', 'fr', 'es', 'de', 'pt-br', 'ja', 'x-default']) {
      expect(hrefs).toContain(code);
    }
  });
});
