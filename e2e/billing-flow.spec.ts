import { expect, test } from '@playwright/test';

/**
 * Billing surface — pricing displays in the user's currency, checkout
 * button POSTs and redirects to the URL Stripe returns. We mock the
 * /api/checkout response so we never touch Stripe in tests.
 */
test.describe('Pricing & checkout', () => {
  test('English pricing shows USD', async ({ page }) => {
    await page.goto('/en/pricing');
    await expect(page.getByRole('heading', { level: 1, name: /pricing/i })).toBeVisible();
    // First plan price contains a currency formatted USD.
    await expect(page.getByText(/\$\s*49/)).toBeVisible();
  });

  test('French pricing shows EUR', async ({ page }) => {
    await page.goto('/fr/pricing');
    // 45 € or €45 depending on Intl format.
    await expect(page.getByText(/45.*€|€.*45/)).toBeVisible();
  });

  test('Brazilian Portuguese pricing shows BRL', async ({ page }) => {
    await page.goto('/pt-br/pricing');
    await expect(page.getByText(/R\$\s*249/)).toBeVisible();
  });

  test('Japanese pricing shows JPY', async ({ page }) => {
    await page.goto('/ja/pricing');
    await expect(page.getByText(/¥\s*7\D?300|7,300\s*¥/)).toBeVisible();
  });

  test('checkout button calls /api/checkout and follows the redirect URL', async ({ page }) => {
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    await page.route('**/api/checkout', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'cs_test_123',
          url: '/en/billing/success?session_id=cs_test_123'
        })
      });
    });

    await page.goto('/en/pricing');
    await page.getByRole('button', { name: /choose this plan/i }).first().click();

    await expect(page).toHaveURL(/\/en\/billing\/success/, { timeout: 10_000 });
    await expect(page.getByText(/welcome to lexyflow/i)).toBeVisible();
  });
});
