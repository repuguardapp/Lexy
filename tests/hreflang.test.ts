import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n/locales.server', () => ({
  discoverLocales: async () => ['en', 'fr', 'es', 'de', 'pt-br', 'ja']
}));
vi.mock('server-only', () => ({}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://compliance.example.com';
});

const { buildHreflangAlternates } = await import('../src/lib/hreflang');

describe('buildHreflangAlternates', () => {
  it('emits one entry per locale plus x-default', async () => {
    const alts = await buildHreflangAlternates('/pricing');
    expect(Object.keys(alts).sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'ja', 'pt-br', 'x-default'].sort()
    );
    expect(alts['fr']).toBe('https://compliance.example.com/fr/pricing');
    expect(alts['x-default']).toContain('/en/pricing');
  });

  it('handles root path correctly', async () => {
    const alts = await buildHreflangAlternates('/');
    expect(alts['ja']).toBe('https://compliance.example.com/ja');
  });
});
