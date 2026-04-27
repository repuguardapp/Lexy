import { DEFAULT_LOCALE, discoverLocales } from '@/i18n/locales';

/**
 * Build the `<link rel="alternate" hreflang>` map for a given pathname.
 *
 * Accepts a path WITHOUT locale prefix (`/`, `/pricing`, `/docs/audit-engine`)
 * and returns an object accepted by Next.js's `metadata.alternates.languages`.
 * `x-default` points at the default locale so search engines have a safe
 * landing page when none of the user's preferred languages are available.
 */
export async function buildHreflangAlternates(
  pathWithoutLocale: string
): Promise<Record<string, string>> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const cleanPath =
    pathWithoutLocale === '/' ? '' : pathWithoutLocale.replace(/^\/+/, '/');

  const locales = await discoverLocales();
  const alternates: Record<string, string> = {};

  for (const locale of locales) {
    alternates[locale] = `${base}/${locale}${cleanPath}`;
  }
  alternates['x-default'] = `${base}/${DEFAULT_LOCALE}${cleanPath}`;
  return alternates;
}
