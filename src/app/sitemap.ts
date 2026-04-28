import type { MetadataRoute } from 'next';
import { discoverLocales } from '@/i18n/locales.server';

/**
 * Multilingual sitemap. Each canonical path is emitted once with an
 * `alternates.languages` map. Search engines pick the right URL per market.
 */
const ROUTES = ['', '/pricing', '/audit', '/docs'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://example.com';
  const locales = await discoverLocales();
  const now = new Date();

  return ROUTES.flatMap((path) =>
    locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: now,
      alternates: {
        languages: Object.fromEntries(
          locales.map((alt) => [alt, `${base}/${alt}${path}`])
        )
      }
    }))
  );
}
