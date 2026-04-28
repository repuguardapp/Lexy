import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase';

/**
 * Daily retention enforcement.
 *
 * Triggered by Vercel Cron (see vercel.json). Authenticated by the
 * `CRON_SECRET` Bearer token, also accepted as the `?secret=` query
 * param so manual invocations from a browser stay simple.
 *
 * What we delete:
 *   - audits whose `created_at` is older than AUDIT_RETENTION_DAYS;
 *   - rate_limits rows whose window has long expired;
 *   - stripe_webhook_events older than 90 days (idempotency window).
 *
 * Billing data is intentionally not touched — tax law requires multi-year
 * retention. That happens via Stripe-side rules and/or a separate, more
 * cautious workflow.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Avoid concurrent purges if Vercel ever fires twice.
export const maxDuration = 60;

const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 30);
const WEBHOOK_RETENTION_DAYS = 90;
const RATE_LIMIT_RETENTION_HOURS = 24;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runPurge();
}

/** POST is also accepted because some queue systems prefer it. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runPurge();
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // In dev (no secret) we leave the route open so it can be exercised
    // by Vitest or a local curl — never deploy without setting CRON_SECRET.
    return process.env.NODE_ENV !== 'production';
  }

  // Vercel Cron sends `authorization: Bearer <CRON_SECRET>`.
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${expected}`) return true;

  // Manual ping fallback.
  const url = new URL(request.url);
  return url.searchParams.get('secret') === expected;
}

async function runPurge() {
  const db = supabaseService();

  const auditCutoff   = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const webhookCutoff = new Date(Date.now() - WEBHOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rateCutoff    = new Date(Date.now() - RATE_LIMIT_RETENTION_HOURS * 60 * 60 * 1000).toISOString();

  // We delete via the cascading audits row — audit_findings drop with it.
  const { count: auditsDeleted, error: auditErr } = await db
    .from('audits')
    .delete({ count: 'exact' })
    .lt('created_at', auditCutoff);

  const { count: webhooksDeleted, error: webhookErr } = await db
    .from('stripe_webhook_events')
    .delete({ count: 'exact' })
    .lt('processed_at', webhookCutoff);

  const { count: rateLimitsDeleted, error: rateErr } = await db
    .from('rate_limits')
    .delete({ count: 'exact' })
    .lt('window_start', rateCutoff);

  const errors = [auditErr, webhookErr, rateErr].filter(Boolean).map((e) => e?.message);
  return NextResponse.json(
    {
      ok: errors.length === 0,
      deleted: {
        audits:        auditsDeleted ?? 0,
        webhooks:      webhooksDeleted ?? 0,
        rate_limits:   rateLimitsDeleted ?? 0
      },
      cutoffs: {
        audits: auditCutoff,
        webhooks: webhookCutoff,
        rate_limits: rateCutoff
      },
      errors
    },
    { status: errors.length === 0 ? 200 : 500 }
  );
}
