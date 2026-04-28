import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, type PlanId } from '@/lib/stripe';
import { supabaseService } from '@/lib/supabase';

/**
 * Stripe webhook handler.
 *
 * Contract:
 *   - Signature is verified against `STRIPE_WEBHOOK_SECRET`. A failed check
 *     returns 400 immediately without DB access.
 *   - Idempotent: every event id is recorded in `stripe_webhook_events`.
 *     Replays of the same id are no-ops (Stripe retries on 5xx, so we
 *     return 200 even when we've already handled the event).
 *   - We acknowledge the webhook FAST. Heavy work (e.g. email) is queued
 *     downstream rather than performed in-line.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE_TO_PLAN: Record<string, PlanId> = {};
function planForPriceId(priceId: string | undefined): PlanId | null {
  if (!priceId) return null;
  if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId]!;

  const map: Array<[string | undefined, PlanId]> = [
    [process.env.STRIPE_PRICE_STARTER,    'starter'],
    [process.env.STRIPE_PRICE_PRO,        'pro'],
    [process.env.STRIPE_PRICE_ENTERPRISE, 'enterprise']
  ];
  for (const [env, plan] of map) {
    if (env && env === priceId) {
      PRICE_TO_PLAN[priceId] = plan;
      return plan;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  // Stripe needs the raw body bytes, not a parsed JSON object.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_signature', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const db = supabaseService();

  // Idempotency: refuse to double-process. Tries an insert; on conflict the
  // event is already recorded — return 200 so Stripe stops retrying.
  const { error: insertErr } = await db
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type, payload: event as unknown as object });
  if (insertErr) {
    if (insertErr.code === '23505') {
      // duplicate primary key — already processed
      return NextResponse.json({ ok: true, idempotent: true });
    }
    // Anything else is a real DB error; ask Stripe to retry.
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        // Status reconciliation lives in the subscription.* events; the
        // invoice.* events are recorded as audit trail but no special
        // handling beyond the idempotent insert above.
        break;
      default:
        // Unknown but harmless — recorded above for future inspection.
        break;
    }
  } catch (err) {
    // The event row is already inserted, so we won't double-process.
    // Return 200 to prevent infinite Stripe retries on a terminal bug;
    // the row remains for manual replay.
    console.error('[stripe-webhook] handler error', event.id, err);
    return NextResponse.json({ ok: true, handlerError: true });
  }

  return NextResponse.json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* Handlers                                                           */
/* ------------------------------------------------------------------ */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.client_reference_id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!orgId || !customerId) return;

  await supabaseService()
    .from('organizations')
    .update({ stripe_customer_id: customerId })
    .eq('id', orgId);
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.organization_id ?? null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price.id;
  const plan = planForPriceId(priceId);
  if (!plan) return;

  const periodStart = sub.current_period_start
    ? new Date(sub.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  await supabaseService()
    .from('subscriptions')
    .upsert(
      {
        organization_id: orgId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        plan,
        status: sub.status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'stripe_subscription_id' }
    );
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await supabaseService()
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', sub.id);
}
