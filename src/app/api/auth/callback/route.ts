import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Magic-link landing endpoint.
 *
 * Supabase redirects the user here with `?code=…` (PKCE flow) or
 * `?token_hash=…&type=email` (legacy). We exchange whichever we
 * received for a session cookie and 303-redirect to `next`.
 *
 * Why this route does NOT use `createSupabaseServerClient` from
 * lib/supabase-server.ts:
 *   The shared helper reads cookies from `cookies()` (next/headers).
 *   In a Route Handler, `cookies().set()` mutates an in-request
 *   cookie jar that's supposed to attach to the outgoing response
 *   — but it does NOT carry across when you construct a *new*
 *   NextResponse with `NextResponse.redirect(...)`. The cookie is
 *   set on the route's implicit response and then thrown away when
 *   we return the explicit redirect response. The browser walks
 *   away from the callback without a session cookie, the dashboard
 *   render sees no user, and Next.js redirects back to /login —
 *   producing the "magic link drops me at the login page" loop.
 *
 * The fix is to attach the cookies directly to the redirect
 * response object before returning it. We build the response up
 * front and pass its mutator into the Supabase server client.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/';

  // Build the destination redirect up front. Cookies set during
  // exchangeCodeForSession will be attached to THIS response.
  const safeNext = /^\/[^/]/.test(next) ? next : '/';
  const response = NextResponse.redirect(new URL(safeNext, url.origin));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return redirectToLogin(url, 'env_not_configured');
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options, maxAge: 0 });
      }
    }
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed', error.message);
      return redirectToLogin(url, 'exchange_failed');
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'email' | 'recovery' | 'invite' | 'signup' | 'magiclink'
    });
    if (error) {
      console.error('[auth/callback] verifyOtp failed', error.message);
      return redirectToLogin(url, 'verify_failed');
    }
  } else {
    return redirectToLogin(url, 'missing_token');
  }

  console.log('[auth/callback] session established', { redirectTo: safeNext });
  return response;
}

function redirectToLogin(url: URL, reason: string) {
  // Try to pull the locale from the original `next` so the user lands
  // on /fr/login instead of bouncing to /en/login mid-flow.
  const next = url.searchParams.get('next') ?? '';
  const localeMatch = next.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
  const locale = localeMatch?.[1] ?? 'en';
  const dest = new URL(`/${locale}/login`, url.origin);
  dest.searchParams.set('error', reason);
  return NextResponse.redirect(dest);
}
