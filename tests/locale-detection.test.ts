import { describe, expect, it } from 'vitest';
import { detectLocale } from '../src/lib/locale-detection';
import { NATIVE_LOCALE_CODES, NATIVE_LOCALES, getLocaleDescriptor } from '../src/i18n/locales';

const available = NATIVE_LOCALE_CODES;

describe('detectLocale', () => {
  it('matches an exact tag', () => {
    expect(
      detectLocale({ acceptLanguage: 'fr-FR,fr;q=0.9', availableLocales: available })
    ).toBe('fr');
  });

  it('falls back to primary subtag when region differs (pt → pt-br)', () => {
    expect(
      detectLocale({ acceptLanguage: 'pt-PT,pt;q=0.9', availableLocales: available })
    ).toBe('pt-br');
  });

  it('uses geo-IP country when Accept-Language is empty', () => {
    expect(
      detectLocale({ acceptLanguage: null, countryHeader: 'JP', availableLocales: available })
    ).toBe('ja');
  });

  it('honors q-weights', () => {
    expect(
      detectLocale({
        acceptLanguage: 'en;q=0.2, ja;q=0.9, fr;q=0.5',
        availableLocales: available
      })
    ).toBe('ja');
  });

  it('falls back to default when nothing matches', () => {
    expect(
      detectLocale({
        acceptLanguage: 'sw-KE,sw;q=0.9',
        countryHeader: 'KE',
        availableLocales: available
      })
    ).toBe('en');
  });
});

describe('Arabic locale descriptor', () => {
  it('exposes ar with rtl direction', () => {
    const ar = NATIVE_LOCALES.find((l) => l.code === 'ar');
    expect(ar).toBeDefined();
    expect(ar?.direction).toBe('rtl');
  });

  it('routes GCC countries to ar', () => {
    for (const cc of ['SA', 'AE', 'QA', 'BH', 'KW', 'OM']) {
      expect(detectLocale({ acceptLanguage: null, countryHeader: cc, availableLocales: available })).toBe('ar');
    }
  });

  it('infers rtl direction from script subtag for unknown locales', () => {
    expect(getLocaleDescriptor('fa-IR').direction).toBe('ltr');
    expect(getLocaleDescriptor('ur-arab').direction).toBe('rtl');
  });
});
