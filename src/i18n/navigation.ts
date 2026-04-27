import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { NATIVE_LOCALE_CODES } from './locales';

/**
 * Shared-pathname navigation: every route is the same across locales,
 * only the `/[locale]` prefix changes. Keeps the URL graph small and
 * lets the discovery loader add locales without registering routes.
 */
export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation({
    locales: NATIVE_LOCALE_CODES as unknown as string[],
    localePrefix: 'as-needed'
  });
