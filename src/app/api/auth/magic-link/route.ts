import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().max(254),
  locale: z.string().min(2).max(10).default('en')
});

export async function POST(request: Request) {
  // Tight per-IP cap to thwart enumeration / mailbomb attempts.
  const ip = clientIpFrom(request.headers);
  const limit = rateLimit({ key: `auth:magic:${ip}`, windowMs: 60 * 60 * 1000, max: 10 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }

  // Hard-fail when the email pipeline is misconfigured server-side.
  // The 503 lets the client render a "service temporarily unavailable"
  // banner instead of a hopeful "check your inbox" — closes the "user
  // waits in the void" failure mode the CEO flagged. These checks are
  // cheap and never leak enumeration data (they're identical for every
  // email).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[auth/magic-link] supabase_env_missing');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('[auth/magic-link] resend_env_missing');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: body.email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?next=/${body.locale}/dashboard`,
      shouldCreateUser: true,
      // Stamp the locale in the user's metadata so the email hook can
      // render the magic-link mail in the user's language on the very
      // first request — without this, a fresh French signup gets the
      // English fallback because metadata is empty until they finish
      // onboarding.
      data: { locale: body.locale }
    }
  });

  if (error) {
    // Do NOT leak Supabase's error verbatim — that would let an attacker
    // distinguish "email exists" vs "email valid". Always 200, log the
    // detail for ops triage.
    console.error('[auth/magic-link] otp_send_failed', error.message);
  } else {
    console.log('[auth/magic-link] otp_send_queued');
  }

  // Always 200 with a generic body so the client UI can show a uniform
  // "check your inbox" regardless of whether the email is registered.
  return NextResponse.json({ ok: true });
}
