import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCheckoutSession } from '@/lib/stripe';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * Stripe Checkout session bootstrap.
 *
 * Security model — the org id is derived from the authenticated
 * session, not the request body. We still accept `organizationId` in
 * the payload because the existing client already sends it, but we
 * treat it as untrusted and reject any mismatch instead of forwarding
 * it to Stripe.
 *
 * Why this matters: `client_reference_id` on the Checkout session
 * controls which org row the stripe-webhook handler later credits
 * with the subscription. If we blindly trusted the request body, a
 * logged-in attacker could craft a checkout that lands the resulting
 * subscription on someone else's organization — either to upgrade
 * a competitor's plan they happen to know the UUID of, or to poison
 * the billing state of an org they want to lock out.
 *
 * Anonymous orgs (the public-share-link placeholder) are not allowed
 * to start checkouts — there is no logged-in subject we could credit
 * the resulting subscription to.
 */
const Body = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
  locale: z.string().min(2).max(10),
  organizationId: z.string().uuid(),
  customerEmail: z.string().email().optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const sessionOrgId = organizationIdFromUser(user);
  if (!sessionOrgId) {
    return NextResponse.json({ error: 'no_organization' }, { status: 403 });
  }

  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }

  if (parsed.organizationId !== sessionOrgId) {
    return NextResponse.json({ error: 'organization_mismatch' }, { status: 403 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  // Pass the session-derived orgId, never the request body one — even
  // though we verified equality above, sourcing the value from the
  // session removes the possibility of a future refactor accidentally
  // re-introducing the trust boundary.
  const session = await createCheckoutSession({
    plan: parsed.plan,
    locale: parsed.locale,
    organizationId: sessionOrgId,
    origin,
    ...(parsed.customerEmail ? { customerEmail: parsed.customerEmail } : {})
  });

  return NextResponse.json({ id: session.id, url: session.url });
}
