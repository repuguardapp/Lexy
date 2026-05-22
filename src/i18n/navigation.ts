import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { NATIVE_LOCALE_CODES } from './locales';

/**
 * Shared-pathname navigation: every route is the same across locales,
 * only the `/[locale]` prefix changes. Keeps the URL graph small and
 * lets the discovery loader add locales without registering routes.
 *
 * `localePrefix: 'always'` — every locale, INCLUDING the default
 * English, gets a `/<locale>/` URL prefix. We dropped `'as-needed'`
 * because it created an unservable English: with English as the
 * default + as-needed prefix, clicking "English" in the language
 * selector emits `/pricing` (no prefix), the middleware sees a
 * prefix-less URL, runs locale detection on the request headers,
 * and rewrites back to the visitor's prior locale — i.e. the user
 * could never actually leave French / Arabic / etc. to view English.
 */
export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation({
    locales: NATIVE_LOCALE_CODES as unknown as string[],
    localePrefix: 'always'
  });
