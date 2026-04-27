import { DEFAULT_LOCALE, NATIVE_LOCALES, type LocaleDescriptor } from '@/i18n/locales';

/**
 * Maps an ISO-3166-1 alpha-2 country code to its preferred native locale.
 * Anything not listed here falls back to `Accept-Language` parsing.
 */
const COUNTRY_TO_LOCALE: Record<string, string> = {
  // English
  US: 'en', GB: 'en', IE: 'en', AU: 'en', NZ: 'en', CA: 'en', SG: 'en', IN: 'en',
  // French
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', CH: 'fr',
  // Spanish
  ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', UY: 'es',
  // German
  DE: 'de', AT: 'de', LI: 'de',
  // Portuguese (Brazil)
  BR: 'pt-br',
  // Japanese
  JP: 'ja'
};

interface LanguageRange {
  tag: string;
  q: number;
}

function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.split('=')[1] ?? '1') : 1;
      return { tag: (tag ?? '').toLowerCase().trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((r) => r.tag.length > 0)
    .sort((a, b) => b.q - a.q);
}

/**
 * Best-effort match of a BCP-47 tag against the configured locales.
 * Strategy: exact → primary subtag → primary subtag with region (e.g. `pt` → `pt-br`).
 */
function matchLocale(tag: string, available: readonly LocaleDescriptor[]): string | null {
  const normalized = tag.toLowerCase();
  const direct = available.find((l) => l.code === normalized);
  if (direct) return direct.code;

  const primary = normalized.split('-')[0] ?? normalized;
  const primaryHit = available.find((l) => l.code === primary || l.code.startsWith(`${primary}-`));
  return primaryHit?.code ?? null;
}

interface DetectArgs {
  acceptLanguage?: string | null;
  /** Country header set by Vercel/Cloudflare/Fastly. */
  countryHeader?: string | null;
  /** Locales we will actually serve (includes dynamically discovered ones). */
  availableLocales?: readonly string[];
}

/**
 * Decide which locale to serve when the URL has none.
 * Order: Accept-Language → country (geo-IP) → DEFAULT_LOCALE.
 */
export function detectLocale({
  acceptLanguage,
  countryHeader,
  availableLocales
}: DetectArgs): string {
  const native = NATIVE_LOCALES;
  const known = new Set(availableLocales ?? native.map((l) => l.code));

  for (const range of parseAcceptLanguage(acceptLanguage)) {
    const match = matchLocale(range.tag, native);
    if (match && known.has(match)) return match;
  }

  if (countryHeader) {
    const byCountry = COUNTRY_TO_LOCALE[countryHeader.toUpperCase()];
    if (byCountry && known.has(byCountry)) return byCountry;
  }

  return DEFAULT_LOCALE;
}
