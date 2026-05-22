import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, NATIVE_LOCALE_CODES } from '@/i18n/locales';
import { detectLocale } from '@/lib/locale-detection';

const intlMiddleware = createMiddleware({
  locales: NATIVE_LOCALE_CODES as unknown as string[],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false
});

const COUNTRY_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code'
] as const;

function readCountry(req: NextRequest): string | null {
  for (const header of COUNTRY_HEADERS) {
    const value = req.headers.get(header);
    if (value) return value;
  }
  return null;
}

/**
 * Middleware orchestration:
 *  1. Skip for assets and API.
 *  2. If the URL has no locale, run our detector (Accept-Language + IP country)
 *     and rewrite to `/${locale}${pathname}`.
 *  3. Hand off to next-intl middleware which sets the request locale.
 *  4. Always emit `Content-Language` for SEO and analytics.
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocalePrefix = NATIVE_LOCALE_CODES.some(
    (code) => pathname === `/${code}` || pathname.startsWith(`/${code}/`)
  );

  if (!hasLocalePrefix) {
    const locale = detectLocale({
      acceptLanguage: request.headers.get('accept-language'),
      countryHeader: readCountry(request),
      availableLocales: NATIVE_LOCALE_CODES
    });

    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;

    const response = NextResponse.redirect(url);
    response.headers.set('Content-Language', locale);
    response.cookies.set('NEXT_LOCALE', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax'
    });
    return response;
  }

  const response = intlMiddleware(request);
  const localeFromPath = pathname.split('/')[1] ?? DEFAULT_LOCALE;
  response.headers.set('Content-Language', localeFromPath);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
