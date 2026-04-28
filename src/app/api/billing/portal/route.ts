import { NextResponse } from 'next/server';
import { createPortalSession } from '@/lib/stripe';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * Stripe Billing Portal — self-serve subscription management.
 *
 * The user's org must already have a stripe_customer_id, set when the
 * checkout webhook fires for the first time. Returns 409 if not — the UI
 * should send the user to /pricing to start a subscription.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const orgId = organizationIdFromUser(user);
  if (!orgId) return NextResponse.json({ error: 'no_organization' }, { status: 403 });

  const { data: org } = await supabaseService()
    .from('organizations')
    .select('stripe_customer_id,ui_locale')
    .eq('id', orgId)
    .maybeSingle();

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 409 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const session = await createPortalSession({
    customerId: org.stripe_customer_id,
    origin,
    locale: org.ui_locale ?? 'en'
  });

  return NextResponse.json({ url: session.url });
}
