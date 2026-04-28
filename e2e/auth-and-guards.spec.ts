import { expect, test } from '@playwright/test';

/**
 * Auth surface + protected-route guards. Without a real Supabase, the
 * dashboard route should redirect unauthenticated users to /login,
 * never expose its content. The login form should POST to
 * /api/auth/magic-link and confirm the "check your inbox" state.
 */
test.describe('Auth & guards', () => {
  test('dashboard redirects unauthenticated visitors to /login', async ({ page }) => {
    const res = await page.goto('/en/dashboard', { waitUntil: 'networkidle' });
    expect(res?.url()).toContain('/login');
  });

  test('login form transitions to "check your inbox" after submit', async ({ page }) => {
    await page.route('**/api/auth/magic-link', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/en/login');
    await page.getByLabel('Email').fill('founder@example.com');
    await page.getByRole('button', { name: /email me a magic link/i }).click();

    await expect(page.getByText(/check your inbox/i)).toBeVisible();
  });
});
