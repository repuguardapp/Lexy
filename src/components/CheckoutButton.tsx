'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  plan: 'starter' | 'pro' | 'enterprise';
  locale: string;
  /** Either the auth'd user's org id (paid checkout) or undefined
   *  to render a sign-in CTA instead — anonymous customers cannot
   *  purchase because we have nowhere to credit. */
  organizationId: string | undefined;
  /** Localized text for the purchase CTA. */
  label: string;
  /** Localized text for the sign-in CTA when organizationId is absent. */
  signInLabel: string;
  /** Localized URL of the sign-in page (typically /{locale}/login). */
  signInHref: string;
}

/**
 * Renders one of two buttons depending on auth state:
 *   • Signed-in customer  → POST /api/checkout, then redirect to Stripe
 *   • Anonymous visitor   → link to the sign-in page with a `next` param
 *                            so they bounce back to /pricing post-login
 *
 * Why we don't try to checkout anonymously: the credit balance lives
 * on `organizations.credits_remaining`. Without an org id Stripe cannot
 * tie the payment to a row, the webhook can't top up, and the customer
 * pays for credits that go nowhere. Hard-stopping the click upfront is
 * better UX than a silent post-payment failure.
 */
export function CheckoutButton({ plan, locale, organizationId, label, signInLabel, signInHref }: Props) {
  const [busy, setBusy] = useState(false);

  if (!organizationId) {
    const nextUrl = `/${locale}/pricing`;
    const href = `${signInHref}?next=${encodeURIComponent(nextUrl)}`;
    return (
      <Button asChild className="w-full" variant="outline">
        <a href={href}>{signInLabel}</a>
      </Button>
    );
  }

  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, locale, organizationId })
      });
      if (!res.ok) {
        // Fall through to a basic alert — the failure card UX is owned
        // by the audit form, not pricing.
        const body = await res.json().catch(() => ({}));
        console.error('[checkout] api error', body);
        alert(body.detail ?? body.error ?? `checkout_failed_${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.url) window.location.assign(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={go} disabled={busy} className="w-full">
      {label}
    </Button>
  );
}
