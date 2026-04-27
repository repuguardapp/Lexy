/**
 * Locale registry.
 *
 * The 6 native-supported locales below get a fully designed UI and a curated
 * dictionary in `messages/`. Any additional locale is supported dynamically by
 * the Multi-Pass engine without code changes — drop a `<bcp47>.json` file in
 * `messages/` and the loader will pick it up at runtime.
 *
 * `nativeLocales` therefore stays small and stable, while `discoverLocales()`
 * walks the messages directory at request time.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type LocaleCode =
  | 'en'
  | 'fr'
  | 'es'
  | 'de'
  | 'pt-br'
  | 'ja';

export interface LocaleDescriptor {
  code: string;
  /** Human-readable name in the locale's own language. */
  endonym: string;
  /** ISO-3166-1 region used to bias currency / legal framework. */
  region: string;
  direction: 'ltr' | 'rtl';
  /** Default ISO-4217 currency for Stripe checkout. */
  currency: 'USD' | 'EUR' | 'BRL' | 'JPY' | 'GBP';
  /** Stripe Checkout `locale` param (subset of supported codes). */
  stripeLocale: string;
}

export const NATIVE_LOCALES: readonly LocaleDescriptor[] = [
  { code: 'en',    endonym: 'English',    region: 'US', direction: 'ltr', currency: 'USD', stripeLocale: 'en' },
  { code: 'fr',    endonym: 'Français',   region: 'FR', direction: 'ltr', currency: 'EUR', stripeLocale: 'fr' },
  { code: 'es',    endonym: 'Español',    region: 'ES', direction: 'ltr', currency: 'EUR', stripeLocale: 'es' },
  { code: 'de',    endonym: 'Deutsch',    region: 'DE', direction: 'ltr', currency: 'EUR', stripeLocale: 'de' },
  { code: 'pt-br', endonym: 'Português',  region: 'BR', direction: 'ltr', currency: 'BRL', stripeLocale: 'pt-BR' },
  { code: 'ja',    endonym: '日本語',      region: 'JP', direction: 'ltr', currency: 'JPY', stripeLocale: 'ja' }
];

export const NATIVE_LOCALE_CODES = NATIVE_LOCALES.map((l) => l.code);
export const DEFAULT_LOCALE: LocaleCode = 'en';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');

/**
 * Walk `messages/` and return the codes of every dictionary present.
 * Adding `ar.json` ships Arabic to production with no source change.
 */
export async function discoverLocales(): Promise<string[]> {
  try {
    const entries = await fs.readdir(MESSAGES_DIR);
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '').toLowerCase());
  } catch {
    return [...NATIVE_LOCALE_CODES];
  }
}

export function getLocaleDescriptor(code: string): LocaleDescriptor {
  const normalized = code.toLowerCase();
  const known = NATIVE_LOCALES.find((l) => l.code === normalized);
  if (known) return known;

  // Dynamic locale fallback — direction inferred from BCP-47 script subtags.
  const rtlScripts = /-(arab|hebr|thaa|nkoo)\b/i;
  return {
    code: normalized,
    endonym: normalized,
    region: 'US',
    direction: rtlScripts.test(normalized) ? 'rtl' : 'ltr',
    currency: 'USD',
    stripeLocale: 'auto'
  };
}

export function isNativeLocale(code: string): code is LocaleCode {
  return (NATIVE_LOCALE_CODES as readonly string[]).includes(code.toLowerCase());
}
