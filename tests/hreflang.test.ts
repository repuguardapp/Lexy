import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildHreflangAlternates } from '../src/lib/hreflang';

vi.mock('../src/i18n/locales', async () => {
  const actual = await vi.importActual<typeof import('../src/i18n/locales')>(
    '../src/i18n/locales'
  );
  return {
    ...actual,
    discoverLocales: async () => ['en', 'fr', 'es', 'de', 'pt-br', 'ja']
  };
});

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://compliance.example.com';
});

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
