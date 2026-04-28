import { expect, test } from '@playwright/test';

test.describe('OpenAPI', () => {
  test('/api/openapi.json returns a 3.1 spec with the expected paths', async ({ request }) => {
    const res = await request.get('/api/openapi.json');
    expect(res.status()).toBe(200);
    expect(res.headers()['access-control-allow-origin']).toBe('*');

    const spec = await res.json();
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(spec.info.title).toBe('LexyFlow API');

    for (const path of [
      '/api/audit',
      '/api/audit/async',
      '/api/audit/{id}',
      '/api/checkout',
      '/api/billing/portal',
      '/api/stripe-webhook',
      '/api/auth/magic-link',
      '/api/auth/callback',
      '/api/auth/signout',
      '/api/onboarding'
    ]) {
      expect(Object.keys(spec.paths)).toContain(path);
    }
  });
});
