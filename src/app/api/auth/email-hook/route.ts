import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMagicLinkEmail } from '@/lib/email';

/**
 * Supabase "Send Email Hook" — Standard Webhook spec.
 *
 * Wiring: Supabase Studio → Authentication → Email Templates → Send Email
 * Hook → enable → URL = https://lexyflow.com/api/auth/email-hook,
 * secret = SUPABASE_AUTH_HOOK_SECRET. Supabase signs every request with
 * an HMAC-SHA256 over the raw body and posts headers compliant with the
 * Standard Webhooks spec (webhook-id, webhook-timestamp, webhook-signature).
 *
 * Behaviour: only `magiclink` and `signup` action types are handled. All
 * others fall through to Supabase's default sender by returning 200 with
 * { send_email: true } (Supabase keeps default behaviour when we don't
 * explicitly opt out).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HookPayload = z.object({
  user: z.object({
    email: z.string().email(),
    user_metadata: z.record(z.unknown()).optional()
  }),
  email_data: z.object({
    token: z.string().optional(),
    token_hash: z.string().optional(),
    redirect_to: z.string().optional(),
    email_action_type: z.string(),
    site_url: z.string().optional(),
    new_email: z.string().email().optional()
  })
});

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'hook_not_configured' }, { status: 500 });
  }

  const rawBody = await request.text();

  if (!verifyStandardWebhook(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: z.infer<typeof HookPayload>;
  try {
    payload = HookPayload.parse(JSON.parse(rawBody));
  } catch (err) {
    return NextResponse.json({ error: 'invalid_payload', detail: String(err) }, { status: 400 });
  }

  const action = payload.email_data.email_action_type;
  if (action !== 'magiclink' && action !== 'signup' && action !== 'invite') {
    // Defer to Supabase's default sender for password-recovery, email-
    // change confirmation, etc. Returning 200 means "no override".
    return NextResponse.json({ ok: true, handled: false });
  }

  const link = buildVerifyLink(payload.email_data);
  const locale = (payload.user.user_metadata?.['locale'] as string | undefined) ?? 'en';

  await sendMagicLinkEmail({ to: payload.user.email, link, locale });

  // Tell Supabase NOT to send its default email — we just sent ours.
  return NextResponse.json({ ok: true, handled: true });
}

/**
 * Standard Webhooks signature check — see <https://www.standardwebhooks.com>.
 *
 * The signature header looks like `v1,base64==[ v1,base64== ...]` where
 * each value is `HMAC-SHA256(secret, "${id}.${timestamp}.${body}")`.
 *
 * We accept any of the listed signatures — Supabase rotates by appending,
 * never replacing. We also enforce a 5-minute timestamp window to make
 * replay attacks bounded.
 */
function verifyStandardWebhook(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature');
  if (!id || !ts || !sigHeader) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) return false;

  // Supabase expects the secret prefixed with `whsec_` to be base64-decoded.
  let key: Buffer;
  if (secret.startsWith('v1,whsec_')) {
    key = Buffer.from(secret.slice('v1,whsec_'.length), 'base64');
  } else if (secret.startsWith('whsec_')) {
    key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  } else {
    key = Buffer.from(secret, 'utf-8');
  }

  const signedPayload = `${id}.${ts}.${body}`;
  const expected = createHmac('sha256', key).update(signedPayload).digest();

  const provided = sigHeader.split(' ').map((token) => {
    const [version, b64] = token.split(',');
    if (version !== 'v1' || !b64) return null;
    try {
      return Buffer.from(b64, 'base64');
    } catch {
      return null;
    }
  });

  return provided.some((p) => {
    if (!p || p.length !== expected.length) return false;
    try {
      return timingSafeEqual(p, expected);
    } catch {
      return false;
    }
  });
}

function buildVerifyLink(emailData: z.infer<typeof HookPayload>['email_data']): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? emailData.site_url ?? 'https://lexyflow.com';

  const url = new URL('/api/auth/callback', base);
  if (emailData.token_hash) url.searchParams.set('token_hash', emailData.token_hash);
  url.searchParams.set('type', emailData.email_action_type);
  if (emailData.redirect_to) url.searchParams.set('next', emailData.redirect_to);
  return url.toString();
}
