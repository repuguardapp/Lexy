import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Subscription tier classification.
 *
 * 'free' covers everything that is NOT a currently-active paid plan:
 *   - no subscriptions row at all
 *   - subscription is canceled / unpaid / incomplete_expired
 *   - subscription is on a plan we don't recognize
 *
 * 'paid' is the canonical "this org has audit credits flowing in"
 * state: a row exists, the status is one of the three Stripe states
 * where credits are granted (active / trialing / past_due — past_due
 * keeps service for 1 dunning cycle so a card blip doesn't drop a
 * customer mid-billing-period), and the plan is one of ours.
 */
export type Tier = 'free' | 'paid';

const PAID_PLANS = new Set(['starter', 'pro', 'enterprise']);
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Max byte size accepted for free-tier audit uploads. ~3 pages of
 *  a typical PDF policy / contract fit comfortably under this. */
export const FREE_TIER_MAX_BYTES = 2 * 1024 * 1024;

interface SubscriptionRow {
  plan: string | null;
  status: string | null;
}

export async function getTierForOrg(db: SupabaseClient, orgId: string): Promise<Tier> {
  const { data } = await db
    .from('subscriptions')
    .select('plan,status')
    .eq('organization_id', orgId)
    .maybeSingle();
  const row = data as SubscriptionRow | null;
  if (!row) return 'free';
  if (!row.plan || !row.status) return 'free';
  if (!PAID_PLANS.has(row.plan)) return 'free';
  if (!PAID_STATUSES.has(row.status)) return 'free';
  return 'paid';
}
