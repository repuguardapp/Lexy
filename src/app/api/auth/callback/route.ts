import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Magic-link landing endpoint.
 *
 * Supabase redirects the user here with `?code=…` (PKCE flow) or
 * `?token_hash=…&type=email` (legacy). We exchange whichever we received
 * for a session cookie and redirect to `next` (default: `/`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/';

  const supabase = createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectToLogin(url, 'exchange_failed');
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'email' | 'recovery' | 'invite' | 'signup' | 'magiclink'
    });
    if (error) return redirectToLogin(url, 'verify_failed');
  } else {
    return redirectToLogin(url, 'missing_token');
  }

  // Sanitize `next` — must be a same-origin relative path.
  const safeNext = /^\/[^/]/.test(next) ? next : '/';
  return NextResponse.redirect(new URL(safeNext, url.origin));
}

function redirectToLogin(url: URL, reason: string) {
  const dest = new URL('/en/login', url.origin);
  dest.searchParams.set('error', reason);
  return NextResponse.redirect(dest);
}
